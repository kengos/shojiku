import { describe, expect, it } from 'vitest';
import type { PaletteGroup } from '../palette/model';
import {
  arrayGroups,
  confirmChoice,
  iterableAvailable,
  MAX_FORM_FIELDS,
  MAX_NAME_CHARS,
  normalizeFields,
  validateCreateForm,
} from './iterableModel';

const ARRAY_GROUP: PaletteGroup = {
  id: 'order_items',
  label: '明細',
  description: '',
  isArray: true,
  fields: [
    { key: 'name', label: '品名', type: 'string', description: '', sample: '', enumOptions: [] },
  ],
};

const SCALAR_GROUP: PaletteGroup = {
  id: 'order',
  label: '注文',
  description: '',
  isArray: false,
  fields: [],
};

describe('iterableAvailable / arrayGroups', () => {
  it('arms on an array group or on workshop mode, and only then', () => {
    expect(iterableAvailable([ARRAY_GROUP, SCALAR_GROUP], false)).toBe(true);
    expect(iterableAvailable([SCALAR_GROUP], false)).toBe(false);
    expect(iterableAvailable(null, false)).toBe(false);
    expect(iterableAvailable(null, true)).toBe(true);
  });

  it('filters to array groups only', () => {
    expect(arrayGroups([ARRAY_GROUP, SCALAR_GROUP])).toEqual([ARRAY_GROUP]);
    expect(arrayGroups(null)).toEqual([]);
  });
});

describe('validateCreateForm', () => {
  const FIELD = { name: '品名', kind: 'text' as const };

  it('accepts a fresh trimmed name with valid fields (params rules stay extendParams turf)', () => {
    expect(validateCreateForm(' 明細 ', [FIELD], 'table')).toBeNull();
    // A prototype name is an ordinary candidate here — the fresh-key check
    // (own-property-guarded) is extendParams' single authority.
    expect(validateCreateForm('constructor', [FIELD], 'table')).toBeNull();
  });

  it('refuses an empty or over-long name', () => {
    expect(validateCreateForm('   ', [FIELD], 'table')).toBe('empty_name');
    expect(validateCreateForm('x'.repeat(MAX_NAME_CHARS + 1), [FIELD], 'table')).toBe(
      'name_too_long',
    );
  });

  it('refuses field problems: none, empty, over-long, duplicate, too many', () => {
    expect(validateCreateForm('明細', [], 'table')).toBe('no_fields');
    expect(validateCreateForm('明細', [{ name: ' ', kind: 'text' }], 'table')).toBe('empty_field');
    expect(
      validateCreateForm('明細', [{ name: 'y'.repeat(MAX_NAME_CHARS + 1), kind: 'text' }], 'table'),
    ).toBe('field_too_long');
    expect(validateCreateForm('明細', [FIELD, { name: ' 品名 ', kind: 'number' }], 'table')).toBe(
      'duplicate_field',
    );
    const flood = Array.from({ length: MAX_FORM_FIELDS + 1 }, (_, i) => ({
      name: `f${i}`,
      kind: 'text' as const,
    }));
    expect(validateCreateForm('明細', flood, 'table')).toBe('too_many_fields');
  });

  it('ignores the fields list for a list (scalar rows)', () => {
    expect(validateCreateForm('tags', [], 'list')).toBeNull();
  });
});

describe('normalizeFields', () => {
  it('trims names and keeps kinds', () => {
    expect(normalizeFields([{ name: ' 品名 ', kind: 'date' }])).toEqual([
      { name: '品名', kind: 'date' },
    ]);
  });
});

describe('confirmChoice', () => {
  it('builds a group choice, and refuses when no group resolves', () => {
    expect(confirmChoice('group', ARRAY_GROUP, '', [], 'repeat_flow')).toEqual({
      ok: true,
      choice: { kind: 'group', group: ARRAY_GROUP, variant: 'repeat_flow' },
    });
    expect(confirmChoice('group', undefined, '', [], 'table')).toEqual({
      ok: false,
      refusal: 'no_source',
    });
  });

  it('validates and normalizes a create choice', () => {
    expect(
      confirmChoice('create', undefined, ' 明細 ', [{ name: ' 品名 ', kind: 'text' }], 'table'),
    ).toEqual({
      ok: true,
      choice: {
        kind: 'create',
        name: '明細',
        fields: [{ name: '品名', kind: 'text' }],
        variant: 'table',
      },
    });
    expect(confirmChoice('create', undefined, '', [], 'table')).toEqual({
      ok: false,
      refusal: 'empty_name',
    });
  });

  it('drops the fields from a list create choice', () => {
    expect(
      confirmChoice('create', undefined, 'tags', [{ name: 'x', kind: 'text' }], 'list'),
    ).toEqual({
      ok: true,
      choice: { kind: 'create', name: 'tags', fields: [], variant: 'list' },
    });
  });
});
