// How a format spelling READS to a human: the wire spelling → chrome-catalog
// key table, and the origin → group-heading key the pickers show above each
// run of options.
//
// The engine returns wire spellings and rendered samples and NOTHING ELSE —
// the i18n boundary: the engine never translates, so every display label is the
// GUI's. A spelling this table does not carry displays as its BARE WIRE
// SPELLING (user decision): a locale pack that ships a new variant, or an
// author's own `formats:` name, is shown as written rather than as a raw
// catalog key. That is also why the lookup is a closed own-property-guarded
// table and never `format.label.${spelling}` — a registry name is a
// document-derived string and must never be spliced into a catalog key.

import type { FormatOrigin } from '../engine/types';

/** Chrome-catalog key per KNOWN spelling. The variant names come from the
 * shipped locale packs' `dateFormats`/`datetimeFormats` keys plus the engine's
 * own currency vocabulary; `default` is the "no pick" row every type carries. */
const LABEL_KEY: Readonly<Record<string, string>> = {
  default: 'format.variant.default',
  long: 'format.variant.long',
  compact: 'format.variant.compact',
  wareki: 'format.variant.wareki',
  'wareki-compact': 'format.variant.warekiCompact',
  gregorian: 'format.variant.gregorian',
  date: 'format.variant.dateOnly',
  symbol: 'format.label.symbol',
  name: 'format.label.name',
};

/** The catalog key for a spelling, or `undefined` when the spelling has none
 * and should display as itself. */
export function variantLabelKey(spelling: string): string | undefined {
  return Object.hasOwn(LABEL_KEY, spelling) ? LABEL_KEY[spelling] : undefined;
}

/** The group heading above a run of options sharing an origin. A document's own
 * `formats:` entries and the locale's variants differ in KIND — only the former
 * breaks when the registry is renamed — so the picker says which is which. */
export const ORIGIN_HEADING_KEY: Record<FormatOrigin, string> = {
  registry: 'format.origin.registry',
  pack: 'format.origin.pack',
  builtin: 'format.origin.builtin',
};
