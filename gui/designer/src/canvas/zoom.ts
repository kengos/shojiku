// The pure zoom model: all the arithmetic behind the canvas zoom control, kept
// free of React and the DOM so every branch is unit-testable with plain
// numbers. Two scales are in play — the DESIRED display scale the user asked
// for (`baseScale × zoom`) and the RENDER scale the engine actually rasterizes
// at (the desired scale capped at `MAX_RENDER_SCALE`, because RGBA bytes grow
// quadratically). When the desired scale exceeds the cap, or a fresh zoom has
// not re-rendered yet, the gap is covered by a CSS transform (`cssFactor`), so
// zooming feels instant and only snaps crisp once the debounced render lands.

/** Smallest / largest zoom the control allows (25% … 400%). */
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;

/** The discrete stops the +/− buttons and the preset select offer. */
export const ZOOM_STEPS: readonly number[] = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];

/** Hard cap on the device px per pt the engine rasterizes at: an A4 page at
 * scale 6 is already ≈ 72 MB of RGBA, so past this the zoom is CSS-only
 * magnification of the capped render (the memory bound never disappears). */
export const MAX_RENDER_SCALE = 6;

/** Per-notch wheel-zoom sensitivity (a trackpad pinch arrives as many small
 * ctrl+wheel deltas, so the factor stays gentle). */
export const WHEEL_ZOOM_SENSITIVITY = 0.0015;

const EPS = 1e-9;

/** Clamp to [MIN_ZOOM, MAX_ZOOM]; a non-finite value (hostile/NaN) → 1, so a
 * zoom fed straight into a render scale can never go NaN. */
export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) {
    return 1;
  }
  if (zoom < MIN_ZOOM) {
    return MIN_ZOOM;
  }
  if (zoom > MAX_ZOOM) {
    return MAX_ZOOM;
  }
  return zoom;
}

/** The next discrete step from an arbitrary current zoom (which may sit between
 * stops after a fit or a wheel), stepping in (`+1`) or out (`-1`). */
export function stepZoom(zoom: number, direction: 1 | -1): number {
  const current = clampZoom(zoom);
  if (direction > 0) {
    for (const step of ZOOM_STEPS) {
      if (step > current + EPS) {
        return step;
      }
    }
    return MAX_ZOOM;
  }
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i -= 1) {
    if (ZOOM_STEPS[i] < current - EPS) {
      return ZOOM_STEPS[i];
    }
  }
  return MIN_ZOOM;
}

/** A continuous zoom for a wheel delta (natural direction: scroll up / pinch
 * out = zoom in). A non-finite delta leaves the zoom untouched. */
export function wheelZoom(zoom: number, deltaY: number): number {
  if (!Number.isFinite(deltaY)) {
    return clampZoom(zoom);
  }
  return clampZoom(zoom * Math.exp(-deltaY * WHEEL_ZOOM_SENSITIVITY));
}

/** The zoom that fits one page inside the container (with a little breathing
 * room). `pageW`/`pageH` are the page's pixel size at zoom 1 (i.e. at
 * `baseScale`). A zero/absent container or page — jsdom before layout — has no
 * measurable box, so fall back to 1 rather than dividing into a degenerate
 * value. */
export function fitZoom(
  containerW: number,
  containerH: number,
  pageW: number,
  pageH: number,
): number {
  if (!(containerW > 0) || !(containerH > 0) || !(pageW > 0) || !(pageH > 0)) {
    return 1;
  }
  const margin = 0.94;
  const fit = Math.min((containerW * margin) / pageW, (containerH * margin) / pageH);
  return clampZoom(fit);
}

/** Whether a container has a usable measured size for the open-at-Fit pass —
 * both dimensions positive. A zero/negative dimension (a pre-layout first paint,
 * or jsdom's unmeasured layout) is not measurable, so the fit is deferred rather
 * than applied against a bogus zero size. */
export function isMeasurable(width: number, height: number): boolean {
  return width > 0 && height > 0;
}

/** The device px per pt to rasterize at for `zoom`, bounded by the memory cap. */
export function renderScale(baseScale: number, zoom: number): number {
  return Math.min(baseScale * clampZoom(zoom), MAX_RENDER_SCALE);
}

/** The CSS transform factor that displays the DESIRED scale (`baseScale ×
 * zoom`) given pages rasterized at `renderedScale`: 1 when they match (crisp),
 * >1 when the render was capped or a newer zoom has not re-rendered yet
 * (interim magnification), <1 for the brief window a zoom-OUT is still showing
 * the larger previous render. A non-positive `renderedScale` (no render yet) →
 * 1. */
export function cssFactor(baseScale: number, zoom: number, renderedScale: number): number {
  if (!(renderedScale > 0)) {
    return 1;
  }
  return (baseScale * clampZoom(zoom)) / renderedScale;
}

/** New scroll offset that keeps the content point under the cursor stationary
 * when the content scales by `factor`. `cursor` is the cursor's offset from the
 * container's left/top content edge. Clamped at 0 (never a negative scroll). */
export function anchorScroll(scroll: number, cursor: number, factor: number): number {
  const next = (scroll + cursor) * factor - cursor;
  return next > 0 ? next : 0;
}

/** The zoom as a rounded whole percent (the control's display value). */
export function zoomPercent(zoom: number): number {
  return Math.round(clampZoom(zoom) * 100);
}

/** Whether a zoom lands (within tolerance) on one of the discrete steps — the
 * control shows a live custom percent only when it does NOT. */
export function isZoomStep(zoom: number): boolean {
  return ZOOM_STEPS.some((step) => Math.abs(step - zoom) < EPS);
}
