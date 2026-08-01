// Display helpers shared by the layer tree and the breadcrumb: the localized
// name for a tree node's kind. Known wire types localize through the chrome
// catalog; an unknown type (a newer engine's item) displays its wire spelling
// verbatim rather than hiding behind a wrong label. The row's decorative type
// MARK lives beside this in `kindIcons.ts`.

import type { TreeNode } from './model';

/** Chrome-catalog key per known kind (engine `Item` wire tags + the tree's
 * structural kinds). Grown alongside the engine's item set. */
const KIND_LABEL_KEYS: ReadonlyMap<string, string> = new Map(
  [
    'text',
    'rect',
    'line',
    'table',
    'page_number',
    'image',
    'container',
    'repeat',
    'repeat_flow',
    'qr_code',
    'list',
    'page_break',
    'char_grid',
    'ellipse',
    'checkbox',
    'column',
    'header_group',
    'item',
  ].map((kind) => [kind, `tree.type.${kind}`]),
);

/** The synthetic kind prefix the tree gives a document section — shared with
 * the type-mark lookup so the two cannot disagree about what a section is. */
export const SECTION_PREFIX = 'section:';

/** The localized display name of a node's kind. */
export function kindName(kind: string, t: (key: string) => string): string {
  if (kind.startsWith(SECTION_PREFIX)) {
    return t(`tree.section.${kind.slice(SECTION_PREFIX.length)}`);
  }
  const key = KIND_LABEL_KEYS.get(kind);
  return key !== undefined ? t(key) : kind;
}

/** The row's display label: content-derived when present, else the kind. */
export function nodeLabel(node: TreeNode, t: (key: string) => string): string {
  return node.label ?? kindName(node.kind, t);
}
