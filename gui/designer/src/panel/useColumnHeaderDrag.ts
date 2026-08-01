// The column-sheet header's reorder machine: pointer drag on the X axis plus
// the Alt+Arrow keyboard path. Thin over the SAME slot math the layer tree's
// vertical reorder uses (`dropIndexFor`/`moveOpFor`) — a drop is ONE `moveItem`.

import type { Op } from '@shojiku/designer-core';
import { useRef, useState } from 'react';
import { DRAG_THRESHOLD_PX } from '../canvas/useDrag';
import { dropIndexFor, moveOpFor } from '../tree/reorder';
import { moveColumnOp } from './columnsModel';

/** In-progress header drag: `from` is the pressed column, `slot` the current
 * 0..count insertion index (LayerTree's local-state reorder, on the X axis). */
interface HeaderDrag {
  readonly from: number;
  readonly pointerId: number;
  readonly startX: number;
  readonly started: boolean;
  readonly slot: number;
}

export interface ColumnHeaderDrag {
  readonly setRef: (index: number, el: HTMLElement | null) => void;
  readonly onPointerDown: (index: number) => (event: React.PointerEvent<HTMLElement>) => void;
  readonly onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
  readonly onPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
  readonly onKeyDown: (index: number) => (event: React.KeyboardEvent<HTMLElement>) => void;
}

export function useColumnHeaderDrag(
  tablePath: string,
  columnCount: number,
  dispatch: (op: Op | null) => void,
): ColumnHeaderDrag {
  const [drag, setDrag] = useState<HeaderDrag | null>(null);
  const headerRefs = useRef(new Map<number, HTMLElement>());
  const columnsPath = `${tablePath}.columns`;

  const headerRects = () => {
    const rects: { top: number; height: number }[] = [];
    let el = headerRefs.current.get(rects.length);
    while (el !== undefined) {
      const rect = el.getBoundingClientRect();
      // RowRect is "any consistent coordinate space" — feed X/width so the
      // shared vertical slot math reorders horizontally.
      rects.push({ top: rect.left, height: rect.width });
      el = headerRefs.current.get(rects.length);
    }
    return rects;
  };

  return {
    setRef: (index, el) => {
      if (el === null) {
        headerRefs.current.delete(index);
      } else {
        headerRefs.current.set(index, el);
      }
    },

    onPointerDown: (index) => (event) => {
      if (!event.isPrimary) {
        return;
      }
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setDrag({
        from: index,
        pointerId: event.pointerId,
        startX: event.clientX,
        started: false,
        slot: index,
      });
    },

    onPointerMove: (event) => {
      if (drag === null || event.pointerId !== drag.pointerId) {
        return;
      }
      if (!drag.started && Math.abs(event.clientX - drag.startX) < DRAG_THRESHOLD_PX) {
        return;
      }
      setDrag({ ...drag, started: true, slot: dropIndexFor(headerRects(), event.clientX) });
    },

    onPointerUp: (event) => {
      if (drag === null || event.pointerId !== drag.pointerId) {
        return;
      }
      if (drag.started) {
        // moveOpFor adds the slot→post-splice `to` adjustment + the no-op guard a
        // multi-slot drag needs; the ±1 keyboard path below uses moveColumnOp.
        dispatch(moveOpFor(columnsPath, drag.from, drag.slot));
      }
      setDrag(null);
    },

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
  };
}
