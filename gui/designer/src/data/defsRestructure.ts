// Renaming and deleting a node in the definitions EDIT LIST — the op list the
// Designer re-applies over the definitions base on every render.
//
// The list keeps one shape, so a rename or delete can rewrite it rather than
// pile ops on top: STRUCTURAL ops first (`renameKey` / `removeKey` of a NODE,
// applied in order over the base), then CONTENT ops (adds and leaf edits) in
// the FINAL names, coalesced per target. A rename therefore re-keys every
// content op under the node to the new name, and appends a structural
// `renameKey` only when the node really exists in the base at that point — a
// node an add created is renamed by re-keying its add. A delete drops every
// content op under the node (so re-adding it starts clean) and appends a
// structural `removeKey` on the same condition.
//
// Re-keying instead of appending is what keeps a workshop session correct: its
// base is re-inferred from the sample data, which the same rename re-keys, so
// an old-name edit left in the list would re-create the old node (a leaf
// write creates its missing parents) next to the renamed one.

import type { Op } from '@shojiku/designer-core';
import { applyDefinitionOps } from './definitionsEdit';
import { holdsNode } from './defsPlan';
import { isStructural, type StructuralOp } from './structuralOps';

function under(keys: readonly string[], prefix: readonly string[]): boolean {
  return prefix.length <= keys.length && prefix.every((key, index) => keys[index] === key);
}

/** The keys a structural rename leaves the node at. */
function renamedTo(op: StructuralOp): readonly string[] | null {
  return op.op === 'renameKey' ? [...op.keys.slice(0, -1), op.to] : null;
}

function split(edits: readonly Op[]): { structural: StructuralOp[]; content: Op[] } {
  const structural: StructuralOp[] = [];
  const content: Op[] = [];
  for (const op of edits) {
    if (isStructural(op)) {
      structural.push(op);
    } else {
      content.push(op);
    }
  }
  return { structural, content };
}

/** Whether `op` acts on `path` or anything above or below it. (Its TARGET need
 * not be asked: no later op can have renamed something INTO a name the rename
 * now claims — the name would be taken, and the rename refused as
 * `key_exists`.) */
function touches(op: StructuralOp, path: readonly string[]): boolean {
  return under(op.keys, path) || under(path, op.keys);
}

/** The structural op that last renamed a node TO `keys`, when nothing after it
 * touches the node — nor, for a rename, the name it is moving to (`claim`): an
 * op that later FREES that name (a swap, A→B then C→A then B→C) has to apply
 * before the folded rename can take it. */
function foldable(
  structural: readonly StructuralOp[],
  keys: readonly string[],
  claim: readonly string[] | null,
): number {
  for (let index = structural.length - 1; index >= 0; index--) {
    const op = structural[index];
    const to = renamedTo(op);
    if (to !== null && to.length === keys.length && under(to, keys)) {
      return index;
    }
    if (under(op.keys, keys) || under(keys, op.keys) || (claim !== null && touches(op, claim))) {
      return -1;
    }
  }
  return -1;
}

/** Whether the BASE (with the structural ops so far) holds the node — a node
 * only an add created does not. No base (a workshop / blank start) holds
 * nothing: its base follows the sample data. */
function inBase(
  base: string | undefined,
  structural: readonly StructuralOp[],
  keys: readonly string[],
): boolean {
  return base !== undefined && holdsNode(applyDefinitionOps(base, structural), keys);
}

/** The edit list after renaming the node at `keys` to `to`. */
export function renameInEdits(
  edits: readonly Op[],
  base: string | undefined,
  keys: readonly string[],
  to: string,
): Op[] {
  const { structural, content } = split(edits);
  const target = [...keys.slice(0, -1), to];
  const rekeyed = content.map((op) =>
    'keys' in op && under(op.keys, keys)
      ? { ...op, keys: [...target, ...op.keys.slice(keys.length)] }
      : op,
  );
  const fold = foldable(structural, keys, target);
  if (fold >= 0) {
    const op = structural[fold];
    const original = op.keys[op.keys.length - 1];
    structural.splice(
      fold,
      1,
      ...(original === to ? [] : [{ op: 'renameKey' as const, keys: op.keys, to }]),
    );
  } else if (inBase(base, structural, keys)) {
    structural.push({ op: 'renameKey', keys, to });
  }
  return [...structural, ...rekeyed];
}

/** The edit list after deleting the node at `keys`. */
export function deleteInEdits(
  edits: readonly Op[],
  base: string | undefined,
  keys: readonly string[],
): Op[] {
  const { structural, content } = split(edits);
  const kept = content.filter((op) => !('keys' in op && under(op.keys, keys)));
  const fold = foldable(structural, keys, null);
  if (fold >= 0) {
    structural.splice(fold, 1, { op: 'removeKey', keys: structural[fold].keys });
  } else if (inBase(base, structural, keys)) {
    structural.push({ op: 'removeKey', keys });
  }
  return [...structural, ...kept];
}
