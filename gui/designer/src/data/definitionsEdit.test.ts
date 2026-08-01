import { describe, expect, it } from 'vitest';
import { readDefinitionsView } from '../palette/model';
import {
  applyDefinitionOps,
  coalesceDefsEdit,
  DEFINITION_TYPES,
  descriptionOp,
  fieldKeysPath,
  formatOp,
  readDefinitionField,
  titleOp,
  typeOp,
} from './definitionsEdit';

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

function groups() {
  const g = readDefinitionsView(DEFS);
  if (g === null) {
    throw new Error('fixture should parse');
  }
  return g;
}

function groupById(id: string) {
  const g = groups().find((entry) => entry.id === id);
  if (g === undefined) {
    throw new Error(`no group ${id}`);
  }
  return g;
}

describe('fieldKeysPath', () => {
  it('addresses a top-level scalar (ungrouped) field', () => {
    const ungrouped = groupById('');
    expect(fieldKeysPath(ungrouped, 'total')).toEqual(['properties', 'total']);
  });

  it('interleaves properties for a nested object leaf', () => {
    const customer = groupById('customer');
    expect(fieldKeysPath(customer, 'customer.name')).toEqual([
      'properties',
      'customer',
      'properties',
      'name',
    ]);
  });

  it('routes an array-group row field through items.properties', () => {
    const items = groupById('items');
    expect(fieldKeysPath(items, 'qty')).toEqual([
      'properties',
      'items',
      'items',
      'properties',
      'qty',
    ]);
  });
});

describe('readDefinitionField', () => {
  it('reads the raw metadata of a scalar field', () => {
    const field = readDefinitionField(DEFS, ['properties', 'total']);
    expect(field).toEqual({
      title: '合計',
      type: 'number',
      format: 'currency',
      description: '税込の総額',
    });
  });

  it('reads a nested leaf, empty for unset keys', () => {
    const field = readDefinitionField(DEFS, ['properties', 'customer', 'properties', 'name']);
    expect(field.title).toBe('宛名');
    expect(field.format).toBe('');
    expect(field.description).toBe('');
  });

  it('returns all-empty for a missing path', () => {
    expect(readDefinitionField(DEFS, ['properties', 'nope'])).toEqual({
      title: '',
      type: '',
      format: '',
      description: '',
    });
  });

  it('returns all-empty when the final node is not a map', () => {
    // `properties.total.type` resolves to the scalar `number`, not a schema map.
    expect(readDefinitionField(DEFS, ['properties', 'total', 'type'])).toEqual({
      title: '',
      type: '',
      format: '',
      description: '',
    });
  });

  it('returns all-empty when a segment is not a map', () => {
    // `total.type` is the scalar `number`, so descending past it hits a non-map.
    expect(readDefinitionField(DEFS, ['properties', 'total', 'type', 'x'])).toEqual({
      title: '',
      type: '',
      format: '',
      description: '',
    });
  });

  it('never throws on malformed definitions', () => {
    expect(readDefinitionField(': : bad', ['properties', 'x'])).toEqual({
      title: '',
      type: '',
      format: '',
      description: '',
    });
  });

  it('ignores a hostile prototype segment (own-property guard)', () => {
    expect(readDefinitionField(DEFS, ['properties', '__proto__'])).toEqual({
      title: '',
      type: '',
      format: '',
      description: '',
    });
  });
});

describe('scalar leaf op builders', () => {
  const keys = ['properties', 'total'];

  it('titleOp sets a changed value', () => {
    expect(titleOp(keys, '合計', '総合計')).toEqual({
      op: 'setScalar',
      keys: ['properties', 'total', 'title'],
      value: '総合計',
    });
  });

  it('titleOp returns null when unchanged', () => {
    expect(titleOp(keys, '合計', '合計')).toBeNull();
  });

  it('titleOp clears via removeKey on empty', () => {
    expect(titleOp(keys, '合計', '')).toEqual({
      op: 'removeKey',
      keys: ['properties', 'total', 'title'],
    });
  });

  it('typeOp / formatOp / descriptionOp address their own leaf', () => {
    expect(typeOp(keys, 'number', 'string')).toEqual({
      op: 'setScalar',
      keys: ['properties', 'total', 'type'],
      value: 'string',
    });
    expect(formatOp(keys, 'currency', 'percentage')).toEqual({
      op: 'setScalar',
      keys: ['properties', 'total', 'format'],
      value: 'percentage',
    });
    expect(descriptionOp(keys, '', 'メモ')).toEqual({
      op: 'setScalar',
      keys: ['properties', 'total', 'description'],
      value: 'メモ',
    });
  });

  it('exposes the closed type vocabulary', () => {
    expect([...DEFINITION_TYPES]).toEqual(['string', 'number', 'integer', 'boolean']);
  });
});

