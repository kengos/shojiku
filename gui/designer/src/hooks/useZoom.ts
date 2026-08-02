// Zoom is Designer-local UI state — never persisted, never written into the
// template. The engine rasterizes at `renderScale` (bounded so RGBA memory
// can't blow up), and the gap up to the desired zoom is a CSS transform. This
// hook owns the state + the scroll container's ⌘/Ctrl+wheel listener; the
// open-at-Fit half needs the preview and lives in `useAutoFit`.

import { type Dispatch, type SetStateAction, useCallback, useRef, useState } from 'react';
import { anchorScroll, clampZoom, wheelZoom } from '../canvas/zoom';

export interface Zoom {
  readonly zoom: number;
  readonly setZoom: Dispatch<SetStateAction<number>>;
  /** Any MANUAL zoom interaction (control, wheel, explicit fit) consumes the
   * open-at-Fit one-shot — a user who zooms first has taken over. */
  readonly setZoomClamped: (next: number) => void;
  readonly didInitialFit: { current: boolean };
  readonly canvasScrollRef: { current: HTMLDivElement | null };
  readonly canvasRefCallback: (el: HTMLDivElement | null) => void;
}

export function useZoom(): Zoom {
  const [zoom, setZoom] = useState(1);

  // The open-at-Fit one-shot. Held here so every MANUAL zoom interaction
  // (control, wheel, explicit fit) can consume it — a user who zooms before the
  // auto-fit ever fires has taken over; the deferred fit must not clobber them.
  const didInitialFit = useRef(false);

  const setZoomClamped = useCallback((next: number) => {
    didInitialFit.current = true;
    setZoom(clampZoom(next));
  }, []);

  // The scroll container: pans via native `overflow: auto` scroll, and hosts the
  // ⌘/Ctrl+wheel zoom. `zoomRef` feeds the native wheel listener the live zoom
  // without churning its (once-subscribed) identity.
  const canvasScrollRef = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  // ⌘/Ctrl+wheel zooms cursor-anchored; a plain wheel is native scroll. Wired
  // as a NON-passive native listener (React's onWheel is passive, so its
  // preventDefault is a no-op) via a callback ref so it attaches to the live
  // element and detaches on unmount.
  const detachWheel = useRef<(() => void) | null>(null);
  const canvasRefCallback = useCallback((el: HTMLDivElement | null) => {
    detachWheel.current?.();
    detachWheel.current = null;
    canvasScrollRef.current = el;
    if (el !== null) {
      const onWheel = (event: WheelEvent) => {
        if (!(event.ctrlKey || event.metaKey)) {
          return;
        }
        event.preventDefault();
        const before = zoomRef.current;
        const next = wheelZoom(before, event.deltaY);
        if (next === before) {
          return;
        }
        const rect = el.getBoundingClientRect();
        const ratio = next / before;
        el.scrollLeft = anchorScroll(el.scrollLeft, event.clientX - rect.left, ratio);
        el.scrollTop = anchorScroll(el.scrollTop, event.clientY - rect.top, ratio);
        didInitialFit.current = true;
        setZoom(next);
      };
      el.addEventListener('wheel', onWheel, { passive: false });
      detachWheel.current = () => el.removeEventListener('wheel', onWheel);
    }
  }, []);

  return { zoom, setZoom, setZoomClamped, didInitialFit, canvasScrollRef, canvasRefCallback };
}
