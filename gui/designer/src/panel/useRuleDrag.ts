// The rule list's drag-to-reorder: a pointer drag from a card's grip over the
// cards' vertical extents, through the shared reorder machine
// (`usePointerReorder`) and the layer tree's slot math in DISPLAY positions.
// The drop line and the release both read `dragMoveOp`, so a slot that paints
// a line is exactly a slot that moves; a release is ONE `moveItem`. The
// keyboard path is the cards' up/down buttons, not this hook.

import type { Op } from '@shojiku/designer-core';
import {
  type ListSlot,
  type PointerReorder,
  usePointerReorder,
  useSlotRefs,
} from '../hooks/usePointerReorder';
import { dragMoveOp } from './ruleOrder';

export interface RuleDrag
  extends Pick<
    PointerReorder<number, ListSlot, Op>,
    'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel'
  > {
  readonly setRef: (display: number, el: HTMLElement | null) => void;
  /** The display slot the drop line paints before (count = after the last
   * card), or `null` while no drag would move anything. */
  readonly lineAt: number | null;
}

export function useRuleDrag(
  tablePath: string,
  entries: readonly unknown[],
  dispatch: (op: Op | null) => void,
): RuleDrag {
  const slots = useSlotRefs('y');
  const reorder = usePointerReorder<number, ListSlot, Op>({
    axis: 'y',
    dropAt: (_from, point) => slots.slotAt(point),
    resolve: (from, slot) => dragMoveOp(tablePath, entries, from, slot.index),
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
