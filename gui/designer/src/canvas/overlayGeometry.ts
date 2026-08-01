// Pure geometry the selection overlay's pieces share: client↔page-pt
// conversion over the overlay's LIVE bounding rect (so the zoom CSS transform
// factors out), box paint ordering by structural depth, resize-handle centres,
// the multi-selection union frame, the per-state cursor, and an arrow key's
// nudge delta. DOM-free apart from the bounding-rect reads, which take the
// minimal structural element shape so tests need no real element.

import type { BoxRect, PlacedBox } from '../engine/types';
import { scaleRect } from './geometry';
import type { Handle } from './resizeHandles';
import type { DragPoint } from './useDrag';

/** Guide-snap reach in screen px (converted to pt via the live overlay ratio). */
export const GUIDE_THRESHOLD_PX = 6;

/** Resize handle square size in overlay px. */
export const HANDLE_PX = 7;

export const HANDLE_CURSORS: Record<Handle, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
};

/** The only thing the coordinate conversions read off the overlay element. */
type Measurable = { getBoundingClientRect(): { left: number; top: number; width: number } };

// The structural depth of a box path, as its count of `.`/`[` segment
// separators (`sections.body.items[0].cell` is deeper than `sections.body`).
// No path parsing — a parent path is always a strict prefix of its child's, so
// separator count orders parent-before-child and tolerates any hostile string.
export function pathDepth(path: string): number {
  let depth = 0;
  for (const ch of path) {
    if (ch === '.' || ch === '[') depth += 1;
  }
  return depth;
}

// Shallowest-first so deeper boxes paint LAST (on top) and are hit first.
// Engine walk order emits some container-like fragments (a `repeat`/`table`
// item covers its own cells) AFTER their children, which would otherwise mask
// the cell a user clicks; a STABLE sort by depth restores innermost-on-top
// without disturbing same-depth walk order.
export function byDepth(boxes: readonly PlacedBox[]): PlacedBox[] {
  return boxes
    .map((box, index) => ({ box, index }))
    .sort((a, b) => pathDepth(a.box.path) - pathDepth(b.box.path) || a.index - b.index)
    .map((entry) => entry.box);
}

/** Client coordinates → page pt, over the overlay's LIVE bounding rect so the
 * zoom CSS transform (and any ancestor transform) is factored out. A missing
 * element or an unmeasurable rect (jsdom) falls back to ratio 1. */
export function clientToPagePt(
  el: Measurable | null,
  width: number,
  scale: number,
  point: DragPoint,
): DragPoint {
  if (el === null) {
    return { x: point.x / scale, y: point.y / scale };
  }
  const rect = el.getBoundingClientRect();
  const ratio = rect.width > 0 ? width / rect.width : 1;
  return {
    x: ((point.x - rect.left) * ratio) / scale,
    y: ((point.y - rect.top) * ratio) / scale,
  };
}

/** A client-space delta re-expressed in page pt (the same live-rect ratio). */
export function clientDeltaToPt(
  el: Measurable | null,
  width: number,
  scale: number,
  from: DragPoint,
  to: DragPoint,
): DragPoint {
  const a = clientToPagePt(el, width, scale, from);
  const b = clientToPagePt(el, width, scale, to);
  return { x: b.x - a.x, y: b.y - a.y };
}

/** A handle's center on the (scaled) selection rect. */
export function handleCenter(
  handle: Handle,
  r: BoxRect,
): { readonly cx: number; readonly cy: number } {
  let cx = r.x + r.w / 2;
  if (handle.includes('w')) {
    cx = r.x;
  } else if (handle.includes('e')) {
    cx = r.x + r.w;
  }
  let cy = r.y + r.h / 2;
  if (handle.includes('n')) {
    cy = r.y;
  } else if (handle.includes('s')) {
    cy = r.y + r.h;
  }
  return { cx, cy };
}

/** The selected box's cursor: what a drag would do (move / grab to reorder /
 * nothing). Unselected boxes keep the select cursor. */
export function boxCursor(selected: boolean, ability: { readonly kind: string } | null): string {
  if (!selected || ability === null) {
    return 'pointer';
  }
  if (ability.kind === 'move') {
    return 'move';
  }
  return ability.kind === 'reorder' ? 'grab' : 'default';
}

/** An arrow key's nudge delta at `step` pt. (Callers guarantee an arrow key.) */
export function arrowDelta(
  key: string,
  step: number,
): { readonly dx: number; readonly dy: number } {
  if (key === 'ArrowLeft') {
    return { dx: -step, dy: 0 };
  }
  if (key === 'ArrowRight') {
    return { dx: step, dy: 0 };
  }
  if (key === 'ArrowUp') {
    return { dx: 0, dy: -step };
  }
  return { dx: 0, dy: step };
}

/** The multi-selection's group frame: the union (in overlay px) of every
 * selected box on THIS page — the multi-set members plus the primary when it is
 * movable. Null below two distinct selected paths, where a frame would only
 * double-stroke the single selection. */
export function groupBounds(
  boxes: readonly PlacedBox[],
  multiSelected: ReadonlySet<string>,
  primaryPath: string | null,
  primaryMovable: boolean,
  scale: number,
): BoxRect | null {
  const groupPaths = new Set<string>();
  let gx0 = Number.POSITIVE_INFINITY;
  let gy0 = Number.POSITIVE_INFINITY;
  let gx1 = Number.NEGATIVE_INFINITY;
  let gy1 = Number.NEGATIVE_INFINITY;
  for (const box of boxes) {
    if (!(multiSelected.has(box.path) || (box.path === primaryPath && primaryMovable))) {
      continue;
    }
    groupPaths.add(box.path);
    const r = scaleRect(box.border, scale);
    gx0 = Math.min(gx0, r.x);
    gy0 = Math.min(gy0, r.y);
    gx1 = Math.max(gx1, r.x + r.w);
    gy1 = Math.max(gy1, r.y + r.h);
  }
  // At least two distinct selected paths → the union frame (their rects are
  // finite, so the accumulated bounds are too).
  return groupPaths.size >= 2 ? { x: gx0, y: gy0, w: gx1 - gx0, h: gy1 - gy0 } : null;
}
