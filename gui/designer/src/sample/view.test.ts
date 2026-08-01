import { describe, expect, it } from 'vitest';
import { MAX_PARAMS_BYTES } from './model';
import { readSampleView } from './view';

const DEFINITIONS = [
  'version: "0.2.0"',
  'type: object',
  'properties:',
  '  invoice:',
  '    type: object',
  '    title: 請求書',
  '    properties:',
  '      number:',
  '        type: string',
  '        title: 番号',
  '      issued_on:',
  '        type: string',
  '        format: date',
  '        title: 発行日',
  '      total:',
  '        type: number',
  '        format: currency',
  '        title: 合計',
  '      paid:',
  '        type: boolean',
  '        title: 支払済',
  '  items:',
  '    type: array',
  '    title: 明細',
  '    items:',
  '      type: object',
  '      properties:',
  '        name:',
  '          type: string',
  '          title: 品名',
].join('\n');

const PARAMS = JSON.stringify({
  invoice: { number: 'A-1', issued_on: '2026-07-01', total: 100, paid: true },
  items: [{ name: 'Book' }, { name: 'Pen' }],
});

describe('readSampleView', () => {
  it('labels and types the fields from the schema, ordered by the data', () => {
    const view = readSampleView(PARAMS, DEFINITIONS);
    expect(view).not.toBeNull();
    const invoice = view?.groups.find((g) => g.id === 'invoice');
    expect(invoice?.label).toBe('請求書');
    const number = invoice?.fields.find((f) => f.label === '番号');
    expect(number?.kind).toBe('string');
    expect(invoice?.fields.find((f) => f.label === '発行日')?.kind).toBe('date');
    expect(invoice?.fields.find((f) => f.label === '合計')?.kind).toBe('number');
    expect(invoice?.fields.find((f) => f.label === '支払済')?.kind).toBe('boolean');
    const items = view?.arrays.find((a) => a.path[0] === 'items');
    expect(items?.label).toBe('明細');
    expect(items?.rows).toHaveLength(2);
    expect(items?.rows[0].fields[0].label).toBe('品名');
  });

  it('infers kinds from the values when no definitions are supplied', () => {
    const view = readSampleView(PARAMS);
    const invoice = view?.groups.find((g) => g.id === 'invoice');
    expect(invoice?.label).toBe('invoice');
    const byKey = (seg: string) => invoice?.fields.find((f) => f.path[f.path.length - 1] === seg);
    expect(byKey('number')?.kind).toBe('string');
    expect(byKey('issued_on')?.kind).toBe('date');
    expect(byKey('total')?.kind).toBe('number');
    expect(byKey('paid')?.kind).toBe('boolean');
  });

  it('surfaces top-level scalars as a leading ungrouped group', () => {
    const view = readSampleView(JSON.stringify({ title: 'Hi', n: 3 }));
    expect(view?.groups[0].id).toBe('');
    expect(view?.groups[0].fields.map((f) => f.value)).toEqual(['Hi', '3']);
  });

  it('flattens nested objects to leaf fields and skips nested arrays', () => {
    const view = readSampleView(JSON.stringify({ a: { b: { c: 'x' }, tags: [1, 2] } }));
    const group = view?.groups.find((g) => g.id === 'a');
    expect(group?.fields).toHaveLength(1);
    expect(group?.fields[0].path).toEqual(['a', 'b', 'c']);
  });

  it('handles arrays of scalars and arrays of nested arrays as rows', () => {
    const view = readSampleView(JSON.stringify({ tags: ['a', 'b'], grid: [[1], [2]] }));
    const tags = view?.arrays.find((a) => a.path[0] === 'tags');
    expect(tags?.rows[0].fields[0].value).toBe('a');
    const grid = view?.arrays.find((a) => a.path[0] === 'grid');
    // A row that is itself an array yields no scalar leaf fields.
    expect(grid?.rows[0].fields).toHaveLength(0);
  });

  it('skips nested-object/array cells inside a row', () => {
    const view = readSampleView(
      JSON.stringify({ rows: [{ name: 'x', meta: { a: 1 }, tags: [1] }] }),
    );
    const rows = view?.arrays.find((a) => a.path[0] === 'rows');
    expect(rows?.rows[0].fields.map((f) => f.path[2])).toEqual(['name']);
  });

  it('returns null on malformed JSON', () => {
    expect(readSampleView('{not json')).toBeNull();
  });

  it('returns null on a non-object root (array or scalar)', () => {
    expect(readSampleView('[1, 2, 3]')).toBeNull();
    expect(readSampleView('42')).toBeNull();
  });

  it('returns null over the size cap', () => {
    const huge = `{"a":"${'x'.repeat(MAX_PARAMS_BYTES)}"}`;
    expect(readSampleView(huge)).toBeNull();
  });

  it('ignores a broken definitions document (fields keep inferred kinds)', () => {
    const view = readSampleView(JSON.stringify({ n: 5 }), '{{ not valid');
    expect(view?.groups[0].fields[0].kind).toBe('number');
  });

  it('reads a __proto__ data key as ordinary data without walking the prototype', () => {
    // A literal JSON string (an object literal `{ __proto__: … }` would set the
    // prototype instead of creating the key).
    const view = readSampleView('{"__proto__": {"polluted": true}}');
    const group = view?.groups.find((g) => g.id === '__proto__');
    expect(group?.fields[0].value).toBe('true');
  });

  it('shows a null leaf as an empty string field', () => {
    const view = readSampleView('{"a": null}');
    expect(view?.groups[0].fields[0].value).toBe('');
    expect(view?.groups[0].fields[0].kind).toBe('string');
  });

  it('caps the number of fields per object group and per row', () => {
    const wide: Record<string, unknown> = {};
    for (let i = 0; i < 600; i += 1) {
      wide[`k${i}`] = i;
    }
    const groupView = readSampleView(JSON.stringify({ big: wide }));
    expect(groupView?.groups[0].fields.length).toBeLessThanOrEqual(512);
    const rowView = readSampleView(JSON.stringify({ rows: [wide] }));
    expect(rowView?.arrays[0].rows[0].fields.length).toBeLessThanOrEqual(512);
  });

  it('caps the walk depth without a stack overflow', () => {
    let deep: unknown = 'leaf';
    for (let i = 0; i < 200; i += 1) {
      deep = { a: deep };
    }
    const view = readSampleView(JSON.stringify({ root: deep }));
    // Deep walk stops silently; no throw.
    expect(view).not.toBeNull();
  });
});

describe('datetime kind', () => {
  it('infers datetime from an RFC-3339 value without a schema', () => {
    const view = readSampleView(JSON.stringify({ at: '2026-07-05T15:30:00+09:00' }));
    expect(view?.groups[0].fields.find((f) => f.path[0] === 'at')?.kind).toBe('datetime');
  });

  it('keeps a plain date as the date kind', () => {
    const view = readSampleView(JSON.stringify({ d: '2026-07-05' }));
    expect(view?.groups[0].fields.find((f) => f.path[0] === 'd')?.kind).toBe('date');
  });

  it('maps a format: date-time schema field to the datetime kind', () => {
    const defs = [
      'type: object',
      'properties:',
      '  at:',
      '    type: string',
      '    format: date-time',
      '    title: 日時',
    ].join('\n');
    const view = readSampleView(JSON.stringify({ at: '2026-07-05T15:30:00+09:00' }), defs);
    expect(view?.groups[0].fields.find((f) => f.path[0] === 'at')?.kind).toBe('datetime');
  });
});
