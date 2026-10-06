// What an anchor may NAME, and the name it takes when it has none. Both anchor
// pickers — an ellipse's "circle an item" and a line endpoint's "attach to an
// item" — offer the document's ITEMS, read from the id namespace (`idIndex`),
// so a Designer-made document with no `id:` anywhere still has targets, and a
// template that does not render yet still lists them.
//
// Excluded, each because the engine would not resolve it to the item the user
// meant:
//   * the anchoring item itself (it is deferred, so it is not in the index the
//     engine resolves against);
//   * a `page_break` (it places no box), a table column (one box per ROW), and
//     the three sub-template frames — none of them is one placement;
//   * a `repeat` / `repeat_flow` not directly in a flow body, and a
//     `page_number` not directly in a band: the engine SKIPS them there
//     (`repeat_in_container`, `page_number_in_body`, …), so they place no box;
//   * an item inside a repeated scope (a repeat cell, a column cell, a
//     repeat_flow card): it is placed once per element, and an anchor resolves
//     to the first placement only;
//   * an item that is itself anchored: the engine builds its target index
//     before drawing anything deferred, so an anchored item is never a target;
//   * an authored id the Designer's own name rule refuses (`isIdText`) — it is
//     offered back verbatim only where it is already the anchor's value — and
//     an id that is not a string at all: picking would overwrite it with a
//     minted name, and the name field never overwrites one.
//
// Picking an item with no `id:` gives it one in the same batch: its bound data
// key (dots → `_`) when that is a plain ASCII name, else `<type>_1`; a taken
// name counts on (`freshName`) over every name the document uses. A partial
// namespace (a truncated walk) cannot prove a name free, so it offers only
// items that already carry one.

import type { Op } from '@shojiku/designer-core';
import { freshName, isIdText, MAX_ID_CHARS } from './idEdit';
import { type IdIndex, takenNames } from './idIndex';
import type { IdHolder, Owner } from './walk';

/** Holder kinds that are never ONE placement the engine can resolve. `item`
 * is the walk's name for an entry with no type. */
const NOT_TARGETS: ReadonlySet<string> = new Set([
  'page_break',
  'column',
  'cell_frame',
  'card_frame',
  'item',
]);

/** Kinds the engine places only DIRECTLY in one kind of region. */
const ONLY_IN: Readonly<Record<string, Owner>> = {
  repeat: 'flow',
  repeat_flow: 'flow',
  page_number: 'band',
};

/** What a minted name may be made of: ASCII letters, digits, `_` and `-`. */
const MINTABLE = /^[A-Za-z0-9_-]+$/;

/** Longest wire type used as a name stem; a longer (hostile) type mints `item_1`. */
const MAX_STEM = 32;

/** The items an anchor at `selfPath` may name, in document order. An id two
 * holders share is offered once — the first eligible one. */
export function anchorCandidates(index: IdIndex, selfPath: string): readonly IdHolder[] {
  const anchored = new Set(index.refs.map((ref) => ref.path));
  const offered = new Set<string>();
  const out: IdHolder[] = [];
  for (const holder of index.holders) {
    if (
      holder.path === selfPath ||
      holder.repeated ||
      holder.foreign ||
      (Object.hasOwn(ONLY_IN, holder.kind) && ONLY_IN[holder.kind] !== holder.owner) ||
      NOT_TARGETS.has(holder.kind) ||
      anchored.has(holder.path)
    ) {
      continue;
    }
    if (holder.id === undefined) {
      if (index.truncated) {
        continue;
      }
    } else {
      if (!isIdText(holder.id) || offered.has(holder.id)) {
        continue;
      }
      offered.add(holder.id);
    }
    out.push(holder);
  }
  return out;
}

/** The name an unnamed `holder` is first offered: its data key, else its type. */
export function mintBase(holder: IdHolder): string {
  const key = holder.dataKey?.replaceAll('.', '_');
  if (key !== undefined && MINTABLE.test(key) && key.length <= MAX_ID_CHARS) {
    return key;
  }
  const stem = MINTABLE.test(holder.kind) && holder.kind.length <= MAX_STEM ? holder.kind : 'item';
  return `${stem}_1`;
}

/** The id an anchor writes for `holder`, and the ops naming the holder first
 * when it has no id — run in the SAME batch as the anchor, so one undo step
 * removes both. */
export interface PickedTarget {
  readonly id: string;
  readonly ops: readonly Op[];
}

export function pickTarget(holder: IdHolder, index: IdIndex): PickedTarget {
  if (holder.id !== undefined) {
    return { id: holder.id, ops: [] };
  }
  const id = freshName(mintBase(holder), takenNames(index));
  return { id, ops: [{ op: 'setScalar', path: holder.path, keys: ['id'], value: id }] };
}
