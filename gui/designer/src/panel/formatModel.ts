// The rows the format picker offers — the `data.format` vocabulary as data plus
// the one function that assembles it. Split out of the panel model, whose read
// side (`itemView.ts`) and op builders (`model.ts`) sit beside it.
//
// The engine stays the validator: an inapplicable format warns live. This module
// only keeps the wire spellings out of the user's head, so every table here is
// looked up own-property-guarded — a bound field's type and a registry name are
// both document-derived strings.
//
// **The SAMPLES come from the engine**, through the format catalog
// (`format.catalog`). They used to be a hand-written table here, which is the
// one thing this module must never own: the GUI does not format, so a sample it
// computed could drift from what the page actually shows. Without a catalog
// (an older engine, a host whose transport omits the query) the rows still
// list every spelling — with no sample beside them.

import type { FormatCatalog, FormatOrigin } from '../engine/types';
import type { DeclaredFormat } from '../palette/declaredFormats';
import { allowedUnder, declaredRows } from './declaredFormatOptions';
import { catalogVariants, originOf, pickableRegistry, sampleFor } from './formatCatalogReads';
import { variantLabelKey } from './formatLabels';

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

/** One row the format picker offers. A `labelKey` (the localized name) and a
 * `sample` are present only for the closed builtin spellings; a registry
 * (author-defined `formats:`) name is offered by its wire `spelling` alone. */
export interface FormatOption {
  readonly spelling: string;
  /** The author's own words for the row — a field's declared `label` — shown
   * verbatim ahead of any `labelKey`. Document text, so it only ever reaches
   * the DOM as escaped React text. */
  readonly label?: string;
  /** `format.label.<spelling>` i18n key — builtin spellings only; a registry
   * name has none (its wire spelling IS its label). */
  readonly labelKey: string | undefined;
  /** What the ENGINE renders for this spelling against its fixed exemplar
   * value(s). Empty when no catalog is available. `quantity` carries two
   * (the plural arms); everything else carries one. */
  readonly samples: readonly string[];
  /** Where the spelling comes from, for the picker's origin headings:
   * `declared` for the bound field's own `displayFormats` (known without the
   * engine), else the catalog's origin — `undefined` without a catalog. */
  readonly origin: FormatOrigin | 'declared' | undefined;
  /** Whether picking this DISCARDS the time part of the value — the engine's
   * own measurement, carried through so the row can say so. A row the catalog
   * did not describe (an engine with no catalog, or a curated override the
   * catalog does not list) reports `false`: not known to drop the time, the
   * same posture as the empty samples beside it. */
  readonly dropsTime: boolean;
}

/** The rows the format picker shows: the bound field's own declared variants
 * (`declared`, its `displayFormats`) first, then the template's `formats:`
 * registry names (author-defined, and filtered to the ones this field's type may
 * actually pick — see `pickableRegistry`), then the builtin spellings the
 * engine accepts for the bound field's display type — each with a localized
 * label and, when the engine supplied a catalog, what it actually renders. The
 * engine stays the validator (a name typed by hand still warns live); this list
 * only keeps the wire spellings out of the user's head, and no longer offers a
 * pick that could only produce a diagnostic — which is why a field that
 * declares variants also loses every row its list makes the engine refuse.
 *
 * A hostile `fieldType` (`__proto__`) resolves to the generic set via the
 * own-property guard, never an inherited table entry. `capabilities` gates the
 * number-field currency variants (undefined = show — the bundled engine
 * coerces; only a host-injected older engine lacks the key).
 */
