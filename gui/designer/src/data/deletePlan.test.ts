// Planning a delete (the template is never touched; every variant loses the
// value; the parent's required list drops the name) and the reverse halves a
// definitions undo applies — a delete's values put back by variant id, a
// rename's cascade back to the old name, a node gone from the tree needing none.

import type { Op } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import type { SampleSet } from '../sample/variants';
import { MAX_DEFS_EDITS } from './defsPlan';
import { type DefsNode, readDefsTree } from './defsTree';
import { planDelete, reversePlan } from './deletePlan';
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
    expect(plan.companion).toEqual({
      kind: 'delete',
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

describe('reversePlan', () => {
  it('puts a delete’s values back by variant id, skipping a variant since removed', () => {
    const plan = planDelete(input(), nodeA());
    if (!plan.ok || plan.companion.kind !== 'delete') {
      throw new Error('expected a delete');
    }
    const after: SampleSet = { ...plan.sampleSet, variants: plan.sampleSet.variants.slice(0, 1) };
    const reverse = reversePlan(input({ sampleSet: after }), tree(), plan.companion);
    // A variant the delete took nothing from is left exactly as it is.
    const both = reversePlan(input({ sampleSet: plan.sampleSet }), tree(), plan.companion);
    expect(both.ok && both.sampleSet.variants[1]).toBe(plan.sampleSet.variants[1]);
    expect(reverse.ok && JSON.parse(reverse.sampleSet.variants[0]?.text ?? '')).toEqual({
      a: 1,
      b: 2,
    });
    expect(reverse.ok && reverse.templateOps).toEqual([]);
  });

  it('cascades a rename back to the old name over the documents as they are now', () => {
    const renamed = 'type: object\nproperties:\n  z: { type: string }\n';
    const text = 'sections:\n  body:\n    items:\n      - { type: text, text: "{z}" }\n';
    const reverse = reversePlan(
      input({ definitions: renamed, templateText: text, refs: readDataRefs(text) }),
      tree(renamed),
      { kind: 'rename', keysPath: ['properties', 'z'], name: 'a' },
    );
    expect(reverse.ok && reverse.templateOps).toEqual([
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['text'], value: '{a}' },
    ]);
  });

  it('needs no reverse for a node the tree no longer holds, and refuses one that cannot apply', () => {
    const gone = reversePlan(input(), tree(), {
      kind: 'rename',
      keysPath: ['properties', 'q'],
      name: 'a',
    });
    expect(
      reversePlan(input(), null, { kind: 'rename', keysPath: ['properties', 'a'], name: 'x' }),
    ).toEqual({
      ok: true,
      templateOps: [],
      sampleSet: SET,
    });
    expect(gone).toEqual({ ok: true, templateOps: [], sampleSet: SET });
    const refused = reversePlan(input({ refs: null }), tree(), {
      kind: 'rename',
      keysPath: ['properties', 'a'],
      name: 'x',
    });
    expect(refused).toEqual({ ok: false });
  });
});
