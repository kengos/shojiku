// What the `formats:` registry IS and how it READS: the registry's cap, one
// entry's shape, the ordered view built from the materialized `formats:` map,
// and the names the engine reserves. Framework-free so it is exhaustively
// unit-testable; the components stay thin over it.
//
// The op-planning halves live beside it, split by what they can be refused BY:
// `refOps` (rename / delete — the reference rewrite, refusable by the usage
// walk) and `fieldOps` (create / update — one entry's own fields). Their shared
// result vocabulary is `plan`. The `styles:` registry is laid out the same way;
// the shapes are deliberately parallel, because an author who has learnt one
// registry surface should not have to learn a second.

/** The engine's `formats:` registry cap (`MAX_FORMATS`) — creating past it
 * would author a `too_many_formats`-warning template, so the model refuses. */
export const MAX_FORMATS = 256;

/** The entry kinds v1 supports (`NamedFormatKind` — `Date | Datetime`).
 * `quantity` entries are deferred until composition proves insufficient. */
export const FORMAT_KINDS: readonly string[] = ['date', 'datetime'];

/** The `defaults.formats` type slots, in the order every surface lists them.
 * Mirrors `FormatDefaults`, a typed struct where an unknown key is a parse
 * error — so this is the COMPLETE set a document can hold. The dated pair
 * leads because they are the two that carry a pattern form. */
export const FORMAT_DEFAULT_TYPES: readonly string[] = [
  'date',
  'datetime',
  'currency',
  'number',
  'percentage',
  'quantity',
];

/** Names the engine REFUSES as registry entries (`reserved_format_name`): a
 * field-type name is a type OVERRIDE in format dispatch, so an entry by that
 * name could never be reached. Mirrors `FieldType::from_name`
 * (`engine/core/src/definitions/schema.rs`) — a drift-guard test pins the set. */
export const RESERVED_FORMAT_NAMES: readonly string[] = [
  'string',
  'number',
  'currency',
  'datetime',
  'date',
  'quantity',
  'percentage',
  'boolean',
  'image',
];

/** One registry entry, as the surface displays it. `kind` is the RAW wire
 * spelling rather than a narrowed union: an entry whose `type:` is neither
 * `date` nor `datetime` does not parse, but the document is invalid for much of
 * the time somebody is typing in it, and a row that vanishes mid-keystroke is
 * worse than one showing what is actually written. */
export interface FormatEntry {
  readonly name: string;
  readonly kind: string;
  readonly pattern: string;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function display(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Read the ordered registry view from a materialized `formats:` node. An
 * empty-string name is skipped — it is unaddressable by the `keys` grammar (an
 * empty key segment is rejected), so it must never be offered for edit. A
 * non-map value reads as no entries. */
export function readFormatsView(raw: unknown): FormatEntry[] {
  const map = record(raw);
  if (map === undefined) {
    return [];
  }
  const entries: FormatEntry[] = [];
  for (const [name, value] of Object.entries(map)) {
    if (name.length === 0) {
      continue;
    }
    const entry = record(value) ?? {};
    entries.push({ name, kind: display(entry.type), pattern: display(entry.pattern) });
  }
  return entries;
}

/** The kind an EDITING control seeds to. An entry whose wire `type:` is not one
 * of the two v1 kinds (a hand-written typo, a newer engine's kind) seeds to
 * `date` rather than leaving the control unset — the form's two-way choice has
 * no third arm to show it in. */
export function editableKind(kind: string): string {
  return FORMAT_KINDS.includes(kind) ? kind : 'date';
}
