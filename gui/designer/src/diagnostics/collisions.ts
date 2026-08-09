// Which items' DRAWN TEXT lands on top of another item's, read from the
// engine's box index. Pure and framework-free, so every hostile-geometry
// branch is unit-testable.
//
// Why the drawn line and not the border box: a full-width heading's BOX
// legitimately spans items pinned inside it, so box overlap is ordinary in a
// perfectly good document and barely moves when the page size changes — it
// cannot tell a broken page from a working one. The drawn line's own
// rectangle can: widening the page re-centres a `w: "100%"` heading over
// neighbours pinned in pt, and the engine is right to stay quiet about it
// (overlap is legal), so the Designer is the only place a reader can be told.
// The measured before/after that settled this is in the change's PR and
// changelog entry, where it can carry the command that produced it; a bare
// number in a source comment would be neither reproducible nor falsifiable
// from this repository.
//
// Comparing drawn text against drawn text is also what keeps deliberate
// overlap quiet — a stamp over a rule or a watermark under a paragraph is
// image/rect-against-text, which this never compares.

import type { BoxIndex, PlacedBox } from '../engine/types';

/** One side of a collision: the path to select, and what to call it. */
export interface CollisionItem {
  readonly path: string;
  readonly label: string;
}

/** Two items whose drawn text overlaps on the same page. */
export interface TextCollision {
  /** Zero-based page index the overlap is on. */
  readonly page: number;
  readonly a: CollisionItem;
  readonly b: CollisionItem;
}

/** The most drawn lines examined per page. The box index is engine output
 * over an attacker-influenceable document, so it is bounded rather than
 * trusted; a page past the bound is reported from the lines that fit. */
const MAX_SCAN_LINES = 400;

/** The most PAIRS compared across the whole document. The per-page bound
 * alone does not bound the work: the collision cap short-circuits only once
 * something has been FOUND, so a long, entirely clean document — the common
 * case, and the one where this feature has nothing to say — would otherwise
 * pay the full quadratic scan on every page. */
const MAX_COMPARISONS = 200_000;

/** The most collisions reported. A pathological document can collide in
 * hundreds of pairs, and a panel is not where that is read. */
const MAX_COLLISIONS = 20;

/** Longest label rendered; an `id` is authored text and can be any length. */
const MAX_LABEL = 40;

/** Point tolerance: rectangles must genuinely share area. Lines that merely
 * ABUT (one's `emBottom` exactly the next one's `emTop`, which ordinary
 * stacked text does) are not a collision, and neither is a DEGENERATE line —
 * the engine emits a zero-width `LineMetric` for a blank line inside a
 * paragraph, and nothing is drawn there to collide with. */
const EPSILON = 0.01;

