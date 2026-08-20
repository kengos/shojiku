// Tests for formatModel.ts — the display-variant rows the FormatPicker
// offers per field type (engine-sourced spellings, deduplicated).
import { describe, expect, it } from 'vitest';
import type { FormatCatalog } from '../engine/types';
import { FORMAT_CATALOG as CATALOG } from '../testkit/formatCatalog';
import { formatOptions, isFixedType, variantOptions, variantSamples } from './formatModel';

describe('formatOptions', () => {
  it('offers registry names first (label-less), then labeled builtins', () => {
    const rows = formatOptions(['tax'], 'currency', undefined, CATALOG);
    expect(rows).toEqual([
      { spelling: 'tax', labelKey: undefined, samples: [], origin: 'registry' },
      {
        spelling: 'symbol',
        labelKey: 'format.label.symbol',
        samples: ['¥1,234,568'],
        origin: 'builtin',
      },
      {
        spelling: 'name',
        labelKey: 'format.label.name',
        samples: ['1,234,568 JPY'],
        origin: 'builtin',
      },
    ]);
  });

  it('labels the semantic overrides for a plain number field with samples', () => {
    // No capabilities passed = the bundled engine, which coerces a
    // `symbol`/`name` pick on a number to the currency type — so the two
    // currency variants ride beside `currency`.
    expect(formatOptions([], 'number', undefined, CATALOG)).toEqual([
      {
        spelling: 'currency',
        labelKey: 'format.label.currency',
        samples: ['1,234,568'],
        origin: 'builtin',
      },
      {
        spelling: 'symbol',
        labelKey: 'format.label.symbol',
        samples: ['¥1,234,568'],
        origin: 'builtin',
      },
      {
        spelling: 'name',
        labelKey: 'format.label.name',
        samples: ['1,234,568 JPY'],
        origin: 'builtin',
      },
      {
        spelling: 'percentage',
        labelKey: 'format.label.percentage',
        samples: ['12.34%'],
        origin: 'builtin',
      },
      {
        spelling: 'quantity',
        labelKey: 'format.label.quantity',
        samples: ['1点', '12,345点'],
        origin: 'builtin',
      },
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
    expect(rows[0]).toEqual({
      spelling: 'currency',
      labelKey: undefined,
      samples: [],
      origin: undefined,
    });
    expect(rows.map((r) => r.spelling)).toEqual([
      'currency',
      'symbol',
      'name',
      'percentage',
      'quantity',
    ]);
  });

  it('offers a TEXT field no builtin: `date` on one is an error, not a format', () => {
    // Naming a type override rewrites the field's type, and the engine then
    // parses the value as a date — which fails on every string that is not
    // one. The registry names a template DOES define still show.
    expect(formatOptions([], 'string')).toEqual([]);
    expect(formatOptions(['mask_tel'], 'string').map((row) => row.spelling)).toEqual(['mask_tel']);
  });

  it('keeps a hostile registry name a plain spelling-only row (no proto walk)', () => {
    const rows = formatOptions(['__proto__'], 'currency');
    expect(rows[0]).toEqual({
      spelling: '__proto__',
      labelKey: undefined,
      samples: [],
      origin: undefined,
    });
  });

  it('gives every builtin spelling a label key and a sample from the catalog (drift guard)', () => {
    // The union of every field type's builtin suggestions. The sample half of
    // this guard moved with the samples themselves: it used to protect a
    // hand-written table in this module, and now protects the LOOKUP — a new
    // builtin suggestion the catalog cannot answer for reds here rather than
    // shipping a blank row.
    const types = ['currency', 'number', 'string', 'date', 'datetime', 'boolean', undefined];
    for (const t of types) {
      for (const row of formatOptions([], t, undefined, CATALOG)) {
        expect(row.labelKey, `label for ${row.spelling}`).toBeDefined();
        expect(row.samples, `sample for ${row.spelling}`).not.toHaveLength(0);
      }
    }
  });

  it('leaves the samples empty when the engine supplied no catalog', () => {
    // The documented fallback for an engine without `format.catalog`: every
    // spelling is still offered, with nothing beside it. The GUI does not
    // substitute a sample of its own.
    for (const row of formatOptions(['tax'], 'currency')) {
      expect(row.samples).toEqual([]);
      expect(row.origin).toBeUndefined();
    }
  });

  it("reads a type-override spelling as that type's own default rendering", () => {
    // `currency` offered on a NUMBER field is a type override, not a variant
    // of number — so its sample is the currency type's default, not anything
    // under `number`. Conflating the two is the mistake the lookup exists to
    // avoid, and only a fixture where the two differ can catch it.
    const rows = formatOptions([], 'number', undefined, CATALOG);
    const currency = rows.find((r) => r.spelling === 'currency');
    expect(currency?.samples).toEqual(['1,234,568']);
    expect(currency?.origin).toBe('builtin');
  });

  it('reads a coerced spelling under CURRENCY, not under the number field', () => {
    // `symbol`/`name` on a number field coerce the value to currency, so
    // their samples live under `currency`. Looking them up under `number` —
    // which has one variant and no symbol — silently yields nothing, and the
    // picker offers the money display with no money beside it.
    const rows = formatOptions([], 'number', undefined, CATALOG);
    expect(rows.find((r) => r.spelling === 'symbol')?.samples).toEqual(['¥1,234,568']);
    expect(rows.find((r) => r.spelling === 'name')?.samples).toEqual(['1,234,568 JPY']);
  });

  it('reads a variant spelling under the BOUND type', () => {
    const rows = formatOptions([], 'currency', undefined, CATALOG);
    expect(rows.find((r) => r.spelling === 'symbol')?.samples).toEqual(['¥1,234,568']);
  });

  it('carries a registry name through with its engine sample and origin', () => {
    const rows = formatOptions(['stamp'], 'date', undefined, CATALOG);
    const stamp = rows.find((r) => r.spelling === 'stamp');
    expect(stamp?.samples).toEqual(['2026.11.03']);
    expect(stamp?.origin).toBe('registry');
  });

  it('does not resolve a prototype name through an inherited property', () => {
    // A registry name is an attacker string; the lookup walks real arrays so
    // `constructor` can never resolve to an inherited value.
    for (const hostile of ['constructor', '__proto__', 'toString']) {
      const rows = formatOptions([hostile], 'date', undefined, CATALOG);
      expect(rows.find((r) => r.spelling === hostile)?.samples).toEqual([]);
    }
  });
});

describe('formatOptions — duplicate spellings', () => {
  it('lists a repeated registry spelling once', () => {
    const rows = formatOptions(['tax', 'tax'], undefined);
    expect(rows.filter((row) => row.spelling === 'tax')).toHaveLength(1);
  });
});

describe('formatOptions — a catalog that answers incompletely', () => {
  // The response guard checks SHAPE, not that every type carries a `default`
  // variant or every suggestion has an entry. A newer/older engine that
  // answers partially must degrade to a blank sample, never to a wrong one.
  const SPARSE: FormatCatalog = {
    types: [
      { fieldType: 'currency', fixed: false, variants: [] },
      { fieldType: 'date', fixed: false, variants: [] },
    ],
    probes: [],
  };

  it('leaves the sample blank when the type carries no default variant', () => {
    const rows = formatOptions([], 'number', ['text'], SPARSE);
    expect(rows.find((r) => r.spelling === 'currency')?.samples).toEqual([]);
  });

  it('leaves the sample blank when the suggested variant is absent', () => {
    const rows = formatOptions([], 'currency', undefined, SPARSE);
    expect(rows.find((r) => r.spelling === 'symbol')?.samples).toEqual([]);
  });

  it('falls back to a builtin origin for a variant the catalog does not list', () => {
    const rows = formatOptions([], 'currency', undefined, SPARSE);
    expect(rows.find((r) => r.spelling === 'symbol')?.origin).toBe('builtin');
  });

  it('falls back to a builtin origin when the type itself is missing', () => {
    const rows = formatOptions([], 'datetime', undefined, SPARSE);
    expect(rows.find((r) => r.spelling === 'date')?.origin).toBe('builtin');
  });
});

describe('variantOptions — the defaults-row picker vocabulary', () => {
  it('is the catalog’s own list for that type, in the engine’s order', () => {
    expect(variantOptions(CATALOG, 'date')).toEqual([
      {
        spelling: 'stamp',
        labelKey: undefined,
        samples: ['2026.11.03'],
        origin: 'registry',
      },
      {
        spelling: 'wareki',
        labelKey: 'format.variant.wareki',
        samples: ['令和8年11月3日'],
        origin: 'pack',
      },
    ]);
  });

  it('leaves `default` out — the picker’s leading row already offers it', () => {
    // And offers it as CLEARING the key, which is cleaner to author than an
    // explicit `date: default`.
    for (const type of ['date', 'datetime', 'currency', 'number']) {
      expect(variantOptions(CATALOG, type).map((row) => row.spelling)).not.toContain('default');
    }
  });

  it('labels a registry name with nothing — its wire spelling IS its label', () => {
    const registry = variantOptions(CATALOG, 'date').find((row) => row.spelling === 'stamp');
    expect(registry?.labelKey).toBeUndefined();
  });

  it('is empty without a catalog, and for a type the catalog does not carry', () => {
    expect(variantOptions(null, 'date')).toEqual([]);
    expect(variantOptions(CATALOG, 'string')).toEqual([]);
    // A hostile type name resolves through a real array walk, never a
    // prototype lookup.
    expect(variantOptions(CATALOG, '__proto__')).toEqual([]);
  });
});

describe('isFixedType', () => {
  it('reports the engine’s own answer per type', () => {
    expect(isFixedType(CATALOG, 'number')).toBe(true);
    expect(isFixedType(CATALOG, 'percentage')).toBe(true);
    expect(isFixedType(CATALOG, 'quantity')).toBe(true);
    expect(isFixedType(CATALOG, 'date')).toBe(false);
    expect(isFixedType(CATALOG, 'currency')).toBe(false);
  });

  it('is false without a catalog or for an unknown type — the row keeps its control', () => {
    expect(isFixedType(null, 'number')).toBe(false);
    expect(isFixedType(CATALOG, 'nope')).toBe(false);
  });
});

describe('variantSamples', () => {
  it('finds what the engine renders for one spelling under a type', () => {
    expect(variantSamples(CATALOG, 'date', 'default')).toEqual(['2026年11月3日']);
    expect(variantSamples(CATALOG, 'date', 'stamp')).toEqual(['2026.11.03']);
    expect(variantSamples(CATALOG, 'quantity', 'default')).toEqual(['1点', '12,345点']);
  });

  it('is empty without a catalog, for an unknown type, or an unknown spelling', () => {
    expect(variantSamples(null, 'date', 'default')).toEqual([]);
    expect(variantSamples(CATALOG, 'nope', 'default')).toEqual([]);
    expect(variantSamples(CATALOG, 'date', 'constructor')).toEqual([]);
  });
});
