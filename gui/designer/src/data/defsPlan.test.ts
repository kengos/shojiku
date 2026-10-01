import type { Op } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { applyDefinitionOps, readDefinitionField } from './definitionsEdit';
import { type AddKind, addFieldPlan, MAX_DEFS_EDITS, sanitizeDefsEdits } from './defsPlan';
import { type DefsNode, readDefsTree } from './defsTree';
import { SELECTION_SEP } from './editorModel';
import { findNode } from './treeModel';

// A schema exercising every field shape: a top-level scalar (ungrouped), a
// nested object leaf, and an array-group row field.
const DEFS = `type: object
properties:
  total:
    type: number
    format: currency
    title: 合計
    description: 税込の総額
  customer:
    type: object
    properties:
      name:
        type: string
        title: 宛名
  items:
    type: array
    title: 明細
    items:
      type: object
      properties:
        qty:
          type: number
`;

function treeOf(text: string) {
  const tree = readDefsTree(text);
  if (tree === null) {
    throw new Error('fixture should parse');
  }
  return tree;
}

function node(text: string, id: string[]) {
  const found = findNode(treeOf(text), id.join(SELECTION_SEP));
  if (found === null) {
    throw new Error(`no node ${id.join('.')}`);
  }
  return found;
}

function planned(parent: DefsNode, label: string, name: string, kind: AddKind) {
  const plan = addFieldPlan(DEFS, parent, label, name, kind);
  if (!plan.ok) {
    throw new Error(plan.reason);
  }
  return plan;
}

