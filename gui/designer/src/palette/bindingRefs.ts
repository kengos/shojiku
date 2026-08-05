// Per-item helpers of the template walk: how ONE item's surfaces yield
// binding refs. Kept beside `bindings.ts` (the recursive walk itself) so the
// scope rules — a `scope: document` binding escapes the enclosing row, a
// declared `{name}` redirects to its declaration's key — read in one place.

import { DOCUMENT_SCOPE } from '../panel/model';
import type { Declaration } from '../text/declModel';
import { interpolationKeys } from '../text/interpolate';
import type { BindingRef } from './bindings';
import { record } from './fieldDisplay';

export const ARRAY_SOURCE_TYPES = new Set(['table', 'repeat', 'repeat_flow', 'list']);

/** Item types whose static `text:` the engine interpolates against data
 * (`{key}` / `{key:format}` — see [data-binding docs]); a field driven only
 * through interpolation must still read as used. `list` is separate: its
 * `text:` resolves against the array ENTRY, one scope further in than the
 * item sits — [`entryScope`] is where that scope comes from. */
export const TEXT_INTERPOLATION_TYPES = new Set(['text', 'qr_code']);

/** The scope a `list`'s per-entry keys resolve in: the array it binds,
 * addressed the way the engine's catalog does — a row-relative key joins its
 * enclosing scope, a `scope: document` one (or a list at document scope)
 * names a top-level source. `null` when the list binds nothing. */
export function entryScope(data: unknown, ambient: string | null): string | null {
  const key = bindingKey(data);
  if (key === undefined) {
    return null;
  }
  const scope = bindingScope(data, ambient);
  return scope === null ? key : `${scope}.${key}`;
}

export function bindingKey(value: unknown): string | undefined {
  const key = record(value)?.key;
  return typeof key === 'string' && key !== '' ? key : undefined;
}

/** Where a `data:` binding's key actually resolves: `scope: document` is the
 * engine's explicit escape from the enclosing row to top-level params, so such
 * a binding counts at DOCUMENT scope even inside a cell. Every other authored
 * value — including a hostile non-string — keeps the ambient scope, matching
 * the engine's `element` default. Mirrors what `narrowDeclarations` already
 * does for a declared `{name}`. */
export function bindingScope(value: unknown, ambient: string | null): string | null {
  return record(value)?.scope === DOCUMENT_SCOPE ? null : ambient;
}

/** Collect the DISTINCT interpolation keys of a text value into `keys` (a key
 * used twice in one item is one placement — the same box). Non-string text (a
 * malformed document) contributes nothing. */
export function collectInterpolations(keys: Set<string>, text: unknown): void {
  if (typeof text !== 'string') {
    return;
  }
  for (const key of interpolationKeys(text)) {
    keys.add(key);
  }
}

/** Push one ref per distinct (key, scope) the given interpolation names
 * resolve to. A DECLARED name reads its declaration's key — and a
 * `scope: document` declaration reads top-level params even from inside a row
 * scope — while an undeclared one keeps the grammar's original meaning (the
 * name IS the key, at the ambient scope). Two names pointing at one field are
 * one placement, exactly as two surfaces of one item already are; a
 * declaration nothing references contributes nothing (the engine reports that
 * as `unused_binding`). */
export function pushInterpolated(
  out: BindingRef[],
  path: string,
  names: ReadonlySet<string>,
  decls: ReadonlyMap<string, Declaration>,
  scope: string | null,
): void {
  const seen: { readonly key: string; readonly scope: string | null }[] = [];
  for (const name of names) {
    const decl = decls.get(name);
    const key = decl === undefined ? name : decl.key;
    const refScope = decl?.scope === 'document' ? null : scope;
    if (seen.some((ref) => ref.key === key && ref.scope === refScope)) {
      continue;
    }
    seen.push({ key, scope: refScope });
    out.push({ path, key, scope: refScope, source: false });
  }
}
