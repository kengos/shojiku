// Pure canvas geometry: pt→device-px scaling. The overlay must scale by the
// SAME `scale` the engine rasterized at, so the SVG rects line up with the
// painted pixels. (Selection is per-rect click/keyboard in `BoxOverlay`, so no
// coordinate hit-testing lives here.)

import type { BoxRect } from '../engine/types';

/** Scale a pt-space rect to device pixels. */
export function scaleRect(rect: BoxRect, scale: number): BoxRect {
  return { x: rect.x * scale, y: rect.y * scale, w: rect.w * scale, h: rect.h * scale };
}
