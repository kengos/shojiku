// Header/footer band rules: which kinds only make sense inside a band, and
// what a band insert has to carry that a flow-body insert does not. Band
// children are coordinate-placed (they resolve against the page margin box),
// which is what makes their placement different from a flow body's.
// Framework-free.

import type { SnippetValue } from '@shojiku/designer-core';
import { BOXLESS_TYPES, MARK_TYPES } from '../panel/itemView';
import type { InsertKind } from './insertMenu';

/** Which items only make sense inside a header/footer band. */
export function requiresBand(kind: InsertKind): boolean {
  return kind === 'pageNumber';
}

/** Where a freshly inserted band item goes. A header item sits at the top of
 * the margin box; a footer item sits just inside its bottom edge — the reader
 * should find it where bands actually print, not at y 0 on page one.
 *
 * `marginBoxHeight` comes from pixel-derived render geometry, so it is floored
 * before use (a ceil-inflated bound would place the item past the page edge,
 * where band items render silently). */
export function bandInsertY(band: 'header' | 'footer', marginBoxHeight: number): number {
  if (band === 'header' || !Number.isFinite(marginBoxHeight)) {
    return 0;
  }
  return Math.max(0, Math.floor(marginBoxHeight) - 32);
}

/** The band-placed form of a snippet: the same item, plus the coordinates a
 * band requires. A body insert keeps its box-less flow form.
 *
 * A BOXLESS item takes no `box:` at all and is placed through its own
 * coordinates instead — see `bandPlacedPoints`.
 *
 * For everything else it supplies a WIDTH but no height. A definite `h` is what `text_overflow`
 * measures against, so a fixed default is a promise about the document's font
 * that this module cannot keep: at the blank presets' 10.5pt over the engine's
 * 1.4 line height the line box is 14.7pt, and every band insert on a
 * blank-start document warned. The types that genuinely REQUIRE a height —
 * `rect`, `qr_code`, `image` — carry their own in their snippet, so they are
 * unaffected; the text-shaped ones auto-size, exactly as they do in the flow
 * body. */
export function bandPlaced(snippet: SnippetValue, y: number): SnippetValue {
  const item = snippet as Record<string, unknown>;
  if (typeof item.type === 'string' && BOXLESS_TYPES.has(item.type)) {
    return bandPlacedPoints(item, y);
  }
  const box = (item.box ?? {}) as Record<string, unknown>;
  // A FORM MARK is not text-shaped: it is a fixed-aspect glyph (an oval, a
  // square frame), so the full-width default above would stretch a checkbox
  // across the whole margin box — and an unsized checkbox is exactly the shape
  // that reaches here, since its snippet deliberately authors no box so the
  // engine can match it to the label's cap height. It takes the coordinates and
  // nothing else.
  const width = typeof item.type === 'string' && MARK_TYPES.has(item.type) ? {} : { w: '100%' };
  return { ...item, box: { ...width, ...box, x: 0, y } } as SnippetValue;
}

/** The band placement of an item that takes NO `box:` — `line` and
 * `page_break`. Authoring one on either is an engine parse error
 * (`deny_unknown_fields`), so there is no box to place against and the offset
 * has to reach the item's own coordinates instead: a `line` carries its
 * position in `from`/`to`, and moving those is what puts a footer rule where
 * footers print rather than at the top of the margin box. A `page_break` has
 * neither key and passes through untouched.
 *
 * Note the asymmetry with the boxed arm, which SETS `box.y` and so is
 * idempotent: this one ADDS, because a segment may be diagonal and has no
 * single `y` to set. So the offset is right for a snippet authored at body
 * coordinates — every path that reaches here from `insertSnippet` — and
 * CUMULATIVE for one already carrying a band's own y, which is what a block
 * saved from a footer and re-inserted into it does.
 *
 * The values are UNTRUSTED: `useBlocks` band-places user-saved blocks restored
 * from browser storage, so anything may arrive here. Every shape that is not a
 * plain numeric `y` is returned exactly as authored. */
function bandPlacedPoints(item: Record<string, unknown>, y: number): SnippetValue {
  const out = { ...item };
  for (const key of ['from', 'to'] as const) {
    if (Object.hasOwn(item, key)) {
      out[key] = shiftPointY(item[key], y);
    }
  }
  return out as SnippetValue;
}

/** One endpoint moved down the page by the band offset. Only a plain numeric
 * `y` shifts: an anchored endpoint (`{ item }`) has no coordinate to move, and
 * a `Length` string like `"50%"` would CONCATENATE rather than add — `"50%700"`
 * is a value the engine would then reject. Both are returned as authored. */
function shiftPointY(point: unknown, y: number): unknown {
  if (typeof point !== 'object' || point === null || Array.isArray(point)) {
    return point;
  }
  const p = point as Record<string, unknown>;
  return typeof p.y === 'number' ? { ...p, y: p.y + y } : point;
}
