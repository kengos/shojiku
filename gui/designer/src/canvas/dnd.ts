// Pure canvas drag-reorder ELIGIBILITY model — the DnD substrate's first half:
// which boxes may reorder (flow-body items and flex-container children, never
// absolutely placed ones) and along which axis, plus the sibling geometry the
// drop math reads. Framework- and DOM-free like the tree and insert models;
// the overlay stays thin over it. Direction comes from the DOCUMENT (the
// container's `box.direction` / the flow body), geometry from the engine's
// inspect boxes — the model never re-derives layout. What a drop then lands
// on and realizes lives in `dropPlan`, and what a drop into a DIFFERENT
// parent means in `reparent`.
//
// It also owns the other side of eligibility: how an owner places the
// children it already has (`ownerPlacement`) and which item types it may hold
// at all (`typeFitsOwner`) — both read the same four owner kinds, so a drop
// target and a reorder axis can never disagree about what a parent is.

import type { ReadFn } from '@shojiku/designer-core';
import type { BoxRect, PlacedBox } from '../engine/types';
import { seqPosition } from '../tree/reorder';

/** The drag axis: `y` for a column/flow stack, `x` for a `direction: row`. */
export type Axis = 'x' | 'y';

export interface ReorderContext {
  /** The parent sequence path (`…items`) the drag reorders within. */
  readonly parent: string;
  /** The dragged child's document index. */
  readonly from: number;
  readonly axis: Axis;
}

const ITEMS_SUFFIX = '.items';

/** A path inside a repeating sub-template (`table` columns / `cell:` /
 * `repeat_flow` `item:`): one authored node drawn once per data element, so
 * it is neither a drag source nor a drop target. Shared with `manipulate`,
 * which classifies the CHILD path against it. */
