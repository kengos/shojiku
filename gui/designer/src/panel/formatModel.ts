// The rows the format picker offers — the `data.format` vocabulary as data plus
// the one function that assembles it. Split out of the panel model, whose read
// side (`itemView.ts`) and op builders (`model.ts`) sit beside it.
//
// The engine stays the validator: an inapplicable format warns live. This module
// only keeps the wire spellings out of the user's head, so every table here is
// looked up own-property-guarded — a bound field's type and a registry name are
// both document-derived strings.

/** Builtin format spellings worth suggesting per bound-field display type
 * (`displayType` names): currency fields offer their two non-default
 * variants, other types the semantic overrides that change their rendering.
 * Keyed by document-derived strings, so lookups are own-property-guarded. */
const BUILTIN_FORMAT_SUGGESTIONS: Record<string, readonly string[]> = {
  currency: ['symbol', 'name'],
  number: ['currency', 'percentage', 'quantity'],
  date: ['datetime'],
  datetime: ['date'],
  percentage: ['number'],
  quantity: ['number'],
  // No format changes how these render — suggesting one would only bait a
  // live engine warning. A TEXT field is in this set: naming `date` on one
  // overrides the declared type, and the engine then parses the value as a
  // date — which fails on every string that is not one, so offering it beside
  // a customer name was offering an error. A text field that really does hold
  // an ISO date is the expert path: the spelling can still be typed.
  string: [],
  boolean: [],
  image: [],
};

/** The suggestions for a field whose type the panel cannot resolve (an
 * unbound key, or a type outside the known table). */
const GENERIC_FORMAT_SUGGESTIONS: readonly string[] = [
  'currency',
  'date',
  'datetime',
  'percentage',
  'quantity',
];

/** The number-field suggestions when the engine coerces a `symbol`/`name`
 * pick to the currency type (`format.currency.coerce`): the two currency
 * variants slot in beside `currency` — the money-display path without
 * definitions. A superset of the base `number` row (drift-guarded by test). */
const NUMBER_COERCE_SUGGESTIONS: readonly string[] = [
  'currency',
  'symbol',
  'name',
  'percentage',
  'quantity',
];

/** Illustrative, language-neutral sample renderings for each builtin format
 * spelling — they show the SHAPE a format produces (grouping, symbol, counter),
 * never the field's real rendering (the engine is the live validator/renderer;
 * the GUI has no formatter over the wire). Keyed by the closed builtin
 * vocabulary; a lookup on a document-derived spelling is own-property-guarded
 * (a registry name may be a hostile string like `constructor`). */
const FORMAT_SAMPLES: Record<string, string> = {
  symbol: '¥300,000',
  name: '300,000 JPY',
  currency: '¥300,000',
  number: '300,000',
  percentage: '30%',
  quantity: '1,234点',
  date: '2026-07-19',
  datetime: '2026-07-19 09:00',
};

/** One row the format picker offers. A `labelKey` (the localized name) and a
 * `sample` are present only for the closed builtin spellings; a registry
 * (author-defined `formats:`) name is offered by its wire `spelling` alone. */
export interface FormatOption {
  readonly spelling: string;
  /** `format.label.<spelling>` i18n key — builtin spellings only; a registry
   * name has none (its wire spelling IS its label). */
  readonly labelKey: string | undefined;
  /** Illustrative sample, or empty for a registry name. */
  readonly sample: string;
}

/** The rows the format picker shows: the template's `formats:` registry names
 * first (author-defined, spelling-only), then the builtin spellings the engine
 * accepts for the bound field's display type — each with a localized label + an
 * illustrative sample. The engine stays the validator (an inapplicable name
 * warns live); this list only keeps the wire spellings out of the user's head.
 * A hostile `fieldType` (`__proto__`) resolves to the generic set via the
 * own-property guard, never an inherited table entry. `capabilities` gates
 * the number-field currency variants (undefined = show — the bundled engine
 * coerces; only a host-injected older engine lacks the key). */
export function formatOptions(
  registry: readonly string[],
  fieldType: string | undefined,
  capabilities?: readonly string[],
): FormatOption[] {
  const coerce =
    fieldType === 'number' &&
    (capabilities === undefined || capabilities.includes('format.currency.coerce'));
  const builtins = coerce
    ? NUMBER_COERCE_SUGGESTIONS
    : fieldType !== undefined && Object.hasOwn(BUILTIN_FORMAT_SUGGESTIONS, fieldType)
      ? BUILTIN_FORMAT_SUGGESTIONS[fieldType]
      : GENERIC_FORMAT_SUGGESTIONS;
  const seen = new Set<string>();
  const out: FormatOption[] = [];
  for (const spelling of registry) {
    if (!seen.has(spelling)) {
      seen.add(spelling);
      out.push({ spelling, labelKey: undefined, sample: '' });
    }
  }
  for (const spelling of builtins) {
    if (!seen.has(spelling)) {
      seen.add(spelling);
      // `spelling` here is only ever a member of the closed builtin vocabulary
      // (`BUILTIN_FORMAT_SUGGESTIONS` / `GENERIC_FORMAT_SUGGESTIONS`), never a
      // document-derived registry name (those took the label-less path above),
      // so a direct sample lookup is safe — every builtin has an entry (pinned
      // by a drift-guard test).
      out.push({
        spelling,
        labelKey: `format.label.${spelling}`,
        sample: FORMAT_SAMPLES[spelling],
      });
    }
  }
  return out;
}
