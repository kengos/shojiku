// A COPY must not share its original's ids. Duplicating a node (⌘D) or
// inserting a saved block lands a subtree whose `id:`s are the ones it was
// copied from, and two different nodes carrying one id make every anchor to it
// resolve to whichever is placed first (`anchor_ambiguous_target`). So each
// copied id takes the next free name (`total` → `total_2`), and an anchor
// INSIDE the copy that named a node inside the copy follows it — a copied
// "circle this answer" group circles its own answer, not the original's. An
// anchor naming something OUTSIDE the copy is left alone.
//
// The ops address the copy where it WILL be (`at`), so they run in the same
// transactional batch as the duplicate/insert that creates it: one undo step.
// When the DOCUMENT's namespace is partial (a truncated walk) a fresh name
// cannot be proven free, so the copy's ids — every one of them, since the
// copy's own walk is whole — are REMOVED instead. When the COPY cannot be read
// whole, the copy is refused (`CopyRefusal`).

import { MAX_BATCH_OPS, type Op, type ReadFn } from '@shojiku/designer-core';
import { freshName } from './idEdit';
import { buildIdIndex, type IdIndex, subtreeIndex, takenNames } from './idIndex';

/** Why a copy is refused: its ops would pass `MAX_BATCH_OPS` together with
 * the op that creates it, or its subtree cannot be read whole (the
 * materialization cap, or a walk cut short) — an id the walk cannot see is one
 * the copy would carry verbatim, so the only outcome that cannot collide is
 * not to copy. */
export type CopyRefusal = 'too_many' | 'unreadable';

export type CopyIds =
  | { readonly ok: true; readonly ops: readonly Op[] }
  | { readonly ok: false; readonly reason: CopyRefusal };

/** The ops that give the copy of `value`, landing at `at`, its own ids —
 * none when it carries no id. */
export function copyIdOps(value: unknown, at: string, document: IdIndex): CopyIds {
  const copy = subtreeIndex(value, at);
  if (copy.truncated) {
    return { ok: false, reason: 'unreadable' };
  }
  const named = copy.holders.flatMap((holder) =>
    holder.id === undefined ? [] : [{ path: holder.path, id: holder.id }],
  );
  const ops: Op[] = [];
  if (document.truncated) {
    for (const holder of named) {
      ops.push({ op: 'removeKey', path: holder.path, keys: ['id'] });
    }
  } else {
    const taken = takenNames(document);
    const renamed = new Map<string, string>();
    for (const holder of named) {
      const { id } = holder;
      const next = freshName(id, taken);
      taken.add(next);
      // The FIRST holder of an id inside the copy is the one its anchors meant
      // (the engine resolves to the first placement), so it keeps the mapping.
      if (!renamed.has(id)) {
        renamed.set(id, next);
      }
      ops.push({ op: 'setScalar', path: holder.path, keys: ['id'], value: next });
    }
    for (const ref of copy.refs) {
      const next = renamed.get(ref.id);
      if (next !== undefined) {
        ops.push({ op: 'setScalar', path: ref.path, keys: ref.keys, value: next });
      }
    }
  }
  return ops.length + 1 > MAX_BATCH_OPS ? { ok: false, reason: 'too_many' } : { ok: true, ops };
}

/** The whole ⌘D batch for the sequence entry `index` of `parent`: the
 * duplicate itself, then the copy's ids. A subtree the materialization cap
 * refuses to read is refused too — its ids cannot be seen, so they cannot be
 * renamed. */
export function duplicateOps(read: ReadFn, parent: string, index: number): CopyIds {
  let original: unknown;
  try {
    original = read(`${parent}[${index}]`);
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
  const ids = copyIdOps(original, `${parent}[${index + 1}]`, buildIdIndex(read));
  return ids.ok
    ? { ok: true, ops: [{ op: 'duplicateItem', path: parent, index }, ...ids.ops] }
    : ids;
}
