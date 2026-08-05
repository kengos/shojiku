import { MAX_TEMPLATE_BYTES } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { MAX_PALETTE_FIELDS, MAX_PALETTE_GROUPS, MAX_TEXT_CHARS } from './caps';
import { type PaletteGroup, readDefinitionsView, rowScopeLabel } from './model';

const DEFINITIONS = [
  'version: "0.2.0"',
  'type: object',
  'properties:',
  '  receipt:',
  '    type: object',
  '    title: 領収書',
  '    description: The document header fields.',
  '    properties:',
  '      number:',
  '        type: string',
  '        title: 番号',
  '        example: "R-001"',
  '      issued_on:',
  '        type: string',
  '        format: date',
  '        description: Issue date.',
  '        example: "2026-01-15"',
  '  items:',
  '    type: array',
  '    title: 明細',
  '    items:',
  '      type: object',
  '      properties:',
  '        name:',
  '          type: string',
  '        quantity:',
  '          type: integer',
  '          format: quantity',
  '          example: 3',
  '',
].join('\n');

describe('readDefinitionsView', () => {
  it('narrows object and array properties with titles, mapped types, examples', () => {
    const groups = readDefinitionsView(DEFINITIONS);
    expect(groups).not.toBeNull();
    const [receipt, items] = groups ?? [];
    expect(receipt.id).toBe('receipt');
    expect(receipt.label).toBe('領収書');
    expect(receipt.description).toBe('The document header fields.');
    expect(receipt.isArray).toBe(false);
    expect(receipt.fields).toEqual([
      {
        key: 'receipt.number',
        label: '番号',
        type: 'string',
        description: '',
        sample: 'R-001',
        enumOptions: [],
      },
      {
        key: 'receipt.issued_on',
        label: 'issued_on',
        type: 'date',
        description: 'Issue date.',
        sample: '2026-01-15',
        enumOptions: [],
      },
    ]);
    expect(items.isArray).toBe(true);
    expect(items.fields.map((f) => f.key)).toEqual(['name', 'quantity']);
    expect(items.fields[1].type).toBe('quantity');
    expect(items.fields[1].sample).toBe('3');
  });

  it('gathers top-level scalars into one leading unlabeled group', () => {
    const groups = readDefinitionsView(
      [
        'type: object',
        'properties:',
        '  purpose:',
        '    type: string',
        '  amount:',
        '    type: object',
        '    properties:',
        '      total:',
        '        type: number',
        '        format: currency',
        '',
      ].join('\n'),
    );
    expect(groups?.map((g) => g.id)).toEqual(['', 'amount']);
    expect(groups?.[0].label).toBe('');
    expect(groups?.[0].fields).toEqual([
      {
        key: 'purpose',
        label: 'purpose',
        type: 'string',
        description: '',
        sample: '',
        enumOptions: [],
      },
    ]);
    expect(groups?.[1].fields[0]).toEqual({
      key: 'amount.total',
      label: 'total',
      type: 'currency',
      description: '',
      sample: '',
      enumOptions: [],
    });
  });

  it('surfaces a nested array property as its own group with a dotted id', () => {
    const groups = readDefinitionsView(
      [
        'type: object',
        'properties:',
        '  order:',
        '    type: object',
        '    properties:',
        '      code:',
        '        type: string',
        '      lines:',
        '        type: array',
        '        items:',
        '          type: object',
        '          properties:',
        '            shipping:',
        '              type: object',
        '              properties:',
        '                weight:',
        '                  type: number',
        '',
      ].join('\n'),
    );
    expect(groups?.map((g) => g.id)).toEqual(['order', 'order.lines']);
    expect(groups?.[1].isArray).toBe(true);
    expect(groups?.[1].rowScope).toBeUndefined();
    // Row fields flatten to dotted RELATIVE keys.
    expect(groups?.[1].fields.map((f) => f.key)).toEqual(['shipping.weight']);
  });

  it('surfaces an array carried by another array’s rows, scoped to its parent', () => {
    // The shipping-labels shape: each order carries its own list of items.
    const groups = readDefinitionsView(
      [
        'type: object',
        'properties:',
        '  orders:',
        '    type: array',
        '    items:',
        '      type: object',
        '      properties:',
        '        name:',
        '          type: string',
        '        items:',
        '          type: array',
        '          title: 内容品',
        '          items:',
        '            type: object',
        '            properties:',
        '              title:',
        '                type: string',
        '',
      ].join('\n'),
    );
    expect(groups?.map((g) => g.id)).toEqual(['orders', 'orders.items']);
    // The nested source is NOT a leaf field of its parent.
    expect(groups?.[0].fields.map((f) => f.key)).toEqual(['name']);
    expect(groups?.[0].rowScope).toBeUndefined();
    const nested = groups?.[1];
    expect(nested?.isArray).toBe(true);
    // Only bindable from inside `orders`, so the parent is recorded.
    expect(nested?.rowScope).toBe('orders');
    expect(nested?.label).toBe('内容品');
    expect(nested?.fields.map((f) => f.key)).toEqual(['title']);
  });

  it('scopes a row array declared under a nested row object to the same parent', () => {
    const groups = readDefinitionsView(
      [
        'type: object',
        'properties:',
        '  orders:',
        '    type: array',
        '    items:',
        '      type: object',
        '      properties:',
        '        ship:',
        '          type: object',
        '          properties:',
        '            parcels:',
        '              type: array',
        '              items:',
        '                type: object',
        '                properties:',
        '                  code:',
        '                    type: string',
        '',
      ].join('\n'),
    );
    expect(groups?.map((g) => g.id)).toEqual(['orders', 'orders.ship.parcels']);
    expect(groups?.[1].rowScope).toBe('orders');
    expect(groups?.[1].fields.map((f) => f.key)).toEqual(['code']);
  });

  it('skips garbage property entries field-by-field', () => {
    const groups = readDefinitionsView(
      [
        'type: object',
        'properties:',
        '  bad: 7',
        '  ok:',
        '    type: object',
        '    properties:',
        '      junk: 7',
        '      real:',
        '        type: string',
        '',
      ].join('\n'),
    );
    expect(groups?.map((g) => g.id)).toEqual(['ok']);
    expect(groups?.[0].fields.map((f) => f.key)).toEqual(['ok.real']);
  });

  it('returns null without a properties map (including the retired v1 form)', () => {
    expect(readDefinitionsView('version: "1"')).toBeNull();
    expect(readDefinitionsView('properties: 7')).toBeNull();
    expect(readDefinitionsView('groups:\n  - id: g\n    fields: []\n')).toBeNull();
  });

  it('returns null for malformed YAML, a non-map root, and oversized input', () => {
    expect(readDefinitionsView('properties: [')).toBeNull();
    expect(readDefinitionsView('- a scalar sequence')).toBeNull();
    expect(readDefinitionsView(`x: ${'y'.repeat(MAX_TEMPLATE_BYTES)}`)).toBeNull();
  });

  it('returns null when materialization trips the alias cap (alias bomb)', () => {
    const bomb = [
      'a: &a [x, x, x, x, x, x, x, x, x, x]',
      'b: &b [*a, *a, *a, *a, *a, *a, *a, *a, *a, *a]',
      'c: &c [*b, *b, *b, *b, *b, *b, *b, *b, *b, *b]',
      'properties: [*c]',
      '',
    ].join('\n');
    expect(readDefinitionsView(bomb)).toBeNull();
  });

  it('caps the groups and fields it renders', () => {
    const manyFields = Array.from({ length: MAX_PALETTE_FIELDS + 5 })
      .map((_, i) => `      f${i}: { type: string }`)
      .join('\n');
    const manyGroups = Array.from({ length: MAX_PALETTE_GROUPS + 5 })
      .map((_, i) => `  g${i}: { type: object, properties: { a: { type: string } } }`)
      .join('\n');
    const flooded = `type: object\nproperties:\n  big:\n    type: object\n    properties:\n${manyFields}\n${manyGroups}\n`;
    const groups = readDefinitionsView(flooded);
    expect(groups?.length).toBe(MAX_PALETTE_GROUPS);
    expect(groups?.[0].fields.length).toBe(MAX_PALETTE_FIELDS);
  });

  it('caps the ungrouped top-level scalars at the field limit', () => {
    const many = Array.from({ length: MAX_PALETTE_FIELDS + 5 })
      .map((_, i) => `  s${i}: { type: string }`)
      .join('\n');
    const groups = readDefinitionsView(`type: object\nproperties:\n${many}\n`);
    expect(groups?.[0].fields.length).toBe(MAX_PALETTE_FIELDS);
  });

  it('bounds the schema walk depth against hostile nesting', () => {
    let inner = 'leaf: { type: string }';
    for (let i = 0; i < 40; i += 1) {
      inner = `n${i}: { type: object, properties: { ${inner} } }`;
    }
    const groups = readDefinitionsView(
      `type: object\nproperties:\n  root: { type: object, properties: { ${inner} } }\n`,
    );
    expect(groups?.length).toBe(1);
    expect(groups?.[0].fields.some((f) => f.key.endsWith('.leaf'))).toBe(false);
  });

  it('tolerates object schemas without a properties map', () => {
    const groups = readDefinitionsView(
      [
        'type: object',
        'properties:',
        '  bare:',
        '    type: object',
        '  rows:',
        '    type: array',
        '    items:',
        '      type: object',
        '',
      ].join('\n'),
    );
    expect(groups?.map((g) => g.id)).toEqual(['bare', 'rows']);
    expect(groups?.[0].fields).toEqual([]);
    expect(groups?.[1].fields).toEqual([]);
  });

  it('shows an array of scalars as a group with no row fields', () => {
    const groups = readDefinitionsView(
      [
        'type: object',
        'properties:',
        '  tags:',
        '    type: array',
        '    items:',
        '      type: string',
        '',
      ].join('\n'),
    );
    expect(groups?.[0].isArray).toBe(true);
    expect(groups?.[0].fields).toEqual([]);
  });

  it('bounds and tolerates hostile array row schemas', () => {
    // Garbage row entries and arrays inside rows are skipped; row fields cap.
    const manyRowFields = Array.from({ length: MAX_PALETTE_FIELDS + 5 })
      .map((_, i) => `        r${i}: { type: string }`)
      .join('\n');
    const groups = readDefinitionsView(
      [
        'type: object',
        'properties:',
        '  rows:',
        '    type: array',
        '    items:',
        '      type: object',
        '      properties:',
        '        junk: 7',
        '        inner: { type: array }',
        manyRowFields,
        '',
      ].join('\n'),
    );
    expect(groups?.[0].fields.length).toBe(MAX_PALETTE_FIELDS);
    expect(groups?.[0].fields.some((f) => f.key === 'inner' || f.key === 'junk')).toBe(false);
  });

  it('bounds the row-schema walk depth against hostile nesting', () => {
    let inner = 'leaf: { type: string }';
    for (let i = 0; i < 40; i += 1) {
      inner = `n${i}: { type: object, properties: { ${inner} } }`;
    }
    const groups = readDefinitionsView(
      `type: object\nproperties:\n  rows:\n    type: array\n    items: { type: object, properties: { ${inner} } }\n`,
    );
    expect(groups?.[0].fields.some((f) => f.key.endsWith('.leaf'))).toBe(false);
  });

  it('caps the ungrouped top-level scalar fields', () => {
    const many = Array.from({ length: MAX_PALETTE_FIELDS + 5 })
      .map((_, i) => `  s${i}: { type: string }`)
      .join('\n');
    const groups = readDefinitionsView(`type: object\nproperties:\n${many}\n`);
    expect(groups?.[0].id).toBe('');
    expect(groups?.[0].fields.length).toBe(MAX_PALETTE_FIELDS);
  });

  it('treats a __proto__ property name as inert data', () => {
    const groups = readDefinitionsView(
      ['type: object', 'properties:', '  "__proto__":', '    type: string', ''].join('\n'),
    );
    // Whether shown or skipped, nothing leaks onto Object.prototype.
    expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false);
    expect(groups).not.toBeNull();
  });

  it('clips hostile long titles and falls back to the clipped identity', () => {
    const long = 'x'.repeat(MAX_TEXT_CHARS + 50);
    const groups = readDefinitionsView(
      [
        'type: object',
        'properties:',
        `  ${long}:`,
        '    type: object',
        '    properties:',
        '      k:',
        '        type: string',
        `        title: ${long}`,
        '',
      ].join('\n'),
    );
    expect(groups?.[0].label.length).toBe(MAX_TEXT_CHARS + 1);
    expect(groups?.[0].label.endsWith('…')).toBe(true);
    expect(groups?.[0].fields[0].label.length).toBe(MAX_TEXT_CHARS + 1);
  });
});

