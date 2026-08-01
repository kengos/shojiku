// Pure canvas drag-reorder ELIGIBILITY model — the DnD substrate's first half:
// which boxes may reorder (flow-body items and flex-container children, never
// absolutely placed ones) and along which axis, plus the sibling geometry the
// drop math reads. Framework- and DOM-free like the tree and insert models;
// the overlay stays thin over it. Direction comes from the DOCUMENT (the
// container's `box.direction` / the flow body), geometry from the engine's
// inspect boxes — the model never re-derives layout. What a drop then lands
// on and realizes lives in `dropPlan`.

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

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** The drag axis the owner's layout order follows, or `null` when its
 * children are not order-placed: the flow body stacks on `y`; a `container`
 * in flex mode (the `box.type` default) follows `box.direction` — anything
 * else (absolute body, grid, `cell`/`item` sub-templates, malformed owners)
 * is not canvas-reorderable. */
function ownerAxis(ownerPath: string, owner: Record<string, unknown>): Axis | null {
  if (ownerPath === 'sections.body') {
    return owner.type === 'flow' ? 'y' : null;
  }
  if (owner.type !== 'container') {
    return null;
  }
  const box = record(owner.box);
  const mode = box?.type;
  if (mode !== undefined && mode !== 'flex') {
    return null;
  }
  return box?.direction === 'row' ? 'x' : 'y';
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
