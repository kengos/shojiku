// What a table column renders (its kind) and which kinds the panel offers for
// it under each engine capability set.

import { describe, expect, it } from 'vitest';
import { COLUMN_KINDS, columnKindOf, offeredKinds } from './columnKinds';

describe('columnKindOf', () => {
  it('reads text, qr_code, image and cell, with cell winning over type', () => {
    expect(columnKindOf({ data: { key: 'a' } })).toBe('text');
    expect(columnKindOf({ type: 'text', data: { key: 'a' } })).toBe('text');
    expect(columnKindOf({ type: 'qr_code' })).toBe('qr_code');
    expect(columnKindOf({ type: 'image' })).toBe('image');
    expect(columnKindOf({ cell: { items: [] } })).toBe('cell');
    // The engine draws the cell when a column authors both.
    expect(columnKindOf({ type: 'image', cell: {} })).toBe('cell');
  });

  it('reads hostile shapes as the default text', () => {
    expect(columnKindOf(undefined)).toBe('text');
    expect(columnKindOf(3)).toBe('text');
    expect(columnKindOf([{ cell: {} }])).toBe('text');
    expect(columnKindOf({ type: 7 })).toBe('text');
    expect(columnKindOf({ type: 'barcode' })).toBe('text');
    // A `cell` that is not a map is no sub-template.
    expect(columnKindOf({ cell: 'x', type: 'qr_code' })).toBe('qr_code');
    // Inherited keys are not the column's own (an own `__proto__` key stays data).
    expect(columnKindOf(Object.create({ cell: {}, type: 'image' }))).toBe('text');
    expect(columnKindOf(JSON.parse('{"__proto__":{"cell":{},"type":"image"}}'))).toBe('text');
  });
});

describe('offeredKinds', () => {
  it('offers every kind, in order, against the bundled engine', () => {
    expect(offeredKinds('text', undefined)).toEqual(COLUMN_KINDS);
    expect(offeredKinds('text', ['table.column.type', 'table.column.cell'])).toEqual([
      'text',
      'qr_code',
      'image',
      'cell',
    ]);
  });

  it('follows each capability on its own', () => {
    expect(offeredKinds('text', ['table.column.type'])).toEqual(['text', 'qr_code', 'image']);
    expect(offeredKinds('text', ['table.column.cell'])).toEqual(['text', 'cell']);
    expect(offeredKinds('text', [])).toEqual(['text']);
  });

  it('always keeps the kind the column already has', () => {
    expect(offeredKinds('qr_code', ['table.column.cell'])).toEqual(['text', 'qr_code', 'cell']);
    expect(offeredKinds('cell', [])).toEqual(['text', 'cell']);
    expect(offeredKinds('image', [])).toEqual(['text', 'image']);
  });
});