describe('applyDefinitionOps', () => {
  it('applies a set, CST-preserving (untouched keys survive)', () => {
    const op = titleOp(['properties', 'total'], '合計', '総合計');
    if (op === null) {
      throw new Error('op');
    }
    const next = applyDefinitionOps(DEFS, [op]);
    expect(next).toContain('title: 総合計');
    // The sibling description and the nested customer/name are untouched.
    expect(next).toContain('description: 税込の総額');
    expect(next).toContain('title: 宛名');
  });

  it('is the identity for an empty batch', () => {
    expect(applyDefinitionOps(DEFS, [])).toBe(DEFS);
  });

  it('fail-closes on malformed text (returns it unchanged)', () => {
    const op = titleOp(['properties', 'x'], '', 'y');
    if (op === null) {
      throw new Error('op');
    }
    expect(applyDefinitionOps(': : bad', [op])).toBe(': : bad');
  });

  it('fail-closes on oversized definitions text (over the parse cap)', () => {
    // Past the 2 MiB default parse cap → Editor.create throws → text unchanged.
    const huge = `type: object\nproperties: {}\n# ${'x'.repeat(2 * 1024 * 1024)}\n`;
    const op = titleOp(['properties', 'x'], '', 'y');
    if (op === null) {
      throw new Error('op');
    }
    expect(applyDefinitionOps(huge, [op])).toBe(huge);
    expect(readDefinitionField(huge, ['properties', 'x'])).toEqual({
      title: '',
      type: '',
      format: '',
      description: '',
    });
  });

  it('preserves comments on untouched keys (CST round-trip)', () => {
    const commented = `# engineer note: keep this schema lean
type: object
properties:
  total:
    type: number # unit: yen
`;
    const op = titleOp(['properties', 'total'], '', '合計');
    if (op === null) {
      throw new Error('op');
    }
    const next = applyDefinitionOps(commented, [op]);
    expect(next).toContain('# engineer note: keep this schema lean');
    expect(next).toContain('type: number # unit: yen');
    expect(next).toContain('title: 合計');
  });

  it('skips a refused op and still applies the rest', () => {
    // Clearing a leaf the base never authored (removeKey → key_not_found) is a
    // benign miss: it must NOT take the other edits down with it — a
    // transactional batch here once dropped every edit from the view when one
    // clear targeted an unset label.
    const clearMissing = { op: 'removeKey', keys: ['properties', 'total', 'zzz'] } as const;
    const realEdit = titleOp(['properties', 'total'], '合計', '総合計');
    if (realEdit === null) {
      throw new Error('op');
    }
    const next = applyDefinitionOps(DEFS, [clearMissing, realEdit]);
    expect(next).toContain('title: 総合計');
  });

  it('a repeated clear of the same key is a no-op on the second apply', () => {
    const clear = { op: 'removeKey', keys: ['properties', 'total', 'title'] } as const;
    const once = applyDefinitionOps(DEFS, [clear]);
    expect(once).not.toContain('title: 合計');
    // Re-applying over the already-cleared text skips harmlessly.
    expect(applyDefinitionOps(once, [clear])).toBe(once);
  });
});

describe('coalesceDefsEdit', () => {
  it('appends a new-target op', () => {
    const a = { op: 'setScalar', keys: ['properties', 'total', 'title'], value: 'x' } as const;
    expect(coalesceDefsEdit([], a)).toEqual([a]);
  });

  it('replaces a same-target op, preserving order', () => {
    const a = { op: 'setScalar', keys: ['properties', 'a', 'title'], value: '1' } as const;
    const b = { op: 'setScalar', keys: ['properties', 'b', 'title'], value: '2' } as const;
    const a2 = { op: 'setScalar', keys: ['properties', 'a', 'title'], value: '3' } as const;
    expect(coalesceDefsEdit([a, b], a2)).toEqual([b, a2]);
  });

  it('keys a keyless op by its shape (never colliding with a real edit)', () => {
    const keyed = { op: 'setScalar', keys: ['properties', 'a', 'title'], value: '1' } as const;
    // A keyless op (never emitted by the editor, but the union allows it) keys
    // by its own shape and appends without replacing the keyed edit.
    const keyless = { op: 'moveItem', path: 'x', from: 0, to: 1 } as const;
    expect(coalesceDefsEdit([keyed], keyless)).toEqual([keyed, keyless]);
  });
});
