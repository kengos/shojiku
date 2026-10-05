// The drag-to-reorder of the data-item editor's row lists — the choices and a
// field's declared display formats: a pointer drag from a row's grip over the
// rows' vertical extents, through the shared reorder machine
// (`usePointerReorder`) and the shared slot math (`moveRow` / `moveFormat` →
// `tree/reorder`).
// The drop line and the release both read the same `resolve`, so a slot that
// paints a line is exactly a slot that moves; a release is ONE op. The keyboard
// path is the rows' up/down buttons, not this hook.

import type { Op } from '@shojiku/designer-core';
import {
  type ListSlot,
  type PointerReorder,
  usePointerReorder,
  useSlotRefs,
} from '../hooks/usePointerReorder';
import { type EnumTarget, moveRow } from './enumEdits';

export interface RowDrag
  extends Pick<
    PointerReorder<number, ListSlot, Op>,
    'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel'
  > {
  readonly setRef: (index: number, el: HTMLElement | null) => void;
  /** The slot the drop line paints before (count = after the last row), or
   * `null` while no drag would move anything. */
  readonly lineAt: number | null;
}

/** The choices table's drag (kept by name for its callers). */
export type EnumDrag = RowDrag;

export function useEnumDrag(target: EnumTarget, dispatch: (op: Op) => void): EnumDrag {
  return useRowDrag((from, slot) => moveRow(target, from, slot), dispatch);
}

/** A row list's drag: `move` turns (row, insertion slot) into the op, or `null`
 * when the drop would not move anything. */
export function useRowDrag(
  move: (from: number, slot: number) => Op | null,
  dispatch: (op: Op) => void,
): RowDrag {
  const slots = useSlotRefs('y');
  const reorder = usePointerReorder<number, ListSlot, Op>({
    axis: 'y',
    dropAt: (_from, point) => slots.slotAt(point),
    resolve: (from, slot) => move(from, slot.index),
    onDrop: dispatch,
  });
  const { active } = reorder;
  return {
    setRef: slots.setRef,
    onPointerDown: reorder.onPointerDown,
    onPointerMove: reorder.onPointerMove,
    onPointerUp: reorder.onPointerUp,
    onPointerCancel: reorder.onPointerCancel,
    lineAt: active === null || reorder.pending === null ? null : active.drop.index,
  };
}
