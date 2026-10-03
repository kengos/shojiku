// Planning a rename across the template, the sample variants and the
// definitions edit list: the cascade per carrier (rewrite lands, everything else
// byte-exact), the scope rules (a same-spelled key elsewhere is untouched; a
// group renames every descendant's prefix; a table renames only its source), the
// sample re-key in EVERY variant, and each refusal arm — the name rules, the two
// the template imposes, and the size / count / truncation bounds.

import {
  Editor,
  MAX_BATCH_OPS,
  MAX_TEMPLATE_BYTES,
  type Op,
  parseTemplate,
  readTemplate,
} from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { MAX_PARAMS_BYTES } from '../sample/model';
import type { SampleSet } from '../sample/variants';
import { applyDefinitionOps } from './definitionsEdit';
import { MAX_DEFS_EDITS } from './defsPlan';
import { type DefsNode, readDefsTree } from './defsTree';
import { SELECTION_SEP } from './editorModel';
import { readDataRefs } from './refs/walk';
import { applyScratch, planRename, type RestructureInput, renameRefusal } from './renamePlan';
import { findNode } from './treeModel';

const DEFS = `type: object
properties:
  total: { type: number }
  name: { type: string }
  customer:
    type: object
    properties:
      name: { type: string }
      city: { type: string }
  items:
    type: array
    items:
      type: object
      required: [name]
      properties:
        name: { type: string }
        qty: { type: number }
required: [total, name]
`;

const TEMPLATE = `# the invoice
sections:
  body:
    type: flow
    items:
      - type: text # total line
        text: "合計 {total:currency} / {{total}}"
        data: { key: total }
      - { type: text, text: "{customer.name} 様 {customer.city}" }
      - type: table
        data: { key: items }
        columns:
          - { label: "{name}", data: { key: name } }
          - { data: { key: qty } }
        row:
          conditionalStyles:
            - { when: { key: qty }, style: { bold: true } }
`;

const SAMPLE = (total: number) =>
  JSON.stringify(
    {
      total,
      name: 'n',
      customer: { name: 'c', city: 'x' },
      items: [
        { name: 'a', qty: 1 },
        { name: 'b', qty: 2 },
      ],
    },
    null,
    2,
  );

const SET: SampleSet = {
  active: 'default',
  variants: [
    { id: 'default', text: SAMPLE(1), origin: 'preset' },
    { id: 'long', text: SAMPLE(2), origin: 'preset' },
    { id: 'user-1', text: SAMPLE(3), origin: 'user', name: 'mine' },
  ],
};

function input(over: Partial<RestructureInput> = {}): RestructureInput {
  const templateText = over.templateText ?? TEMPLATE;
  return {
    definitions: DEFS,
    base: DEFS,
    edits: [],
    templateText,
    refs: readDataRefs(templateText),
    maxBytes: 1_048_576,
    sampleSet: SET,
    ...over,
  };
}

function node(...keys: string[]): DefsNode {
  const tree = readDefsTree(DEFS);
  const found = tree === null ? null : findNode(tree, keys.join(SELECTION_SEP));
  if (found === null) {
    throw new Error(`no node ${keys.join('.')}`);
  }
  return found;
}

function applied(text: string, ops: readonly Op[]): string {
  const editor = Editor.create(text);
  expect(editor.applyAll(ops).ok).toBe(true);
  return editor.text();
}

