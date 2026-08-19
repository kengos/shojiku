// The cross-parent move, as ops — the ONE model both direct-manipulation
// surfaces share, so the canvas and the layer tree can never disagree about
// what a drop into a different parent means. Where a canvas pointer lands is
// `reparentTarget`; the tree computes its own target from row geometry and
// asks this module the same question.
//
// A move is ONE `moveItem` carrying a destination sequence (designer-core
// splices the node, so the moved subtree keeps its comments and aliases),
// preceded by whatever `box` keys the crossing invalidates. They are applied
// as one transactional `applyAll` — one undo step, AI parity, and a refusal
// anywhere leaves the document untouched.
//
// Every refusal is a `null` return: the caller paints nothing and the release
// does nothing, which is the canvas-dnd posture for "this cannot be expressed
// as a valid op".

import type { Op, ReadFn } from '@shojiku/designer-core';
import { seqPosition } from '../tree/reorder';
import { type Receiver, SUB_TEMPLATE_RE, typeFitsOwner } from './dnd';
import { baseLength, record } from './manipulate';
import type { PageMargin } from './marginGuide';
import { axisOp } from './plan';

const ITEMS_SUFFIX = '.items';

/** A point on the page, in pt. */
export interface DropPoint {
  readonly x: number;
  readonly y: number;
}

/** Where a cross-parent drop lands. */
export interface ReparentTarget {
  readonly receiver: Receiver;
  /** The index in the destination sequence — which, because the source is a
   * DIFFERENT sequence, the removal never shifts. */
  readonly index: number;
  /** Where the pointer released, in page pt. A coordinate-placed receiver (a
   * band, an absolute body) writes `box.x`/`box.y` from it. The layer tree
   * has no page geometry and omits it, so a tree drop leaves the item's own
   * coordinates alone. */
  readonly at?: DropPoint;
}

/** The `box` keys a move into a COORDINATE-placed owner writes: the drop
 * point expressed against the margin box, which is the origin a band child
 * and an absolute-body child both resolve against (the engine builds all
 * three sections from one page basis). Written in the item's own authored
 * form, and only where the value actually changes. `null` refuses the move —
 * a hostile point, or a position authored in a relative unit the drag cannot
 * write back. */
function coordinateOps(
  path: string,
  box: Record<string, unknown>,
  at: DropPoint | undefined,
  margin: PageMargin | null,
): readonly Op[] | null {
  if (at === undefined || margin === null) {
    return [];
  }
  const baseX = baseLength(box.x, 0);
  const baseY = baseLength(box.y, 0);
  if (baseX === null || baseY === null) {
    return null;
  }
  const opX = axisOp(path, 'x', baseX, at.x - margin[3]);
  const opY = axisOp(path, 'y', baseY, at.y - margin[0]);
  if (opX === undefined || opY === undefined) {
    return null;
  }
  return [opX, opY].filter((op): op is Op => op !== null);
}

/** The `box` keys a move into an ORDER-placed owner clears.
 *
 * The two owners differ in WHY, and only one of them ignores the keys. In the
 * flow BODY an authored `x`/`y` is the `flowPositioned` dead end — the engine
 * does not read it and the panel has to explain that. A CONTAINER honours it
 * (`layout`'s `absolute_child_atom`, the escape hatch every pre-flex template
 * uses), so clearing there is a deliberate choice, not a tidy-up: the numbers
 * were measured against a DIFFERENT parent's origin, so keeping them would
 * land the item somewhere the user did not drop it, and "put this inside the
 * container" is a request to let the container place it. Either way it is the
 * one value-destroying edit this move makes, which is why the canvas says so
 * before the release. */
function clearCoordinateOps(path: string, box: Record<string, unknown>): readonly Op[] {
  const ops: Op[] = [];
  for (const key of ['x', 'y'] as const) {
    if (box[key] !== undefined) {
      ops.push({ op: 'removeKey', path, keys: ['box', key] });
    }
  }
  return ops;
}

/** Where the moved item ENDS UP — which is not simply
 * `<destination>[index]`. Lifting the item out of its own parent shifts every
 * LATER index in that parent down by one, and the destination may sit inside
 * one of those later siblings (dragging a row into a container that follows it
 * is the ordinary case), so the destination's OWN path moves too. The op is
 * unaffected — it resolves both sequences before it splices — but a selection
 * built from the pre-move spelling would land one sibling off, which reads as
 * the selection jumping to the wrong item. */
export function reparentedPath(
  parent: string,
  from: number,
  destination: string,
  index: number,
): string {
  const prefix = `${parent}[`;
  if (!destination.startsWith(prefix)) {
    return `${destination}[${index}]`;
  }
  const rest = destination.slice(prefix.length);
  const close = rest.indexOf(']');
  const sibling = Number(rest.slice(0, close));
  const shifted =
    Number.isInteger(sibling) && sibling > from
      ? `${parent}[${sibling - 1}]${rest.slice(close + 1)}`
      : destination;
  return `${shifted}[${index}]`;
}

/** The batch that moves the item at `fromPath` into `target`, or `null` when
 * that move is not expressible: the source is not a sequence entry or sits in
 * a repeating sub-template, the destination IS the source's own parent (a
 * plain reorder — the shipped drop path owns that), the destination sits
 * inside the item being moved, the destination cannot lay this item type out
 * at all, the index is hostile, or the document read refuses. */
export function reparentOps(
  read: ReadFn,
  fromPath: string,
  target: ReparentTarget,
  margin: PageMargin | null,
): readonly Op[] | null {
  const position = seqPosition(fromPath);
  if (position === null || !position.parent.endsWith(ITEMS_SUFFIX)) {
    return null;
  }
  if (SUB_TEMPLATE_RE.test(`${fromPath}.`)) {
    return null;
  }
  const destination = target.receiver.items;
  if (destination === position.parent || destination.startsWith(`${fromPath}.`)) {
    return null;
  }
  if (!Number.isInteger(target.index) || target.index < 0) {
    return null;
  }
  let child: Record<string, unknown> | undefined;
  try {
    child = record(read(fromPath));
  } catch {
    return null;
  }
  if (child === undefined || !typeFitsOwner(child.type, target.receiver.placement.owner)) {
    return null;
  }
  const box = record(child.box) ?? {};
  const placed =
    target.receiver.placement.axis === null
      ? coordinateOps(fromPath, box, target.at, margin)
      : clearCoordinateOps(fromPath, box);
  if (placed === null) {
    return null;
  }
  return [
    ...placed,
    {
      op: 'moveItem',
      path: position.parent,
      from: position.index,
      to: target.index,
      toPath: destination,
    },
  ];
}
