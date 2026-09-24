// Insert-target rules: which insert kinds lay out ONLY in the body's flow,
// which OWNER a resolved insert target is, and which band it is DIRECTLY — the
// one question band placement asks. The mirror of `bandPlacement.ts` — where
// that file answers "this belongs in a band" and how to place it there, this
// one answers "this belongs in the flow and nowhere else" and names the owner a
// target is, so any restricted kind can be asked the same question.
// Framework-free.
//
// The engine's own word for it is three warn-and-skip diagnostics per kind
// (`page_break_in_absolute_body` / `_in_band` / `_in_container`, and the same
// trio for `repeat` and for `repeat_flow`), so a misplaced item is not a parse
// error — it simply never draws. That is exactly the failure a menu row must not lead someone
// into, which is why the row states the reason instead of acting.

import type { ReadFn } from '@shojiku/designer-core';
import { type OwnerKind, receiverFor } from '../canvas/dnd';
import { isOrInsideSubTemplate } from '../tree/subTemplate';
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

/** The owner kind of the insert target at `path`. OUTSIDE a repeating
 * sub-template it is an `…items` list read through the same `receiverFor` a
 * canvas drop uses, so an insert and a drag can never disagree about what a
 * parent is; inside one, neither half of that mechanism applies — the branch
 * below answers first, from the path alone, and the path need not be an
 * `…items` list at all. The two still agree in EFFECT there, by refusing
 * rather than by classifying: a drag over a cell lands in the body, and an
 * insert into one is refused for a table.
 *
 * A target ANYWHERE inside a repeating sub-template answers `cell`, decided
 * from the path before the document is consulted: the engine scopes a `repeat`
 * cell, a `repeat_flow` card and a table column's `cell:` to their bound
 * element and carries that scope into every nested container, so the list one
 * container down is as much a cell as the cell's own `items`. It is strictly
 * narrower than `container` — the two differ only in that a `cell` also
 * refuses a `table` (`table_in_cell`).
 *
 * Everything else `receiverFor` cannot classify still answers `container`: a
 * grid container, a body whose `type` is missing or unrecognized, a read that
 * throws (a hostile subtree the materializer refuses), a path that is not an
 * item list. That fails CLOSED — `container` holds neither the band-only nor
 * the flow-only kinds and refuses nothing else — and it is the engine's own
 * classification for grid children, which place through the container path and
 * warn `*_in_container`. Nothing is ever read as the flow or a band by
 * default. */
export function insertTargetOwner(read: ReadFn, path: string): OwnerKind {
  // The slot's own path answers yes here, the same as `receiverFor`: an insert
  // aimed AT a `cell:` is an insert into the repeating part.
  if (isOrInsideSubTemplate(path)) {
    return 'cell';
  }
  if (!path.endsWith(ITEMS_SUFFIX)) {
    return 'container';
  }
  return receiverFor(read, path.slice(0, -ITEMS_SUFFIX.length))?.placement.owner ?? 'container';
}

/** The band the insert target at `path` is DIRECTLY — the owner whose children
 * are coordinate-placed against the page margin box, so an insert there ships
 * with band coordinates. `null` for everything else, including a container
 * INSIDE a band, whose children its own layout places. A `band` owner is only
 * ever `sections.header.items` or `sections.footer.items` (`canvas/dnd`'s
 * `ownerPlacement`), so the path names which. */
export function insertTargetBand(read: ReadFn, path: string): 'header' | 'footer' | null {
  if (insertTargetOwner(read, path) !== 'band') {
    return null;
  }
  return path === 'sections.header.items' ? 'header' : 'footer';
}

/** Whether the insert target at `path` is the body's flow — the one owner a
 * `requiresFlow` kind lays out in. Positive, so it fails closed exactly as
 * `insertTargetOwner` does. */
export function isFlowTarget(read: ReadFn, path: string): boolean {
  return insertTargetOwner(read, path) === 'flow';
}
