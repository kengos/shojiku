// The `styleNames` list edits — the one wire shape every named-style
// checklist authors (an item's own list, a table band's, a zebra's
// `alternateStyleNames`, a rule's, a header group's) and the format toolbar's
// style picker toggles. Split from `model.ts` as its own concern: a LIST of
// references, not a leaf value.

import type { Op } from '@shojiku/designer-core';

/** A styleNames edit: an empty selection clears the key, otherwise writes the
 * list as a flow sequence. `keys` is where the list lives under `path` — an
 * item's own `styleNames` by default, or a table band's (`header.styleNames`,
 * `row.styleNames`, `row.alternateStyleNames`), whose bands are map keys under
 * the table rather than paths of their own. */
export function styleNamesOp(
  path: string,
  names: readonly string[],
  keys: readonly string[] = ['styleNames'],
): Op {
  return names.length === 0
    ? { op: 'removeKey', path, keys: [...keys] }
    : { op: 'setStrings', path, keys: [...keys], values: [...names] };
}

/** Toggle one name in a styleNames selection, preserving order (append on add,
 * drop on remove). */
export function toggleStyleName(current: readonly string[], name: string, on: boolean): string[] {
  if (on) {
    return current.includes(name) ? [...current] : [...current, name];
  }
  return current.filter((n) => n !== name);
}
