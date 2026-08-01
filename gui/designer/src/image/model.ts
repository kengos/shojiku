// The import DECISION for a sniffed image (accept / downscale / refuse), its
// tunable budgets, and the default draw box an inserted image gets. Framework-
// AND DOM-free so every branch is unit-testable; the DOM glue (probe dimensions,
// canvas re-encode, read bytes) lives behind the injected `ImageCodec` in
// `import.ts`. The neighbours: what an image IS (`sniff.ts`), what it travels as
// (`dataUri.ts`), and how much template room is left (`capacity.ts`).
//
// Security posture: the declared MIME is never trusted — only the sniffed
// bytes decide the format. SVG is passed through verbatim as an inert data-URI
// string (never DOM-parsed here — the engine's subset parser is the render-time
// sanitizer); a raster is size- and pixel-bounded before any canvas allocation.

import type { ImageKind, RasterKind } from './sniff';

export type { ImageKind, RasterKind } from './sniff';
export { sniffImage } from './sniff';

/** Why an import was refused (each maps to a localized notice). */
export type ImportRefusal =
  | 'unsupported_format'
  | 'too_large'
  | 'svg_too_large'
  | 'dimensions'
  | 'decode_failed';

/** Tunable bounds for one import. */
export interface ImageBudgets {
  /** Max encoded bytes for one image (raw, before base64's ×1.37 inflation). */
  readonly maxImageBytes: number;
  /** Longest-edge target (px) when downscaling an over-budget raster. */
  readonly downscaleEdge: number;
  /** JPEG re-encode quality (0..1). */
  readonly jpegQuality: number;
  /** Max intrinsic pixel area (w×h) before refusing — the decompression-bomb
   * guard, checked before any canvas is allocated. */
  readonly maxPixels: number;
}

/** The user-confirmed defaults: ~1 MiB encoded, longest edge 2048px, jpeg
 * quality 0.85, 64 MP pixel-bomb bound. */
export const DEFAULT_IMAGE_BUDGETS: ImageBudgets = {
  maxImageBytes: 1024 * 1024,
  downscaleEdge: 2048,
  jpegQuality: 0.85,
  maxPixels: 64 * 1024 * 1024,
};

/** The decision `importPlan` reaches for a sniffed image. */
export type ImportDecision =
  | { readonly action: 'accept' }
  | {
      readonly action: 'downscale';
      readonly kind: RasterKind;
      readonly target: { readonly w: number; readonly h: number };
      readonly quality: number;
    }
  | { readonly action: 'refuse'; readonly reason: ImportRefusal };

/** Downscale `intrinsic` so its longest edge is at most `maxEdge`, preserving
 * aspect ratio and never upscaling. Dimensions round to whole pixels (≥1). */
export function fitDimensions(
  intrinsic: { readonly w: number; readonly h: number },
  maxEdge: number,
): { readonly w: number; readonly h: number } {
  const longest = Math.max(intrinsic.w, intrinsic.h);
  if (longest <= maxEdge) {
    return { w: intrinsic.w, h: intrinsic.h };
  }
  const ratio = maxEdge / longest;
  return {
    w: Math.max(1, Math.round(intrinsic.w * ratio)),
    h: Math.max(1, Math.round(intrinsic.h * ratio)),
  };
}

/** Decide what to do with a sniffed image. SVG is never rasterized (over budget
 * → refuse); a raster over the byte budget is downscaled (longest edge capped),
 * and an over-pixel-area raster is refused before any canvas is built. A raster
 * whose dimensions could not be probed (`intrinsic === null`) is a decode
 * failure. */
export function importPlan(
  kind: ImageKind,
  byteLength: number,
  intrinsic: { readonly w: number; readonly h: number } | null,
  budgets: ImageBudgets,
): ImportDecision {
  if (kind === 'svg') {
    return byteLength > budgets.maxImageBytes
      ? { action: 'refuse', reason: 'svg_too_large' }
      : { action: 'accept' };
  }
  if (intrinsic === null) {
    return { action: 'refuse', reason: 'decode_failed' };
  }
  if (intrinsic.w * intrinsic.h > budgets.maxPixels) {
    return { action: 'refuse', reason: 'dimensions' };
  }
  if (byteLength <= budgets.maxImageBytes) {
    return { action: 'accept' };
  }
  return {
    action: 'downscale',
    kind,
    target: fitDimensions(intrinsic, budgets.downscaleEdge),
    quality: budgets.jpegQuality,
  };
}

/** The default draw box (pt) for an inserted image: intrinsic pixels converted
 * at 96 dpi (px × 72/96), clamped to the page content width (preserving aspect).
 * An unknown intrinsic (SVG — never raster-probed here) falls back to a square
 * bounded by the page width. Values round to whole points for a clean diff —
 * but the width clamp FLOORS: the content width arrives slightly inflated
 * (page pixels are ceil'd before ÷scale), and rounding up past the true edge
 * makes every full-width insert warn "renders off-sheet" by a fraction of a
 * point (caught in a live-browser smoke). */
export function defaultBox(
  intrinsic: { readonly w: number; readonly h: number } | null,
  pageContentWidthPt: number,
): { readonly w: number; readonly h: number } {
  const maxW = Math.max(1, Math.floor(pageContentWidthPt));
  if (intrinsic === null) {
    const side = Math.min(200, maxW);
    return { w: side, h: side };
  }
  let w = intrinsic.w * 0.75;
  let h = intrinsic.h * 0.75;
  if (w > maxW) {
    h = (h * maxW) / w;
    w = maxW;
  }
  return { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
}
