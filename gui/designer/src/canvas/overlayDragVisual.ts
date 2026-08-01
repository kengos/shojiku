// What a LIVE box drag paints: the dragged path, the reorder insertion
// indicator OR the move/resize ghost plus its alignment guides. Every value is
// recomputed from the CURRENT context each render, never captured at drag
// start, so a mid-drag edit that invalidates the drag degrades to a visual
// no-op instead of painting (and later committing) stale geometry.

import type { BoxRect } from '../engine/types';
import { type IndicatorLine, planDrop } from './dropPlan';
import type { GuideLine } from './guides';
import {
  type DragTask,
  type OverlayDragContext,
  reorderContextFor,
  snapOptionsFor,
} from './overlayDragModel';
import { clientDeltaToPt, clientToPagePt } from './overlayGeometry';
import type { ManipulationPlan } from './plan';
import { planMove } from './planMove';
import { planResize } from './planResize';
import type { DragSession } from './useDrag';

export interface DragVisual {
  /** The path being dragged — null when the drag stopped being valid. */
  readonly dragPath: string | null;
  /** The reorder insertion indicator, in page pt. */
  readonly indicator: IndicatorLine | null;
  /** The move/resize/reorder ghost outline, in page pt (the caller scales it). */
  readonly ghost: BoxRect | null;
  /** The winning alignment guides, in page pt. */
  readonly guides: readonly GuideLine[];
}

/** Nothing painted — idle, below the drag threshold, a refused gesture, or a
 * drag that stopped resolving to a plan. */
export const NO_DRAG_VISUAL: DragVisual = {
  dragPath: null,
  indicator: null,
  ghost: null,
  guides: [],
};

/** The reorder gesture's visuals: the insertion line the drop would take, and
 * a ghost that follows the pointer from the dragged box's own rect. */
function reorderVisual(
  ctx: OverlayDragContext,
  session: DragSession<DragTask>,
  path: string,
): DragVisual {
  const point = clientToPagePt(ctx.svgRef.current, ctx.width, ctx.scale, session.point);
  const plan = planDrop((p) => reorderContextFor(ctx, p), ctx.boxes, path, point);
  if (plan === null) {
    return NO_DRAG_VISUAL;
  }
  const start = clientToPagePt(ctx.svgRef.current, ctx.width, ctx.scale, session.start);
  return {
    dragPath: path,
    indicator: plan.line,
    ghost: {
      x: plan.source.x + (point.x - start.x),
      y: plan.source.y + (point.y - start.y),
      w: plan.source.w,
      h: plan.source.h,
    },
    guides: [],
  };
}

/** The started drag's visual state. `NO_DRAG_VISUAL` when the gesture paints
 * nothing (a refusal) or the drag no longer resolves to a plan. */
export function dragVisual(ctx: OverlayDragContext, session: DragSession<DragTask>): DragVisual {
  const task = session.payload;
  if (task.mode === 'refused') {
    return NO_DRAG_VISUAL;
  }
  if (task.mode === 'reorder') {
    return reorderVisual(ctx, session, task.path);
  }
  const delta = clientDeltaToPt(
    ctx.svgRef.current,
    ctx.width,
    ctx.scale,
    session.start,
    session.point,
  );
  const opts = snapOptionsFor(ctx, session.point);
  const plan: ManipulationPlan | null =
    task.mode === 'move'
      ? planMove(ctx.manipulate.read, ctx.boxes, task.path, delta, opts)
      : planResize(ctx.manipulate.read, ctx.boxes, task.path, task.handle, delta, opts);
  if (plan === null) {
    return NO_DRAG_VISUAL;
  }
  return { dragPath: task.path, indicator: null, ghost: plan.ghost, guides: plan.guides };
}