export const SUB_TEMPLATE_RE = /\.columns\[|\.cell\.|\.item\./;

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** The four owners of an `items` list, kept apart because the engine's
 * placement rules distinguish them: `page_number` lays out only in a `band`,
 * and `repeat`/`repeat_flow`/`page_break` only in the `flow` body. */
export type OwnerKind = 'flow' | 'absoluteBody' | 'band' | 'container';

/** How an owner places its direct children: `axis` is the slot axis when they
 * are ORDER-placed, and `null` when they are COORDINATE-placed (a band, an
 * absolute body — both resolve `box.x`/`box.y` against the page margin box).
 * `null` for the whole placement means the children are neither: a grid
 * container (the tracks decide), a sub-template's owner map, a malformed
 * owner. */
export interface OwnerPlacement {
  readonly owner: OwnerKind;
  readonly axis: Axis | null;
}

function ownerPlacement(ownerPath: string, owner: Record<string, unknown>): OwnerPlacement | null {
  if (ownerPath === 'sections.header' || ownerPath === 'sections.footer') {
    return { owner: 'band', axis: null };
  }
  if (ownerPath === 'sections.body') {
    if (owner.type === 'flow') {
      return { owner: 'flow', axis: 'y' };
    }
    return owner.type === 'absolute' ? { owner: 'absoluteBody', axis: null } : null;
  }
  if (owner.type !== 'container') {
    return null;
  }
  const box = record(owner.box);
  const mode = box?.type;
  if (mode !== undefined && mode !== 'flex') {
    return null;
  }
  return { owner: 'container', axis: box?.direction === 'row' ? 'x' : 'y' };
}

// The engine lays a `page_number` out only in a band and warns-and-skips it
// anywhere else (`page_number_in_body`/`page_number_in_container`); the three
// flow-only kinds carry the same shape of refusal against every other owner
// (`repeat_in_*`, `repeat_flow_in_*`, `page_break_in_*`). Moving an item into
// an owner that cannot hold it would leave a document that renders nothing
// where the item used to be, so the move is refused instead.
const BAND_ONLY = 'page_number';
const FLOW_ONLY: ReadonlySet<string> = new Set(['repeat', 'repeat_flow', 'page_break']);

/** Whether an item of wire `type` lays out inside `owner`. A typeless or
 * malformed item is not one of the restricted kinds, so it fits. */
export function typeFitsOwner(type: unknown, owner: OwnerKind): boolean {
  if (type === BAND_ONLY) {
    return owner === 'band';
  }
  if (typeof type === 'string' && FLOW_ONLY.has(type)) {
    return owner === 'flow';
  }
  return true;
}

/** The drag axis the owner's layout order follows, or `null` when its
 * children are not order-placed: the flow body stacks on `y`; a `container`
 * in flex mode (the `box.type` default) follows `box.direction` — anything
 * else (absolute body, band, grid, `cell`/`item` sub-templates, malformed
 * owners) is not canvas-reorderable. */
function ownerAxis(ownerPath: string, owner: Record<string, unknown>): Axis | null {
  return ownerPlacement(ownerPath, owner)?.axis ?? null;
}

/** What the owner at `ownerPath` may RECEIVE from another parent: its `items`
 * sequence plus how it places children. `null` when it is not an item owner
 * at all — a sub-template, a grid container, a malformed node, or a document
 * the materializer refuses (a read throw reads as "no"). */
export function receiverFor(read: ReadFn, ownerPath: string): Receiver | null {
  if (SUB_TEMPLATE_RE.test(`${ownerPath}.`)) {
    return null;
  }
  let owner: Record<string, unknown> | undefined;
  try {
    owner = record(read(ownerPath));
  } catch {
    return null;
  }
  if (owner === undefined) {
    return null;
  }
  const placement = ownerPlacement(ownerPath, owner);
  return placement === null ? null : { items: `${ownerPath}${ITEMS_SUFFIX}`, placement };
}

/** An owner a cross-parent drop may land in. */
export interface Receiver {
  /** The `…items` sequence the drop inserts into. */
  readonly items: string;
  readonly placement: OwnerPlacement;
}

/** Whether the box at `path` may drag-reorder, and along which axis. `null`
 * for anything else: not a sequence entry, a parent that is not an `items`
 * list, an owner whose children are not order-placed, a child with authored
 * `box.x`/`box.y` (absolutely placed — move, not reorder), or a document the
 * materializer refuses (a read throw reads as "no"). */
export function reorderContext(read: ReadFn, path: string): ReorderContext | null {
  const position = seqPosition(path);
  if (position === null || !position.parent.endsWith(ITEMS_SUFFIX)) {
    return null;
  }
  const ownerPath = position.parent.slice(0, -ITEMS_SUFFIX.length);
  let owner: Record<string, unknown> | undefined;
  let child: Record<string, unknown> | undefined;
  try {
    owner = record(read(ownerPath));
    child = record(read(path));
  } catch {
    return null;
  }
  if (owner === undefined) {
    return null;
  }
  const childBox = record(child?.box);
  if (childBox !== undefined && (childBox.x !== undefined || childBox.y !== undefined)) {
    return null;
  }
  const axis = ownerAxis(ownerPath, owner);
  if (axis === null) {
    return null;
  }
  return { parent: position.parent, from: position.index, axis };
}

/** One sibling's laid-out border box, keyed by its document index. */
export interface SiblingBox {
  readonly index: number;
  readonly rect: BoxRect;
}

/** The parent's direct children laid out on ONE page, in document order.
 * `null` when an index appears twice — repeat/table instances share paths,
 * and slot math over duplicated geometry would lie. */
export function siblingRects(
  pageBoxes: readonly PlacedBox[],
  parent: string,
): readonly SiblingBox[] | null {
  const prefix = `${parent}[`;
  const byIndex = new Map<number, BoxRect>();
  for (const box of pageBoxes) {
    if (!box.path.startsWith(prefix)) {
      continue;
    }
    const rest = box.path.slice(prefix.length);
    const close = rest.indexOf(']');
    if (close === -1 || close + 1 !== rest.length) {
      continue;
    }
    const index = Number(rest.slice(0, close));
    if (!Number.isInteger(index) || index < 0) {
      continue;
    }
    if (byIndex.has(index)) {
      return null;
    }
    byIndex.set(index, box.border);
  }
  return [...byIndex.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, rect]) => ({ index, rect }));
}
