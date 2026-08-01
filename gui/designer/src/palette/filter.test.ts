// Tests for filter.ts — the palette search filter: group-level hits keep
// the whole group, field hits keep their group, misses drop it.
import { describe, expect, it } from 'vitest';
import { filterGroups } from './filter';
import { readDefinitionsView } from './model';

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

describe('filterGroups', () => {
  const groups = readDefinitionsView(DEFINITIONS) ?? [];

  it('returns everything for an empty or blank query', () => {
    expect(filterGroups(groups, '')).toBe(groups);
    expect(filterGroups(groups, '   ')).toBe(groups);
  });

  it('keeps the whole group on a group-level hit', () => {
    const hit = filterGroups(groups, '領収');
    expect(hit.length).toBe(1);
    expect(hit[0].fields.length).toBe(2);
  });

  it('matches group ids, field keys, and field labels case-insensitively', () => {
    expect(filterGroups(groups, 'ITEMS')[0].id).toBe('items');
    const byKey = filterGroups(groups, 'issued');
    expect(byKey[0].fields.map((f) => f.key)).toEqual(['receipt.issued_on']);
    const byLabel = filterGroups(groups, '番号');
    expect(byLabel[0].fields.map((f) => f.key)).toEqual(['receipt.number']);
  });

  it('drops groups with no hits', () => {
    expect(filterGroups(groups, 'quantity').map((g) => g.id)).toEqual(['items']);
    expect(filterGroups(groups, 'zzz-none')).toEqual([]);
  });
});
