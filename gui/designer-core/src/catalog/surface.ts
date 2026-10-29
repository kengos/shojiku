// The keys the catalog says a property surface takes (see `defs.ts`): the
// catalog half of what a generic "more settings" section lists. The other
// half — the keys a hand-made control on the same surface already edits — is
// the surface's own, and is taken away by its caller.

import { defs, itemBranch, type ObjectNode } from './defs';
import type { CatalogField } from './fieldKinds';
import { type CompositeNames, objectFields } from './fieldSpec';

/** Where a panel edits keys of one catalog object:
 * - `style` — a named style (`styles.<name>`): every `Style` key;
 * - `defaultsStyle` — `defaults.style`: the `Style` keys it takes;
 * - `item` — an item of `type`: its own keys, less the structural ones every
 *   item panel edits through its own sections. */
export type CatalogSurface =
  | { readonly kind: 'style' }
  | { readonly kind: 'defaultsStyle' }
  | { readonly kind: 'item'; readonly type: string };

/** The item keys no generic section lists: the discriminator, the identity
 * and geometry, the style and its names, the visibility condition and the
 * data source each have an item panel section of their own. */
const STRUCTURAL_ITEM_KEYS: ReadonlySet<string> = new Set([
  'type',
  'id',
  'box',
  'style',
  'styleNames',
  'visible',
  'data',
]);

/** The keys a surface takes, in catalog order; empty for an item type the
 * catalog does not know. */
export function surfaceKeys(surface: CatalogSurface): readonly string[] {
  return source(surface)?.keys ?? [];
}

/** `surfaceKeys` with each key's kind, capability, requiredness and initial
 * value; `composites` as for `fieldSpec`. */
export function surfaceFields(
  surface: CatalogSurface,
  composites: CompositeNames,
): readonly CatalogField[] {
  const found = source(surface);
  return found === undefined ? [] : objectFields(found.node, found.keys, composites);
}

interface Source {
  readonly node: ObjectNode;
  readonly keys: readonly string[];
}

function source(surface: CatalogSurface): Source | undefined {
  const { Style, TemplateDefaults } = defs();
  switch (surface.kind) {
    case 'style':
      return { node: Style, keys: Object.keys(Style.properties) };
    case 'defaultsStyle':
      return { node: Style, keys: TemplateDefaults.properties.style['x-shojiku-style-keys'] };
    case 'item':
      return itemSource(surface.type);
  }
}

function itemSource(type: string): Source | undefined {
  const branch = itemBranch(type);
  if (branch === undefined) {
    return undefined;
  }
  const keys = Object.keys(branch.properties).filter((key) => !STRUCTURAL_ITEM_KEYS.has(key));
  return { node: branch, keys };
}