export function formatOptions(
  registry: readonly string[],
  fieldType: string | undefined,
  capabilities?: readonly string[],
  catalog: FormatCatalog | null = null,
  declared: readonly DeclaredFormat[] = [],
): FormatOption[] {
  const coerce =
    fieldType === 'number' &&
    (capabilities === undefined || capabilities.includes('format.currency.coerce'));
  const builtins = coerce
    ? NUMBER_COERCE_SUGGESTIONS
    : fieldType !== undefined && Object.hasOwn(BUILTIN_FORMAT_SUGGESTIONS, fieldType)
      ? BUILTIN_FORMAT_SUGGESTIONS[fieldType]
      : GENERIC_FORMAT_SUGGESTIONS;
  // The field's own declared variants come first, and once there are any they
  // also drop every later row the engine would refuse (`allowedUnder`). One
  // `seen` set dedupes across all four sources: a declared id may repeat a
  // registry name, a pack variant or a curated spelling, and it wins as the
  // declared row. A row appears once, at its first source.
  const out: FormatOption[] = declaredRows(declared, fieldType, catalog);
  const seen = new Set(out.map((option) => option.spelling));
  const add = (option: FormatOption) => {
    if (
      !seen.has(option.spelling) &&
      allowedUnder(declared, option.spelling, fieldType, registry)
    ) {
      seen.add(option.spelling);
      out.push(option);
    }
  };
  for (const spelling of pickableRegistry(registry, catalog, fieldType)) {
    add({
      spelling,
      labelKey: undefined,
      samples: sampleFor(catalog, spelling, fieldType),
      origin: catalog === null ? undefined : 'registry',
      dropsTime: false,
    });
  }
  for (const variant of catalogVariants(catalog, fieldType)) {
    add({
      spelling: variant.spelling,
      // A closed own-property-guarded table, never `format.label.${…}`: a
      // pack spelling is pack-derived text and must not be spliced into a
      // catalog key. An unlabelled one shows as its bare wire spelling.
      labelKey: variantLabelKey(variant.spelling),
      samples: variant.samples,
      origin: variant.origin,
      dropsTime: variant.dropsTime,
    });
  }
  for (const spelling of builtins) {
    // `spelling` here is only ever a member of the closed builtin vocabulary
    // (`BUILTIN_FORMAT_SUGGESTIONS` / `GENERIC_FORMAT_SUGGESTIONS`), never a
    // document-derived registry name (those took the label-less path above).
    // The `seen` check is what lets a curated override row dedupe away when
    // the pack already declared that spelling.
    add({
      spelling,
      labelKey: `format.label.${spelling}`,
      samples: sampleFor(catalog, spelling, fieldType),
      origin: originOf(catalog, spelling, fieldType),
      dropsTime: overrideDropsTime(spelling, fieldType),
    });
  }
  return out;
}

/** Whether a curated TYPE-OVERRIDE row discards the time.
 *
 * The catalog answers this for every variant it describes, and those rows win
 * the dedupe above — so this only speaks for an override the catalog did NOT
 * describe: a pack that declares no `datetimeFormats.date`, or an engine too
 * old to answer at all. `date` on a datetime field re-types the value to a
 * date, which has no time by construction, so the loss is knowable here
 * without asking anyone.
 *
 * It stays FALSE where the bound type is unresolved (a document with no
 * `definitions`, which `formatCatalogReads` notes is the common state rather
 * than an edge): the generic row set offers `date` without anything saying
 * the value is a datetime, so nothing here knows a time exists to lose. That
 * is a real hole in "no silent time-drop is offered without a mark", and it
 * is the reason the claim is scoped to a field whose type is known. */
function overrideDropsTime(spelling: string, fieldType: string | undefined): boolean {
  return fieldType === 'datetime' && spelling === 'date';
}

/** The rows a `defaults.formats.<type>` picker offers: the catalog's OWN
 * variant list for that type, in the engine's order (`default` first, then the
 * pack's, then the document's registry entries). Unlike `formatOptions` this
 * is not a curated suggestion set — the catalog already answers exactly "what
 * may this type be set to", so anything not in it would warn if picked.
 *
 * `default` is left OUT: the picker's leading row already offers it, and it
 * offers it as CLEARING the key, which is the cleaner thing to author than an
 * explicit `date: default`.
 *
 * Empty without a catalog: with no engine answer there is no honest vocabulary
 * to offer, and the row falls back to showing what the document holds. */
export function variantOptions(catalog: FormatCatalog | null, fieldType: string): FormatOption[] {
  const entry = catalog?.types.find((t) => t.fieldType === fieldType);
  if (entry === undefined) {
    return [];
  }
  return entry.variants
    .filter((variant) => variant.spelling !== 'default')
    .map((variant) => ({
      spelling: variant.spelling,
      // A closed table, never an interpolated key: a registry name is a
      // document-derived string. An unlabelled spelling shows as itself.
      labelKey: variantLabelKey(variant.spelling),
      samples: variant.samples,
      origin: variant.origin,
      dropsTime: variant.dropsTime,
    }));
}

/** Whether the engine says this type has no real choice (`number`,
 * `percentage`, `quantity` in v1): the surface then shows what it renders and
 * offers NO control, because every pick but `default` would only produce a
 * warning. Unknown without a catalog — treated as not fixed, so the row keeps
 * whatever control it would otherwise have. */
export function isFixedType(catalog: FormatCatalog | null, fieldType: string): boolean {
  return catalog?.types.find((t) => t.fieldType === fieldType)?.fixed ?? false;
}

/** The sample the engine renders for one spelling under `fieldType` — what an
 * unset row shows for `default`, and what a picked name shows beside it. */
export function variantSamples(
  catalog: FormatCatalog | null,
  fieldType: string,
  spelling: string,
): readonly string[] {
  const entry = catalog?.types.find((t) => t.fieldType === fieldType);
  return entry?.variants.find((v) => v.spelling === spelling)?.samples ?? [];
}
