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
// The wrap must not move the item OR RESIZE IT. What placed the item IN ITS
// OWNER moves onto the container, because the container is now that owner's
// child: its `box.x`/`box.y` resolve against the same basis the item's did in
// every owner (a band, the absolute body, the flow body, a container or cell),
// and its `flexGrow`/`flexBasis`/`columnSpan`/`rowSpan` take the share of a row
// or grid the item had. Left on the item they would resolve against the
// container instead: the container's box would sit at its owner's origin and,
// wherever that is not the item's place, the item would move or change size too.
//
// A height authored as a `%` moves for the same reason and is the harsher case,
// because a new container is ALWAYS auto-height: left on the item, `h: "10%"`
// has no basis at all, so the engine drops it with `percent_of_auto` and a
// `rect` — which needs a size to exist — is simply not drawn. `heightAxis`
// decides that, and the shapes it cannot preserve are not offered a wrap.
// Framework-free; every op is a designer-core `Op` (AI parity).

import type { Op, ReadFn, SnippetValue } from '@shojiku/designer-core';
import { typeFitsOwner } from '../canvas/dnd';
import { REQUIRED_BOX_WIRE_TYPES } from '../panel/itemView';
import { seqPosition } from '../tree/reorder';

/** The box keys that place an item in its OWNER rather than size or lay out
 * the item itself. */
const OWNER_KEYS = ['x', 'y', 'flexGrow', 'flexBasis', 'columnSpan', 'rowSpan'] as const;

/** The box keys whose `%` resolves against the OWNER's HEIGHT. A new container
 * is always auto-height, so left on the item these have nothing to resolve
 * against and the engine drops them with `percent_of_auto` — a `rect` then
 * loses its size and is not drawn at all. */
const HEIGHT_PERCENT_KEYS = ['h', 'minHeight', 'maxHeight'] as const;

/** What moves onto the container when the height axis moves. `margin` rides
 * along even though its `%` is a WIDTH value: the item's height becomes the
 * container's, so the spacing around that height has to travel with it, or the
 * item overflows its own wrapper by the margins it kept. */
const HEIGHT_AXIS_KEYS = [...HEIGHT_PERCENT_KEYS, 'margin'] as const;

type Node = Record<string, unknown>;

/** Whether a wire value is a `%` [`Length`]: a string that, trimmed, ends in
 * `%` — the same test `parse_length_text` applies (`engine/core/src/length.rs`).
 * A `%`-suffixed value the engine cannot parse as a FINITE number is refused
 * there (`parse_number`, then `finite`), so a looser match here costs nothing:
 * that document does not render either way. */
function isPercent(value: unknown): boolean {
  return typeof value === 'string' && value.trim().endsWith('%');
}

function record(value: unknown): Node | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Node)
    : undefined;
}

/** What the wrap must do about the item's height axis.
 *
 * `move` — the item's height goes onto the container, which resolves its `%`
 * against the basis the item did, and the item takes `h: "100%"` of that.
 * `refuse` — the item's height CANNOT be preserved by re-authoring, so the
 * wrap is not offered (the same silent treatment the kinds a container skips
 * already get): a `%` `minHeight`/`maxHeight` with no `h` has nothing to move
 * onto (a container with only a bound is still auto-height, so `h: "100%"` on
 * the item would be unresolvable in turn), and a `line` endpoint's `%` `y` has
 * no box to carry it — giving the container a full-height box instead pushes
 * the following siblings down wherever the owner STACKS them (measured: off the
 * page in a flowing body, 200pt down in a column container).
 *
 * Both refusals are OWNER-INDEPENDENT, and deliberately wider than the break.
 * A band and a cell place their children absolutely, and a `row` container
 * hands its children a cross-axis height, so in those owners both shapes do
 * survive a wrap today. `isWrappable(path, node)` is handed the path and the
 * node and never the owner, so it cannot tell those owners apart and refuses in
 * all of them rather than offering an edit that breaks the page in the rest.
 * `leave` — nothing on this item resolves against the owner's height. An
 * anchored `ellipse` is always `leave`: the engine never reads its box. */
function heightAxis(node: Node): 'leave' | 'move' | 'refuse' {
  if (node.type === 'line') {
    return [node.from, node.to].some((end) => isPercent(record(end)?.y)) ? 'refuse' : 'leave';
  }
  const box = record(node.box);
  if (box === undefined || (node.type === 'ellipse' && typeof node.anchor === 'string')) {
    return 'leave';
  }
  if (!HEIGHT_PERCENT_KEYS.some((key) => isPercent(box[key]))) {
    return 'leave';
  }
  // `== null`, not `=== undefined`: a valueless `h:` reads as `null`, and a
  // `null` height is no more able to carry a `%` bound than a missing one.
  return box.h == null ? 'refuse' : 'move';
}

/** Whether the item `node` at `path` can be wrapped: a sequence entry whose
 * parent is an `…items` list (the flow body, a band, a container, a cell, a
 * card) — the only lists a `container` item is valid in — holding a map of a
 * type a container lays out. A `…columns[n]` (a table column, not an item) is
 * excluded, and so are the kinds a container warns and skips (`page_number`,
 * `page_break`, `repeat`, `repeat_flow`): wrapping one would erase it from the
 * page — as are the shapes whose height `heightAxis` cannot carry onto the
 * container. The ONE rule the affordances and `wrapInContainerOps` share. */
export function isWrappable(path: string, node: unknown): boolean {
  const item = record(node);
  return (
    (seqPosition(path)?.parent.endsWith('.items') ?? false) &&
    item !== undefined &&
    typeFitsOwner(item.type, 'container') &&
    heightAxis(item) !== 'refuse'
  );
}

/** A `line` has no box: its position is its endpoints. Where the container's
 * `y` is read, the topmost numeric endpoint `y` becomes the container's and
 * both endpoints shift up by it. Anything else — a flow body (which never
 * reads a container's `y`), a `Length` string, an anchored endpoint — is left
 * as authored. A `%` `y` never reaches here: `heightAxis` refuses that line,
 * because leaving it would drop the endpoint to the container's top edge. */
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

/** The container's own keys and the item as re-authored inside it. An anchored
 * `ellipse` keeps its keys: the engine never reads them. A box left empty is
 * dropped, except where the wire requires one (`rect`) — the height-carrying
 * path can never empty one, since it always leaves `h: "100%"` behind. */
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
  // A height that resolves against the owner travels with the position, for the
  // same reason: the container is the owner's child now, so only the container
  // still has the basis that height was authored against.
  const carryHeight = heightAxis(node) === 'move';
  const keys: readonly string[] = carryHeight ? [...OWNER_KEYS, ...HEIGHT_AXIS_KEYS] : OWNER_KEYS;
  for (const key of keys) {
    if (rest[key] !== undefined) {
      moved[key] = rest[key];
      delete rest[key];
    }
  }
  if (carryHeight) {
    // The container is exactly as tall as the item was, and has no padding of
    // its own, so its content box IS the item's old border box.
    rest.h = '100%';
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