/** The template the usage-index cases correlate against. Duplicated in
 * `bindings.test.ts`, which owns the walk itself: the two suites assert over
 * the same document from opposite ends, and a shared fixture MODULE would be
 * neither budget-exempt nor coverage-excluded. */

// Node types are referenced HERE only (the base tsconfig sets `types: []`):
// this block reads a bundled example off disk, so the claim is about the
// SHIPPED schema rather than a fixture written to agree with the walk.
/// <reference types="node" />

describe('readDefinitionsView over a bundled example', () => {
  it('surfaces the shipping labels’ per-order item list as its own scoped group', async () => {
    // `import.meta.url` is an http URL under this package's jsdom
    // environment, so the path is resolved from the package directory.
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const source = readFileSync(
      resolve(process.cwd(), '../../examples/business/shipping-labels-ja/definitions.yml'),
      'utf8',
    );
    const groups = readDefinitionsView(source);
    expect(groups?.map((g) => g.id)).toEqual(['orders', 'orders.items']);
    const nested = groups?.[1];
    expect(nested?.rowScope).toBe('orders');
    // The example declares string entries, so the group carries no fields —
    // what matters is that the source is VISIBLE at all: the `list` on the
    // label binds it, and the palette used to drop it silently.
    expect(nested?.fields).toEqual([]);
    expect(nested?.label).toBe('内容品');
  });
});

describe('rowScopeLabel', () => {
  const nested: PaletteGroup = {
    id: 'orders.items',
    label: '内容品',
    description: '',
    isArray: true,
    rowScope: 'orders',
    fields: [],
  };

  it('names the parent group a source is carried by', () => {
    const parent: PaletteGroup = {
      id: 'orders',
      label: '注文',
      description: '',
      isArray: true,
      fields: [],
    };
    expect(rowScopeLabel([parent, nested], nested)).toBe('注文');
  });

  it('falls back to the parent id when the parent is untitled or absent', () => {
    const untitled: PaletteGroup = {
      id: 'orders',
      label: '',
      description: '',
      isArray: true,
      fields: [],
    };
    expect(rowScopeLabel([untitled, nested], nested)).toBe('orders');
    expect(rowScopeLabel([nested], nested)).toBe('orders');
  });

  it('says nothing about a group bindable at document scope', () => {
    expect(rowScopeLabel([nested], { ...nested, rowScope: undefined })).toBeUndefined();
  });
});
