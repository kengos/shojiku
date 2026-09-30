// The rule list's drag-to-reorder: a pointer drag from a card's grip over the
// cards' vertical extents, the layer tree's slot math (`dropIndexFor`) in
// DISPLAY positions. The drop line and the release both read `dragMoveOp`, so
// a slot that paints a line is exactly a slot that moves; a release is ONE
// `moveItem`. Escape cancels a running drag. The keyboard path is the cards'
// up/down buttons, not this hook.

import type { Op } from '@shojiku/designer-core';
import { type PointerEvent, useEffect, useRef, useState } from 'react';
import { DRAG_THRESHOLD_PX } from '../canvas/useDrag';
import { dropIndexFor } from '../tree/reorder';
import { dragMoveOp } from './ruleOrder';

/** An in-progress drag: `from` is the pressed card's display position, `slot`
 * the current 0..count insertion slot. */
interface RuleDragState {
  readonly from: number;
  readonly pointerId: number;
  readonly startY: number;
  readonly started: boolean;
  readonly slot: number;
}

export interface RuleDrag {
  readonly setRef: (display: number, el: HTMLElement | null) => void;
  readonly onPointerDown: (display: number) => (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerUp: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerCancel: () => void;
  /** The display slot the drop line paints before (count = after the last
   * card), or `null` while no drag would move anything. */
  readonly lineAt: number | null;
}

export function useRuleDrag(
  tablePath: string,
  entries: readonly unknown[],
  dispatch: (op: Op | null) => void,
): RuleDrag {
  const [drag, setDrag] = useState<RuleDragState | null>(null);
  const cards = useRef(new Map<number, HTMLElement>());

  useEffect(() => {
    if (drag?.started !== true) {
      return;
    }
    const cancel = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Captured on window so it wins over the Designer's Escape-to-deselect.
        event.stopPropagation();
        setDrag(null);
      }
    };
    window.addEventListener('keydown', cancel, true);
    return () => window.removeEventListener('keydown', cancel, true);
  }, [drag]);

  const rects = () => {
    const out: { top: number; height: number }[] = [];
    let el = cards.current.get(0);
    while (el !== undefined) {
      const rect = el.getBoundingClientRect();
      out.push({ top: rect.top, height: rect.height });
      el = cards.current.get(out.length);
    }
    return out;
  };
  const opFor = (state: RuleDragState) => dragMoveOp(tablePath, entries, state.from, state.slot);
  const live = drag?.started === true && opFor(drag) !== null;

  return {
    setRef: (display, el) => {
      if (el === null) {
        cards.current.delete(display);
      } else {
        cards.current.set(display, el);
      }
    },
    onPointerDown: (display) => (event) => {
      if (!event.isPrimary) {
        return;
      }
      // Guarded: jsdom has no pointer capture; a browser keeps the stream here.
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setDrag({
        from: display,
        pointerId: event.pointerId,
        startY: event.clientY,
        started: false,
        slot: display,
      });
    },
    onPointerMove: (event) => {
      if (drag === null || event.pointerId !== drag.pointerId) {
        return;
      }
      if (!drag.started && Math.abs(event.clientY - drag.startY) < DRAG_THRESHOLD_PX) {
        return;
      }
      setDrag({ ...drag, started: true, slot: dropIndexFor(rects(), event.clientY) });
    },
    onPointerUp: (event) => {
      if (drag === null || event.pointerId !== drag.pointerId) {
        return;
      }
      if (drag.started) {
        dispatch(opFor(drag));
      }
      setDrag(null);
    },
    onPointerCancel: () => setDrag(null),
    lineAt: live ? drag.slot : null,
  };
}
