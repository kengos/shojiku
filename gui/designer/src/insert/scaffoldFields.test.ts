// Tests for scaffoldFields.ts — the create-your-own-fields form behind the
// iterable dialog: the field-row schema and the scaffold built from it.
import { describe, expect, it } from 'vitest';
import { MAX_SCAFFOLD_FIELDS } from './scaffold';
import { scaffoldFromFields, scaffoldSchema } from './scaffoldFields';

describe('scaffoldSchema', () => {
  it('maps each field kind to its schema type', () => {
    expect(
      scaffoldSchema(
        [
          { name: '品名', kind: 'text' },
          { name: '数量', kind: 'number' },
          { name: '金額', kind: 'currency' },
          { name: '納期', kind: 'date' },
          { name: '済', kind: 'boolean' },
        ],
        'table',
      ),
    ).toEqual({
      type: 'array',
      minItems: 3,
      items: {
        type: 'object',
        properties: {
          品名: { type: 'string' },
          数量: { type: 'number' },
          // Currency = number refined by the currency format; no per-field code.
          金額: { type: 'number', format: 'currency' },
          納期: { type: 'string', format: 'date' },
          済: { type: 'boolean' },
        },
      },
    });
  });

  it('generates scalar string rows for a list', () => {
    expect(scaffoldSchema([{ name: 'x', kind: 'text' }], 'list')).toEqual({
      type: 'array',
      minItems: 3,
      items: { type: 'string' },
    });
  });

  it('caps the row shape at MAX_SCAFFOLD_FIELDS and keeps __proto__ inert', () => {
    const fields = Array.from({ length: MAX_SCAFFOLD_FIELDS + 4 }, (_, i) => ({
      name: `f${i}`,
      kind: 'text' as const,
    }));
    const schema = scaffoldSchema(fields, 'table');
    const items = schema.items as { properties: Record<string, unknown> };
    expect(Object.keys(items.properties)).toHaveLength(MAX_SCAFFOLD_FIELDS);

    const proto = scaffoldSchema([{ name: '__proto__', kind: 'text' }], 'table');
    const row = (proto.items as { properties: Record<string, unknown> }).properties;
    expect(Object.getPrototypeOf(row)).toBe(Object.prototype);
    expect(Object.keys(row)).toEqual(['__proto__']);
  });
});

describe('scaffoldFromFields', () => {
  it('uses the typed names as both keys and labels', () => {
    expect(
      scaffoldFromFields(
        '明細',
        [
          { name: '品名', kind: 'text' },
          { name: '数量', kind: 'number' },
        ],
        'table',
      ),
    ).toEqual({
      sourceKey: '明細',
      columns: [
        { key: '品名', label: '品名' },
        { key: '数量', label: '数量' },
      ],
    });
  });

  it('gives a 通貨 column a symbol format; other kinds carry none', () => {
    // The user picked "通貨", so the column shows ¥ from the first preview
    // (the engine coerces number + `symbol` to the currency type).
    expect(
      scaffoldFromFields(
        '明細',
        [
          { name: '金額', kind: 'currency' },
          { name: '数量', kind: 'number' },
          { name: '納期', kind: 'date' },
          { name: '済', kind: 'boolean' },
        ],
        'table',
      ).columns,
    ).toEqual([
      { key: '金額', label: '金額', format: 'symbol' },
      { key: '数量', label: '数量' },
      { key: '納期', label: '納期' },
      { key: '済', label: '済' },
    ]);
  });

  it('yields a field-less (scalar) spec for a list and caps a hostile field flood', () => {
    expect(scaffoldFromFields('tags', [{ name: 'x', kind: 'text' }], 'list')).toEqual({
      sourceKey: 'tags',
      columns: [],
    });
    const flood = Array.from({ length: MAX_SCAFFOLD_FIELDS + 9 }, (_, i) => ({
      name: `f${i}`,
      kind: 'text' as const,
    }));
    expect(scaffoldFromFields('wide', flood, 'table').columns).toHaveLength(MAX_SCAFFOLD_FIELDS);
  });
});
