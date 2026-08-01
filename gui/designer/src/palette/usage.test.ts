// Tests for usage.ts — the where-is-this-field-used index over the
// document's binding refs: scalar keys, group-scoped rows, source
// placements, and prototype-safety for hostile keys.
import { describe, expect, it } from 'vitest';
import { type BindingRef, readBindings } from './bindings';
import { readDefinitionsView } from './model';
import { buildUsage, fieldUsage, groupUsage } from './usage';

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

const TEMPLATE = [
  'sections:',
  '  header:',
  '    items:',
  '      - type: text',
  '        data: { key: receipt.number }',
  '  body:',
  '    type: flow',
  '    items:',
  '      - type: text',
  '        data: { key: receipt.number }',
  '      - type: container',
  '        items:',
  '          - type: text',
  '            data: { key: receipt.issued_on }',
  '          - type: text',
  '            spans:',
  '              - { data: { key: recipient.name } }',
  '            mark:',
  '              data: { key: flags.circled }',
  '      - type: checkbox',
  '        box: { x: 0, y: 0 }',
  '        data: { key: flags.agreed }',
  '      - type: table',
  '        data: { key: items }',
  '        columns:',
  '          - label: 品名',
  '            data: { key: name }',
  '          - label: 数量',
  '            cell:',
  '              items:',
  '                - type: text',
  '                  data: { key: quantity }',
  '      - type: repeat',
  '        data: { key: tickets }',
  '        cell:',
  '          items:',
  '            - type: text',
  '              data: { key: seat }',
  '      - type: repeat_flow',
  '        data: { key: cards }',
  '        item:',
  '          items:',
  '            - type: text',
  '              data: { key: title }',
  '      - type: list',
  '        data: { key: tags }',
  '      - type: ellipse',
  '        box: { x: 0, y: 0, w: 10, h: 10 }',
  '        data: { key: flags.vip, equals: gold }',
  '',
].join('\n');

describe('usage index', () => {
  const groups = readDefinitionsView(DEFINITIONS) ?? [];
  const usage = buildUsage(readBindings(TEMPLATE));
  const [receipt, items] = groups;

  it('matches a scalar field by its full key across the document', () => {
    expect(fieldUsage(usage, receipt, 'receipt.number')).toEqual([
      'sections.header.items[0]',
      'sections.body.items[0]',
    ]);
    expect(fieldUsage(usage, receipt, 'receipt.issued_on')).toEqual([
      'sections.body.items[1].items[0]',
    ]);
  });

  it('matches an array field only under its own group scope', () => {
    expect(fieldUsage(usage, items, 'name')).toEqual(['sections.body.items[3].columns[0]']);
    expect(fieldUsage(usage, items, 'quantity')).toEqual([
      'sections.body.items[3].columns[1].cell.items[0]',
    ]);
    // `seat` is bound under the `tickets` scope, not `items`.
    expect(fieldUsage(usage, items, 'seat')).toEqual([]);
  });

  it('reports array-source placements on the group, none for scalar groups', () => {
    expect(groupUsage(usage, items)).toEqual(['sections.body.items[3]']);
    expect(groupUsage(usage, receipt)).toEqual([]);
  });

  it('reports unbound fields as unused', () => {
    expect(fieldUsage(usage, receipt, 'nowhere')).toEqual([]);
  });

  it('is prototype-safe for hostile binding keys', () => {
    const hostile: BindingRef[] = [
      { path: 'sections.body.items[0]', key: '__proto__', scope: null, source: false },
      { path: 'sections.body.items[1]', key: 'constructor', scope: '__proto__', source: false },
    ];
    const index = buildUsage(hostile);
    expect(index.scalar.get('__proto__')).toEqual(['sections.body.items[0]']);
    expect(index.rows.get('__proto__')?.get('constructor')).toEqual(['sections.body.items[1]']);
    // Nothing leaked onto Object.prototype.
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false);
  });
});
