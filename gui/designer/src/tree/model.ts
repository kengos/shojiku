// Pure layer-tree model: the document outline built by walking the template
// TEXT through designer-core's capped materialization — never the box index,
// so the tree stays correct when a render fails. Every node carries the same
// structural path grammar the box index / diagnostics / palette use, so a
// tree row, a canvas box, and a diagnostic all address one node through the
// shared selection. The walk mirrors the palette's binding walk (items /
// headerGroups + columns + cell.items / cell.items / item.items) and never throws — hostile
// or malformed documents degrade to an empty or truncated view. What the drag
// and the post-edit selection do with the built tree is `reorder.ts` /
// `selection.ts`.

import { MAX_TEMPLATE_BYTES_CEILING, parseTemplate, readTemplate } from '@shojiku/designer-core';

/** Nesting cap for the walk — bounds hostile deep nesting and any cyclic
 * structure YAML anchors could express through the materialized view. */
export const MAX_TREE_DEPTH = 32;

/** Total node cap — bounds the DOM weight a hostile/huge document can demand.
 * The walk stops here and the view reports `truncated`. */
export const MAX_TREE_NODES = 1024;

/** Row-label clip — a label is a glance hint, not a text viewer. */
export const MAX_LABEL_CHARS = 60;

export interface TreeNode {
  /** Structural path (the box-index grammar) — the shared-selection key. */
  readonly path: string;
  /** The wire `type` (`text`/`table`/…), or a structural kind the wire has no
   * type string for: `section:header|body|footer`, `column`, `header_group`,
   * and `item` for a malformed/typeless entry. Display is localized for known
   * kinds; an unknown wire type displays verbatim. */
  readonly kind: string;
  /** Content-derived label (clipped), or `null` → display the kind's name. */
  readonly label: string | null;
  readonly children: readonly TreeNode[];
}

export interface TreeView {
  readonly roots: readonly TreeNode[];
  /** True when a cap (node budget or depth) cut the walk short. */
  readonly truncated: boolean;
}

const SECTION_NAMES = ['header', 'body', 'footer'] as const;

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function clip(value: string): string {
  return value.length > MAX_LABEL_CHARS ? `${value.slice(0, MAX_LABEL_CHARS)}…` : value;
}

/** The first non-empty string among candidate label sources, clipped. */
function pickLabel(...candidates: readonly unknown[]): string | null {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate !== '') {
      return clip(candidate);
    }
  }
  return null;
}

function bindingKey(value: unknown): string | undefined {
  const key = record(value)?.key;
  return typeof key === 'string' && key !== '' ? key : undefined;
}

/** Mutable walk budget shared across the recursion. */
interface Walk {
  nodes: number;
  truncated: boolean;
}

/** Take one node from the budget; false = budget exhausted (mark truncated). */
function take(walk: Walk): boolean {
  if (walk.nodes >= MAX_TREE_NODES) {
    walk.truncated = true;
    return false;
  }
  walk.nodes += 1;
  return true;
}

function walkItems(
  walk: Walk,
  prefix: string,
  items: readonly unknown[],
  depth: number,
): TreeNode[] {
  if (depth > MAX_TREE_DEPTH) {
    walk.truncated = true;
    return [];
  }
  const out: TreeNode[] = [];
  for (let index = 0; index < items.length; index++) {
    if (!take(walk)) {
      break;
    }
    out.push(itemNode(walk, `${prefix}[${index}]`, items[index], depth));
  }
  return out;
}

/** A node for one sequence entry. A malformed (non-map) entry still gets a
 * row — every sibling index must stay visible so reorder from/to indices
 * match the document, never a filtered view. */
function itemNode(walk: Walk, path: string, entry: unknown, depth: number): TreeNode {
  const item = record(entry);
  if (item === undefined) {
    return { path, kind: 'item', label: null, children: [] };
  }
  const kind = typeof item.type === 'string' && item.type !== '' ? item.type : 'item';
  const label = pickLabel(item.text, bindingKey(item.data), item.id);
  const children: TreeNode[] = [];
  if (Array.isArray(item.items)) {
    children.push(...walkItems(walk, `${path}.items`, item.items, depth + 1));
  }
  // Header groups come before the columns, the order the table draws them in
  // (the group row sits above the label row).
  if (Array.isArray(item.headerGroups)) {
    for (let index = 0; index < item.headerGroups.length; index++) {
      if (!take(walk)) {
        break;
      }
      children.push(groupNode(`${path}.headerGroups[${index}]`, item.headerGroups[index]));
    }
  }
  if (Array.isArray(item.columns)) {
    for (let index = 0; index < item.columns.length; index++) {
      if (!take(walk)) {
        break;
      }
      children.push(columnNode(walk, `${path}.columns[${index}]`, item.columns[index], depth + 1));
    }
  }
  const cellItems = record(item.cell)?.items;
  if (Array.isArray(cellItems)) {
    children.push(...walkItems(walk, `${path}.cell.items`, cellItems, depth + 1));
  }
  const cardItems = record(item.item)?.items;
  if (Array.isArray(cardItems)) {
    children.push(...walkItems(walk, `${path}.item.items`, cardItems, depth + 1));
  }
  return { path, kind, label, children };
}

/** A node for one `headerGroups` entry. A group is a leaf — its label is the
 * only content it carries, and the columns it spans are their own siblings. */
function groupNode(path: string, entry: unknown): TreeNode {
  const label = pickLabel(record(entry)?.label);
  return { path, kind: 'header_group', label, children: [] };
}

function columnNode(walk: Walk, path: string, entry: unknown, depth: number): TreeNode {
  const column = record(entry);
  if (column === undefined) {
    return { path, kind: 'column', label: null, children: [] };
  }
  const label = pickLabel(column.label, bindingKey(column.data));
  const cellItems = record(column.cell)?.items;
  const children = Array.isArray(cellItems)
    ? walkItems(walk, `${path}.cell.items`, cellItems, depth + 1)
    : [];
  return { path, kind: 'column', label, children };
}

/** Build the outline from template text. `null` when the text does not parse
 * to a map (malformed YAML, over the size cap, an alias bomb, a non-map root)
 * — the tree shows its empty state; the canvas keeps its last good preview.
 * Parsed at the CEILING cap: this is editor-held text an image can legally push
 * past the 2 MiB default, and the tree must stay populated for it. */
export function buildTree(source: string): TreeView | null {
  let raw: unknown;
  try {
    raw = readTemplate(parseTemplate(source, MAX_TEMPLATE_BYTES_CEILING));
  } catch {
    return null;
  }
  const root = record(raw);
  if (root === undefined) {
    return null;
  }
  const sections = record(root.sections);
  const walk: Walk = { nodes: 0, truncated: false };
  const roots: TreeNode[] = [];
  if (sections !== undefined) {
    for (const name of SECTION_NAMES) {
      const section = record(sections[name]);
      if (section === undefined || !take(walk)) {
        continue;
      }
      const items = Array.isArray(section.items) ? section.items : [];
      roots.push({
        path: `sections.${name}`,
        kind: `section:${name}`,
        label: null,
        children: walkItems(walk, `sections.${name}.items`, items, 0),
      });
    }
  }
  return { roots, truncated: walk.truncated };
}
