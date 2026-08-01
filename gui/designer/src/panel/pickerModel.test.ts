import type { ReadFn } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { readDefinitionsView } from '../palette/model';
import { bindingScopeFor, filterOptions, pickerOptions, sampleValueFor } from './pickerModel';

/** A read function over a flat path → materialized-value table. */
function readOf(doc: Record<string, unknown>): ReadFn {
  return (path) => doc[path];
}

const DEFINITIONS = [
  'properties:',
  '  order:',
  '    type: object',
  '    properties:',
  '      code: { type: string, title: 注文コード, example: ORD-1 }',
  '      logo: { type: string, format: image }',
  '  amount:',
  '    type: object',
  '    properties:',
  '      total: { type: number, format: currency, example: 500 }',
  '  items:',
  '    type: array',
  '    items:',
  '      type: object',
  '      properties:',
  '        name: { type: string, title: 品名 }',
  '        quantity: { type: number, example: 1 }',
  '',
].join('\n');

const PARAMS = JSON.stringify({
  order: { code: 'ORD-9' },
  amount: { total: 1200 },
  items: [{ name: 'りんご', quantity: 3 }, { name: 'みかん' }],
});

const groups = readDefinitionsView(DEFINITIONS);

describe('bindingScopeFor', () => {
  const doc: Record<string, unknown> = {
    'sections.body.items[3]': { type: 'table', data: { key: 'items' } },
    'sections.body.items[4]': { type: 'repeat', data: { key: 'tickets' } },
    'sections.body.items[5]': { type: 'repeat_flow', data: { key: 'cards' } },
    'sections.body.items[6]': { type: 'container' },
    'sections.body.items[7]': { type: 'table' },
  };
  const read = readOf(doc);

  it('resolves a table column cell item to the table row scope', () => {
    expect(bindingScopeFor(read, 'sections.body.items[3].columns[1].cell.items[0]')).toBe('items');
  });

  it('resolves a repeat cell item to the bound element scope', () => {
    expect(bindingScopeFor(read, 'sections.body.items[4].cell.items[0]')).toBe('tickets');
  });

  it('resolves a repeat_flow card item to the card scope', () => {
    expect(bindingScopeFor(read, 'sections.body.items[5].item.items[2]')).toBe('cards');
  });

  it('resolves nested scopes to the INNERMOST source', () => {
    const nested = readOf({
      ...doc,
      'sections.body.items[4].cell.items[1]': { type: 'repeat', data: { key: 'inner' } },
    });
    expect(nested('sections.body.items[4].cell.items[1]')).toBeDefined();
    expect(bindingScopeFor(nested, 'sections.body.items[4].cell.items[1].cell.items[0]')).toBe(
      'inner',
    );
  });

  it('reads a document-scope item as no scope', () => {
    expect(bindingScopeFor(read, 'sections.body.items[0]')).toBeNull();
    expect(bindingScopeFor(read, 'sections.body.items[6].items[0]')).toBeNull();
  });

  it('reads a source WITHOUT a data key as document scope', () => {
    expect(bindingScopeFor(read, 'sections.body.items[7].columns[0].cell.items[0]')).toBeNull();
  });

  it('tolerates an unparseable path and a throwing read', () => {
    expect(bindingScopeFor(read, 'not a ]path[')).toBeNull();
    const throwing: ReadFn = () => {
      throw new Error('hostile');
    };
    expect(bindingScopeFor(throwing, 'sections.body.items[3].columns[0].cell.items[0]')).toBeNull();
  });

  it('skips a look-alike key boundary that is not really a source', () => {
    const fake = readOf({
      'sections.body.items[0]': { type: 'container' },
    });
    // `.cell` here belongs to a non-source map — no scope resolves.
    expect(bindingScopeFor(fake, 'sections.body.items[0].cell.items[0]')).toBeNull();
  });
});

