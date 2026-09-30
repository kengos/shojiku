// The column-sheet header's reorder: a pointer drag on the X axis over the
// shared reorder machine (`usePointerReorder`) plus the Alt+Arrow keyboard
// path. A drop is ONE `moveItem` built by the same slot math the layer tree
// uses (`moveOpFor`), and the drop line down the sheet is painted from that
// same call, so a slot that shows a line is exactly a slot that moves.

import type { Op } from '@shojiku/designer-core';
import {
  type ListSlot,
  type PointerReorder,
  usePointerReorder,
  useSlotRefs,
} from '../hooks/usePointerReorder';
import { moveOpFor } from '../tree/reorder';
import { moveColumnOp } from './columnsModel';

/** Where a header drop line sits against its slot's edge (the grid is the
 * headers' offset parent): in the middle of the 4px gap before the slot's
 * header, or just past the last one. */
const LINE_BEFORE_PX = -3;
const LINE_AFTER_PX = 1;

export interface ColumnHeaderDrag
  extends Pick<
    PointerReorder<number, ListSlot, Op>,
    'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel'
  > {
  readonly setRef: (index: number, el: HTMLElement | null) => void;
  readonly onKeyDown: (index: number) => (event: React.KeyboardEvent<HTMLElement>) => void;
  /** The drop line's x in the grid, or `null` while no drop would move anything. */
  readonly lineX: number | null;
}

export function useColumnHeaderDrag(
  tablePath: string,
  columnCount: number,
  dispatch: (op: Op | null) => void,
): ColumnHeaderDrag {
  const slots = useSlotRefs('x');
  const columnsPath = `${tablePath}.columns`;
  const reorder = usePointerReorder<number, ListSlot, Op>({
    axis: 'x',
    dropAt: (_from, point) => slots.slotAt(point),
    // moveOpFor adds the slot→post-splice `to` adjustment + the no-op guard a
    // multi-slot drag needs; the ±1 keyboard path below uses moveColumnOp.
    resolve: (from, slot) => moveOpFor(columnsPath, from, slot.index),
    onDrop: dispatch,
  });
  const { active } = reorder;

  return {
    setRef: slots.setRef,
    onPointerDown: reorder.onPointerDown,
    onPointerMove: reorder.onPointerMove,
    onPointerUp: reorder.onPointerUp,
    onPointerCancel: reorder.onPointerCancel,
    onKeyDown: (index) => (event) => {
      if (!event.altKey || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) {
        return;
      }
      const to = event.key === 'ArrowLeft' ? index - 1 : index + 1;
      if (to < 0 || to >= columnCount) {
        return;
      }
      event.preventDefault();
      dispatch(moveColumnOp(tablePath, index, to));
    },
    lineX:
      active === null || reorder.pending === null
        ? null
        : active.drop.edge + (active.drop.tail ? LINE_AFTER_PX : LINE_BEFORE_PX),
  };
}
