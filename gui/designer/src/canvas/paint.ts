// Painting a raw-RGBA page onto a 2D canvas. Kept out of the component so both
// branches (no 2D backend / real context) are unit-testable with a fake canvas
// — jsdom's `getContext('2d')` returns null without a native backend, which is
// exactly the guard's real case.

import type { RawPage } from '../engine/types';

/** Paint one page's RGBA bytes to the canvas at its natural size. No-op when
 * the canvas has no 2D context (e.g. jsdom without a native backend). */
export function paintPage(canvas: HTMLCanvasElement, page: RawPage): void {
  const ctx = canvas.getContext('2d');
  if (ctx === null) {
    return;
  }
  const image = new ImageData(new Uint8ClampedArray(page.rgba), page.width, page.height);
  ctx.putImageData(image, 0, 0);
}
