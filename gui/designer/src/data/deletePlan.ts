// Planning a node DELETE, and what an undo/redo of a rename or delete does to
// the sample data (the template and the definitions ride the undo stack's own
// snapshots; the samples are re-keyed against what they are at that moment).
//
// A delete touches two documents: the definitions edit list (the node and every
// edit under it go, `defsRestructure.ts`) and every sample variant (the key goes
// wherever the params hold it). The template is left alone by decision — a
// reference to the deleted name stays, reading as an undefined key in 診断 —
// which is why the confirmation names those places first.

import type { Op } from '@shojiku/designer-core';
import {
  type RemovedValue,
  removeSampleKey,
  renameSampleKey,
  restoreSampleValues,
} from '../sample/rekey';
import type { SampleSet } from '../sample/variants';
import { coalesceDefsEdit, requiredOp } from './definitionsEdit';
import { MAX_DEFS_EDITS } from './defsPlan';
import { deleteInEdits } from './defsRestructure';
import type { DefsEffect } from './defsStep';
import type { DefsNode } from './defsTree';
import { mapVariants, type RestructureInput, type RestructurePlan } from './renamePlan';

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
  const effect: DefsEffect = {
    kind: 'delete',
    keysPath: node.keysPath,
    name: node.name,
    variants: removed,
  };
  return { ok: true, templateOps: [], sampleSet, edits, effect, keysPath: null };
}

/** The sample set after an undo (`back`) or a redo crosses a step with
 * `effect`: a rename re-keys the node back or forward, a delete puts its values
 * back by variant id or removes them again. A plain edit, and a variant the step
 * never touched, are left exactly as they are. */
export function samplesAcross(set: SampleSet, effect: DefsEffect, back: boolean): SampleSet {
  if (effect.kind === 'rename') {
    const [at, to] = back ? [effect.to, effect.from] : [effect.from, effect.to];
    return mapVariants(set, (text) => renameSampleKey(text, [...effect.parent, at], to));
  }
  if (effect.kind === 'edit') {
    return set;
  }
  if (!back) {
    return mapVariants(set, (text) => removeSampleKey(text, effect.keysPath).text);
  }
  const byId = new Map(effect.variants.map((entry) => [entry.id, entry.removed]));
  return mapVariants(set, (text, id) => {
    const removed = byId.get(id);
    return removed === undefined ? text : restoreSampleValues(text, removed);
  });
}
