// Planning a delete (the template is never touched; every variant loses the
// value; the parent's required list drops the name) and what an undo / redo of a
// step does to the samples — a delete's values put back by variant id or
// removed again, a rename re-keyed back or forward, a plain edit nothing.

import type { Op } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import type { SampleSet } from '../sample/variants';
import { MAX_DEFS_EDITS } from './defsPlan';
import { type DefsNode, readDefsTree } from './defsTree';
import { planDelete, samplesAcross } from './deletePlan';
import { SELECTION_SEP } from './editorModel';
import { readDataRefs } from './refs/walk';
import type { RestructureInput } from './renamePlan';
import { findNode } from './treeModel';

const DEFS =
  'type: object\nproperties:\n  a: { type: string }\n  b: { type: string }\nrequired: [a, b]\n';
const TEMPLATE = 'sections:\n  body:\n    items:\n      - { type: text, text: "{a}" }\n';
const SET: SampleSet = {
  active: 'one',
  variants: [
    { id: 'one', text: '{"a": 1, "b": 2}', origin: 'preset' },
    { id: 'two', text: '{"b": 3}', origin: 'user', name: 'two' },
  ],
};

function input(over: Partial<RestructureInput> = {}): RestructureInput {
  return {
    definitions: DEFS,
    base: DEFS,
    edits: [],
    templateText: TEMPLATE,
    refs: readDataRefs(TEMPLATE),
    maxBytes: 1_048_576,
    sampleSet: SET,
    ...over,
  };
}

function tree(text = DEFS): DefsNode {
  const root = readDefsTree(text);
  if (root === null) {
    throw new Error('fixture should parse');
  }
  return root;
}

const nodeA = () => findNode(tree(), ['properties', 'a'].join(SELECTION_SEP)) as DefsNode;

describe('planDelete', () => {
  it('removes the node and its required entry, every variant’s value, and leaves the template', () => {
    const plan = planDelete(input(), nodeA());
    if (!plan.ok) {
      throw new Error(plan.reason);
    }
    expect(plan.templateOps).toEqual([]);
    expect(plan.edits).toEqual([
      { op: 'removeKey', keys: ['properties', 'a'] },
      { op: 'setStrings', keys: ['required'], values: ['b'] },
    ]);
    expect(plan.sampleSet.variants.map((variant) => JSON.parse(variant.text))).toEqual([
      { b: 2 },
      { b: 3 },
    ]);
    // The untouched variant keeps its very text.
    expect(plan.sampleSet.variants[1]).toBe(SET.variants[1]);
    expect(plan.effect).toEqual({
      kind: 'delete',
      keysPath: ['properties', 'a'],
      name: 'a',
      variants: [{ id: 'one', removed: [{ path: ['a'], value: 1, position: 0 }] }],
    });
    expect(plan.keysPath).toBeNull();
  });

  it('refuses at the edit-list cap', () => {
    const edits: Op[] = Array.from({ length: MAX_DEFS_EDITS }, (_, i) => ({
      op: 'setScalar',
      keys: ['properties', `f${i}`, 'title'],
      value: 'x',
    }));
    expect(planDelete(input({ edits }), nodeA())).toEqual({ ok: false, reason: 'edit_cap' });
  });
});

describe('samplesAcross', () => {
  it('puts a delete’s values back by variant id, skipping a variant since removed, and redoes it', () => {
    const plan = planDelete(input(), nodeA());
    if (!plan.ok) {
      throw new Error(plan.reason);
    }
    const after: SampleSet = { ...plan.sampleSet, variants: plan.sampleSet.variants.slice(0, 1) };
    const back = samplesAcross(after, plan.effect, true);
    expect(JSON.parse(back.variants[0]?.text ?? '')).toEqual({ a: 1, b: 2 });
    // A variant the delete took nothing from is left exactly as it is.
    const both = samplesAcross(plan.sampleSet, plan.effect, true);
    expect(both.variants[1]).toBe(plan.sampleSet.variants[1]);
    expect(samplesAcross(SET, plan.effect, false)).toEqual(plan.sampleSet);
  });

  it('re-keys a rename back and forward, and leaves the samples alone for a plain edit', () => {
    const effect = { kind: 'rename', parent: ['properties'], from: 'a', to: 'z' } as const;
    const renamed = samplesAcross(SET, effect, false);
    expect(renamed.variants.map((variant) => JSON.parse(variant.text))).toEqual([
      { z: 1, b: 2 },
      { b: 3 },
    ]);
    expect(samplesAcross(renamed, effect, true).variants.map((v) => JSON.parse(v.text))).toEqual([
      { a: 1, b: 2 },
      { b: 3 },
    ]);
    expect(samplesAcross(SET, { kind: 'edit' }, true)).toBe(SET);
  });
});
