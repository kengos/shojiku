// Pure smart-guide math: edge/center alignment of a moving box against its
// sibling boxes (page-pt space, from the inspect geometry). An axis guide is
// the nearest sibling edge within the snap threshold; the guide line spans
// both boxes' perpendicular extent. DOM-free, like the rest of the canvas
// models.

import type { BoxRect } from '../engine/types';

/** One alignment guide line, in the same pt space as the boxes. */
export interface GuideLine {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/** The winning alignment on one axis: how far the candidate must shift to
 * align (`offset`), the aligned position (`at`), and the sibling that won. */
export interface AxisGuide {
  readonly offset: number;
  readonly at: number;
  readonly sibling: BoxRect;
}

/** The alignment positions a box offers on an axis: leading edge, center,
 * trailing edge. */
export function alignPositions(rect: BoxRect, axis: 'x' | 'y'): readonly number[] {
  return axis === 'x'
    ? [rect.x, rect.x + rect.w / 2, rect.x + rect.w]
    : [rect.y, rect.y + rect.h / 2, rect.y + rect.h];
}

/** The nearest sibling alignment within `threshold` of any candidate
 * position, or `null` (no snap). A non-positive or non-finite threshold — off,
 * or a hostile ratio upstream — disables guides rather than snapping wildly. */
export function axisGuide(
  candidates: readonly number[],
  siblings: readonly BoxRect[],
  axis: 'x' | 'y',
  threshold: number,
): AxisGuide | null {
  if (!Number.isFinite(threshold) || threshold <= 0) {
    return null;
  }
  let best: AxisGuide | null = null;
  let bestDistance = threshold;
  for (const sibling of siblings) {
    for (const at of alignPositions(sibling, axis)) {
      for (const candidate of candidates) {
        if (!Number.isFinite(candidate)) {
          continue;
        }
        const distance = Math.abs(at - candidate);
        if (distance <= bestDistance) {
          best = { offset: at - candidate, at, sibling };
          bestDistance = distance;
        }
      }
    }
  }
  return best;
}

/** The guide line for an axis hit: perpendicular to the axis at the aligned
 * position, spanning the union of the (snapped) moving box and the winning
 * sibling. */
export function guideLineFor(guide: AxisGuide, ghost: BoxRect, axis: 'x' | 'y'): GuideLine {
  if (axis === 'x') {
    const y1 = Math.min(ghost.y, guide.sibling.y);
    const y2 = Math.max(ghost.y + ghost.h, guide.sibling.y + guide.sibling.h);
    return { x1: guide.at, y1, x2: guide.at, y2 };
  }
  const x1 = Math.min(ghost.x, guide.sibling.x);
  const x2 = Math.max(ghost.x + ghost.w, guide.sibling.x + guide.sibling.w);
  return { x1, y1: guide.at, x2, y2: guide.at };
}
