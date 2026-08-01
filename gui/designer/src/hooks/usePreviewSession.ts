// The preview half of one editing session: the zoom state that picks the render
// scale, the engine render loop itself, and the auto-fit that measures the
// result. Composed in that ORDER on purpose — zoom feeds the render scale, and
// Fit measures the last-good page the render produced.

import { cssFactor, renderScale } from '../canvas/zoom';
import type { EngineTransport } from '../engine/transport';
import type { BoxIndex, RawPage } from '../engine/types';
import type { PreviewState } from '../preview/reducer';
import { usePreview } from '../preview/usePreview';
import { useAutoFit } from './useAutoFit';
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
  readonly baseScale: number;
}

export interface PreviewSession {
  readonly preview: PreviewState;
  readonly zoom: number;
  readonly setZoomClamped: (next: number) => void;
  readonly canvasRefCallback: (el: HTMLDivElement | null) => void;
  readonly onFit: () => void;
  /** The scale the shown render was produced at (not necessarily the target —
   * the zoom may have moved on since it was requested). */
  readonly renderedScale: number;
  /** The interim CSS transform that gives zoom instant feedback. */
  readonly cssFactor: number;
  /** Whether the shown render corresponds to the LIVE document. */
  readonly fresh: boolean;
  /** The last-good pages — never blanked while a failing edit re-renders. */
  readonly pages: readonly RawPage[];
  readonly boxes: BoxIndex;
}

export function usePreviewSession({
  transport,
  text,
  params,
  definitions,
  baseScale,
}: PreviewSessionOptions): PreviewSession {
  const zoomState = useZoom();
  const target = renderScale(baseScale, zoomState.zoom);
  const preview = usePreview(transport, text, { params, definitions, scale: target });
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
    cssFactor: cssFactor(baseScale, zoomState.zoom, renderedScale),
    fresh: preview.rendered !== null && preview.rendered === preview.revision,
    pages: preview.lastGood?.pages ?? [],
    boxes: preview.lastGood?.inspect?.boxes ?? EMPTY_BOXES,
  };
}