describe('sampleValueFor', () => {
  const root = JSON.parse(PARAMS) as Record<string, unknown>;

  it('walks a dotted document-scope key', () => {
    expect(sampleValueFor(root, null, 'order.code')).toBe('ORD-9');
    expect(sampleValueFor(root, null, 'amount.total')).toBe(1200);
  });

  it('walks the FIRST row of an array scope', () => {
    expect(sampleValueFor(root, 'items', 'name')).toBe('りんご');
    expect(sampleValueFor(root, 'items', 'quantity')).toBe(3);
  });

  it('walks boolean and nested values', () => {
    const withBool = { flags: { vip: false } } as Record<string, unknown>;
    expect(sampleValueFor(withBool, null, 'flags.vip')).toBe(false);
  });

  it('misses cleanly on absent keys, non-arrays, and null roots', () => {
    expect(sampleValueFor(root, null, 'order.nope')).toBeUndefined();
    expect(sampleValueFor(root, 'order', 'code')).toBeUndefined();
    expect(sampleValueFor(root, 'nope', 'name')).toBeUndefined();
    expect(sampleValueFor(null, null, 'order.code')).toBeUndefined();
  });

  it('never walks the prototype (literal-JSON __proto__ stays inert)', () => {
    const hostile = JSON.parse('{"__proto__":{"polluted":"x"},"a":{"constructor":"c"}}') as Record<
      string,
      unknown
    >;
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    // `__proto__` as own data IS addressable; prototype members are not.
    expect(sampleValueFor(hostile, null, '__proto__.polluted')).toBe('x');
    expect(sampleValueFor(hostile, null, 'a.constructor')).toBe('c');
    expect(sampleValueFor(hostile, null, 'a.toString')).toBeUndefined();
    expect(sampleValueFor(hostile, null, 'constructor')).toBeUndefined();
  });

  it('skips non-record rows when picking the sample row', () => {
    const sparse = { rows: [null, 'x', { name: 'ok' }] } as Record<string, unknown>;
    expect(sampleValueFor(sparse, 'rows', 'name')).toBe('ok');
  });
});

describe('pickerOptions', () => {
  it('offers document-scope fields (never array groups) with live params values', () => {
    const options = pickerOptions(groups, null, PARAMS);
    const keys = options.map((o) => o.key);
    expect(keys).toContain('order.code');
    expect(keys).toContain('amount.total');
    expect(keys).not.toContain('name');
    const code = options.find((o) => o.key === 'order.code');
    expect(code).toMatchObject({ label: '注文コード', type: 'string', sample: 'ORD-9' });
    const total = options.find((o) => o.key === 'amount.total');
    expect(total).toMatchObject({ type: 'currency', sample: '1200' });
  });

  it('carries a declared enum to the option as its VALUES (labels are display-side)', () => {
    const defs = [
      'properties:',
      '  status:',
      '    type: string',
      '    enum:',
      '      - { value: backorder, label: （入荷待ち） }',
      '      - arrived',
      '',
    ].join('\n');
    const options = pickerOptions(readDefinitionsView(defs), null, '{}');
    expect(options.find((o) => o.key === 'status')?.enumValues).toEqual(['backorder', 'arrived']);
  });

  it('falls back to the definitions example when params carry no value', () => {
    const options = pickerOptions(groups, null, '{}');
    expect(options.find((o) => o.key === 'order.code')?.sample).toBe('ORD-1');
    // No example and no params value → empty sample.
    expect(options.find((o) => o.key === 'order.logo')?.sample).toBe('');
  });

  it('offers an array scope its row-relative fields', () => {
    const options = pickerOptions(groups, 'items', PARAMS);
    expect(options.map((o) => o.key)).toEqual(['name', 'quantity']);
    expect(options.find((o) => o.key === 'name')).toMatchObject({
      label: '品名',
      sample: 'りんご',
    });
  });

  it('offers nothing for an unknown scope or missing definitions', () => {
    expect(pickerOptions(groups, 'unknown', PARAMS)).toEqual([]);
    expect(pickerOptions(null, null, PARAMS)).toEqual([]);
  });

  it('falls back to definition samples on an over-cap params document', () => {
    const oversized = `{"pad":"${'x'.repeat(1_100_000)}"}`;
    const options = pickerOptions(groups, null, oversized);
    expect(options.find((o) => o.key === 'order.code')?.sample).toBe('ORD-1');
  });

  it('tolerates malformed params (options keep definition samples)', () => {
    const options = pickerOptions(groups, null, 'not json');
    expect(options.find((o) => o.key === 'order.code')?.sample).toBe('ORD-1');
  });
});

describe('filterOptions', () => {
  const options = pickerOptions(groups, null, PARAMS);

  it('matches key and label case-insensitively; empty query keeps all', () => {
    expect(filterOptions(options, '')).toEqual(options);
    expect(filterOptions(options, 'ORDER').map((o) => o.key)).toContain('order.code');
    expect(filterOptions(options, '注文').map((o) => o.key)).toEqual(['order.code']);
  });

  it('treats the query as plain text, never a RegExp', () => {
    expect(filterOptions(options, '.*')).toEqual([]);
    expect(filterOptions(options, '(order')).toEqual([]);
  });
});
