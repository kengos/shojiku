// Which rule stays OPEN when the rule list changes under it. The open rule is
// held as a wire index, and an index names a different rule the moment an entry
// before it moves, arrives or leaves — so the rule view would silently start
// editing a neighbour.
//
// Two kinds of change reach it. An applied op (`apply`/`batch`) reports itself,
// so the index is remapped exactly (`openAfterOps`). Undo and redo restore a
// snapshot and report NO ops, so the rule is followed by its VALUE instead
// (`followOpenRule`): unchanged in place, it stays; moved, it is found again.

import type { Op } from '@shojiku/designer-core';

/** Where the open index goes through one op on the list at `listPath`; `null`
 * once the open rule itself is gone. */
function remapOne(open: number, op: Op, listPath: string): number | null {
  switch (op.op) {
    case 'moveItem':
      return remapMove(open, op, listPath);
    case 'insertItem':
      return op.path === listPath && op.index <= open ? open + 1 : open;
    case 'duplicateItem':
      return op.path === listPath && op.index < open ? open + 1 : open;
    case 'removeItem':
      return op.path === listPath ? afterRemoval(open, op.index) : open;
    default:
      return replacesList(op.path, op.keys, listPath) ? null : open;
  }
}

function afterRemoval(open: number, index: number): number | null {
  if (index === open) {
    return null;
  }
  return index < open ? open - 1 : open;
}

function remapMove(
  open: number,
  op: Extract<Op, { op: 'moveItem' }>,
  listPath: string,
): number | null {
  const destination = op.toPath ?? op.path;
  const leaves = op.path === listPath;
  const arrives = destination === listPath;
  if (leaves && arrives) {
    if (op.from === open) {
      return op.to;
    }
    const without = op.from < open ? open - 1 : open;
    return op.to <= without ? without + 1 : without;
  }
  if (leaves) {
    return afterRemoval(open, op.from);
  }
  return arrives && op.to <= open ? open + 1 : open;
}

/** Whether a map-key op writes the list itself or a map above it — the list
 * is then replaced or gone, and no index into it survives. */
function replacesList(
  path: string | undefined,
  keys: readonly string[],
  listPath: string,
): boolean {
  const target = [path, ...keys].filter((part) => part !== undefined && part !== '').join('.');
  return listPath === target || listPath.startsWith(`${target}.`);
}

/** The open index after the ops of one applied change, in order. */
export function openAfterOps(
  open: number | null,
  ops: readonly Op[],
  listPath: string,
): number | null {
  let at = open;
  for (const op of ops) {
    if (at === null) {
      return null;
    }
    at = remapOne(at, op, listPath);
  }
  return at;
}

/** The open index after an undo/redo, from the list before and after it.
 *
 * Only a change whose SHAPE is recognisable is followed, because a value match
 * alone misleads: undoing an edit that made the open rule equal to another one
 * would find the other one. So: the same entries in another order (a move) →
 * the open rule's value, where it stays in place if it can; one entry taken
 * out or put back → the exact index shift; anything else (the rule's own edit
 * undone) → the index as it was. `null` once the index is past the end, which
 * shows the list. */
export function followOpenRule(
  before: readonly unknown[],
  after: readonly unknown[],
  open: number | null,
): number | null {
  if (open === null) {
    return null;
  }
  const at = followedIndex(before, after, open);
  return at !== null && at < after.length ? at : null;
}

function followedIndex(
  before: readonly unknown[],
  after: readonly unknown[],
  open: number,
): number | null {
  const was = before.map((entry) => JSON.stringify(entry));
  const now = after.map((entry) => JSON.stringify(entry));
  if (isPermutation(was, now)) {
    return now[open] === was[open] ? open : now.indexOf(was[open]);
  }
  const removed = singleSplice(was, now);
  if (removed !== null) {
    return afterRemoval(open, removed);
  }
  const inserted = singleSplice(now, was);
  return inserted !== null && inserted <= open ? open + 1 : open;
}

function isPermutation(was: readonly string[], now: readonly string[]): boolean {
  if (was.length !== now.length) {
    return false;
  }
  const sorted = (list: readonly string[]) => [...list].sort().join('\n');
  return sorted(was) === sorted(now);
}

/** The index `longer` loses to become `shorter`, when exactly one entry is the
 * difference; else `null`. */
function singleSplice(longer: readonly string[], shorter: readonly string[]): number | null {
  if (longer.length !== shorter.length + 1) {
    return null;
  }
  let at = 0;
  while (at < shorter.length && longer[at] === shorter[at]) {
    at++;
  }
  const rest = (list: readonly string[], from: number) => list.slice(from).join('\n');
  return rest(longer, at + 1) === rest(shorter, at) ? at : null;
}