describe('planRename — the template cascade', () => {
  it('rewrites a field everywhere it is named, keeping every other byte', () => {
    const plan = planRename(input(), node('properties', 'total'), 'grand');
    if (!plan.ok) {
      throw new Error(plan.reason);
    }
    const text = applied(TEMPLATE, plan.templateOps);
    expect(text).toContain('text: "合計 {grand:currency} / {{total}}"');
    expect(text).toContain('data: { key: grand }');
    expect(text).toContain('# the invoice');
    expect(text).toContain('- type: text # total line');
    expect(text).toContain('{customer.name} 様 {customer.city}');
  });

  it('a group rename rewrites every descendant’s prefix', () => {
    const plan = planRename(input(), node('properties', 'customer'), 'client');
    expect(plan.ok && applied(TEMPLATE, plan.templateOps)).toContain(
      '{client.name} 様 {client.city}',
    );
  });

  it('a table rename rewrites only its source; its rows read relative keys', () => {
    const plan = planRename(input(), node('properties', 'items'), 'lines');
    expect(plan.ok && plan.templateOps).toEqual([
      { op: 'setScalar', path: 'sections.body.items[2]', keys: ['data', 'key'], value: 'lines' },
    ]);
  });

  it('a row field rename rewrites its column, label and row condition — not the top-level same name', () => {
    const plan = planRename(
      input(),
      node('properties', 'items', 'items', 'properties', 'qty'),
      'count',
    );
    expect(plan.ok && plan.templateOps.map((op) => ('path' in op ? op.path : ''))).toEqual([
      'sections.body.items[2].columns[1]',
      'sections.body.items[2].row.conditionalStyles[0]',
    ]);
    const same = planRename(
      input(),
      node('properties', 'items', 'items', 'properties', 'name'),
      'title',
    );
    const text = same.ok ? applied(TEMPLATE, same.templateOps) : '';
    expect(text).toContain('- { label: "{name}", data: { key: title } }');
    // The label interpolates at DOCUMENT scope, so its {name} is the top-level
    // field — a same-spelled key in another scope stays untouched.
    expect(planRename(input(), node('properties', 'name'), 'title').ok).toBe(true);
  });

  it('re-keys the sample in every variant, inactive ones included, keeping key order', () => {
    const plan = planRename(
      input(),
      node('properties', 'items', 'items', 'properties', 'qty'),
      'count',
    );
    if (!plan.ok) {
      throw new Error(plan.reason);
    }
    for (const variant of plan.sampleSet.variants) {
      const rows = JSON.parse(variant.text).items;
      expect(Object.keys(rows[0])).toEqual(['name', 'count']);
      expect(Object.keys(rows[1])).toEqual(['name', 'count']);
    }
  });

  it('renames the node in the edit list and in its parent’s required list', () => {
    const plan = planRename(
      input(),
      node('properties', 'items', 'items', 'properties', 'name'),
      'title',
    );
    expect(plan.ok && plan.edits).toEqual([
      {
        op: 'renameKey',
        keys: ['properties', 'items', 'items', 'properties', 'name'],
        to: 'title',
      },
      { op: 'setStrings', keys: ['properties', 'items', 'items', 'required'], values: ['title'] },
    ]);
    expect(plan.ok && plan.keysPath).toEqual([
      'properties',
      'items',
      'items',
      'properties',
      'title',
    ]);
    expect(plan.ok && plan.companion).toEqual({
      kind: 'rename',
      keysPath: ['properties', 'items', 'items', 'properties', 'title'],
      name: 'name',
    });
  });
});

describe('planRename — the quiet cases', () => {
  it('an unused node renames the definitions and samples with no template batch', () => {
    const text = 'sections:\n  body:\n    items: []\n';
    const plan = planRename(
      input({ templateText: text, refs: readDataRefs(text) }),
      node('properties', 'total'),
      'g',
    );
    expect(plan.ok && plan.templateOps).toEqual([]);
  });

  it('rewrites only the expression that names the node in a shared string', () => {
    const text = 'sections:\n  body:\n    items:\n      - { type: text, text: "{total} {name}" }\n';
    const plan = planRename(
      input({ templateText: text, refs: readDataRefs(text) }),
      node('properties', 'total'),
      'g',
    );
    expect(plan.ok && plan.templateOps).toEqual([
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['text'], value: '{g} {name}' },
    ]);
  });
});

