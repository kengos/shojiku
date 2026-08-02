// Tests for formatModel.ts — the display-variant rows the FormatPicker
// offers per field type (engine-sourced spellings, deduplicated).
import { describe, expect, it } from 'vitest';
import { formatOptions } from './formatModel';

describe('formatOptions', () => {
  it('offers registry names first (label-less), then labeled builtins', () => {
    const rows = formatOptions(['tax'], 'currency');
    expect(rows).toEqual([
      { spelling: 'tax', labelKey: undefined, sample: '' },
      { spelling: 'symbol', labelKey: 'format.label.symbol', sample: '¥300,000' },
      { spelling: 'name', labelKey: 'format.label.name', sample: '300,000 JPY' },
    ]);
  });

  it('labels the semantic overrides for a plain number field with samples', () => {
    // No capabilities passed = the bundled engine, which coerces a
    // `symbol`/`name` pick on a number to the currency type — so the two
    // currency variants ride beside `currency`.
    expect(formatOptions([], 'number')).toEqual([
      { spelling: 'currency', labelKey: 'format.label.currency', sample: '¥300,000' },
      { spelling: 'symbol', labelKey: 'format.label.symbol', sample: '¥300,000' },
      { spelling: 'name', labelKey: 'format.label.name', sample: '300,000 JPY' },
      { spelling: 'percentage', labelKey: 'format.label.percentage', sample: '30%' },
      { spelling: 'quantity', labelKey: 'format.label.quantity', sample: '1,234点' },
    ]);
  });

  it('gates the number currency variants on the engine capability key', () => {
    // An older host-injected engine (capabilities present, key absent)
    // keeps the base trio; a capability list carrying the key shows all.
    expect(formatOptions([], 'number', ['text']).map((r) => r.spelling)).toEqual([
      'currency',
      'percentage',
      'quantity',
    ]);
    expect(formatOptions([], 'number', ['format.currency.coerce']).map((r) => r.spelling)).toEqual([
      'currency',
      'symbol',
      'name',
      'percentage',
      'quantity',
    ]);
    // The gate is number-only: a currency field's set ignores capabilities.
    expect(formatOptions([], 'currency', ['text']).map((r) => r.spelling)).toEqual([
      'symbol',
      'name',
    ]);
  });

  it('falls back to the generic set when the field type is unresolved', () => {
    expect(formatOptions([], undefined).map((r) => r.spelling)).toEqual([
      'currency',
      'date',
      'datetime',
      'percentage',
      'quantity',
    ]);
  });

  it('offers nothing for a boolean field with no registry (empty picker)', () => {
    expect(formatOptions([], 'boolean')).toEqual([]);
  });

  it('treats a hostile __proto__ field type as unresolved, not an inherited key', () => {
    // The own-property guard must not return the prototype's members for a
    // `format: __proto__` (or `constructor`) schema type.
    expect(formatOptions([], '__proto__').map((r) => r.spelling)).toEqual([
      'currency',
      'date',
      'datetime',
      'percentage',
      'quantity',
    ]);
  });

  it('dedupes a registry name that shadows a builtin (registry row wins, no label)', () => {
    const rows = formatOptions(['currency'], 'number');
    expect(rows[0]).toEqual({ spelling: 'currency', labelKey: undefined, sample: '' });
    expect(rows.map((r) => r.spelling)).toEqual([
      'currency',
      'symbol',
      'name',
      'percentage',
      'quantity',
    ]);
  });

  it('keeps a hostile registry name a plain spelling-only row (no proto walk)', () => {
    const rows = formatOptions(['__proto__'], 'currency');
    expect(rows[0]).toEqual({ spelling: '__proto__', labelKey: undefined, sample: '' });
  });

  it('gives every builtin spelling a non-empty label key and sample (drift guard)', () => {
    // The union of every field type's builtin suggestions — a new builtin
    // spelling without a FORMAT_SAMPLES entry reds here, not as a blank row.
    const types = ['currency', 'number', 'string', 'date', 'datetime', 'boolean', undefined];
    for (const t of types) {
      for (const row of formatOptions([], t)) {
        expect(row.labelKey, `label for ${row.spelling}`).toBeDefined();
        expect(row.sample, `sample for ${row.spelling}`).not.toBe('');
      }
    }
  });
});

describe('formatOptions — duplicate spellings', () => {
  it('lists a repeated registry spelling once', () => {
    const rows = formatOptions(['tax', 'tax'], undefined);
    expect(rows.filter((row) => row.spelling === 'tax')).toHaveLength(1);
  });
});
