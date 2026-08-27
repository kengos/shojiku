// The catalog lookups `formatOptions` needs: given the engine's answer, which
// names a BINDING may pick, what each one renders, and where it came from.
//
// Split out of `formatModel.ts` for the line budget. Scope, stated rather
// than assumed: every export here has exactly one caller, `formatOptions`.
// The document-defaults side (`variantOptions` / `isFixedType` /
// `variantSamples`) reads the catalog too, but inlines its own one-line
// `types.find(…)` and does not come through here — it cannot, without
// importing `FormatOption` back from `formatModel` and making the two files
// circular. So this is the binding picker's half, not a shared seam.
//
// Every lookup here walks real ARRAYS rather than indexing an object table: a
// spelling can be a document-derived registry name, so a prototype name
// (`constructor`, `__proto__`) must never resolve to an inherited value.

import type { FormatCatalog, FormatOrigin, FormatVariant } from '../engine/types';

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
export function sampleFor(
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

/** Which of the document's `formats:` registry names this field may PICK.
 *
 * The engine already answers this. A registry entry declares a KIND (`date` or
 * `datetime` — the only two v1 has), and the catalog lists it under a type only
 * where the two agree (`kind_matches`, `engine/authoring/src/formats/variants.rs`).
 * Offering the rest offered a pick that WARNS on a currency field
 * (`unknown_format_variant`) and, on a text field with no declared `enum`
 * labels, is silently INERT — that arm has no variants of its own, so the name
 * is neither honoured nor complained about (`engine/formatter/src/format/text.rs`;
 * WITH labels the same pick degrades to the label and does warn). The document-settings picker has read the catalog since it shipped;
 * this is the binding-level picker catching up to it.
 *
 * Two states have nothing to filter WITH, and both keep the full list: no
 * catalog (an older engine, a host whose transport omits the query), and an
 * unresolved field type — types come from `definitions`, so a document without
 * them resolves none, which makes that the common state rather than an edge.
 * Unresolved has TWO spellings and they mean the same thing: `undefined` when
 * no offer matches the bound key, and `''` when one does and its type could not
 * be read — `displayType` mints that for any non-string `type:`, a field
 * declared with no `type:` at all included. The builtin table already treats
 * them alike (neither is an own property, so both fall to the generic set).
 * Otherwise the catalog IS the vocabulary, including for the types it carries
 * no entry for at all (`string`/`boolean`/`image` have no format layer), where
 * the honest answer is none.
 *
 * The DOCUMENT's list is what gets walked, with the catalog consulted per name:
 * that keeps the authored order, and it means a catalog naming an entry the
 * document does not hold can never add a row to a picker. `origin` is read too,
 * not just presence — a name the engine attributes to the pack or to its own
 * builtins (a `formats:` entry spelled `symbol`, which `reserved_format_name`
 * permits) is not the document's registry entry, and it is still offered by the
 * builtin row below, with its label and its sample.
 *
 * Arrays, never object indexing: a registry name is a document-derived string.
 */
export function pickableRegistry(
  registry: readonly string[],
  catalog: FormatCatalog | null,
  fieldType: string | undefined,
): readonly string[] {
  if (catalog === null || fieldType === undefined || fieldType === '') {
    return registry;
  }
  const listed = catalog.types.find((t) => t.fieldType === fieldType)?.variants ?? [];
  return registry.filter((n) => listed.some((v) => v.spelling === n && v.origin === 'registry'));
}

/** The variants the ENGINE says this type has, as picker rows.
 *
 * This is the half of the picker that used to be hand-written in this module.
 * A locale pack's own vocabulary — `wareki` on a Japanese date field — was
 * simply unreachable from a binding's panel, because a curated table here
 * cannot know what a pack declares. The catalog does, so it supplies the
 * names, and a pack shipped after this build is reachable without a GUI
 * change.
 *
 * `registry` rows are excluded ON PURPOSE, and that is the whole of what
 * survives of the old "catalog is a filter, never a name source" rule: a
 * registry entry is the DOCUMENT's, so for those the catalog stays a filter
 * over the document's own list (`pickableRegistry`) and can never add a row
 * for an entry the document does not declare.
 *
 * `default` is left out for the same reason `variantOptions` leaves it out:
 * the panel's empty state already means "no pick", and authoring
 * `format: default` only says that again in the file.
 *
 * Arrays, never object indexing: a spelling here is pack- or
 * document-derived text.
 */
export function catalogVariants(
  catalog: FormatCatalog | null,
  fieldType: string | undefined,
): readonly FormatVariant[] {
  if (catalog === null || fieldType === undefined || fieldType === '') {
    return [];
  }
  const entry = catalog.types.find((t) => t.fieldType === fieldType);
  return (entry?.variants ?? []).filter((v) => v.origin !== 'registry' && v.spelling !== 'default');
}

/** A builtin suggestion's origin, as the catalog reports it. A type-override
 * spelling is the engine's own vocabulary; a variant carries whatever layer
 * defined it, which is how a pack-declared variant is told apart from one the
 * engine ships. */
export function originOf(
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
