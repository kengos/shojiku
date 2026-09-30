// The ONE pointer-drag machine under the Designer's list reorders — the layer
// tree's rows, the column sheet's headers, the rule list's cards. It owns what
// a reorder gesture is regardless of what it moves: the primary-pointer and
// pointer-id guards, guarded pointer capture, the threshold along the list's
// own axis, Escape to cancel (captured on window so it wins over the
// Designer's Escape-to-deselect), pointercancel, and swallowing the click a
// finished gesture leaves behind. What a position MEANS stays with each list:
// `dropAt` reads where the pointer is, `resolve` turns that into what a release
// commits — and the same `resolve` feeds `pending`, so a list that paints its
// indicator from `pending` paints it exactly where a release moves.
//
// `useSlotRefs` is the index-keyed element map a flat list measures its slots
// off, through the shared slot math in `tree/reorder.ts`.
//
// It is deliberately NOT `canvas/useDrag`, the canvas's own drag machine: a
// list starts on travel along its own axis only (the canvas on either), guards
// pointercancel by pointer id, and re-reads its drop on every move so an
// indicator can show what a release would commit.

import { type PointerEvent, useEffect, useRef, useState } from 'react';
import { DRAG_THRESHOLD_PX } from '../canvas/useDrag';
import { dropIndexFor, type RowRect } from '../tree/reorder';

export type ReorderAxis = 'x' | 'y';

export interface ReorderPoint {
  readonly x: number;
  readonly y: number;
}

export interface PointerReorderOptions<K, D, R> {
  /** The list's axis — the threshold is measured along it only. */
  readonly axis: ReorderAxis;
  /** Where the pointer drops, read on every move past the threshold. */
  readonly dropAt: (key: K, point: ReorderPoint) => D;
  /** What a release at `drop` commits; `null` moves nothing. */
  readonly resolve: (key: K, drop: D) => R | null;
  readonly onDrop: (result: R) => void;
}

export interface PointerReorder<K, D, R> {
  /** The running gesture, once past the threshold; `null` otherwise. */
  readonly active: { readonly key: K; readonly drop: D } | null;
  /** `resolve` over `active` — what a release now would commit. */
  readonly pending: R | null;
  readonly onPointerDown: (key: K) => (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerUp: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
  /** True exactly once after a started gesture ended by a release or Escape —
   * the trailing click it leaves must not act. A pointercancel arms nothing:
   * the browser sends no click after one. A surface that never reads it (its
   * handle has no click action) leaves it armed, so one that later gains a
   * click action must read it. */
  readonly consumeClick: () => boolean;
}

interface Session<K, D> {
  readonly key: K;
  readonly pointerId: number;
  readonly start: number;
  /** Set once the pointer travels the threshold — a plain click never drags. */
  readonly moved: { readonly drop: D } | null;
}

const along = (axis: ReorderAxis, point: ReorderPoint) => (axis === 'x' ? point.x : point.y);
const pointOf = (event: PointerEvent<HTMLElement>) => ({ x: event.clientX, y: event.clientY });

export function usePointerReorder<K, D, R>({
  axis,
  dropAt,
  resolve,
  onDrop,
}: PointerReorderOptions<K, D, R>): PointerReorder<K, D, R> {
  const [session, setSession] = useState<Session<K, D> | null>(null);
  const suppressClick = useRef(false);
  const started = session?.moved != null;

  useEffect(() => {
    if (!started) {
      return;
    }
    const cancel = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        suppressClick.current = true;
        setSession(null);
      }
    };
    window.addEventListener('keydown', cancel, true);
    return () => window.removeEventListener('keydown', cancel, true);
  }, [started]);

  const own = (event: PointerEvent<HTMLElement>) =>
    session !== null && event.pointerId === session.pointerId;
  const active = session?.moved == null ? null : { key: session.key, drop: session.moved.drop };

  return {
    active,
    // A getter: a surface that paints no indicator from it never pays for it.
    get pending() {
      return active === null ? null : resolve(active.key, active.drop);
    },
    onPointerDown: (key) => (event) => {
      if (!event.isPrimary) {
        return;
      }
      // Guarded: jsdom implements no pointer capture; in a real browser this
      // keeps the move/up stream on the pressed element while the pointer travels.
      event.currentTarget.setPointerCapture?.(event.pointerId);
      const start = along(axis, pointOf(event));
      setSession({ key, pointerId: event.pointerId, start, moved: null });
    },
    onPointerMove: (event) => {
      if (session === null || !own(event)) {
        return;
      }
      const point = pointOf(event);
      if (
        session.moved === null &&
        Math.abs(along(axis, point) - session.start) < DRAG_THRESHOLD_PX
      ) {
        return;
      }
      setSession({ ...session, moved: { drop: dropAt(session.key, point) } });
    },
    onPointerUp: (event) => {
      if (session === null || !own(event)) {
        return;
      }
      if (session.moved !== null) {
        suppressClick.current = true;
        const result = resolve(session.key, session.moved.drop);
        if (result !== null) {
          onDrop(result);
        }
      }
      setSession(null);
    },
    onPointerCancel: (event) => {
      if (own(event)) {
        setSession(null);
      }
    },
    consumeClick: () => {
      const suppressed = suppressClick.current;
      suppressClick.current = false;
      return suppressed;
    },
  };
}

/** A flat list's slot under the pointer: the insertion index (0..count),
 * whether it is the TAIL (after the last element), and that slot's edge along
 * the axis in the elements' OFFSET-parent space — the leading edge of the
 * element at `index`, or the last element's far edge for the tail — which is
 * where an indicator drawn inside that parent goes. */
export interface ListSlot {
  readonly index: number;
  readonly tail: boolean;
  readonly edge: number;
}

export interface SlotRefs {
  readonly setRef: (index: number, el: HTMLElement | null) => void;
  readonly slotAt: (point: ReorderPoint) => ListSlot;
}

/** The index-keyed element map of a flat list, measured NOW (never at render)
 * along `axis`: the contiguous run from index 0 is what the slot math sees. */
export function useSlotRefs(axis: ReorderAxis): SlotRefs {
  const elements = useRef(new Map<number, HTMLElement>());
  return {
    setRef: (index, el) => {
      if (el === null) {
        elements.current.delete(index);
      } else {
        elements.current.set(index, el);
      }
    },
    slotAt: (point) => {
      const run: HTMLElement[] = [];
      for (
        let el = elements.current.get(0);
        el !== undefined;
        el = elements.current.get(run.length)
      ) {
        run.push(el);
      }
      // RowRect is "any consistent coordinate space": X/width on the X axis.
      const rects: RowRect[] = run.map((el) => {
        const rect = el.getBoundingClientRect();
        return axis === 'x' ? { top: rect.left, height: rect.width } : rect;
      });
      const index = dropIndexFor(rects, along(axis, point));
      const at = run[Math.min(index, run.length - 1)];
      const [start, size] =
        axis === 'x' ? [at.offsetLeft, at.offsetWidth] : [at.offsetTop, at.offsetHeight];
      const tail = index === run.length;
      return { index, tail, edge: tail ? start + size : start };
    },
  };
}
