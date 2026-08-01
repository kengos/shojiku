// The two ways an absolutely placed box gets REPOSITIONED: a pointer drag
// (guide snap wins over grid snap, per axis; Shift locks the dominant axis)
// and an arrow-key nudge (a straight authored-space delta — the nudge IS the
// step, so it never snaps). Both commit changed keys only, so an untouched
// axis never dirties the diff, and both refuse rather than guess when the drag
// stopped being valid.

import type { Op, ReadFn } from '@shojiku/designer-core';
import type { BoxRect, PlacedBox } from '../engine/types';
import { alignPositions, axisGuide, type GuideLine, guideLineFor } from './guides';
import { snapLength } from './lengths';
import { manipulationFor } from './manipulate';
import { axisOp, guideTargets, type ManipulationPlan, type SnapOptions, sourceRect } from './plan';

/** Plan a move drag at `delta` (page pt from the drag start): guide snap
 * (nearest sibling edge/center within threshold) wins over grid snap, per
 * axis; the commit writes only the axes whose committed value changed.
 * `null` when the drag is not (or no longer) valid — the path stopped
 * classifying movable after an edit, geometry is ambiguous, or the pointer
 * is hostile. */
export function planMove(
  read: ReadFn,
  pageBoxes: readonly PlacedBox[],
  path: string,
  delta: { readonly x: number; readonly y: number },
  opts: SnapOptions,
): ManipulationPlan | null {
  if (!Number.isFinite(delta.x) || !Number.isFinite(delta.y)) {
    return null;
  }
  const ability = manipulationFor(read, path);
  if (ability.kind !== 'move') {
    return null;
  }
  const source = sourceRect(pageBoxes, path);
  if (source === null) {
    return null;
  }
  const baseX = ability.x;
  const baseY = ability.y;
  const proposed: BoxRect = {
    x: source.x + delta.x,
    y: source.y + delta.y,
    w: source.w,
    h: source.h,
  };
  // Shift axis-lock: constrain the move to its dominant axis; the minor axis
  // stays pinned to its base (no delta, no guide, no grid pull — "slide it
  // sideways, keep y"). A tie keeps x. Exactly one lock flag holds when armed.
  const lockMinor = opts.axisLock === true;
  const lockY = lockMinor && Math.abs(delta.x) >= Math.abs(delta.y);
  const lockX = lockMinor && Math.abs(delta.x) < Math.abs(delta.y);
  const siblings = guideTargets(pageBoxes, path, opts.bypass);
  const guideX = lockX
    ? null
    : axisGuide(alignPositions(proposed, 'x'), siblings, 'x', opts.threshold);
  const guideY = lockY
    ? null
    : axisGuide(alignPositions(proposed, 'y'), siblings, 'y', opts.threshold);
  const step = opts.bypass ? 0 : opts.grid;
  const targetX = lockX
    ? baseX.pt
    : guideX !== null
      ? baseX.pt + delta.x + guideX.offset
      : snapLength(baseX.pt + delta.x, step);
  const targetY = lockY
    ? baseY.pt
    : guideY !== null
      ? baseY.pt + delta.y + guideY.offset
      : snapLength(baseY.pt + delta.y, step);
  const ghost: BoxRect = {
    x: source.x + (targetX - baseX.pt),
    y: source.y + (targetY - baseY.pt),
    w: source.w,
    h: source.h,
  };
  const opX = axisOp(path, 'x', baseX, targetX);
  const opY = axisOp(path, 'y', baseY, targetY);
  if (opX === undefined || opY === undefined) {
    return null;
  }
  const ops: Op[] = [];
  if (opX !== null) {
    ops.push(opX);
  }
  if (opY !== null) {
    ops.push(opY);
  }
  const guides: GuideLine[] = [];
  if (guideX !== null) {
    guides.push(guideLineFor(guideX, ghost, 'x'));
  }
  if (guideY !== null) {
    guides.push(guideLineFor(guideY, ghost, 'y'));
  }
  return { ops, ghost, guides };
}

/** The op batch an arrow-key nudge commits: a straight authored-space delta
 * (no snapping — the nudge IS the step), changed-keys-only like a drag.
 * `null` when the box is not movable or a value cannot be written back. */
export function nudgeOps(read: ReadFn, path: string, dx: number, dy: number): readonly Op[] | null {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
    return null;
  }
  const ability = manipulationFor(read, path);
  if (ability.kind !== 'move') {
    return null;
  }
  const opX = axisOp(path, 'x', ability.x, ability.x.pt + dx);
  const opY = axisOp(path, 'y', ability.y, ability.y.pt + dy);
  if (opX === undefined || opY === undefined) {
    return null;
  }
  const ops: Op[] = [];
  if (opX !== null) {
    ops.push(opX);
  }
  if (opY !== null) {
    ops.push(opY);
  }
  return ops;
}
