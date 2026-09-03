// An `ellipse`'s `anchor:` — the key that turns a free-floating oval into the
// "circle this answer" mark a form is full of. Anchored, the ellipse CENTRES on
// another item's glyph band (its inked text metrics, or its border box when it
// has no text) and the engine never reads `box.x`/`box.y` at all; `box.w`/`box.h`
// survive only as a size, and unsized it takes the band's own extent.
//
// Two consequences the ops are written around:
//
//   * attaching DROPS `box.x`/`box.y` in the same batch. Leaving them would keep
//     two keys the engine ignores in a file that reads as though they place the
//     oval — and `canvas/manipulate` already refuses to drag an anchored ellipse
//     for exactly that reason, so the document would disagree with the canvas.
//   * removing an ABSENT key refuses the whole batch (the `lineArmOps` lesson),
//     so the builder is told which coordinates the document actually carries.

import type { Op, ReadFn } from '@shojiku/designer-core';
import { readRecord, record } from './borderModel';

/** What the panel needs to know about an ellipse's anchoring. */
export interface EllipseAnchorView {
  /** The authored target id; `''` when the key is absent or holds a non-string
   * the engine would reject, which the panel must not echo back as a
   * selection. */
  readonly anchor: string;
  /** Whether the key is a STRING at all — `anchor: ''` included. The engine
   * takes `if let Some(target) = &e.anchor`, so an empty one is anchored and
   * resolves to no item (`anchor_unknown_target`); `canvas/manipulate` refuses
   * the drag on exactly that predicate, and the panel has to agree or it offers
   * coordinates for an item whose coordinates the engine does not read. */
  readonly anchored: boolean;
  /** Whether `box.x` / `box.y` are present — attaching removes only what is
   * there. */
  readonly hasX: boolean;
  readonly hasY: boolean;
}

/** Longest target id the picker RENDERS. An id is document-derived and a
 * hostile one must not paint out of the column — but the bound is on the
 * DISPLAY only: the value itself has to reach the wire exactly, or re-picking
 * would author a truncated id that resolves to nothing. Sanitize-for-display
 * and offer-as-a-choice are different contracts. */
const MAX_ID = 80;

/** The id as the picker SHOWS it: clipped, and marked so a long id is not
 * mistaken for a short one. */
export function anchorLabel(id: string): string {
  return id.length > MAX_ID ? `${id.slice(0, MAX_ID)}…` : id;
}

/** Read the anchoring of the ellipse at `path`. A hostile or unreadable node
 * reads as unanchored rather than throwing through the panel render. */
export function readEllipseAnchor(read: ReadFn, path: string): EllipseAnchorView {
  const item = readRecord(read, path);
  const raw = item.anchor;
  // NOT clipped: this value round-trips to the wire. `anchorLabel` bounds what
  // is drawn.
  const anchor = typeof raw === 'string' ? raw : '';
  const box = record(item.box);
  return {
    anchor,
    anchored: typeof raw === 'string',
    hasX: box?.x !== undefined,
    hasY: box?.y !== undefined,
  };
}

/** Attaches the ellipse to `target`, dropping the coordinates the engine will
 * stop reading — ONE transactional op list, so it is one undo step and the
 * document is never in the mixed shape.
 *
 * An empty target authors nothing: switching arms first and asking after would
 * write `anchor: ''`, which resolves to no item, and the oval would vanish from
 * the canvas before the user chose anything. */
export function attachAnchorOps(
  path: string,
  target: string,
  view: EllipseAnchorView,
): readonly Op[] {
  if (target === '') {
    return [];
  }
  const ops: Op[] = [{ op: 'setScalar', path, keys: ['anchor'], value: target }];
  if (view.hasX) {
    ops.push({ op: 'removeKey', path, keys: ['box', 'x'] });
  }
  if (view.hasY) {
    ops.push({ op: 'removeKey', path, keys: ['box', 'y'] });
  }
  return ops;
}

/** Detaches the ellipse, so its own `box` places it again. The coordinates are
 * NOT written back: the engine's own default (unset) is the top-left of the
 * parent box, and inventing a position the user never chose is the thing every
 * other snippet in this package refuses to do. */
export function detachAnchorOp(path: string): Op {
  return { op: 'removeKey', path, keys: ['anchor'] };
}

/** Whether the panel must WITHHOLD the coordinate fields for the item at
 * `path`: an anchored ellipse's position comes from the item it circles, and
 * the engine never reads `box.x`/`box.y`, so two editable coordinates would be
 * controls with no effect. Its SIZE still comes from `box.w`/`box.h`.
 *
 * Not capability-gated, deliberately. `EllipseItem` is `deny_unknown_fields`,
 * so an engine that does not know `anchor:` REJECTS the document rather than
 * ignoring the key — there is no engine for which the coordinates come back to
 * life. The capability gates the OFFER to attach, never the reading of a file
 * that already is (the `line.anchor` rule). */
export function anchorHidesCoords(read: ReadFn, type: string, path: string): boolean {
  return type === 'ellipse' && readEllipseAnchor(read, path).anchored;
}
