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

/** Finds what a spelling RENDERS, in the engine's own words.
 *
 * Two shapes resolve differently, and conflating them is the bug this
 * function exists to avoid. A spelling that names a TYPE (`currency` offered
 * on a number field) is a type OVERRIDE — the engine re-types the value — so
 * its sample is that type's own default rendering. Anything else is a VARIANT
 * of the bound field's type (`symbol` on a currency field, a `formats:`
 * registry name on a date field), so it is looked up under that type.
 *
 * Both lookups walk real arrays rather than indexing an object table: the
 * spelling can be a document-derived registry name, and a prototype name
 * (`constructor`, `__proto__`) must never resolve to an inherited value.
 */
function sampleFor(
  catalog: FormatCatalog | null,
  spelling: string,
  fieldType: string | undefined,
): readonly string[] {
  if (catalog === null) {
    return [];
  }
  const asType = catalog.types.find((t) => t.fieldType === spelling);
  if (asType !== undefined) {
    return asType.variants.find((v) => v.spelling === 'default')?.samples ?? [];
  }
  const own = catalog.types.find((t) => t.fieldType === resolvedType(spelling, fieldType));
  return own?.variants.find((v) => v.spelling === spelling)?.samples ?? [];
}

/** The type a variant spelling actually resolves under.
 *
 * Normally the bound field's own — but `symbol`/`name` on a NUMBER field
 * COERCE the value to currency (`format.currency.coerce`, mirrored from
 * `engine/formatter/src/format.rs`), so their samples live under `currency`
 * and looking them up under `number` finds nothing. That is the whole point
 * of offering them there: money display without definitions.
 */
function resolvedType(spelling: string, fieldType: string | undefined): string | undefined {
  if (fieldType === 'number' && (spelling === 'symbol' || spelling === 'name')) {
    return 'currency';
  }
  return fieldType;
}

/** One row the format picker offers. A `labelKey` (the localized name) and a
 * `sample` are present only for the closed builtin spellings; a registry
 * (author-defined `formats:`) name is offered by its wire `spelling` alone. */
export interface FormatOption {
  readonly spelling: string;
  /** `format.label.<spelling>` i18n key — builtin spellings only; a registry
   * name has none (its wire spelling IS its label). */
  readonly labelKey: string | undefined;
  /** What the ENGINE renders for this spelling against its fixed exemplar
   * value(s). Empty when no catalog is available. `quantity` carries two
   * (the plural arms); everything else carries one. */
  readonly samples: readonly string[];
  /** Where the spelling comes from, for the picker's origin headings.
   * `undefined` without a catalog. */
  readonly origin: FormatOrigin | undefined;
}

/** The rows the format picker shows: the template's `formats:` registry names
 * first (author-defined), then the builtin spellings the engine accepts for the
 * bound field's display type — each with a localized label and, when the engine
 * supplied a catalog, what it actually renders. The engine stays the validator
 * (an inapplicable name warns live); this list only keeps the wire spellings
 * out of the user's head.
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
      out.push({
        spelling,
        labelKey: undefined,
        samples: sampleFor(catalog, spelling, fieldType),
        origin: catalog === null ? undefined : 'registry',
      });
    }
  }
  for (const spelling of builtins) {
    if (!seen.has(spelling)) {
      seen.add(spelling);
      // `spelling` here is only ever a member of the closed builtin vocabulary
      // (`BUILTIN_FORMAT_SUGGESTIONS` / `GENERIC_FORMAT_SUGGESTIONS`), never a
      // document-derived registry name (those took the label-less path above).
      out.push({
        spelling,
        labelKey: `format.label.${spelling}`,
        samples: sampleFor(catalog, spelling, fieldType),
        origin: originOf(catalog, spelling, fieldType),
      });
    }
  }
  return out;
}

/** A builtin suggestion's origin, as the catalog reports it. A type-override
 * spelling is the engine's own vocabulary; a variant carries whatever layer
 * defined it, which is how a pack-declared variant is told apart from one the
 * engine ships. */
function originOf(
  catalog: FormatCatalog | null,
  spelling: string,
  fieldType: string | undefined,
): FormatOrigin | undefined {
  if (catalog === null) {
    return undefined;
  }
  if (catalog.types.some((t) => t.fieldType === spelling)) {
    return 'builtin';
  }
  const own = catalog.types.find((t) => t.fieldType === resolvedType(spelling, fieldType));
  return own?.variants.find((v) => v.spelling === spelling)?.origin ?? 'builtin';
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
