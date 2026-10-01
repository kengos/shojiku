import { describe, expect, it } from 'vitest';
import {
  applyDefinitionOps,
  coalesceDefsEdit,
  DEFINITION_TYPES,
  descriptionOp,
  formatOp,
  readDefinitionField,
  requiredOp,
  semanticFormats,
  titleOp,
  typeOp,
  versionOp,
} from './definitionsEdit';
import { readDefsTree } from './defsTree';
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

describe('readDefinitionField', () => {
  it('reads the raw metadata of a scalar field', () => {
    const field = readDefinitionField(DEFS, ['properties', 'total']);
    expect(field).toEqual({
      title: '合計',
      type: 'number',
      format: 'currency',
      description: '税込の総額',
      version: '',
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
      version: '',
    });
  });

  it('returns all-empty when the final node is not a map', () => {
    // `properties.total.type` resolves to the scalar `number`, not a schema map.
    expect(readDefinitionField(DEFS, ['properties', 'total', 'type'])).toEqual({
      title: '',
      type: '',
      format: '',
      description: '',
      version: '',
    });
  });

  it('returns all-empty when a segment is not a map', () => {
    // `total.type` is the scalar `number`, so descending past it hits a non-map.
    expect(readDefinitionField(DEFS, ['properties', 'total', 'type', 'x'])).toEqual({
      title: '',
      type: '',
      format: '',
      description: '',
      version: '',
    });
  });

  it('never throws on malformed definitions', () => {
    expect(readDefinitionField(': : bad', ['properties', 'x'])).toEqual({
      title: '',
      type: '',
      format: '',
      description: '',
      version: '',
    });
  });

  it('ignores a hostile prototype segment (own-property guard)', () => {
    expect(readDefinitionField(DEFS, ['properties', '__proto__'])).toEqual({
      title: '',
      type: '',
      format: '',
      description: '',
      version: '',
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
      version: '',
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

describe('semanticFormats', () => {
  it('offers the date/image refinements for a string and the money ones for a number', () => {
    expect(semanticFormats('string')).toEqual(['date', 'date-time', 'image']);
    expect(semanticFormats('number')).toEqual(['currency', 'percentage', 'quantity']);
    expect(semanticFormats('integer')).toEqual(['currency', 'percentage', 'quantity']);
  });

  it('offers nothing for a boolean, which no semantic format refines', () => {
    expect(semanticFormats('boolean')).toEqual([]);
  });

  it('offers nothing for a type it cannot resolve', () => {
    // The type is a document-derived string: an unknown one gets the empty
    // set, and a prototype name must not reach an inherited table entry.
    expect(semanticFormats('array')).toEqual([]);
    for (const hostile of ['constructor', '__proto__', 'toString', 'valueOf']) {
      expect(semanticFormats(hostile), hostile).toEqual([]);
    }
  });
});

describe('the root version read and its op', () => {
  it('reads the root version (and empty for a field, which carries none)', () => {
    const text = `version: "0.2.0"\n${DEFS}`;
    expect(readDefinitionField(text, []).version).toBe('0.2.0');
    expect(readDefinitionField(text, ['properties', 'total']).version).toBe('');
  });

  it('sets, clears and leaves an unchanged version alone', () => {
    expect(versionOp([], '', '1.0')).toEqual({ op: 'setScalar', keys: ['version'], value: '1.0' });
    expect(versionOp([], '1.0', '')).toEqual({ op: 'removeKey', keys: ['version'] });
    expect(versionOp([], '1.0', '1.0')).toBeNull();
  });
});

const REQ = `type: object
required: [ total ]
properties:
  total: { type: number }
  memo: { type: string }
  customer:
    type: object
    required: [ name, tel ]
    properties:
      name: { type: string }
      tel: { type: string }
  items:
    type: array
    items:
      type: object
      properties:
        qty: { type: number }
`;

function at(...keys: string[]) {
  const tree = readDefsTree(REQ);
  const found = tree === null ? null : findNode(tree, keys.join(SELECTION_SEP));
  if (found === null) {
    throw new Error(`no node ${keys.join('.')}`);
  }
  return found;
}

describe('the root ops round-trip', () => {
  it('writes the root label, description and version leaving the rest byte-exact', () => {
    const text =
      '# the data dictionary\nversion: "0.2.0"\ntype: object\nproperties:\n  total: { type: number }\n';
    const ops = [
      titleOp([], '', 'Invoice'),
      descriptionOp([], '', 'Fields'),
      versionOp([], '0.2.0', '0.3.0'),
    ].filter((op) => op !== null);
    expect(applyDefinitionOps(text, ops)).toBe(
      '# the data dictionary\nversion: "0.3.0"\ntype: object\nproperties:\n  total: { type: number }\ntitle: Invoice\ndescription: Fields\n',
    );
  });
});

describe('requiredOp', () => {
  it('appends to the ROOT list for a top-level item, keeping its order', () => {
    expect(requiredOp(at('properties', 'memo'), true)).toEqual({
      op: 'setStrings',
      keys: ['required'],
      values: ['total', 'memo'],
    });
  });

  it("edits a group's own list for its child", () => {
    expect(requiredOp(at('properties', 'customer', 'properties', 'name'), false)).toEqual({
      op: 'setStrings',
      keys: ['properties', 'customer', 'required'],
      values: ['tel'],
    });
  });

  it("edits a table ROW object's list (items.required) for a row field", () => {
    expect(requiredOp(at('properties', 'items', 'items', 'properties', 'qty'), true)).toEqual({
      op: 'setStrings',
      keys: ['properties', 'items', 'items', 'required'],
      values: ['qty'],
    });
  });

  it('REMOVES a list its last member leaves, rather than writing []', () => {
    expect(requiredOp(at('properties', 'total'), false)).toEqual({
      op: 'removeKey',
      keys: ['required'],
    });
  });

  it('authors nothing when the flag already matches, and nothing for the root', () => {
    expect(requiredOp(at('properties', 'total'), true)).toBeNull();
    expect(requiredOp(at('properties', 'memo'), false)).toBeNull();
    const tree = readDefsTree(REQ);
    expect(tree === null ? 'no tree' : requiredOp(tree, true)).toBeNull();
  });

  it('authors nothing past the string-list cap one op may write', () => {
    const names = Array.from({ length: 256 }, (_, i) => `f${i}`);
    const text = `type: object\nrequired: [${names.join(', ')}]\nproperties:\n  extra: { type: string }\n`;
    const tree = readDefsTree(text);
    const extra =
      tree === null ? null : findNode(tree, ['properties', 'extra'].join(SELECTION_SEP));
    expect(extra === null ? 'missing' : requiredOp(extra, true)).toBeNull();
  });

  it('round-trips: applying the op leaves untouched keys and comments byte-exact', () => {
    const text = `# the data dictionary\n${REQ}`;
    const op = requiredOp(at('properties', 'memo'), true);
    const out = applyDefinitionOps(text, op === null ? [] : [op]);
    expect(out.startsWith('# the data dictionary\n')).toBe(true);
    expect(out).toContain('required: [ total, memo ]');
    // A FIXED-POINT fixture (canonical flow spacing): designer-core re-emits flow
    // collections canonically on the first write, so only such a fixture can be
    // compared byte for byte.
    expect(out.replace('required: [ total, memo ]', 'required: [ total ]')).toBe(text);
  });
});
