// Where the SELECTION sits in the outline and where it goes when the document
// changes under it: the ancestor chain for a selected path, and the node that
// should take over after an item is removed (its next sibling, the new last
// sibling, or the enclosing node when the sequence empties). Pure over the tree
// view + an injected `read`, so the hostile branches are unit-testable.

import type { TreeNode, TreeView } from './model';

/** Whether `path` addresses `node` or something inside it (segment-wise
 * prefix — `items[1]` is not a prefix of `items[10]`). */
function covers(node: TreeNode, path: string): boolean {
  return path === node.path || path.startsWith(`${node.path}.`) || path.startsWith(`${node.path}[`);
}

/** The ancestor chain (root → node) of the deepest tree node covering the
 * selection. A selection the tree does not carry (stale path, truncated walk)
 * yields the longest covering prefix; no match yields an empty chain. */
export function breadcrumbChain(
  view: TreeView | null,
  selection: string | null,
): readonly TreeNode[] {
  if (view === null || selection === null) {
    return [];
  }
  const chain: TreeNode[] = [];
  let level: readonly TreeNode[] = view.roots;
  for (;;) {
    const next: TreeNode | undefined = level.find((node) => covers(node, selection));
    if (next === undefined) {
      return chain;
    }
    chain.push(next);
    if (next.path === selection) {
      return chain;
    }
    level = next.children;
  }
}

/** The selectable node enclosing a sequence, for when removing its last child
 * leaves it empty: the sequence path minus its trailing `.<key>` segment — the
 * container item (`…items[0].items` → `…items[0]`) or the section
 * (`sections.body.items` → `sections.body`). A bare top-level sequence key (no
 * dot) has no enclosing selectable node → `null` (deselect). */
export function enclosingNodePath(seqPath: string): string | null {
  const dot = seqPath.lastIndexOf('.');
  return dot === -1 ? null : seqPath.slice(0, dot);
}

/** The length of the sequence at `path`, read through the editor's `read`.
 * A read throw (an alias-bomb subtree) or a non-array node degrades to 0 —
 * the caller then treats the sequence as already empty (deselect), never
 * crashes. Kept as a free function taking `read` so the hostile branches are
 * unit-testable with a fake reader. */
export function seqLength(read: (path: string) => unknown, path: string): number {
  try {
    const seq = read(path);
    return Array.isArray(seq) ? seq.length : 0;
  } catch {
    return 0;
  }
}

/** Where the selection should land after removing item `index` from a sequence
 * of `lengthBefore` items, keeping the user's place: the item that shifts into
 * the freed slot (the next sibling), or the new last item when the removed one
 * was last, or the enclosing node when the sequence empties. `lengthBefore` is
 * read BEFORE the removal. */
export function nextSelectionAfterRemove(
  parent: string,
  index: number,
  lengthBefore: number,
): string | null {
  const remaining = lengthBefore - 1;
  if (remaining <= 0) {
    return enclosingNodePath(parent);
  }
  // Removed the last item → its previous sibling is now last; otherwise the
  // sibling that was at index+1 has shifted down into `index`.
  const target = index >= remaining ? remaining - 1 : index;
  return `${parent}[${target}]`;
}
