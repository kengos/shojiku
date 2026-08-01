// Pure rubber-band (marquee) selection model: the rect two drag points span,
// an AABB overlap test, and the MOVABLE items whose page rect the marquee
// intersects — the canvas-local multi-selection a rubber-band drag produces.
// Movable-only (align/distribute act on that subset, and a marquee over a busy
// area should not sweep in every nested container/text box). DOM-free like the
// rest of the canvas models: classification reads the DOCUMENT, geometry comes
// from the inspect rects, and a hostile/non-finite rect never throws — it just
// does not overlap.

import type { ReadFn } from '@shojiku/designer-core';
import type { BoxRect, PlacedBox } from '../engine/types';
import { manipulationFor } from './manipulate';
import type { DragPoint } from './useDrag';

/** The rect spanned by two page-pt points, normalized so w/h are ≥ 0. */
export function marqueeRect(a: DragPoint, b: DragPoint): BoxRect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  };
}

function allFinite(r: BoxRect): boolean {
  return (
    Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.w) && Number.isFinite(r.h)
  );
}

/** Whether two rects overlap in area. Edge-touching counts as separated (no
 * overlap), and a non-finite coordinate on either rect never overlaps — a
 * hostile inspect geometry cannot force a selection. */
export function rectsOverlap(a: BoxRect, b: BoxRect): boolean {
  if (!allFinite(a) || !allFinite(b)) {
    return false;
  }
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}

/** The movable item paths on `pageBoxes` whose border rect the marquee `rect`
 * intersects, in walk order, deduped by path. Non-movable items (containers,
 * flow children, fixed) are excluded so the result is exactly what
 * align/distribute can act on. */
export function marqueeSelection(
  read: ReadFn,
  pageBoxes: readonly PlacedBox[],
  rect: BoxRect,
): readonly string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const box of pageBoxes) {
    if (seen.has(box.path)) {
      continue;
    }
    if (manipulationFor(read, box.path).kind !== 'move') {
      continue;
    }
    if (!rectsOverlap(rect, box.border)) {
      continue;
    }
    seen.add(box.path);
    out.push(box.path);
  }
  return out;
}
