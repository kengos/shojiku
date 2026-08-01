// The canvas drag-reorder DROP model: where the pointer lands in the sibling
// list, where that slot sits in the DOCUMENT (one page may show a sparse run,
// so list space and document space differ), the insertion line the overlay
// paints, and the single `moveItem` op a release realizes (AI parity, through
// the tree model's shared op math). Framework- and DOM-free like `dnd`, whose
// reorder eligibility + sibling geometry it consumes; geometry comes from the
// engine's inspect boxes — the model never re-derives layout.

import type { BoxRect, PlacedBox } from '../engine/types';
import { type MoveItemOp, moveOpFor } from '../tree/reorder';
import { type Axis, type ReorderContext, type SiblingBox, siblingRects } from './dnd';

/** The insertion slot (0..=siblings.length, in sibling-LIST space) for a
 * pointer at `coord` on the drag axis — before the first sibling whose
 * midpoint the pointer precedes, else after the last. `null` on a non-finite
 * coordinate (a hostile synthetic event must not place a slot). */
export function dropSlotFor(
  siblings: readonly SiblingBox[],
  coord: number,
  axis: Axis,
): number | null {
  if (!Number.isFinite(coord)) {
    return null;
  }
  for (let i = 0; i < siblings.length; i++) {
    const rect = siblings[i].rect;
    const midpoint = axis === 'y' ? rect.y + rect.h / 2 : rect.x + rect.w / 2;
    if (coord < midpoint) {
      return i;
    }
  }
  return siblings.length;
}

/** Map a sibling-list slot to the DOCUMENT insertion index — the page may
 * show a sparse run (`items[5..7]` on page 2), so slot k inserts before
 * sibling k's document index, and the tail slot after the last one. */
export function slotToDocIndex(siblings: readonly SiblingBox[], slot: number): number {
  const at = siblings[slot];
  if (at !== undefined) {
    return at.index;
  }
  const last = siblings[siblings.length - 1];
  return last === undefined ? 0 : last.index + 1;
}

/** The insertion line for `slot`, in the same pt space as the boxes: across
 * the midpoint of the gap between the neighbouring siblings, or along the
 * leading/trailing edge at the extremes. `null` when no neighbour exists. */
export function indicatorLine(
  siblings: readonly SiblingBox[],
  slot: number,
  axis: Axis,
): IndicatorLine | null {
  const before = slot > 0 ? siblings[slot - 1] : undefined;
  const after = slot < siblings.length ? siblings[slot] : undefined;
  if (before === undefined && after === undefined) {
    return null;
  }
  const rects: BoxRect[] = [];
  if (before !== undefined) {
    rects.push(before.rect);
  }
  if (after !== undefined) {
    rects.push(after.rect);
  }
  if (axis === 'y') {
    const beforeEdge = before === undefined ? undefined : before.rect.y + before.rect.h;
    const afterEdge = after === undefined ? undefined : after.rect.y;
    const y = edgePosition(beforeEdge, afterEdge);
    const x1 = Math.min(...rects.map((r) => r.x));
    const x2 = Math.max(...rects.map((r) => r.x + r.w));
    return { x1, y1: y, x2, y2: y };
  }
  const beforeEdge = before === undefined ? undefined : before.rect.x + before.rect.w;
  const afterEdge = after === undefined ? undefined : after.rect.x;
  const x = edgePosition(beforeEdge, afterEdge);
  const y1 = Math.min(...rects.map((r) => r.y));
  const y2 = Math.max(...rects.map((r) => r.y + r.h));
  return { x1: x, y1, x2: x, y2 };
}

export interface IndicatorLine {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/** The line position between two neighbouring edges: their midpoint, or the
 * one present edge at an extreme slot. (Callers guarantee at least one.) */
function edgePosition(beforeEdge: number | undefined, afterEdge: number | undefined): number {
  if (beforeEdge === undefined) {
    return afterEdge as number;
  }
  if (afterEdge === undefined) {
    return beforeEdge;
  }
  return (beforeEdge + afterEdge) / 2;
}

/** Everything a started drag needs at one pointer position: the (possibly
 * no-op) `moveItem` the drop would realize, the indicator to paint, and the
 * dragged box's own rect for the ghost. `null` when the drag is not (or no
 * longer) valid — the dragged path stopped resolving after an edit, sibling
 * geometry is ambiguous (repeat fragments), or the pointer is hostile; the
 * overlay then paints nothing and the release is a no-op (never a stale-
 * geometry move). */
export interface DropPlan {
  readonly context: ReorderContext;
  readonly slot: number;
  readonly op: MoveItemOp | null;
  readonly line: IndicatorLine | null;
  readonly source: BoxRect;
}

export function planDrop(
  contextFor: (path: string) => ReorderContext | null,
  pageBoxes: readonly PlacedBox[],
  path: string,
  point: { readonly x: number; readonly y: number },
): DropPlan | null {
  const context = contextFor(path);
  if (context === null) {
    return null;
  }
  const siblings = siblingRects(pageBoxes, context.parent);
  if (siblings === null) {
    return null;
  }
  const source = siblings.find((sibling) => sibling.index === context.from);
  if (source === undefined) {
    return null;
  }
  const slot = dropSlotFor(siblings, context.axis === 'y' ? point.y : point.x, context.axis);
  if (slot === null) {
    return null;
  }
  return {
    context,
    slot,
    op: moveOpFor(context.parent, context.from, slotToDocIndex(siblings, slot)),
    line: indicatorLine(siblings, slot, context.axis),
    source: source.rect,
  };
}