/** One drawn line's rectangle in page points, tagged with its owner. */
interface DrawnRect {
  readonly path: string;
  readonly label: string;
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

/** What to call an item: its authored `id` when it has one, else its path. */
function labelOf(box: PlacedBox): string {
  const id = typeof box.id === 'string' && box.id !== '' ? box.id : box.path;
  return id.length > MAX_LABEL ? `${id.slice(0, MAX_LABEL)}…` : id;
}

/** A horizontal line's drawn rectangle: the run's `x`/`width`, and the em band
 * as its vertical extent (tighter and more honest than the box height). */
function fromLine(line: unknown, path: string, label: string): DrawnRect | null {
  const metric = record(line);
  if (metric === null) {
    return null;
  }
  const x = finite(metric.x);
  const width = finite(metric.width);
  const top = finite(metric.emTop);
  const bottom = finite(metric.emBottom);
  if (x === null || width === null || top === null || bottom === null) {
    return null;
  }
  return { path, label, x0: x, x1: x + width, y0: top, y1: bottom };
}

/** A vertical (vertical-writing) column's drawn rectangle — the axis-swapped
 * twin of {@link fromLine}: the em band is horizontal, the run vertical. */
function fromColumn(column: unknown, path: string, label: string): DrawnRect | null {
  const metric = record(column);
  if (metric === null) {
    return null;
  }
  const y = finite(metric.y);
  const height = finite(metric.height);
  const left = finite(metric.emLeft);
  const right = finite(metric.emRight);
  if (y === null || height === null || left === null || right === null) {
    return null;
  }
  return { path, label, x0: left, x1: right, y0: y, y1: y + height };
}

/** Every drawn rectangle one box contributes, at most `budget` of them. The
 * budget is applied to the LINE LIST, not just checked between boxes: one
 * item can wrap to arbitrarily many lines, so a per-box check would let a
 * single hostile item allocate without bound. A box with no text metrics (a
 * rect, an image, or an engine that does not advertise them) contributes
 * none, which is how this stays silent rather than guessing. */
function rectsOf(box: PlacedBox, budget: number): readonly DrawnRect[] {
  const metrics = record(box.text);
  if (metrics === null) {
    return [];
  }
  const label = labelOf(box);
  const lines = metrics.lines;
  if (Array.isArray(lines)) {
    return lines
      .slice(0, budget)
      .map((line) => fromLine(line, box.path, label))
      .filter(present);
  }
  const columns = metrics.columns;
  return Array.isArray(columns)
    ? columns
        .slice(0, budget)
        .map((column) => fromColumn(column, box.path, label))
        .filter(present)
    : [];
}

function present(rect: DrawnRect | null): rect is DrawnRect {
  return rect !== null;
}

/** Do the two rectangles genuinely share area on both axes? Expressed as the
 * length of each axis's INTERSECTION rather than as four edge comparisons:
 * that form is the one that also rejects a degenerate (zero-extent) rectangle
 * and an inverted one, both of which satisfy the pairwise-edge form. */
function overlaps(a: DrawnRect, b: DrawnRect): boolean {
  const x = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const y = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return x > EPSILON && y > EPSILON;
}

/** The drawn rectangles of one page, bounded by {@link MAX_SCAN_LINES}. */
function pageRects(boxes: readonly PlacedBox[]): readonly DrawnRect[] {
  const rects: DrawnRect[] = [];
  for (const box of boxes) {
    const remaining = MAX_SCAN_LINES - rects.length;
    if (remaining <= 0) {
      break;
    }
    // One at a time, never `push(...spread)`: spreading a large array passes
    // every element as an argument and blows the call stack.
    for (const rect of rectsOf(box, remaining)) {
      rects.push(rect);
    }
  }
  return rects;
}

/** The dedup key for an item PAIR on a page, order-normalized. The pair must
 * key the same whichever side is scanned first: a single item yields one box
 * PER PLACEMENT, all sharing its path (a `repeat` cell child appears once per
 * element), so one page really does interleave two items' rectangles and the
 * same pair is reachable in both orders. Encoded as JSON rather than joined
 * on a separator character: paths are document-derived, so any separator is a
 * character an author could put in a path and collide two different pairs
 * onto one key. It also keeps the source plain ASCII — a literal control byte
 * here would make the whole file binary to git and grep, and it would stop
 * appearing in diffs at all. */
function pairKey(page: number, one: string, two: string): string {
  const [first, second] = one < two ? [one, two] : [two, one];
  return JSON.stringify([page, first, second]);
}

/** Items whose drawn text overlaps another item's, page by page. An item is
 * never compared with itself, so a wrapped paragraph's own stacked lines are
 * not a collision. */
export function findTextCollisions(boxes: BoxIndex | undefined): readonly TextCollision[] {
  const pages = boxes === undefined ? [] : boxes.pages;
  const found: TextCollision[] = [];
  // A Set, never a plain-object table — the paths are document-derived and
  // `__proto__` must not resolve through a prototype.
  const seen = new Set<string>();
  let budget = MAX_COMPARISONS;
  for (const [page, boxesOnPage] of pages.entries()) {
    if (found.length >= MAX_COLLISIONS || budget <= 0) {
      break;
    }
    const rects = pageRects(boxesOnPage);
    for (let i = 0; i < rects.length && found.length < MAX_COLLISIONS && budget > 0; i += 1) {
      for (let j = i + 1; j < rects.length && found.length < MAX_COLLISIONS && budget > 0; j += 1) {
        budget -= 1;
        const a = rects[i];
        const b = rects[j];
        const key = pairKey(page, a.path, b.path);
        if (a.path !== b.path && !seen.has(key) && overlaps(a, b)) {
          seen.add(key);
          found.push({
            page,
            a: { path: a.path, label: a.label },
            b: { path: b.path, label: b.label },
          });
        }
      }
    }
  }
  return found;
}
