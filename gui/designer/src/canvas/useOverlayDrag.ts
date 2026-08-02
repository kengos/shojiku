// The canvas overlay's pointer WIRING: the box drag machine (move / resize /
// reorder, and a typed refusal on a fixed box) and the rubber-band marquee on
// its OWN machine, so a box drag's bubbling pointer events never double-fire
// it. What a release commits and what a live drag paints are the pure
// `overlayDragModel` / `overlayDragVisual` functions over one context bundle;
// this hook only owns the machines, the once-per-session refusal report, and
// the page-pt → overlay-px scaling of what it hands back.

import { type RefObject, useCallback, useEffect, useRef } from 'react';
import type { BoxRect, PlacedBox } from '../engine/types';
import type { IndicatorLine } from './dropPlan';
import { scaleRect } from './geometry';
import type { GuideLine } from './guides';
import { marqueeRect } from './marquee';
import {
  type CanvasManipulate,
  commitDrag,
  commitMarquee,
  type DragTask,
  type MarqueeTask,
  type OverlayDragContext,
} from './overlayDragModel';
import { dragVisual, NO_DRAG_VISUAL } from './overlayDragVisual';
import { clientToPagePt } from './overlayGeometry';
import { type DragPoint, type UseDrag, useDrag } from './useDrag';

export interface OverlayDragOptions {
  /** The overlay's own SVG element — the live rect every conversion reads. */
  readonly svgRef: RefObject<SVGSVGElement | null>;
  readonly boxes: readonly PlacedBox[];
  readonly scale: number;
  readonly width: number;
  readonly manipulate: CanvasManipulate | undefined;
  readonly onSelect: (path: string) => void;
  readonly onMarquee: ((paths: readonly string[], additive: boolean) => void) | undefined;
}

export interface OverlayDrag {
  /** The box drag machine (move / resize / reorder / refused). */
  readonly drag: UseDrag<DragTask>;
  /** The rubber-band machine (its own, so bubbling box events miss it). */
  readonly marquee: UseDrag<MarqueeTask>;
  /** The path being dragged — null when idle, below threshold, or invalid. */
  readonly dragPath: string | null;
  /** The reorder insertion indicator, in page pt. */
  readonly indicator: IndicatorLine | null;
  /** The move/resize ghost outline, already scaled to overlay px. */
  readonly ghostPx: BoxRect | null;
  /** The winning alignment guides, in page pt. */
  readonly guides: readonly GuideLine[];
  /** The active rubber-band rect, already scaled to overlay px. */
  readonly marqueePx: BoxRect | null;
}

export function useOverlayDrag({
  svgRef,
  boxes,
  scale,
  width,
  manipulate,
  onSelect,
  onMarquee,
}: OverlayDragOptions): OverlayDrag {
  const onDrop = useCallback(
    (task: DragTask, point: DragPoint) => {
      // The wiring may have been withdrawn mid-drag (a prop change); the
      // release must then do nothing rather than act on stale wiring.
      if (manipulate === undefined) {
        return;
      }
      commitDrag({ svgRef, boxes, scale, width, manipulate }, task, point, onSelect);
    },
    [manipulate, boxes, width, scale, onSelect, svgRef],
  );
  const drag = useDrag<DragTask>(onDrop);

  // The rubber-band gesture on its OWN machine (see MarqueeTask): a drop maps
  // the swept rect (page pt) to the movable items it intersects. A withdrawn
  // wiring mid-drag (prop change) makes the release a no-op.
  const onMarqueeDrop = useCallback(
    (task: MarqueeTask, point: DragPoint) => {
      if (manipulate === undefined || onMarquee === undefined) {
        return;
      }
      commitMarquee({ svgRef, boxes, scale, width, manipulate }, task, point, onMarquee);
    },
    [manipulate, boxes, width, scale, onMarquee, svgRef],
  );
  const marquee = useDrag<MarqueeTask>(onMarqueeDrop);

  // A drag attempt on a fixed box surfaces its reason ONCE per session (an
  // effect — the report reaches the chrome outside this render).
  const session = drag.session;
  const refusalNotified = useRef(false);
  useEffect(() => {
    if (session === null) {
      refusalNotified.current = false;
      return;
    }
    if (
      session.started &&
      session.payload.mode === 'refused' &&
      !refusalNotified.current &&
      manipulate !== undefined
    ) {
      refusalNotified.current = true;
      manipulate.onRefused(session.payload.reason);
    }
  }, [session, manipulate]);

  // The active drag's visual state, recomputed from CURRENT props (never
  // captured at drag start). All null when idle, below the threshold, or when
  // the drag stopped being valid.
  const context: OverlayDragContext | null =
    manipulate === undefined ? null : { svgRef, boxes, scale, width, manipulate };
  const visual =
    session?.started === true && context !== null ? dragVisual(context, session) : NO_DRAG_VISUAL;

  // The active rubber-band rect (its own machine), page pt → scaled px.
  const marqueeSession = marquee.session;
  const marqueeBox: BoxRect | null =
    marqueeSession?.started === true
      ? marqueeRect(
          clientToPagePt(svgRef.current, width, scale, marqueeSession.start),
          clientToPagePt(svgRef.current, width, scale, marqueeSession.point),
        )
      : null;

  return {
    drag,
    marquee,
    dragPath: visual.dragPath,
    indicator: visual.indicator,
    ghostPx: visual.ghost === null ? null : scaleRect(visual.ghost, scale),
    guides: visual.guides,
    marqueePx: marqueeBox === null ? null : scaleRect(marqueeBox, scale),
  };
}
