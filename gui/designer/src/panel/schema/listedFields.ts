// What a surface's 「その他の設定」 lists: the keys the catalog says the
// surface takes, less the keys its hand-made controls edit, less the keys the
// engine cannot read. The hand-made half comes from the surface itself — one
// owned-keys function per surface, read off the table its section draws — so
// a key is listed exactly when no control of the surface's own edits it.

import { type CatalogField, type CatalogSurface, surfaceFields } from '@shojiku/designer-core';
import { hasCapability } from '../itemPanelProps';
import { COMPOSITES } from './composites';

/** The catalog fields of `surface` that no key in `owned` covers, in catalog
 * order. */
export function listedFields(
  surface: CatalogSurface,
  owned: readonly string[],
): readonly CatalogField[] {
  return surfaceFields(surface, COMPOSITES).filter((field) => !owned.includes(field.key));
}

/** The fields the engine can read: a field gated on a capability the host does
 * not report is dropped; `undefined` capabilities (an ungated host) keep all. */
export function capableFields(
  fields: readonly CatalogField[],
  capabilities: readonly string[] | undefined,
): readonly CatalogField[] {
  return fields.filter(
    (field) => field.capability === undefined || hasCapability(capabilities, field.capability),
  );
}
