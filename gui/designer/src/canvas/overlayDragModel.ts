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
import { seqPosition } from '../tree/reorder';
import type { ReorderContext } from './dnd';
import { planDrop } from './dropPlan';
import { type FixedReason, manipulationFor } from './manipulate';
import type { PageMargin } from './marginGuide';
import { clientDeltaToPt, clientToPagePt, GUIDE_THRESHOLD_PX } from './overlayGeometry';
import type { SnapOptions } from './plan';
import { planMove } from './planMove';
import { planResize } from './planResize';
import { reparentedPath, reparentOps } from './reparent';
import { type PageSize, planReparent, type ReparentPlan } from './reparentTarget';
import type { Handle } from './resizeHandles';
import type { DragPoint } from './useDrag';

/** The canvas direct-manipulation wiring: the document read the pure models
 * classify/plan over, the op dispatchers, the refusal report, and the editor
 * grid step (pt; 0 = off — also hides the painted grid). */
export interface CanvasManipulate {
  readonly read: ReadFn;
  /** Commit a move that CHANGES the item's path — a same-parent reorder (one
   * `moveItem`) or a cross-parent one (the box keys the crossing invalidates,
   * then the `moveItem`). ONE transactional batch upstream, and the selection
   * travels to `selectPath`. */
  readonly onReorder: (ops: readonly Op[], selectPath: string) => void;
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

/** What every drag computation is asked over. Built once per call, after the
 * wiring has been confirmed present. */
export interface OverlayDragContext {
  /** The overlay's own SVG element — the live rect every conversion reads. */
  readonly svgRef: RefObject<SVGSVGElement | null>;
  readonly boxes: readonly PlacedBox[];
  readonly scale: number;
  readonly width: number;
  /** The page in pt — the band regions a cross-parent drop can land in are
   * measured from it and the margins. */
  readonly page: PageSize;
  readonly margin: PageMargin | null;
  readonly manipulate: CanvasManipulate;
}

/** The cross-parent move a release at `point` would commit, or `null` when
 * the pointer is not over a receiver that would take this item — including
 * the common case of its OWN parent, which the shipped same-parent paths
 * below then handle. */
export function reparentAt(
  ctx: OverlayDragContext,
  path: string,
  point: { readonly x: number; readonly y: number },
): {
  readonly ops: readonly Op[];
  readonly selectPath: string;
  /** The landing, so the live visuals need no second plan — and so there is
   * no second refusal check for a plan this one already resolved. */
  readonly plan: ReparentPlan;
} | null {
  const plan = planReparent(ctx.manipulate.read, ctx.boxes, point, ctx.page, ctx.margin);
  if (plan === null) {
    return null;
  }
  const ops = reparentOps(ctx.manipulate.read, path, plan.target, ctx.margin);
  const position = seqPosition(path);
  return ops === null || position === null
    ? null
    : {
        ops,
        selectPath: reparentedPath(
          position.parent,
          position.index,
          plan.target.receiver.items,
          plan.target.index,
        ),
        plan,
      };
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
  const local = clientToPagePt(ctx.svgRef.current, ctx.width, ctx.scale, point);
  // A drop over a DIFFERENT parent is a reparent for either RELOCATING
  // gesture: an order-placed item reorders within its own parent and reparents
  // out of it, and an absolutely placed one moves within its own parent and
  // reparents out of it. `reparentAt` returns null for the own-parent case,
  // which is what hands the release back to the shipped paths below.
  //
  // A RESIZE is not a relocation and is excluded by name. Its pointer is a
  // HANDLE, and leaving the item's own box is exactly what resizing looks
  // like — so the owner under it says nothing about where the item belongs,
  // and probing it would turn "make this taller" into "move this out", taking
  // the item's authored x/y with it.
  const moved = task.mode === 'resize' ? null : reparentAt(ctx, task.path, local);
  if (moved !== null) {
    ctx.manipulate.onReorder(moved.ops, moved.selectPath);
    return;
  }
  if (task.mode === 'reorder') {
    const plan = planDrop((path) => reorderContextFor(ctx, path), ctx.boxes, task.path, local);
    if (plan !== null && plan.op !== null) {
      ctx.manipulate.onReorder([plan.op], `${plan.op.path}[${plan.op.to}]`);
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
