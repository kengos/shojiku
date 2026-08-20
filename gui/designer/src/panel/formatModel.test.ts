// Tests for formatModel.ts — the display-variant rows the FormatPicker
// offers per field type (engine-sourced spellings, deduplicated).
import { describe, expect, it } from 'vitest';
import type { FormatCatalog } from '../engine/types';
import { FORMAT_CATALOG as CATALOG } from '../testkit/formatCatalog';
import { formatOptions, isFixedType, variantOptions, variantSamples } from './formatModel';

describe('formatOptions', () => {
  it('withholds a registry name the bound type cannot pick', () => {
    // `tax` is a `formats:` entry, and every v1 registry entry is a date or a
    // datetime pattern — so the catalog lists none of them under `currency`,
    // and picking one on a money binding renders the bare amount plus an
    // `unknown_format_variant` warning. It used to head this very list.
    const rows = formatOptions(['tax'], 'currency', undefined, CATALOG);
    expect(rows).toEqual([
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
    // A registry name is an attacker string; both the sample lookup and the
    // pickability filter walk real arrays, so `constructor` can never resolve
    // to an inherited value — it is simply a name the catalog does not list.
    for (const hostile of ['constructor', '__proto__', 'toString']) {
      expect(formatOptions([hostile], 'date', undefined, CATALOG)).toEqual([
        {
          spelling: 'datetime',
          labelKey: 'format.label.datetime',
          samples: ['2026-11-03 14:05'],
          origin: 'builtin',
        },
      ]);
      // The other arm: with no catalog to filter by, the same name is offered
      // and still carries nothing inherited.
      const kept = formatOptions([hostile], 'date');
      expect(kept[0]).toEqual({
        spelling: hostile,
        labelKey: undefined,
        samples: [],
        origin: undefined,
      });
    }
  });
});

describe('formatOptions — the registry names a type may actually pick', () => {
  it('keeps a registry name the catalog lists for the bound type', () => {
    // The filter is not a blanket removal: `stamp` is a date pattern on a date
    // field, which is exactly the pairing `kind_matches` admits.
    expect(formatOptions(['stamp'], 'date', undefined, CATALOG).map((r) => r.spelling)).toEqual([
      'stamp',
      'datetime',
    ]);
  });

  it('withholds a DATE entry from a datetime field', () => {
    // The two kinds are not interchangeable — `render_dated` finds a registry
    // name before the pack, so a date pattern picked on a datetime binding
    // renders the wrong SHAPE rather than warning. The engine lists `stamp`
    // under `date` only, and this reads that answer.
    expect(formatOptions(['stamp'], 'datetime', undefined, CATALOG).map((r) => r.spelling)).toEqual(
      ['date'],
    );
  });

  it('offers a TEXT field none of them, with the catalog present', () => {
    // `string` has no format layer at all, so the catalog carries no entry for
    // it and the honest answer is none. A pick there is not even wrong out
    // loud: with no declared `enum` labels the text arm has no variants, so an
    // authored name is silently INERT (with labels it degrades to the label and
    // warns). Typing one stays possible — the picker's input is free text.
    expect(formatOptions(['mask_tel'], 'string', undefined, CATALOG)).toEqual([]);
  });

  it('offers every name when the engine supplied no catalog', () => {
    // Nothing to filter WITH, on either a type that could pick one or a type
    // that could not. The documented fallback: an older engine, or a host
    // whose transport omits the query.
    expect(formatOptions(['tax'], 'currency').map((r) => r.spelling)).toEqual([
      'tax',
      'symbol',
      'name',
    ]);
    expect(formatOptions(['mask_tel'], 'string').map((r) => r.spelling)).toEqual(['mask_tel']);
  });

  it('offers every name when the bound type is unresolved', () => {
    // Field types come from `definitions`, so a document without them resolves
    // none — the common state, not an edge case. There is no type to filter by.
    expect(
      formatOptions(['tax', 'stamp'], undefined, undefined, CATALOG).map((r) => r.spelling),
    ).toEqual(['tax', 'stamp', 'currency', 'date', 'datetime', 'percentage', 'quantity']);
  });

  it('offers every name when the type read as the empty string', () => {
    // The palette's OTHER spelling of unresolved: `displayType` returns `''`
    // for any non-string `type:`, which includes a field declared with no
    // `type:` at all — an ordinary definitions shape, not a hostile one. It
    // means "could not read this", exactly as `undefined` does, and the builtin
    // table already treats the two alike.
    expect(formatOptions(['tax'], '', undefined, CATALOG).map((r) => r.spelling)).toEqual([
      'tax',
      'currency',
      'date',
      'datetime',
      'percentage',
      'quantity',
    ]);
  });

  it('withholds every name when the catalog carries no entry for the type', () => {
    // A catalog that answers partially has ANSWERED: an absent type entry is
    // read as "nothing pickable here", never as "filter disabled". Narrower is
    // the safe direction — the free-text input still commits any spelling.
    const SPARSE: FormatCatalog = {
      types: [{ fieldType: 'currency', fixed: false, variants: [] }],
      probes: [],
    };
    expect(formatOptions(['stamp'], 'date', undefined, SPARSE).map((r) => r.spelling)).toEqual([
      'datetime',
    ]);
  });

  it('reads the catalog as a FILTER, never as a source of names', () => {
    // The document's list is what gets walked. A catalog naming `stamp` cannot
    // put it in a picker for a document that does not declare it, and a
    // document name the catalog does not list does not survive either.
    expect(formatOptions(['other'], 'date', undefined, CATALOG).map((r) => r.spelling)).toEqual([
      'datetime',
    ]);
  });

  it('does not file a builtin-origin spelling as the document’s own entry', () => {
    // `reserved_format_name` reserves the nine field-TYPE names only, so a
    // `formats:` entry may legally be spelled `symbol` — and currency dispatch
    // matches that name in `money.rs` without ever consulting the registry. So
    // the catalog attributes it to the engine, and it is offered as the BUILTIN
    // row it really is (label and sample), not as a bare registry row.
    const rows = formatOptions(['symbol'], 'currency', undefined, CATALOG);
    expect(rows.map((r) => r.spelling)).toEqual(['symbol', 'name']);
    expect(rows[0].labelKey).toBe('format.label.symbol');
    expect(rows[0].samples).toEqual(['¥1,234,568']);
  });

  it('keeps the authored order and lists a repeat once', () => {
    const TWO: FormatCatalog = {
      types: [
        {
          fieldType: 'date',
          fixed: false,
          variants: [
            { spelling: 'era', origin: 'registry', samples: ['令和8年'] },
            { spelling: 'stamp', origin: 'registry', samples: ['2026.11.03'] },
          ],
        },
      ],
      probes: [],
    };
    // The catalog sorts its own names; the picker shows the author's order.
    expect(
      formatOptions(['stamp', 'era', 'stamp'], 'date', undefined, TWO).map((r) => r.spelling),
    ).toEqual(['stamp', 'era', 'datetime']);
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
