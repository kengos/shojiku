// The preview half of one editing session: the zoom state that picks the render
// scale, the engine render loop itself, and the auto-fit that measures the
// result. Composed in that ORDER on purpose — zoom feeds the render scale, and
// Fit measures the last-good page the render produced.

import type { Op } from '@shojiku/designer-core';
import type { PageMargin } from '../canvas/marginGuide';
import { cssFactor, pixelRatio, renderScale } from '../canvas/zoom';
import type { EngineTransport } from '../engine/transport';
import type { BoxIndex, RawPage } from '../engine/types';
import type { PreviewState } from '../preview/reducer';
import { usePreview } from '../preview/usePreview';
import { useAutoFit } from './useAutoFit';
import { useDraftPreview } from './useDraftPreview';
import { useZoom } from './useZoom';

/** The stable empty box index (no render yet, or a render without inspect). */
const EMPTY_BOXES: BoxIndex = { pages: [] };

export interface PreviewSessionOptions {
  readonly transport: EngineTransport;
  readonly text: string;
  readonly params: string;
  /** The ENGINEER definitions only — an inferred stub would add nothing the
   * render needs (definitions are validate-time, and rendering runs off params)
   * and would only inject `empty_definitions`/`unknown_data_key` noise. */
  readonly definitions: string | undefined;
  /** CSS px per pt at zoom 1 — the Designer passes `ACTUAL_SIZE_SCALE`. */
  readonly baseScale: number;
  /** The session's template-size cap — a draft is derived by re-parsing the
   * committed text, which must happen under the SAME bound or a legally
   * oversized document stops previewing the moment it is edited. */
  readonly maxBytes: number;
}

export interface PreviewSession {
  readonly preview: PreviewState;
  readonly zoom: number;
  readonly setZoomClamped: (next: number) => void;
  readonly canvasRefCallback: (el: HTMLDivElement | null) => void;
  readonly onFit: () => void;
  /** The scale the shown render was produced at, in DEVICE px per pt (not
   * necessarily the target — the zoom may have moved on since it was
   * requested). Divide by {@link pixelRatio} for the CSS scale the canvas is
   * laid out at; `useAutoFit` wants this one, because it divides a page's
   * device-pixel width by it to recover pt. */
  readonly renderedScale: number;
  /** Device pixels per CSS pixel the render was requested for. */
  readonly pixelRatio: number;
  /** CSS px per pt the pages are DISPLAYED at — {@link renderedScale} divided
   * by {@link pixelRatio}. What the canvas lays out in, and what the overlay's
   * pt conversions are measured against. */
  readonly cssScale: number;
  /** The interim CSS transform that gives zoom instant feedback. */
  readonly cssFactor: number;
  /** Whether the shown render corresponds to the LIVE COMMITTED document. A
   * draft render is never fresh: `panel/boxFields` gates the placement pin on
   * this, and pinning a measurement taken from text the user never committed
   * would author numbers off a document that does not exist. */
  readonly fresh: boolean;
  /** Publish an in-progress edit as ops so the canvas shows it, or `null` to
   * withdraw it. The ops are applied to a THROWAWAY document — see
   * `preview/draftTemplate`. */
  readonly setDraftOps: (ops: readonly Op[] | null) => void;
  /** The last-good pages — never blanked while a failing edit re-renders. */
  readonly pages: readonly RawPage[];
  readonly boxes: BoxIndex;
  /** The last-good render's RESOLVED page margins — the canvas paints them as
   * the margin-box guide. `null` before the first render, or when the outcome
   * carried no inspect envelope. Unlike {@link boxes} this keeps its null (an
   * "empty" margin has no meaningful stand-in, and the guide's own model
   * refuses one anyway). */
  readonly margin: PageMargin | null;
}

export function usePreviewSession({
  transport,
  text,
  params,
  definitions,
  baseScale,
  maxBytes,
}: PreviewSessionOptions): PreviewSession {
  const zoomState = useZoom();
  // Read fresh on each render rather than subscribed to: the ratio only matters
  // when it feeds a render, and every way it can change (a browser zoom, a
  // window moved to another display) re-renders this tree anyway. A stale one
  // costs exactly what the app did before this was read at all — an upscaled
  // raster — so there is no state to keep in sync and no listener to leak.
  const ratio = pixelRatio(window.devicePixelRatio);
  const target = renderScale(baseScale, zoomState.zoom, ratio);
  const draft = useDraftPreview(text, maxBytes);
  const preview = usePreview(transport, draft.text, {
    params,
    definitions,
    scale: target,
    // The draft has already waited out its own debounce before it reaches here,
    // so waiting again would double the delay the reader feels for nothing.
    ...(draft.drafting ? { debounceMs: 0 } : {}),
  });
  const renderedScale = preview.renderedScale ?? target;
  const onFit = useAutoFit({
    lastGood: preview.lastGood,
    baseScale,
    renderedScale,
    setZoom: zoomState.setZoom,
    didInitialFit: zoomState.didInitialFit,
    canvasScrollRef: zoomState.canvasScrollRef,
  });

  return {
    preview,
    zoom: zoomState.zoom,
    setZoomClamped: zoomState.setZoomClamped,
    canvasRefCallback: zoomState.canvasRefCallback,
    onFit,
    renderedScale,
    pixelRatio: ratio,
    cssScale: renderedScale / ratio,
    cssFactor: cssFactor(baseScale, zoomState.zoom, renderedScale, ratio),
    fresh: !draft.drafting && preview.rendered !== null && preview.rendered === preview.revision,
    setDraftOps: draft.setDraftOps,
    pages: preview.lastGood?.pages ?? [],
    boxes: preview.lastGood?.inspect?.boxes ?? EMPTY_BOXES,
    margin: preview.lastGood?.inspect?.margin ?? null,
  };
}
