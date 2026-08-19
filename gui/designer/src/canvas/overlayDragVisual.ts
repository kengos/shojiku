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
  reparentAt,
  snapOptionsFor,
} from './overlayDragModel';
import { clientDeltaToPt, clientToPagePt } from './overlayGeometry';
import { type ManipulationPlan, sourceRect } from './plan';
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
  /** The receiving owner a cross-parent drop would land in, outlined in page
   * pt. `null` for a same-parent drag — nothing is being entered. */
  readonly region: BoxRect | null;
  /** This drop would DROP the item's authored `x`/`y` — the receiver takes
   * position over from it. The one value-destroying thing a drop does, so the
   * overlay says it before the release. */
  readonly clearsPosition: boolean;
}

/** Nothing painted — idle, below the drag threshold, a refused gesture, or a
 * drag that stopped resolving to a plan. */
export const NO_DRAG_VISUAL: DragVisual = {
  dragPath: null,
  indicator: null,
  ghost: null,
  guides: [],
  region: null,
  clearsPosition: false,
};

/** What a cross-parent drop would paint — the receiving owner's outline, and
 * the insertion line inside it when its children are order-placed. `null`
 * when the pointer is over the item's own parent (or nothing that would take
 * it), so the same-parent visuals below take over unchanged. */
function reparentVisual(
  ctx: OverlayDragContext,
  path: string,
  point: { readonly x: number; readonly y: number },
  ghost: BoxRect | null,
): DragVisual | null {
  const moved = reparentAt(ctx, path, point);
  return moved === null
    ? null
    : {
        dragPath: path,
        indicator: moved.plan.line,
        ghost,
        guides: [],
        region: moved.plan.region,
        // The batch clears a key only when the item actually authored one, so
        // reading the ops is what makes the warning honest rather than a
        // blanket "entering a container".
        clearsPosition: moved.ops.some((op) => op.op === 'removeKey'),
      };
}

/** The dragged box's own rect, carried by the pointer delta. */
function ghostAt(source: BoxRect, from: DragPointPt, to: DragPointPt): BoxRect {
  return { x: source.x + (to.x - from.x), y: source.y + (to.y - from.y), w: source.w, h: source.h };
}

interface DragPointPt {
  readonly x: number;
  readonly y: number;
}

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
  const ghost = ghostAt(plan.source, start, point);
  return (
    reparentVisual(ctx, path, point, ghost) ?? {
      dragPath: path,
      indicator: plan.line,
      ghost,
      guides: [],
      region: null,
      clearsPosition: false,
    }
  );
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
  const point = clientToPagePt(ctx.svgRef.current, ctx.width, ctx.scale, session.point);
  // Only a RELOCATING gesture paints a receiver — a resize's handle routinely
  // leaves the item's own box without meaning anything about its parent (see
  // `commitDrag`, which excludes it from the release for the same reason).
  const source = task.mode === 'move' ? sourceRect(ctx.boxes, task.path) : null;
  const entering =
    source === null
      ? null
      : reparentVisual(
          ctx,
          task.path,
          point,
          ghostAt(
            source,
            clientToPagePt(ctx.svgRef.current, ctx.width, ctx.scale, session.start),
            point,
          ),
        );
  if (entering !== null) {
    return entering;
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
  return {
    dragPath: task.path,
    indicator: null,
    ghost: plan.ghost,
    guides: plan.guides,
    region: null,
    clearsPosition: false,
  };
}
