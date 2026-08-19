// The rubber-band gesture's model — the overlay's OTHER drag, on its own
// `useDrag` machine (see `useOverlayDrag`), so a box drag's bubbling pointer
// events never double-fire it. Kept apart from `overlayDragModel` for the same
// reason: it selects, it never edits the document, and it shares nothing with
// the box drag but the context bundle and the pointer conversion.

import { marqueeRect, marqueeSelection } from './marquee';
import type { OverlayDragContext } from './overlayDragModel';
import { clientToPagePt } from './overlayGeometry';
import type { DragPoint } from './useDrag';

/** The rubber-band gesture, captured at press: the press point plus whether
 * Shift added to the current selection. */
export interface MarqueeTask {
  readonly startX: number;
  readonly startY: number;
  readonly additive: boolean;
}

/** Commit a released rubber band: map the swept rect (page pt) to the movable
 * items it intersects. */
export function commitMarquee(
  ctx: OverlayDragContext,
  task: MarqueeTask,
  point: DragPoint,
  onMarquee: (paths: readonly string[], additive: boolean) => void,
): void {
  const start = clientToPagePt(ctx.svgRef.current, ctx.width, ctx.scale, {
    x: task.startX,
    y: task.startY,
  });
  const rect = marqueeRect(start, clientToPagePt(ctx.svgRef.current, ctx.width, ctx.scale, point));
  onMarquee(marqueeSelection(ctx.manipulate.read, ctx.boxes, rect), task.additive);
}
