// Where a pointer-anchored surface actually sits. The click point is the wish;
// a surface that would hang off the right or bottom edge is pulled back inside
// the viewport, so the row a user is reaching for is always on screen. A
// surface LARGER than the viewport pins to the margin rather than to a negative
// coordinate — its first row stays reachable and the far edge clips instead.

export interface AnchorPoint {
  readonly x: number;
  readonly y: number;
}

export interface AnchorSize {
  readonly width: number;
  readonly height: number;
}

/** The gap kept between the surface and the viewport edge, in client px. */
export const ANCHOR_MARGIN_PX = 8;

export function clampToViewport(
  at: AnchorPoint,
  size: AnchorSize,
  viewport: AnchorSize,
): AnchorPoint {
  return {
    x: clampAxis(at.x, size.width, viewport.width),
    y: clampAxis(at.y, size.height, viewport.height),
  };
}

function clampAxis(value: number, extent: number, limit: number): number {
  const furthest = limit - extent - ANCHOR_MARGIN_PX;
  // A surface bigger than the viewport leaves no room to pull back into: start
  // it at the margin rather than off the near edge.
  return furthest < ANCHOR_MARGIN_PX ? ANCHOR_MARGIN_PX : Math.min(value, furthest);
}