describe('addFieldPlan', () => {
  it('plans a fresh top-level field as ONE putValue op, and returns its keys path', () => {
    const plan = planned(treeOf(DEFS), '', 'memo', 'string');
    expect(plan.op).toEqual({
      op: 'putValue',
      keys: ['properties', 'memo'],
      value: { type: 'string' },
    });
    expect(plan.keysPath).toEqual(['properties', 'memo']);
    // Applying it authors a real field.
    expect(
      readDefinitionField(applyDefinitionOps(DEFS, [plan.op]), ['properties', 'memo']).type,
    ).toBe('string');
  });

  it('writes the display label as the title, trimmed, and only when given', () => {
    expect(planned(treeOf(DEFS), '  税率  ', 'tax_rate', 'number').op).toEqual({
      op: 'putValue',
      keys: ['properties', 'tax_rate'],
      value: { type: 'number', title: '税率' },
    });
    expect(planned(treeOf(DEFS), '   ', 'tax_rate', 'number').op).toMatchObject({
      value: { type: 'number' },
    });
  });

  it('starts each of the seven kinds as its own schema', () => {
    const root = treeOf(DEFS);
    const value = (kind: AddKind) => {
      const op = planned(root, '', 'x', kind).op;
      return 'value' in op ? op.value : undefined;
    };
    expect(value('string')).toEqual({ type: 'string' });
    expect(value('number')).toEqual({ type: 'number' });
    expect(value('integer')).toEqual({ type: 'integer' });
    expect(value('boolean')).toEqual({ type: 'boolean' });
    // A container carries no empty `properties: {}` — a flow map would make
    // every later child flow-style.
    expect(value('group')).toEqual({ type: 'object' });
    expect(value('table')).toEqual({ type: 'array', items: { type: 'object' } });
    expect(value('list')).toEqual({ type: 'array', items: { type: 'string' } });
  });

  it('adds into a group under its own properties', () => {
    const plan = planned(node(DEFS, ['properties', 'customer']), '', 'tel', 'string');
    expect(plan.keysPath).toEqual(['properties', 'customer', 'properties', 'tel']);
  });

  it('adds into a table under its ROW object (items.properties)', () => {
    const plan = planned(node(DEFS, ['properties', 'items']), '', 'unit', 'string');
    expect(plan.keysPath).toEqual(['properties', 'items', 'items', 'properties', 'unit']);
  });

  it('adds into a group with no properties yet, creating the map as a block', () => {
    const text = 'type: object\nproperties:\n  meta:\n    type: object\n';
    const plan = addFieldPlan(text, node(text, ['properties', 'meta']), '', 'note', 'string');
    if (!plan.ok) {
      throw new Error(plan.reason);
    }
    const out = applyDefinitionOps(text, [plan.op]);
    expect(readDefinitionField(out, ['properties', 'meta', 'properties', 'note']).type).toBe(
      'string',
    );
    expect(out).not.toContain('{');
  });

  it('adds into a nested container (a group inside a table row)', () => {
    const text = `type: object
properties:
  items:
    type: array
    items:
      type: object
      properties:
        addr:
          type: object
          properties:
            city: { type: string }
`;
    const parent = node(text, ['properties', 'items', 'items', 'properties', 'addr']);
    const plan = addFieldPlan(text, parent, '', 'zip', 'string');
    expect(plan.ok && plan.keysPath).toEqual([
      'properties',
      'items',
      'items',
      'properties',
      'addr',
      'properties',
      'zip',
    ]);
  });

  it('round-trips: the added item lands at the TAIL of its map, everything else byte-exact', () => {
    // A FIXED-POINT fixture (canonical flow spacing, a comment on the root and
    // inside the target map) so the comparison can be byte for byte.
    const text = `# invoice data
type: object
properties:
  # the grand total
  total: { type: number }
  customer:
    type: object
    properties:
      name: { type: string }
`;
    const plan = addFieldPlan(text, node(text, ['properties', 'customer']), 'Tel', 'tel', 'string');
    if (!plan.ok) {
      throw new Error(plan.reason);
    }
    expect(applyDefinitionOps(text, [plan.op])).toBe(
      `${text}      tel:\n        type: string\n        title: Tel\n`,
    );
  });

  it('refuses an empty name', () => {
    expect(addFieldPlan(DEFS, treeOf(DEFS), '', '   ', 'string')).toEqual({
      ok: false,
      reason: 'empty_name',
    });
  });

  it('refuses an over-long name', () => {
    expect(addFieldPlan(DEFS, treeOf(DEFS), '', 'x'.repeat(200), 'string')).toEqual({
      ok: false,
      reason: 'name_too_long',
    });
  });

  it('refuses a dotted name, which no binding path can reach', () => {
    expect(addFieldPlan(DEFS, treeOf(DEFS), '', 'a.b', 'string')).toEqual({
      ok: false,
      reason: 'name_has_dot',
    });
  });

  it('refuses characters that draw nothing, but keeps the joiners and variation selectors', () => {
    for (const bad of [
      'a\u202Eb',
      'a\u061Cb',
      'a\u00ADb',
      'a\u0007b',
      // Letters and marks that LOOK blank, and the line separators — outside
      // Cc/Cf, inside the "draws nothing" class.
      '\u3164',
      'a\u115Fb',
      'a\uFFA0b',
      'a\u034Fb',
      'a\u2028b',
      'a\u2029b',
    ]) {
      expect(addFieldPlan(DEFS, treeOf(DEFS), '', bad, 'string')).toEqual({
        ok: false,
        reason: 'name_invisible',
      });
    }
    // ZWJ / ZWNJ carry meaning in Indic scripts and emoji sequences.
    expect(addFieldPlan(DEFS, treeOf(DEFS), '', 'क\u200Dष', 'string').ok).toBe(true);
    expect(addFieldPlan(DEFS, treeOf(DEFS), '', 'a\u200Cb', 'string').ok).toBe(true);
    // Variation selectors pick a glyph variant (an ideographic one spells a
    // Japanese name's exact kanji), so they stay.
    expect(addFieldPlan(DEFS, treeOf(DEFS), '', '葛\u{E0100}', 'string').ok).toBe(true);
    expect(addFieldPlan(DEFS, treeOf(DEFS), '', '\u2764\uFE0F', 'string').ok).toBe(true);
  });

  it('refuses a name the SAME container already holds (own-property guard)', () => {
    expect(addFieldPlan(DEFS, treeOf(DEFS), '', 'total', 'string')).toEqual({
      ok: false,
      reason: 'key_exists',
    });
    const customer = node(DEFS, ['properties', 'customer']);
    expect(addFieldPlan(DEFS, customer, '', 'name', 'string')).toEqual({
      ok: false,
      reason: 'key_exists',
    });
    // The same name in ANOTHER container is fine.
    expect(addFieldPlan(DEFS, customer, '', 'total', 'string').ok).toBe(true);
  });

  it('treats a hostile prototype name as a fresh key, quoted inertly', () => {
    for (const name of ['__proto__', 'constructor', 'toString']) {
      const plan = planned(treeOf(DEFS), '', name, 'number');
      const text = applyDefinitionOps(DEFS, [plan.op]);
      expect(readDefinitionField(text, ['properties', name]).type).toBe('number');
    }
  });

  it('allows the key on malformed definitions (the base guards on apply)', () => {
    expect(addFieldPlan(': : bad', treeOf(DEFS), '', 'memo', 'string').ok).toBe(true);
  });
});

describe('sanitizeDefsEdits', () => {
  const op: Op = { op: 'setScalar', keys: ['properties', 'total', 'title'], value: 'x' };

  it('keeps op-shaped records', () => {
    expect(sanitizeDefsEdits([op])).toEqual([op]);
  });

  it('degrades every non-array shape to no edits', () => {
    expect(sanitizeDefsEdits(null)).toEqual([]);
    expect(sanitizeDefsEdits(undefined)).toEqual([]);
    expect(sanitizeDefsEdits('[]')).toEqual([]);
    expect(sanitizeDefsEdits({ 0: op, length: 1 })).toEqual([]);
  });

  it('drops entries that are not records carrying a string op', () => {
    expect(sanitizeDefsEdits([op, 'setScalar', null, 42, [op], { keys: [] }, { op: 7 }])).toEqual([
      op,
    ]);
  });

  it('caps the restored list, dropping the tail', () => {
    const many = Array.from({ length: MAX_DEFS_EDITS + 10 }, () => op);
    expect(sanitizeDefsEdits(many)).toHaveLength(MAX_DEFS_EDITS);
  });

  it('leaves a hostile prototype key inert own data on the parsed value', () => {
    const raw: unknown = JSON.parse('[{"op":"setScalar","__proto__":{"polluted":1}}]');
    expect(sanitizeDefsEdits(raw)).toHaveLength(1);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
