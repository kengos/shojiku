// The generic canvas pointer-drag state machine: press → threshold → drag →
// drop/cancel, with guarded pointer capture, capture-phase Escape cancel
// (stopping the Designer's own Escape-to-deselect), and click suppression
// after a completed or cancelled drag. Semantics-free — what a drag MEANS
// (reorder, move/resize, palette insert) is the caller's: it supplies the
// payload at press and receives it back with the drop point.

import { useCallback, useEffect, useRef, useState } from 'react';

/** Pointer travel (px) before a press becomes a drag instead of a click. */
export const DRAG_THRESHOLD_PX = 4;

export interface DragPoint {
  readonly x: number;
  readonly y: number;
  /** Whether Alt was held at this point — snap-bypass for move/resize
   * consumers; reorder/list consumers ignore it. */
  readonly alt?: boolean;
  /** Whether Shift was held at this point — axis-lock for a move drag;
   * additive for a marquee; other consumers ignore it. */
  readonly shift?: boolean;
}

export interface DragSession<T> {
  readonly payload: T;
  readonly pointerId: number;
  readonly start: DragPoint;
  readonly point: DragPoint;
  /** False until the pointer travels the threshold — a plain click never
   * becomes a drag. */
  readonly started: boolean;
}

export interface UseDrag<T> {
  /** The live session; `null` when idle. */
  readonly session: DragSession<T> | null;
  /** Arm a drag on primary-pointer press (call only for a draggable target). */
  readonly begin: (payload: T, event: React.PointerEvent<Element>) => void;
  readonly move: (event: React.PointerEvent<Element>) => void;
  readonly up: (event: React.PointerEvent<Element>) => void;
  readonly cancel: () => void;
  /** True exactly once after a drag ended — the trailing click a completed
   * drag fires must not select. */
  readonly consumeClick: () => boolean;
}

function finiteEvent(event: React.PointerEvent<Element>): boolean {
  return Number.isFinite(event.clientX) && Number.isFinite(event.clientY);
}

export function useDrag<T>(onDrop: (payload: T, point: DragPoint) => void): UseDrag<T> {
  const [session, setSession] = useState<DragSession<T> | null>(null);
  const suppressClick = useRef(false);

  // Escape cancels an active drag — captured on window so it wins over (and
  // stops) the Designer's window-level Escape-to-deselect.
  useEffect(() => {
    if (session?.started !== true) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        suppressClick.current = true;
        setSession(null);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [session]);

  const begin = useCallback((payload: T, event: React.PointerEvent<Element>) => {
    if (!event.isPrimary || !finiteEvent(event)) {
      return;
    }
    // Guarded: jsdom implements no pointer capture; in a real browser this
    // keeps the move/up stream on the pressed element while the pointer
    // travels.
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = { x: event.clientX, y: event.clientY, alt: event.altKey, shift: event.shiftKey };
    setSession({ payload, pointerId: event.pointerId, start: point, point, started: false });
  }, []);

  const move = useCallback(
    (event: React.PointerEvent<Element>) => {
      if (session === null || event.pointerId !== session.pointerId || !finiteEvent(event)) {
        return;
      }
      const point = {
        x: event.clientX,
        y: event.clientY,
        alt: event.altKey,
        shift: event.shiftKey,
      };
      if (
        !session.started &&
        Math.abs(point.x - session.start.x) < DRAG_THRESHOLD_PX &&
        Math.abs(point.y - session.start.y) < DRAG_THRESHOLD_PX
      ) {
        return;
      }
      setSession({ ...session, point, started: true });
    },
    [session],
  );

  const up = useCallback(
    (event: React.PointerEvent<Element>) => {
      if (session === null || event.pointerId !== session.pointerId) {
        return;
      }
      if (session.started) {
        suppressClick.current = true;
        onDrop(
          session.payload,
          finiteEvent(event)
            ? { x: event.clientX, y: event.clientY, alt: event.altKey, shift: event.shiftKey }
            : session.point,
        );
      }
      setSession(null);
    },
    [session, onDrop],
  );

  const cancel = useCallback(() => setSession(null), []);

  const consumeClick = useCallback(() => {
    const suppressed = suppressClick.current;
    suppressClick.current = false;
    return suppressed;
  }, []);

  return { session, begin, move, up, cancel, consumeClick };
}
