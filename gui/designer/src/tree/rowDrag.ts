// What a row drag IS while it runs: the in-flight state, the live row rects it
// measures against, how it MARKS one row (dragged / drop-line above / below),
// and the ops a release commits. The pointer + keyboard machine that produces
// the state is `useRowReorder`; where a pointer LANDS is `rowDrop.ts`, and
// what a cross-parent landing means is the shared `canvas/reparent` model the
// canvas uses too.
//
// The rects are read from the row-element ref map at the moment they are needed,
// never captured at render time — a drop must decide against where the rows
// actually are.

import type { Op, OpResult, ReadFn } from '@shojiku/designer-core';
import type { RefObject } from 'react';
import { receiverFor } from '../canvas/dnd';
import { reparentedPath, reparentOps } from '../canvas/reparent';
import { moveOpFor } from './reorder';
import type { RowSlot, VisibleRow } from './rowDrop';

const ITEMS_SUFFIX = '.items';

export interface DragState {
  readonly path: string;
  readonly parent: string;
  readonly from: number;
  readonly pointerId: number;
  readonly startY: number;
  readonly started: boolean;
  /** Where the pointer currently drops — `null` when nothing under it can
   * take this row, which paints no indicator and releases as a no-op. */
  readonly drop: RowSlot | null;
}

/** How an active drag affects ONE row: whether it is the row being dragged, and
 * whether the drop indicator line sits above or below it. */
export interface RowDragMarks {
  readonly dragging: boolean;
  readonly dropBefore: boolean;
  readonly dropAfter: boolean;
}

/** The live row elements by path — the row rects are measured off them. */
export type RowRefs = RefObject<Map<string, HTMLElement>>;

/** Apply a drop batch and keep the selection travelling with the moved row. */
export function applyDrop(
  applyAll: (ops: readonly Op[]) => OpResult,
  onSelect: (path: string) => void,
  ops: readonly Op[],
  selectPath: string,
): void {
  if (applyAll(ops).ok) {
    onSelect(selectPath);
  }
}

/** The visible rows in tree order, measured now. Paths whose element is not
 * mounted are skipped, so the run always matches what is on screen. */
export function visibleRows(rowRefs: RowRefs, order: readonly string[]): VisibleRow[] {
  const rows: VisibleRow[] = [];
  for (const path of order) {
    const el = rowRefs.current.get(path);
    if (el !== undefined) {
      const rect = el.getBoundingClientRect();
      rows.push({ path, top: rect.top, height: rect.height, left: rect.left });
    }
  }
  return rows;
}

/** Whether `index` is the last sibling of `parent` (the only row that renders
 * the after-line). */
export function siblingEnd(rowRefs: RowRefs, parent: string, index: number): boolean {
  return rowRefs.current.get(`${parent}[${index + 1}]`) === undefined;
}

/** Which parent sequences this drag may land in: its OWN (a plain reorder) or
 * any owner the shared reparent model would accept it into. Handed to
 * `rowDropAt`, so the indicator can only ever point at a legal drop. */
export function acceptsFor(read: ReadFn, path: string, parent: string) {
  return (candidate: string): boolean => {
    if (candidate === parent) {
      return true;
    }
    const receiver = receiverFor(read, candidate.slice(0, -ITEMS_SUFFIX.length));
    return receiver !== null && reparentOps(read, path, { receiver, index: 0 }, null) !== null;
  };
}

/** The ops a release at `drop` commits, and where the row ends up. `null` when
 * the drop changes nothing (the row is already there) or is not expressible.
 * A same-parent drop is the shipped single `moveItem`; a cross-parent one is
 * the shared reparent batch — the tree passes no drop point, so a
 * coordinate-placed destination leaves the row's own `box` keys alone. */
export function rowDropOps(
  read: ReadFn,
  drag: DragState,
  drop: RowSlot,
): { readonly ops: readonly Op[]; readonly selectPath: string } | null {
  if (drop.parent === drag.parent) {
    const op = moveOpFor(drag.parent, drag.from, drop.index);
    return op === null ? null : { ops: [op], selectPath: `${op.path}[${op.to}]` };
  }
  const receiver = receiverFor(read, drop.parent.slice(0, -ITEMS_SUFFIX.length));
  if (receiver === null) {
    return null;
  }
  const ops = reparentOps(read, drag.path, { receiver, index: drop.index }, null);
  return ops === null
    ? null
    : { ops, selectPath: reparentedPath(drag.parent, drag.from, drop.parent, drop.index) };
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
  const drop = drag?.started === true ? drag.drop : null;
  if (drop !== null && position !== null && drop.parent === position.parent) {
    if (drop.index === position.index) {
      dropBefore = true;
    } else if (drop.index === position.index + 1 && isEnd(position.parent, position.index)) {
      dropAfter = true;
    }
  }
  return { dragging, dropBefore, dropAfter };
}