describe('planRename — refusals (nothing is planned)', () => {
  const total = () => node('properties', 'total');

  it('refuses the add form’s name rules, an unchanged name, and a taken one', () => {
    expect(renameRefusal(input(), total(), '')).toBe('empty_name');
    expect(renameRefusal(input(), total(), 'a.b')).toBe('name_has_dot');
    expect(renameRefusal(input(), total(), 'a​b')).toBe('name_invisible');
    expect(renameRefusal(input(), total(), 'x'.repeat(200))).toBe('name_too_long');
    expect(renameRefusal(input(), total(), 'total')).toBe('same_name');
    expect(renameRefusal(input(), total(), 'name')).toBe('key_exists');
    expect(renameRefusal(input(), total(), 'grand')).toBeNull();
  });

  it('refuses a name a `{key}` cannot spell only when a `{key}` uses the item', () => {
    expect(renameRefusal(input(), total(), '合計')).toBe('not_interpolatable');
    const keyOnly = 'sections:\n  body:\n    items: [ { type: text, data: { key: total } } ]\n';
    expect(
      renameRefusal(input({ templateText: keyOnly, refs: readDataRefs(keyOnly) }), total(), '合計'),
    ).toBeNull();
  });

  it('refuses a name an item’s own `bindings:` name would capture', () => {
    const text =
      'sections:\n  body:\n    items:\n      - { type: text, text: "{total}", bindings: { grand: { key: name } } }\n';
    expect(
      renameRefusal(input({ templateText: text, refs: readDataRefs(text) }), total(), 'grand'),
    ).toBe('binding_capture');
  });

  it('refuses when the walk could not see everything (or the template does not parse)', () => {
    expect(renameRefusal(input({ refs: { refs: [], truncated: true } }), total(), 'grand')).toBe(
      'walk_truncated',
    );
    expect(renameRefusal(input({ refs: null }), total(), 'grand')).toBe('walk_truncated');
  });

  it(`refuses more than ${MAX_BATCH_OPS} rewritten places`, () => {
    const many = (count: number) =>
      `sections:\n  body:\n    items:\n${'      - { type: text, data: { key: total } }\n'.repeat(count)}`;
    const at = (count: number) =>
      planRename(
        input({ templateText: many(count), refs: readDataRefs(many(count)) }),
        total(),
        'grand',
      );
    expect(at(MAX_BATCH_OPS).ok).toBe(true);
    expect(at(MAX_BATCH_OPS + 1)).toEqual({ ok: false, reason: 'too_many_refs' });
  });

  it('refuses a template the rewrite would push past the session cap', () => {
    const text = TEMPLATE;
    const size = new TextEncoder().encode(text).length;
    expect(planRename(input({ maxBytes: size }), total(), 'g')).toMatchObject({ ok: true });
    expect(planRename(input({ maxBytes: size }), total(), 'grand_total')).toEqual({
      ok: false,
      reason: 'too_large',
    });
  });

  it('refuses a sample variant the re-key would push past the params cap', () => {
    const big = JSON.stringify({ total: 1, pad: 'x'.repeat(MAX_PARAMS_BYTES - 30) });
    const set: SampleSet = {
      active: 'default',
      variants: [{ id: 'default', text: big, origin: 'preset' }],
    };
    expect(planRename(input({ sampleSet: set }), total(), 'grand_total_amount')).toEqual({
      ok: false,
      reason: 'too_large',
    });
  });

  it('refuses at the edit-list cap', () => {
    const edits: Op[] = Array.from({ length: MAX_DEFS_EDITS }, (_, i) => ({
      op: 'setScalar',
      keys: ['properties', `f${i}`, 'title'],
      value: 'x',
    }));
    expect(planRename(input({ edits }), total(), 'grand')).toEqual({
      ok: false,
      reason: 'edit_cap',
    });
  });

  it('refuses definitions that do not parse', () => {
    expect(planRename(input({ definitions: ': [' }), total(), 'grand')).toEqual({
      ok: false,
      reason: 'too_large',
    });
  });
});

