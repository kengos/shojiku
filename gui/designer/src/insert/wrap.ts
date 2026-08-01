// Pure model for wrap-in-container (right-click / panel action): wrap the
// selected item in a new column container, in place. `moveItem` is same-sequence
// only, so the wrapped node cannot be relocated into a fresh container's items
// with its CST intact — instead the node is READ as a snippet and re-authored
// inside the container (insertItem), then the original is removed, as ONE
// applyAll batch (one undo step, the new container selected). The node's own
// comments are re-authored away by this (a deliberate move, not a stray churn);
// its content is preserved. A hostile/oversized subtree fails the snippet
// validator inside `insertItem`, so the whole batch rolls back (no-op).
// Framework-free; every op is a designer-core `Op` (AI parity).

import type { Op, ReadFn, SnippetValue } from '@shojiku/designer-core';
import { seqPosition } from '../tree/reorder';

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Whether `path` addresses an item that can be wrapped: a sequence entry whose
 * parent is an `…items` list (the flow body, a container, a cell, a card) — the
 * only lists a `container` item is valid in. A `…columns[n]` (a table column,
 * not an item) is excluded. Cheap (no read) so the UI gates the affordance
 * with it; `wrapInContainerOps` re-checks before mutating. */
export function isWrappablePath(path: string): boolean {
  return seqPosition(path)?.parent.endsWith('.items') ?? false;
}

/** The batch that wraps the item at `path` in a new column container, or `null`
 * when the item cannot be wrapped: a non-item-list entry (a section root, a
 * table column), a read throw (an alias-bomb subtree), or a non-map node. The
 * container lands where the item was; select `path` after applying. */
export function wrapInContainerOps(read: ReadFn, path: string): readonly Op[] | null {
  const pos = seqPosition(path);
  if (pos === null || !pos.parent.endsWith('.items')) {
    return null;
  }
  let node: unknown;
  try {
    node = read(path);
  } catch {
    return null;
  }
  if (record(node) === undefined) {
    return null;
  }
  const container: SnippetValue = {
    type: 'container',
    box: { direction: 'column' },
    items: [node as SnippetValue],
  };
  return [
    { op: 'insertItem', path: pos.parent, index: pos.index, value: container },
    { op: 'removeItem', path: pos.parent, index: pos.index + 1 },
  ];
}
