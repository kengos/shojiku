// Planning a node DELETE, and the reverse halves a definitions undo applies.
//
// A delete touches two documents: the definitions edit list (the node and every
// edit under it go, `defsRestructure.ts`) and every sample variant (the key goes
// wherever the params hold it). The template is left alone by decision — a
// reference to the deleted name stays, reading as an undefined key in 診断 —
// which is why the confirmation names those places first.

import type { Op } from '@shojiku/designer-core';
import { type RemovedValue, removeSampleKey, restoreSampleValues } from '../sample/rekey';
import type { SampleSet } from '../sample/variants';
import { coalesceDefsEdit, requiredOp } from './definitionsEdit';
import type { DefsCompanion } from './defsHistory';
import { MAX_DEFS_EDITS } from './defsPlan';
import { deleteInEdits } from './defsRestructure';
import type { DefsNode } from './defsTree';
import { sameFrame } from './refs/match';
import {
  cascadePlan,
  mapVariants,
  type RestructureInput,
  type RestructurePlan,
} from './renamePlan';
import { flattenTree } from './treeModel';

/** Plan deleting `node` (and everything under it). */
export function planDelete(input: RestructureInput, node: DefsNode): RestructurePlan {
  let edits: Op[] = deleteInEdits(input.edits, input.base, node.keysPath);
  const required = requiredOp(node, false);
  if (required !== null) {
    edits = coalesceDefsEdit(edits, required);
  }
  if (edits.length > MAX_DEFS_EDITS) {
    return { ok: false, reason: 'edit_cap' };
  }
  const removed: { readonly id: string; readonly removed: readonly RemovedValue[] }[] = [];
  const sampleSet = mapVariants(input.sampleSet, (text, id) => {
    const result = removeSampleKey(text, node.keysPath);
    if (result.removed.length > 0) {
      removed.push({ id, removed: result.removed });
    }
    return result.text;
  });
  const companion: DefsCompanion = { kind: 'delete', name: node.name, variants: removed };
  return { ok: true, templateOps: [], sampleSet, edits, companion, keysPath: null };
}

/** What undoing a rename / delete re-applies to the template and the samples
 * (the definitions half is the restored op list). A rename's reverse is the
 * same cascade back to the old name, planned against the documents as they are
 * NOW — so a template edit made since survives — and refused whole on the same
 * grounds. A node the tree no longer holds needs no reverse. */
export function reversePlan(
  input: RestructureInput,
  tree: DefsNode | null,
  companion: DefsCompanion,
):
  | { readonly ok: true; readonly templateOps: readonly Op[]; readonly sampleSet: SampleSet }
  | { readonly ok: false } {
  if (companion.kind === 'delete') {
    const byId = new Map(companion.variants.map((entry) => [entry.id, entry.removed]));
    const sampleSet = mapVariants(input.sampleSet, (text, id) => {
      const removed = byId.get(id);
      return removed === undefined ? text : restoreSampleValues(text, removed);
    });
    return { ok: true, templateOps: [], sampleSet };
  }
  const nodes = tree === null ? [] : flattenTree(tree);
  const node = nodes.find((entry) => sameFrame(entry.keysPath, companion.keysPath));
  if (node === undefined) {
    return { ok: true, templateOps: [], sampleSet: input.sampleSet };
  }
  const cascade = cascadePlan(input, node, companion.name);
  return cascade.ok ? cascade : { ok: false };
}
