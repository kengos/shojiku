// Pure readers over the definitions tree (`defsTree.ts`) that the data-item
// editor's panes share: lookup, the display label, the template usage of a node,
// resolving the palette's jump target, the search filter, where a new item may
// go, and where a field's sample value lives in the params.
//
// Usage and the jump target speak the palette's addressing (a document-scope
// full key, or a row-relative key under an array's dotted id), so a node maps
// onto the same `UsageIndex` and `FieldTarget` the palette produces.

import type { FieldTarget } from '../palette/model';
import type { UsageIndex } from '../palette/usage';
import type { SamplePath } from '../sample/model';
import type { DefsNode } from './defsTree';

/** Every node, pre-order, the root first. */
export function flattenTree(root: DefsNode): DefsNode[] {
  const out: DefsNode[] = [];
  const visit = (node: DefsNode) => {
    out.push(node);
    node.children.forEach(visit);
  };
  visit(root);
  return out;
}

export function findNode(root: DefsNode, id: string): DefsNode | null {
  return flattenTree(root).find((node) => node.id === id) ?? null;
}

/** The words a node shows as: its label, else its data name. */
export function nodeLabel(node: DefsNode): string {
  return node.label !== '' ? node.label : node.name;
}

/** The data name relative to the rows that carry the node (the full dotted
 * path at document scope). */
function relativeKey(node: DefsNode): string {
  return node.dataPath.slice(node.scope?.length ?? 0).join('.');
}

/** The template item paths bound to a node. `null` for the root and object
 * groups, which no binding names. */
export function nodeUsage(usage: UsageIndex, node: DefsNode): readonly string[] | null {
  if (node.kind === 'root' || node.kind === 'group') {
    return null;
  }
  if (node.scope === null) {
    const index = node.kind === 'field' ? usage.scalar : usage.sources;
    return index.get(relativeKey(node)) ?? [];
  }
  return usage.rows.get(node.scope.join('.'))?.get(relativeKey(node)) ?? [];
}

/** The field a palette jump names, or `null` (a stale or hostile target simply
 * selects nothing). An array group's id addresses a row-relative key; any other
 * group id is display grouping, and the key is the full document path. */
export function nodeForTarget(root: DefsNode, target: FieldTarget): DefsNode | null {
  const nodes = flattenTree(root);
  const rows = nodes.some(
    (node) =>
      (node.kind === 'table' || node.kind === 'list') && node.dataPath.join('.') === target.group,
  );
  return (
    nodes.find(
      (node) =>
        node.kind === 'field' &&
        relativeKey(node) === target.key &&
        (rows ? node.scope?.join('.') === target.group : node.scope === null),
    ) ?? null
  );
}

/** The tree narrowed to a case-insensitive query over each node's label and full
 * data name: a matching node keeps its whole subtree, and an ancestor of a match
 * stays so the match keeps its place. Plain `includes` — never a RegExp. */
export function filterTree(root: DefsNode, query: string): DefsNode {
  const needle = query.trim().toLowerCase();
  if (needle === '') {
    return root;
  }
  const keep = (node: DefsNode): DefsNode | null => {
    const hay = [node.label, node.dataPath.join('.')];
    if (hay.some((text) => text.toLowerCase().includes(needle))) {
      return node;
    }
    const children = node.children.map(keep).filter((child) => child !== null);
    return children.length > 0 ? { ...node, children } : null;
  };
  return { ...root, children: root.children.map(keep).filter((child) => child !== null) };
}

/** Where a new item may go: the root, every group, every table (its rows). */
export function addTargets(root: DefsNode): DefsNode[] {
  return flattenTree(root).filter(
    (node) => node.kind === 'root' || node.kind === 'group' || node.kind === 'table',
  );
}

/** The add form's starting place: the selected container, or the container
 * holding the selected item, or the root. */
export function defaultAddTarget(root: DefsNode, selected: DefsNode | null): DefsNode {
  if (selected === null || selected.kind === 'group' || selected.kind === 'table') {
    return selected ?? root;
  }
  return parentOf(root, selected) ?? root;
}

/** The container holding `node` (the root for a top-level item); `null` for the
 * root itself, or a node the tree does not hold. */
export function parentOf(root: DefsNode, node: DefsNode): DefsNode | null {
  return (
    addTargets(root).find((owner) => owner.children.some((child) => child.id === node.id)) ?? null
  );
}

/** The containers from the top down to `node`, the root excluded and `node`
 * included — what a breadcrumb names. */
export function ancestry(root: DefsNode, node: DefsNode): DefsNode[] {
  const chain: DefsNode[] = [];
  for (let at: DefsNode | null = node; at !== null && at.kind !== 'root'; at = parentOf(root, at)) {
    chain.unshift(at);
  }
  return chain;
}

/** Where a field's sample value lives in the params: one value at its path,
 * one per row of the table carrying it, or nowhere the editor reaches (a table
 * nested in another table's rows has rows PER parent row). */
export type SampleSpot =
  | { readonly kind: 'single'; readonly path: SamplePath }
  | { readonly kind: 'rows'; readonly arrayPath: SamplePath; readonly rel: SamplePath }
  | { readonly kind: 'none' };

export function sampleSpot(root: DefsNode, node: DefsNode): SampleSpot {
  const scope = node.scope;
  if (scope === null) {
    return { kind: 'single', path: node.dataPath };
  }
  const nested = flattenTree(root).some(
    (owner) =>
      owner.kind === 'table' &&
      owner.scope !== null &&
      owner.dataPath.join('.') === scope.join('.'),
  );
  return nested
    ? { kind: 'none' }
    : { kind: 'rows', arrayPath: scope, rel: node.dataPath.slice(scope.length) };
}
