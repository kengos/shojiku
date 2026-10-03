// The choices list's drag-to-reorder: a pointer drag from a row's grip over the
// rows' vertical extents, through the shared reorder machine
// (`usePointerReorder`) and the shared slot math (`moveRow` → `tree/reorder`).
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

export interface EnumDrag
  extends Pick<
    PointerReorder<number, ListSlot, Op>,
    'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel'
  > {
  readonly setRef: (index: number, el: HTMLElement | null) => void;
  /** The slot the drop line paints before (count = after the last row), or
   * `null` while no drag would move anything. */
  readonly lineAt: number | null;
}

export function useEnumDrag(target: EnumTarget, dispatch: (op: Op) => void): EnumDrag {
  const slots = useSlotRefs('y');
  const reorder = usePointerReorder<number, ListSlot, Op>({
    axis: 'y',
    dropAt: (_from, point) => slots.slotAt(point),
    resolve: (from, slot) => moveRow(target, from, slot.index),
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
