// Pure canvas geometry: pt→device-px scaling. The overlay must scale by the
// SAME `scale` the engine rasterized at, so the SVG rects line up with the
// painted pixels. (Selection is per-rect click/keyboard in `BoxOverlay`, so no
// coordinate hit-testing lives here.)

import type { BoxRect } from '../engine/types';

/** Scale a pt-space rect to device pixels. */
export function scaleRect(rect: BoxRect, scale: number): BoxRect {
  return { x: rect.x * scale, y: rect.y * scale, w: rect.w * scale, h: rect.h * scale };
}

/** The on-screen extent, in device px, a collapsed overlay side is grown to. */
export const MIN_HIT_PX = 6;

/** An overlay rect with any side that is EXACTLY zero grown to `MIN_HIT_PX`
 * about its own centre, so the band straddles what it represents.
 *
 * An axis-aligned `line` has a zero-thickness placement box by design: the box
 * index reports the endpoint bounding box and explicitly hands the hit
 * tolerance to the overlay (`docs/engine/line.md`). An SVG `rect` with a zero
 * side is neither rendered nor pointer-targetable, so without this a rule has
 * no selection outline and can never be clicked on the canvas.
 *
 * Deliberately narrow: only an EXACTLY zero side grows, which is the shape the
 * engine documents. A merely TINY box (a hairline rect at a low zoom) is still
 * hard to hit and is not addressed here — widening the predicate would move
 * every small item's outline, which is a separate decision. */
export function hitRect(rect: BoxRect): BoxRect {
  const grow = (lo: number, size: number): [number, number] =>
    size === 0 ? [lo - MIN_HIT_PX / 2, MIN_HIT_PX] : [lo, size];
  const [x, w] = grow(rect.x, rect.w);
  const [y, h] = grow(rect.y, rect.h);
  return { x, y, w, h };
}
