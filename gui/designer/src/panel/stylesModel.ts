// What the `styles:` registry IS and how it READS: the registry's cap, one
// entry's shape, the ordered view built from the materialized `styles:` map,
// and the name-list hygiene its references need (`dedupe`). Framework-free so
// it is exhaustively unit-testable; the components stay thin over it.
//
// The op-planning halves live beside it, split by what they can be refused BY:
// `styleRefOps` (rename / delete — the reference rewrite, refusable by the
// usage walk) and `styleFieldOps` (create / update — one entry's own fields).
// Their shared result vocabulary is `stylePlan`.
//
// `dedupe` lives here rather than with the reference rewrite because the
// selection-capture model under `styles/` needs it alongside `MAX_STYLES` —
// registry vocabulary a capture reuses, not something specific to renaming.

import { STYLE_FIELDS } from './styleFieldSpecs';

/** The engine's `styles:` registry cap (`MAX_STYLES`) — creating past it would
 * author a `too_many_styles`-warning template, so the model refuses instead. */
export const MAX_STYLES = 256;

/** One registry entry: its name and the display values of the editable style
 * fields (non-`STYLE_FIELDS` props — per-side border maps, etc. — are carried
 * on the document untouched and survive edits/rename byte-intact). */
export interface StyleEntry {
  readonly name: string;
  readonly style: Readonly<Record<string, string>>;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function display(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return '';
}

/** Drop duplicate names, preserving first-seen order (a `styleNames` list may
 * gain a duplicate when a rename maps one name onto another already present). */
export function dedupe(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of names) {
    if (!seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

/** Read the ordered registry view from a materialized `styles:` node. An
 * empty-string name is skipped — it is unaddressable by the `keys` grammar
 * (an empty key segment is rejected), so it must never be offered for edit. A
 * non-map value reads as no entries. */
export function readStylesView(raw: unknown): StyleEntry[] {
  const map = record(raw);
  if (map === undefined) {
    return [];
  }
  const entries: StyleEntry[] = [];
  for (const [name, value] of Object.entries(map)) {
    if (name.length === 0) {
      continue;
    }
    const style = record(value) ?? {};
    entries.push({
      name,
      style: Object.fromEntries(STYLE_FIELDS.map((f) => [f.key, display(style[f.key])])),
    });
  }
  return entries;
}
