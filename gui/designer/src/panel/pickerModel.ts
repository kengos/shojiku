// Pure model for the binding field picker: which fields the picker offers for
// the selected item (document-scope fields, or the enclosing array group's
// row-relative fields when the item sits inside a table column / repeat cell /
// repeat_flow card), each with a LIVE sample value read from the active params
// (falling back to the definitions `example`). Framework-free like the other
// panel models; the picker component stays thin over it. Definitions AND
// params are untrusted — lookups are own-property-guarded, display strings
// bounded, and the search filter is plain `includes` (user input never becomes
// a RegExp).

import { formatPath, parsePath, type ReadFn } from '@shojiku/designer-core';
import { sampleDisplay } from '../palette/fieldDisplay';
import type { PaletteField, PaletteGroup } from '../palette/model';
import { parseParams } from '../sample/model';

/** One pickable binding target. `key` is what `data.key` would author —
 * dotted full key at document scope, row-relative inside an array scope. */
export interface PickerOption {
  readonly key: string;
  readonly label: string;
  /** The wire type name for the localized type label (unknown verbatim). */
  readonly type: string;
  /** Bounded display string of the live params value (or the definitions
   * example when params carry none); empty when neither exists. */
  readonly sample: string;
  /** The field's declared `enum` members (empty when it declares none). */
  readonly enumValues: readonly string[];
}

const ARRAY_SOURCE_TYPES = new Set(['table', 'repeat', 'repeat_flow', 'list']);

/** The capability key the `scope: document` escape rides on. */
const BINDING_SCOPE_CAPABILITY = 'binding.scope';

/** Whether the connected engine can carry a binding scope — the gate on
 * OFFERING the document-scope rows and AUTHORING `scope: document` (an older
 * engine parse-rejects the key). Reading an already-authored scope is never
 * gated: the badge tells the truth about the open file either way. Undefined
 * capabilities mean the bundled engine, which has the key (never
 * version-sniff). */
export function scopeAuthorable(capabilities: readonly string[] | undefined): boolean {
  return capabilities === undefined || capabilities.includes(BINDING_SCOPE_CAPABILITY);
}

/** The sub-template keys that re-scope bindings to an array element. */
const SCOPE_KEYS = new Set(['columns', 'cell', 'item']);

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** The enclosing row scope of the item at `path` — the `data.key` of the
 * nearest ancestor array source whose sub-template (`columns` / `cell` /
 * `item`) the path descends into — or `null` at document scope. A path that
 * does not parse, or an ancestor that is not really a bound source, reads as
 * document scope (the picker then offers full keys; the engine's validate
 * stays the real error surface). */
export function bindingScopeFor(read: ReadFn, path: string): string | null {
  let segments: ReturnType<typeof parsePath>;
  try {
    segments = parsePath(path);
  } catch {
    return null;
  }
  // Innermost candidate wins: the last `<item index>.<columns|cell|item>`
  // boundary strictly before the path's end (the selection must be INSIDE the
  // sub-template, not the source item itself). A candidate whose prefix is
  // not really a bound array source is skipped and the scan continues outward
  // — a table column's `cell` boundary resolves through the table itself.
  for (let k = segments.length - 2; k > 0; k--) {
    const segment = segments[k];
    if (
      segment.kind !== 'key' ||
      !SCOPE_KEYS.has(segment.key) ||
      segments[k - 1].kind !== 'index'
    ) {
      continue;
    }
    const sourcePath = formatPath(segments.slice(0, k));
    let source: Record<string, unknown> | undefined;
    try {
      source = record(read(sourcePath));
    } catch {
      continue;
    }
    if (source === undefined || typeof source.type !== 'string') {
      continue;
    }
    if (!ARRAY_SOURCE_TYPES.has(source.type)) {
      continue;
    }
    const key = record(source.data)?.key;
    return typeof key === 'string' && key !== '' ? key : null;
  }
  return null;
}

/** Walk the parsed params to the value a binding key addresses: dotted
 * segments at document scope, or the FIRST row of the scope array then the
 * row-relative segments. Own-property-guarded at every step (a `__proto__` /
 * `constructor` segment must never walk the prototype); anything unresolvable
 * is `undefined`. */
export function sampleValueFor(
  root: Record<string, unknown> | null,
  scope: string | null,
  key: string,
): unknown {
  if (root === null) {
    return undefined;
  }
  let node: unknown = root;
  if (scope !== null) {
    const rows = step(node, scope);
    node = Array.isArray(rows) ? rows.find((row) => record(row) !== undefined) : undefined;
  }
  return step(node, key);
}

/** One own-property step into a params object (scope keys may themselves be
 * dotted — a nested array group's id). */
function step(node: unknown, key: string): unknown {
  let current = node;
  for (const segment of key.split('.')) {
    const rec = record(current);
    if (rec === undefined || !Object.hasOwn(rec, segment)) {
      return undefined;
    }
    current = rec[segment];
  }
  return current;
}

/** The picker's option list for a scope: document scope offers every
 * non-array group's fields (full keys); an array scope offers that group's
 * row-relative fields. Samples prefer the LIVE params value over the
 * definitions example. `groups` may be `null` (no definitions) — the picker
 * then shows its empty state and free entry remains the path. */
export function pickerOptions(
  groups: readonly PaletteGroup[] | null,
  scope: string | null,
  paramsText: string,
): readonly PickerOption[] {
  if (groups === null) {
    return [];
  }
  const root = parseParams(paramsText);
  const out: PickerOption[] = [];
  for (const group of groups) {
    if (scope === null ? group.isArray : group.id !== scope || !group.isArray) {
      continue;
    }
    for (const field of group.fields) {
      out.push(option(field, root, scope));
    }
  }
  return out;
}

function option(
  field: PaletteField,
  root: Record<string, unknown> | null,
  scope: string | null,
): PickerOption {
  const live = sampleValueFor(root, scope, field.key);
  const sample = live === undefined ? field.sample : sampleDisplay(live);
  return {
    key: field.key,
    label: field.label,
    type: field.type,
    sample,
    enumValues: field.enumOptions.map((option) => option.value),
  };
}

/** Case-insensitive substring filter over key and label (plain `includes` —
 * the query is user input and never becomes a RegExp). */
export function filterOptions(
  options: readonly PickerOption[],
  query: string,
): readonly PickerOption[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') {
    return options;
  }
  return options.filter(
    (o) => o.key.toLowerCase().includes(needle) || o.label.toLowerCase().includes(needle),
  );
}
