// Pure form model for the document-metadata surface: it reads the display view
// out of the materialized `document:` map (`Editor.read('document')`) and builds
// the root-addressed named ops each control dispatches. Framework-free so the
// extraction + op construction are exhaustively unit-testable; the component
// stays thin over it.
//
// The two LISTS (`keywords`, `authors`) are written whole with `setStrings` —
// the same op the `styleNames` list uses — because they are flat scalar lists
// with no per-entry structure worth preserving; clearing the last entry removes
// the key rather than leaving an empty sequence behind.

import type { Op } from '@shojiku/designer-core';
import { plainTextOp } from './model';

/** The scalar metadata keys. (No array beside it: each of the three has its
 * own widget and copy, so nothing iterates them.) */
export type MetaTextKey = 'title' | 'description' | 'language';

/** The list-valued metadata keys, in the order the surface shows them —
 * these two DO share one widget, so the surface iterates this. */
export const META_LIST_KEYS = ['keywords', 'authors'] as const;
export type MetaListKey = (typeof META_LIST_KEYS)[number];

/** The engine's per-list cap (`MAX_DOCUMENT_ENTRIES`) — the surface stops
 * offering "add" at it rather than authoring entries the engine would warn
 * about and drop. */
export const MAX_META_ENTRIES = 64;

/** The document-metadata display view: bare wire strings (empty when unset)
 * and the two lists (empty when unset). */
export interface DocumentMetaView {
  readonly title: string;
  readonly description: string;
  readonly language: string;
  readonly keywords: readonly string[];
  readonly authors: readonly string[];
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** A scalar's display string: strings verbatim, numbers stringified, anything
 * else empty (the field reads as unset). */
function display(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return '';
}

/** A list's display entries. A non-list reads as empty, and a non-scalar entry
 * is dropped rather than shown as `[object Object]` — the document is
 * untrusted, and an entry the surface cannot address must not look editable. */
function displayList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(display).filter((entry) => entry !== '');
}

/** Read the metadata view from a materialized `document:` node. A missing key
 * or a garbage non-map value both read as all-empty — the surface shows blank
 * fields, and a first edit auto-creates `document:`. */
export function readDocumentMetaView(raw: unknown): DocumentMetaView {
  const rec = record(raw);
  return {
    title: display(rec?.title),
    description: display(rec?.description),
    language: display(rec?.language),
    keywords: displayList(rec?.keywords),
    authors: displayList(rec?.authors),
  };
}

/** The template's own identity, which sits at the ROOT beside `document:`
 * rather than inside it: `name:` (the PDF title when `document.title` is
 * absent — the engine's only reader of it) and `version:` (informational; the
 * engine reads it nowhere). Display strings, `''` when unset. */
export interface TemplateIdentityView {
  readonly name: string;
  readonly version: string;
  /** The key is PRESENT but holds a shape no field can show (a map, a list, a
   * bool) — distinct from absent, which also displays as `''`. The engine
   * refuses such a document at parse, so the field must be able to clear it. */
  readonly unreadable: Readonly<Record<IdentityKey, boolean>>;
}

/** The root keys the identity fields write. */
export type IdentityKey = 'name' | 'version';

/** A present value the display cannot show (`null` reads as absent, as the
 * engine's `Option` does). */
function unreadableValue(value: unknown): boolean {
  return (
    value !== undefined && value !== null && typeof value !== 'string' && typeof value !== 'number'
  );
}

/** Read the identity view through the editor's root reads. A number reads as
 * its decimal string — the document model has already parsed it, so an
 * authored `1.0` shows as `1` (an unchanged blur writes nothing back); anything
 * else — a map, a list, a bool — reads as `''` and is flagged `unreadable`. */
export function readTemplateIdentity(read: (path: string) => unknown): TemplateIdentityView {
  const name = read('name');
  const version = read('version');
  return {
    name: display(name),
    version: display(version),
    unreadable: { name: unreadableValue(name), version: unreadableValue(version) },
  };
}

/** The op for one identity edit, or `null` when the commit changes nothing (a
 * blur at the field's own value must not bump the revision) — except that an
 * EMPTY commit over an unreadable value removes the key, the one way to clear
 * a shape the field could not show. The value is always written as TEXT, so it
 * keeps exactly what was typed: a number would turn a typed `1.10` into `1.1`
 * and `1.0` into `1`, while the engine's `Version` takes a string as readily
 * as a number. Empty clears the key. */
export function identityOp(
  key: IdentityKey,
  current: string,
  raw: string,
  unreadable = false,
): Op | null {
  return raw === current && !(unreadable && raw === '') ? null : plainTextOp(undefined, [key], raw);
}

/** The op for one scalar metadata edit (empty clears the key), or `null` when
 * the commit changes nothing — a field blurred at its own value must not put
 * an edit nobody made on the undo stack (`controller.apply` commits whatever
 * it is handed, a same-value write included). */
export function metaTextOp(key: MetaTextKey, current: string, raw: string): Op | null {
  return raw === current ? null : plainTextOp(undefined, ['document', key], raw);
}

/** The op for a whole metadata list: an empty selection clears the key,
 * otherwise the list is written as a flow sequence. Blank entries are dropped
 * (a row the user emptied is a removal, not an empty string in the PDF). */
export function metaListOp(key: MetaListKey, entries: readonly string[]): Op {
  const kept = entries.map((entry) => entry.trim()).filter((entry) => entry !== '');
  return kept.length === 0
    ? { op: 'removeKey', path: undefined, keys: ['document', key] }
    : { op: 'setStrings', path: undefined, keys: ['document', key], values: kept };
}

/** The list with one row's committed value applied. `index === entries.length`
 * is the trailing blank row the surface always shows, so committing there
 * APPENDS — which is what makes "add" a place to type rather than a button
 * that authors an empty entry the engine would drop. An index outside that
 * range refuses (returns the list unchanged): the document is untrusted and a
 * stale row must never author a hole. */
export function replaceEntry(entries: readonly string[], index: number, value: string): string[] {
  if (index === entries.length) {
    return [...entries, value];
  }
  if (index < 0 || index > entries.length) {
    return [...entries];
  }
  return entries.map((entry, i) => (i === index ? value : entry));
}

/** The list with one entry removed. */
export function removeEntry(entries: readonly string[], index: number): string[] {
  return entries.filter((_, i) => i !== index);
}
