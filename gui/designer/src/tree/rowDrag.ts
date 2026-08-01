// What a row drag IS while it runs: the in-flight state, the live sibling rects
// it measures against, and how it MARKS one row (dragged / drop-line above /
// drop-line below). The pointer + keyboard machine that produces the state is
// `useRowReorder`; the slot math and op building are `reorder.ts`.
//
// The rects are read from the row-element ref map at the moment they are needed,
// never captured at render time — a drop must decide against where the rows
// actually are.

import type { Op, OpResult } from '@shojiku/designer-core';
import type { RefObject } from 'react';
import type { MoveItemOp, RowRect } from './reorder';

export interface DragState {
  readonly path: string;
  readonly parent: string;
  readonly from: number;
  readonly pointerId: number;
  readonly startY: number;
  readonly started: boolean;
  readonly slot: number;
}

/** How an active drag affects ONE row: whether it is the row being dragged, and
 * whether the drop indicator line sits above or below it. */
export interface RowDragMarks {
  readonly dragging: boolean;
  readonly dropBefore: boolean;
  readonly dropAfter: boolean;
}

/** The live row elements by path — the sibling rects are measured off them. */
export type RowRefs = RefObject<Map<string, HTMLElement>>;

/** Apply a reorder and keep the selection travelling with the moved row. */
export function applyMove(
  apply: (op: Op) => OpResult,
  onSelect: (path: string) => void,
  op: MoveItemOp,
): void {
  if (apply(op).ok) {
    onSelect(`${op.path}[${op.to}]`);
  }
}

/** The visible sibling rows of the dragged node, in index order. */
export function siblingRects(rowRefs: RowRefs, parent: string): RowRect[] {
  const rects: RowRect[] = [];
  let el = rowRefs.current.get(`${parent}[0]`);
  while (el !== undefined) {
    const rect = el.getBoundingClientRect();
    rects.push({ top: rect.top, height: rect.height });
    el = rowRefs.current.get(`${parent}[${rects.length}]`);
  }
  return rects;
}

/** Whether `index` is the last sibling of the drag's parent (the only row
 * that renders the after-line). */
export function siblingEnd(rowRefs: RowRefs, parent: string, index: number): boolean {
  return rowRefs.current.get(`${parent}[${index + 1}]`) === undefined;
}

/** The drop indicator renders on the row occupying the active slot (line
 * above), or as a line below the last row when the slot is the tail. */
export function rowDragMarks(
  drag: DragState | null,
  path: string,
  position: { readonly parent: string; readonly index: number } | null,
  isEnd: (parent: string, index: number) => boolean,
): RowDragMarks {
  const dragging = drag?.started === true && drag.path === path;
  let dropBefore = false;
  let dropAfter = false;
  if (drag?.started === true && position !== null && position.parent === drag.parent) {
    if (drag.slot === position.index) {
      dropBefore = true;
    } else if (drag.slot === position.index + 1 && isEnd(drag.parent, position.index)) {
      dropAfter = true;
    }
  }
  return { dragging, dropBefore, dropAfter };
}
