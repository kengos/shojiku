// The page MARGIN BOX as canvas geometry — the rectangle the coordinate system
// actually starts from.
//
// `x: 0` / `y: 0` mean the margin corner, not the paper corner: the margin box
// IS the engine's coordinate origin (docs/engine/page.md). An absolutely placed
// item is nevertheless bounded by the SHEET (`sheet_overflow`), so sitting
// outside the margins is silent by design — reaching into them is a documented
// escape hatch. Two invisible rectangles, one of which the numbers are measured
// from and the other of which the warnings are; the canvas drew neither, which
// is what made the relationship guesswork.
//
// The engine hands over the RESOLVED margins on `inspect.margin` (post-clamp, so
// `page_margin_too_large` has already been applied). This model turns them into
// the px rectangle the overlay paints. Pure and guard-heavy per the canvas
// posture — hostile or degenerate geometry degrades to `null` (paints nothing)
// before it can reach an SVG attribute, because a `NaN` in a rect attribute is
// exactly how a bad envelope would otherwise surface.

import type { BoxRect, InspectEnvelope } from '../engine/types';

/** The engine's resolved page margins, `[top, right, bottom, left]` in pt.
 * DERIVED from the wire mirror rather than restated: a second declaration of
 * the same tuple would drift silently if the envelope's shape ever changed. */
export type PageMargin = InspectEnvelope['margin'];

/** Room (px) the origin marker needs in the TOP margin band. Below it the
 * marker is dropped — it would otherwise draw off the page or over content —
 * and the rectangle carries the meaning on its own. */
export const ORIGIN_MARKER_PX = 10;

/** What the overlay paints for the margin box. */
export interface MarginGuide {
  /** The margin box in overlay px, relative to the page's top-left corner. */
  readonly rect: BoxRect;
  /** Whether the top margin band has room for the `0,0` origin marker. */
  readonly origin: boolean;
}

/** A finite, strictly positive px extent. */
function positive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/** One margin side as it arrives across the wasm seam: the declared tuple type
 * is what the transport PARSES, never a proof, so the runtime shape is checked
 * here rather than trusted. A negative side cannot reach us from a valid engine
 * (the wire rejects negative margins at parse) but is refused anyway. */
function side(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * The margin-box guide for one page, or `null` when nothing should be painted.
 *
 * `null` covers: no margins at hand, a hostile/degenerate envelope, a page with
 * no usable area left — and the deliberate case of `margin: 0` on every side,
 * which is the documented escape hatch for sheet-absolute coordinates. There the
 * margin box IS the sheet, so there is no invisible inner rectangle to reveal
 * and a guide would only paint a border around the page.
 */
export function marginGuide(
  margin: PageMargin | null | undefined,
  scale: number,
  width: number,
  height: number,
): MarginGuide | null {
  // Checked through an `unknown` alias: the declared tuple is what the transport
  // PARSES rather than a proof, and narrowing a readonly tuple with
  // `Array.isArray` collapses it to `never`. `Array.isArray` must come before the
  // arity check — a hostile envelope carrying a four-CHARACTER string passes a
  // bare length test and then throws on `.every`, a crash rather than a refusal.
  const raw: unknown = margin;
  // `Array.from` before `.every`: `every` SKIPS HOLES, so a sparse array
  // (`length === 4` with an empty slot) would bypass the per-side guard entirely
  // and reach the arithmetic. It would still refuse — a hole destructures to
  // `undefined` and poisons an extent, which `positive` rejects — but the safety
  // would rest on a downstream check instead of the guard this module documents.
  // JSON cannot produce holes and the wasm seam is JSON, so this is not reachable
  // today; it would become reachable if the transport ever moved to
  // structuredClone/postMessage, which preserve them.
  if (!Array.isArray(raw) || raw.length !== 4 || !Array.from(raw).every(side)) {
    return null;
  }
  const [top, right, bottom, left] = raw as unknown as PageMargin;
  // Every side zero is the documented sheet-absolute escape hatch, not an
  // omission — see the doc comment above.
  if (top === 0 && right === 0 && bottom === 0 && left === 0) {
    return null;
  }
  if (!positive(scale) || !positive(width) || !positive(height)) {
    return null;
  }
  const x = left * scale;
  const y = top * scale;
  const w = width - (left + right) * scale;
  const h = height - (top + bottom) * scale;
  if (!positive(w) || !positive(h)) {
    return null;
  }
  return { rect: { x, y, w, h }, origin: y >= ORIGIN_MARKER_PX };
}
