// Flow-body rules: which insert kinds lay out ONLY in the body's flow, and
// which OWNER a resolved insert target is — the flow being the one those kinds
// need. The mirror of `bandPlacement.ts` — where that file answers "this
// belongs in a band", this one answers "this belongs in the flow and nowhere
// else", and names the owner a target is so any restricted kind can be asked
// the same question. Framework-free.
//
// The engine's own word for it is three warn-and-skip diagnostics per kind
// (`page_break_in_absolute_body` / `_in_band` / `_in_container`, and the same
// trio for `repeat` and for `repeat_flow`), so a misplaced item is not a parse error — it simply
// never draws. That is exactly the failure a menu row must not lead someone
// into, which is why the row states the reason instead of acting.

import type { ReadFn } from '@shojiku/designer-core';
import { type OwnerKind, receiverFor } from '../canvas/dnd';
import type { InsertKind } from './insertMenu';

const ITEMS_SUFFIX = '.items';

/** Which kinds lay out only in the body's flow.
 *
 * `charGrid` is deliberately NOT one of them: the engine places a `char_grid`
 * everywhere, drawing a single sheet (and dropping the overflow with
 * `char_grid_overflow`) outside a flow body rather than skipping the item. */
export function requiresFlow(kind: InsertKind): boolean {
  return kind === 'pageBreak';
}

/** The owner kind of the insert target at `path` (an `…items` list), read
 * through the same `receiverFor` a canvas drop uses, so an insert and a drag
 * can never disagree about what a parent is.
 *
 * Everything `receiverFor` cannot classify answers `container`: a repeat
 * `cell` or repeat_flow `item` sub-template, a grid container, a body whose
 * `type` is missing or unrecognized, a read that throws (a hostile subtree the
 * materializer refuses), a path that is not an item list. That fails CLOSED —
 * `container` holds neither the band-only nor the flow-only kinds and refuses
 * nothing else — and it is the engine's own classification for sub-template
 * and grid children, which place through the container path and warn
 * `*_in_container`. Nothing is ever read as the flow or a band by default. */
export function insertTargetOwner(read: ReadFn, path: string): OwnerKind {
  if (!path.endsWith(ITEMS_SUFFIX)) {
    return 'container';
  }
  return receiverFor(read, path.slice(0, -ITEMS_SUFFIX.length))?.placement.owner ?? 'container';
}

/** Whether the insert target at `path` is the body's flow — the one owner a
 * `requiresFlow` kind lays out in. Positive, so it fails closed exactly as
 * `insertTargetOwner` does. */
export function isFlowTarget(read: ReadFn, path: string): boolean {
  return insertTargetOwner(read, path) === 'flow';
}
