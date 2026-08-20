// Pure form model for the `defaults.formats` surface: the per-type document
// default each row shows, and the root-addressed ops each control dispatches.
// Framework-free so the extraction + op construction are exhaustively
// unit-testable; the component stays thin over it.
//
// A slot holds one of THREE things, and the wire union (`FormatRef`, an
// untagged String | Inline) is why switching between them is a whole-value
// replacement at one key rather than a merge: a name reference, an inline
// `{ pattern }` map (date/datetime only), or nothing at all.
//
// **An empty pattern authors NOTHING.** `InlineFormat.pattern` is a REQUIRED
// wire field, so the panel's usual "an empty value clears the key" policy would
// author `{}` — a template the engine cannot parse, and a failure no gate
// reports because the op succeeds and the YAML stays valid.

import type { Op } from '@shojiku/designer-core';
import { FORMAT_DEFAULT_TYPES } from '../formats/model';

/** The slots whose value may be an inline `{ pattern }`. `NamedFormatKind` is
 * `Date | Datetime` only; on the other four types an inline pattern warns
 * `format_pattern_ignored` and the default form renders, so no pattern surface
 * is offered there. */
export const PATTERN_TYPES: readonly string[] = ['date', 'datetime'];

/** What one slot currently holds. */
export type FormatDefaultValue =
  | { readonly kind: 'unset' }
  | { readonly kind: 'name'; readonly name: string }
  | { readonly kind: 'inline'; readonly pattern: string };

const UNSET: FormatDefaultValue = { kind: 'unset' };

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Read one slot. A garbage value (a number, a list, a map without a string
 * `pattern`) reads as UNSET — the row then shows the locale default, which is
 * what the engine falls back to anyway. */
function readSlot(raw: unknown): FormatDefaultValue {
  if (typeof raw === 'string' && raw.length > 0) {
    return { kind: 'name', name: raw };
  }
  const pattern = record(raw)?.pattern;
  return typeof pattern === 'string' ? { kind: 'inline', pattern } : UNSET;
}

/** Read the whole `defaults.formats` view from a materialized `defaults:` node.
 * Every declared type is present in the result, so the section never has to
 * branch on a missing key. */
export function readFormatDefaultsView(raw: unknown): Readonly<Record<string, FormatDefaultValue>> {
  const formats = record(record(raw)?.formats) ?? {};
  return Object.fromEntries(FORMAT_DEFAULT_TYPES.map((type) => [type, readSlot(formats[type])]));
}

/** The op for picking a variant NAME on one slot. An empty spelling CLEARS the
 * slot — unlike a pattern, an absent name is exactly what "use the locale
 * default" means on the wire. */
export function formatDefaultNameOp(type: string, spelling: string): Op {
  const keys = ['defaults', 'formats', type];
  return spelling.length === 0
    ? { op: 'removeKey', keys }
    : { op: 'setScalar', keys, value: spelling };
}

/** The op for writing an inline pattern on one slot.
 *
 * `null` on an EMPTY pattern: authoring `{}` there produces a template the
 * engine cannot parse, so nothing is written and the field reseeds from the
 * document. A slot already holding an inline map is edited at its own
 * `pattern` key (a `setScalar`, so the map's comments survive); any other slot
 * is replaced whole, which is how the untagged union switches arms. */
export function formatDefaultPatternOp(
  type: string,
  pattern: string,
  current: FormatDefaultValue,
): Op | null {
  if (pattern.length === 0) {
    return null;
  }
  const keys = ['defaults', 'formats', type];
  return current.kind === 'inline'
    ? { op: 'setScalar', keys: [...keys, 'pattern'], value: pattern }
    : { op: 'putValue', keys, value: { pattern } };
}
