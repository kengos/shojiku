// Fit-to-container zoom: the explicit Fit action plus the open-at-Fit one-shot.
// Split out of `useZoom` because both read the preview, which is rendered at the
// scale `useZoom`'s state feeds — so this half runs AFTER the preview loop.

import { type Dispatch, type SetStateAction, useCallback, useEffect } from 'react';
import { fitZoom, isMeasurable } from '../canvas/zoom';
import type { LastGoodPreview } from '../preview/reducer';

export interface AutoFitOptions {
  readonly lastGood: LastGoodPreview | null;
  readonly baseScale: number;
  readonly renderedScale: number;
  readonly setZoom: Dispatch<SetStateAction<number>>;
  readonly didInitialFit: { current: boolean };
  readonly canvasScrollRef: { current: HTMLDivElement | null };
}

export function useAutoFit({
  lastGood,
  baseScale,
  renderedScale,
  setZoom,
  didInitialFit,
  canvasScrollRef,
}: AutoFitOptions): () => void {
  // Fit the first page inside the container (measured on demand — no
  // ResizeObserver). A missing page or unmeasurable container falls back to 1.
  // Any explicit fit also consumes the open-at-Fit one-shot (already fitted).
  const onFit = useCallback(() => {
    didInitialFit.current = true;
    const firstPage = lastGood?.pages[0];
    const el = canvasScrollRef.current;
    if (firstPage === undefined || el === null) {
      setZoom(1);
      return;
    }
    // The page's pixel size at zoom 1 (= pt × baseScale); the rendered pixels
    // are at `renderedScale`, so normalize back to the base.
    const pageBaseW = (firstPage.width * baseScale) / renderedScale;
    const pageBaseH = (firstPage.height * baseScale) / renderedScale;
    setZoom(fitZoom(el.clientWidth, el.clientHeight, pageBaseW, pageBaseH));
  }, [lastGood, baseScale, renderedScale, setZoom, didInitialFit, canvasScrollRef]);

  // Open at Fit: apply the fit ONCE, when a good preview exists AND the scroll
  // container has a measured size — and only if the user has not zoomed
  // manually first (any zoom interaction consumes the one-shot above). Deferring
  // on a zero size keeps the one-shot armed instead of applying a bogus fit.
  // Zoom stays Designer-local; nothing is written to the template.
  useEffect(() => {
    if (didInitialFit.current) {
      return;
    }
    const firstPage = lastGood?.pages[0];
    const el = canvasScrollRef.current;
    if (firstPage === undefined || el === null) {
      return;
    }
    if (!isMeasurable(el.clientWidth, el.clientHeight)) {
      return;
    }
    didInitialFit.current = true;
    onFit();
  }, [lastGood, onFit, didInitialFit, canvasScrollRef]);

  return onFit;
}
