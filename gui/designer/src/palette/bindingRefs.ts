// The binding-shape readers several template walks share: which item types
// are array sources, the key a `data:` (or `visible:` / mark / declaration) map
// names, and where it resolves — `scope: document` is the engine's escape from
// the enclosing row to top-level params.

import { DOCUMENT_SCOPE } from '../panel/model';
import { record } from './fieldDisplay';

export const ARRAY_SOURCE_TYPES = new Set(['table', 'repeat', 'repeat_flow', 'list']);

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
