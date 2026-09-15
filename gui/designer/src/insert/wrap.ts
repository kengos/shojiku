// Pure model for wrap-in-container (right-click / panel action): wrap the
// selected item in a new column container, in place. `moveItem` is same-sequence
// only, so the wrapped node cannot be relocated into a fresh container's items
// with its CST intact — instead the node is READ as a snippet and re-authored
// inside the container (insertItem), then the original is removed, as ONE
// applyAll batch (one undo step, the new container selected). The node's own
// comments are re-authored away by this (a deliberate move, not a stray churn);
// its content is preserved. A hostile/oversized subtree fails the snippet
// validator inside `insertItem`, so the whole batch rolls back (no-op).
//
// The wrap must not move the item. What placed the item IN ITS OWNER moves onto
// the container, because the container is now that owner's child: its
// `box.x`/`box.y` resolve against the same basis the item's did in every owner
// (a band, the absolute body, the flow body, a container or cell), and its
// `flexGrow`/`flexBasis`/`columnSpan`/`rowSpan` take the share of a row or grid
// the item had. Left on the item they would resolve against the container
// instead: the container's box would sit at its owner's origin and, wherever
// that is not the item's place, the item would move or change size too.
// Framework-free; every op is a designer-core `Op` (AI parity).

import type { Op, ReadFn, SnippetValue } from '@shojiku/designer-core';
import { typeFitsOwner } from '../canvas/dnd';
import { REQUIRED_BOX_WIRE_TYPES } from '../panel/itemView';
import { seqPosition } from '../tree/reorder';

/** The box keys that place an item in its OWNER rather than size or lay out
 * the item itself. */
const OWNER_KEYS = ['x', 'y', 'flexGrow', 'flexBasis', 'columnSpan', 'rowSpan'] as const;

type Node = Record<string, unknown>;

function record(value: unknown): Node | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Node)
    : undefined;
}

/** Whether the item `node` at `path` can be wrapped: a sequence entry whose
 * parent is an `…items` list (the flow body, a band, a container, a cell, a
 * card) — the only lists a `container` item is valid in — holding a map of a
 * type a container lays out. A `…columns[n]` (a table column, not an item) is
 * excluded, and so are the kinds a container warns and skips (`page_number`,
 * `page_break`, `repeat`, `repeat_flow`): wrapping one would erase it from the
 * page. The ONE rule the affordances and `wrapInContainerOps` share. */
export function isWrappable(path: string, node: unknown): boolean {
  const item = record(node);
  return (
    (seqPosition(path)?.parent.endsWith('.items') ?? false) &&
    item !== undefined &&
    typeFitsOwner(item.type, 'container')
  );
}

/** A `line` has no box: its position is its endpoints. Where the container's
 * `y` is read, the topmost numeric endpoint `y` becomes the container's and
 * both endpoints shift up by it. Anything else — a flow body (which never
 * reads a container's `y`), a `Length` string, an anchored endpoint — is left
 * as authored. */
function wrapLine(line: Node, flowBody: boolean): { box: Node; item: Node } {
  const from = record(line.from);
  const to = record(line.to);
  if (flowBody || typeof from?.y !== 'number' || typeof to?.y !== 'number') {
    return { box: {}, item: line };
  }
  const top = Math.min(from.y, to.y);
  return {
    box: { y: top },
    item: { ...line, from: { ...from, y: from.y - top }, to: { ...to, y: to.y - top } },
  };
}

/** The container's owner keys and the item as re-authored inside it. An
 * anchored `ellipse` keeps its keys: the engine never reads them. A box left
 * empty is dropped, except where the wire requires one (`rect`). */
function splitPosition(node: Node, flowBody: boolean): { box: Node; item: Node } {
  if (node.type === 'line') {
    return wrapLine(node, flowBody);
  }
  const box = record(node.box);
  if (box === undefined || (node.type === 'ellipse' && typeof node.anchor === 'string')) {
    return { box: {}, item: node };
  }
  const moved: Node = {};
  const rest: Node = { ...box };
  for (const key of OWNER_KEYS) {
    if (rest[key] !== undefined) {
      moved[key] = rest[key];
      delete rest[key];
    }
  }
  const item: Node = { ...node, box: rest };
  if (Object.keys(rest).length === 0 && !REQUIRED_BOX_WIRE_TYPES.has(String(node.type))) {
    delete item.box;
  }
  return { box: moved, item };
}

/** Whether `parent` is the flow body's items. An unreadable body type counts as
 * flow, where no endpoint is shifted. */
function inFlowBody(read: ReadFn, parent: string): boolean {
  if (parent !== 'sections.body.items') {
    return false;
  }
  try {
    return read('sections.body.type') !== 'absolute';
  } catch {
    return true;
  }
}

/** The batch that wraps the item at `path` in a new column container, or `null`
 * when the item cannot be wrapped (`isWrappable`), or a read throws (an
 * alias-bomb subtree). The container lands where the item was, carrying the
 * item's position; select `path` after applying. */
export function wrapInContainerOps(read: ReadFn, path: string): readonly Op[] | null {
  const pos = seqPosition(path);
  if (pos === null) {
    return null;
  }
  let node: unknown;
  try {
    node = read(path);
  } catch {
    return null;
  }
  if (!isWrappable(path, node)) {
    return null;
  }
  const { box, item } = splitPosition(node as Node, inFlowBody(read, pos.parent));
  const container: SnippetValue = {
    type: 'container',
    box: { direction: 'column', ...box },
    items: [item as SnippetValue],
  };
  return [
    { op: 'insertItem', path: pos.parent, index: pos.index, value: container },
    { op: 'removeItem', path: pos.parent, index: pos.index + 1 },
  ];
}
