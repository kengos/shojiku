// The overlay drag's model: the canvas manipulation WIRING contract, the
// gesture payloads a press arms, the context the pure models are asked over,
// and what a RELEASE commits (a reorder move, a move/resize op batch, or a
// marquee selection). All slot/plan math stays in `dropPlan`/`planMove`/
// `planResize`/`marquee`; this module only decides which plan to ask for.
//
// The context carries the overlay's SVG REF, not the element: every pointer
// conversion must read the LIVE bounding rect at drop time, so a value read at
// render time would be stale by the time the release runs.

import type { Op, ReadFn } from '@shojiku/designer-core';
import type { RefObject } from 'react';
import type { PlacedBox } from '../engine/types';
import type { MoveItemOp } from '../tree/reorder';
import type { ReorderContext } from './dnd';
import { planDrop } from './dropPlan';
import { type FixedReason, manipulationFor } from './manipulate';
import { marqueeRect, marqueeSelection } from './marquee';
import { clientDeltaToPt, clientToPagePt, GUIDE_THRESHOLD_PX } from './overlayGeometry';
import type { SnapOptions } from './plan';
import { planMove } from './planMove';
import { planResize } from './planResize';
import type { Handle } from './resizeHandles';
import type { DragPoint } from './useDrag';

/** The canvas direct-manipulation wiring: the document read the pure models
 * classify/plan over, the op dispatchers, the refusal report, and the editor
 * grid step (pt; 0 = off — also hides the painted grid). */
export interface CanvasManipulate {
  readonly read: ReadFn;
  readonly onReorder: (op: MoveItemOp) => void;
  /** Commit a move/resize/nudge batch for the box at `path` (ONE
   * transactional applyAll upstream; the path never changes across it). */
  readonly onApply: (path: string, ops: readonly Op[]) => void;
  /** A drag was attempted on a fixed box — surface the reason. */
  readonly onRefused: (reason: FixedReason) => void;
  readonly grid: number;
}

/** One armed drag: what the gesture means, captured at press. Move/resize
 * carry their press point so the drop can compute the full delta. */
export type DragTask =
  | { readonly mode: 'reorder'; readonly path: string }
  | {
      readonly mode: 'move';
      readonly path: string;
      readonly startX: number;
      readonly startY: number;
    }
  | {
      readonly mode: 'resize';
      readonly path: string;
      readonly handle: Handle;
      readonly startX: number;
      readonly startY: number;
    }
  | { readonly mode: 'refused'; readonly reason: FixedReason };

/** The rubber-band gesture, on its OWN drag machine (see `useOverlayDrag`).
 * Carries the press point + whether Shift added to the current selection. */
export interface MarqueeTask {
  readonly startX: number;
  readonly startY: number;
  readonly additive: boolean;
}

/** What every drag computation is asked over. Built once per call, after the
 * wiring has been confirmed present. */
export interface OverlayDragContext {
  /** The overlay's own SVG element — the live rect every conversion reads. */
  readonly svgRef: RefObject<SVGSVGElement | null>;
  readonly boxes: readonly PlacedBox[];
  readonly scale: number;
  readonly width: number;
  readonly manipulate: CanvasManipulate;
}

/** The snap options for a pointer state: grid + the guide threshold converted
 * to pt through the SAME live-rect ratio the pointer conversion uses. */
export function snapOptionsFor(ctx: OverlayDragContext, point: DragPoint): SnapOptions {
  const unit = clientDeltaToPt(
    ctx.svgRef.current,
    ctx.width,
    ctx.scale,
    { x: 0, y: 0 },
    { x: 1, y: 0 },
  ).x;
  return {
    grid: ctx.manipulate.grid,
    threshold: GUIDE_THRESHOLD_PX * unit,
    bypass: point.alt === true,
    axisLock: point.shift === true,
  };
}

/** The reorder context for `path`, or `null` when it no longer classifies as
 * reorderable — the shape `planDrop` asks its caller for. */
export function reorderContextFor(ctx: OverlayDragContext, path: string): ReorderContext | null {
  const ability = manipulationFor(ctx.manipulate.read, path);
  return ability.kind === 'reorder' ? ability.context : null;
}

/** Commit a released box drag. A refused gesture does nothing; a reorder or
 * move/resize that produced no change is treated as a click (the drag machine
 * suppressed the trailing click, so the pressed item is selected explicitly
 * rather than leaving nothing selected). */
export function commitDrag(
  ctx: OverlayDragContext,
  task: DragTask,
  point: DragPoint,
  onSelect: (path: string) => void,
): void {
  if (task.mode === 'refused') {
    return;
  }
  if (task.mode === 'reorder') {
    const local = clientToPagePt(ctx.svgRef.current, ctx.width, ctx.scale, point);
    const plan = planDrop((path) => reorderContextFor(ctx, path), ctx.boxes, task.path, local);
    if (plan !== null && plan.op !== null) {
      ctx.manipulate.onReorder(plan.op);
    } else {
      onSelect(task.path);
    }
    return;
  }
  const delta = clientDeltaToPt(
    ctx.svgRef.current,
    ctx.width,
    ctx.scale,
    { x: task.startX, y: task.startY },
    point,
  );
  const opts = snapOptionsFor(ctx, point);
  const plan =
    task.mode === 'move'
      ? planMove(ctx.manipulate.read, ctx.boxes, task.path, delta, opts)
      : planResize(ctx.manipulate.read, ctx.boxes, task.path, task.handle, delta, opts);
  if (plan !== null && plan.ops.length > 0) {
    ctx.manipulate.onApply(task.path, plan.ops);
  } else {
    onSelect(task.path);
  }
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