describe('applyScratch', () => {
  it('answers null for text that does not parse or a batch the editor refuses', () => {
    expect(applyScratch(': [', [{ op: 'removeKey', keys: ['a'] }], 1_048_576)).toBeNull();
    expect(applyScratch('a: 1\n', [{ op: 'removeKey', keys: ['missing'] }], 1_048_576)).toBeNull();
    expect(applyScratch('a: 1\n', [], 1)).toBe('a: 1\n');
  });
});

describe('planRename — the parent’s required list', () => {
  it('renames the node in place among its siblings', () => {
    const plan = planRename(input(), node('properties', 'total'), 'grand');
    expect(plan.ok && plan.edits).toContainEqual({
      op: 'setStrings',
      keys: ['required'],
      values: ['grand', 'name'],
    });
  });
});

describe('planRename — names and shapes the census must survive', () => {
  it('writes a name that looks like YAML syntax as a plain key, in the template and the definitions', () => {
    const keyOnly = 'sections:\n  body:\n    items: [ { type: text, data: { key: total } } ]\n';
    for (const name of ['a: b', '- x']) {
      const plan = planRename(
        input({ templateText: keyOnly, refs: readDataRefs(keyOnly) }),
        node('properties', 'total'),
        name,
      );
      if (!plan.ok) {
        throw new Error(plan.reason);
      }
      const template = readTemplate(parseTemplate(applied(keyOnly, plan.templateOps))) as {
        sections: { body: { items: { data: { key: string } }[] } };
      };
      expect(template.sections.body.items[0]?.data.key).toBe(name);
      const defs = readTemplate(parseTemplate(applyDefinitionOps(DEFS, plan.edits))) as {
        properties: Record<string, unknown>;
      };
      expect(Object.keys(defs.properties)).toContain(name);
      expect(Object.keys(defs.properties)).toHaveLength(4);
    }
  });

  it('renames a field of a table nested in another table’s rows, through the list that reads it', () => {
    const defs = `type: object
properties:
  orders:
    type: array
    items:
      type: object
      properties:
        lines:
          type: array
          items:
            type: object
            properties:
              sku: { type: string }
`;
    const text = `sections:
  body:
    items:
      - type: table
        data: { key: orders }
        columns:
          - cell:
              items:
                - { type: list, data: { key: lines }, text: "{sku}" }
`;
    const tree = readDefsTree(defs);
    const sku =
      tree === null
        ? null
        : findNode(
            tree,
            [
              'properties',
              'orders',
              'items',
              'properties',
              'lines',
              'items',
              'properties',
              'sku',
            ].join(SELECTION_SEP),
          );
    if (sku === null) {
      throw new Error('fixture');
    }
    const plan = planRename(
      input({
        definitions: defs,
        base: defs,
        templateText: text,
        refs: readDataRefs(text),
        sampleSet: { active: 'd', variants: [{ id: 'd', text: '{}', origin: 'preset' }] },
      }),
      sku,
      'code',
    );
    expect(plan.ok && plan.templateOps).toEqual([
      {
        op: 'setScalar',
        path: 'sections.body.items[0].columns[0].cell.items[0]',
        keys: ['text'],
        value: '{code}',
      },
    ]);
  });

  it('refuses definitions the rename would push past their size cap', () => {
    const head =
      'type: object\nproperties:\n  total: { type: number }\n  pad: { type: string, description: "';
    const tail = '" }\n';
    const fill = MAX_TEMPLATE_BYTES - head.length - tail.length - 2;
    const defs = `${head}${'x'.repeat(fill)}${tail}`;
    const text = 'sections:\n  body:\n    items: []\n';
    const tree = readDefsTree(defs);
    const total =
      tree === null ? null : findNode(tree, ['properties', 'total'].join(SELECTION_SEP));
    if (total === null) {
      throw new Error('fixture');
    }
    const at = (name: string) =>
      planRename(
        input({
          definitions: defs,
          base: defs,
          edits: [],
          templateText: text,
          refs: readDataRefs(text),
        }),
        total,
        name,
      );
    expect(at('t').ok).toBe(true);
    expect(at('total_amount_in_tax')).toEqual({ ok: false, reason: 'too_large' });
  });
});
