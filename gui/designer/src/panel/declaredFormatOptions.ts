// What a field's declared display variants (`displayFormats`) change in a
// placement's format picker: the variants themselves become the FIRST rows, and
// a pick the engine would refuse because of them is no longer offered.
//
// The refusal is the engine's, mirrored: once a field declares a list, validate
// raises `unknown_format` — an ERROR, which refuses the whole render — for any
// pick outside it that is not a type name, a `formats:` registry name, or one of
// the money formats (engine/core/src/validate/bindings.rs). The picker's rule is
// that it never offers a pick that can only produce a diagnostic, so those rows
// leave the list. The engine's fourth escape (`value` on a field with labelled
// choices) is not mirrored because this picker never offers `value`. Typing
// stays free either way; the engine stays the validator, and the real-wasm seam
// suite pins this mirror against it.

import type { FormatCatalog } from '../engine/types';
import type { DeclaredFormat } from '../palette/declaredFormats';
import { sampleFor } from './formatCatalogReads';
import { variantLabelKey } from './formatLabels';
import type { FormatOption } from './formatModel';

/** The type names the engine reads as an OVERRIDE rather than a variant
 * (`FieldType::from_name`), which the declared-set check exempts. */
const TYPE_NAMES = new Set([
  'string',
  'number',
  'currency',
  'datetime',
  'date',
  'quantity',
  'percentage',
  'boolean',
  'image',
]);

/** Whether validate accepts `spelling` on a field of `fieldType` that declares
 * `declared` (and a document whose registry holds `registry`). Always true for
 * a field that declares nothing — the list restricts only once it has entries. */
export function allowedUnder(
  declared: readonly DeclaredFormat[],
  spelling: string,
  fieldType: string | undefined,
  registry: readonly string[],
): boolean {
  if (declared.length === 0 || declared.some((entry) => entry.id === spelling)) {
    return true;
  }
  if (TYPE_NAMES.has(spelling) || registry.includes(spelling)) {
    return true;
  }
  if (fieldType === 'currency') {
    return spelling === 'default' || spelling === 'symbol' || spelling === 'name';
  }
  return fieldType === 'number' && (spelling === 'symbol' || spelling === 'name');
}

/** The type names with a `format.label.*` entry of their own — the labels the
 * curated override rows already carry. */
const TYPE_LABELLED = new Set(['currency', 'date', 'datetime', 'number', 'percentage', 'quantity']);

/** The chrome label key for a declared id the picker knows: a variant it names
 * (`wareki`), else a labelled type name. A closed set — a key is never built
 * from document text outside it. */
function knownLabelKey(id: string): string | undefined {
  const variant = variantLabelKey(id);
  if (variant !== undefined) {
    return variant;
  }
  return TYPE_LABELLED.has(id) ? `format.label.${id}` : undefined;
}

/** The declared variants as picker rows, in the order written. Each is named by
 * its own `label`, else by the chrome label of a spelling the picker knows
 * (`wareki`, a type name), else by its id. What it RENDERS comes from the
 * engine's catalog when the catalog lists that spelling for the bound type; a
 * declared id the engine does not list (an author's own name the locale does
 * not carry) is still offered — the field declares it — with no sample. An
 * empty id restricts the field but is no pick, so it has no row.
 *
 * The rows carry the `declared` origin — and with it their own heading — only
 * when the engine answered: without a catalog no other row has a heading
 * either, and a lone heading would then stand over every row below it. */
export function declaredRows(
  declared: readonly DeclaredFormat[],
  fieldType: string | undefined,
  catalog: FormatCatalog | null,
): FormatOption[] {
  const variants = catalog?.types.find((entry) => entry.fieldType === fieldType)?.variants ?? [];
  return declared
    .filter((entry) => entry.id !== '')
    .map((entry) => ({
      spelling: entry.id,
      label: entry.label === '' ? undefined : entry.label,
      labelKey: knownLabelKey(entry.id),
      samples: sampleFor(catalog, entry.id, fieldType),
      origin: catalog === null ? undefined : 'declared',
      dropsTime: variants.find((v) => v.spelling === entry.id)?.dropsTime ?? false,
    }));
}
