// The resize drag's plan: per axis, a leading-edge handle moves position AND
// size while a trailing-edge one moves size only, the moving edge guide-snaps
// to sibling edges (else the moved value grid-snaps), and the size clamps at
// the minimum a drag may leave. Only the keys the handle TOUCHES must be
// writable in their authored form — an untouched relative `w` never blocks a
// vertical drag — and the commit stays changed-keys-only like every other plan.

import type { Op, ReadFn } from '@shojiku/designer-core';
import type { BoxRect, PlacedBox } from '../engine/types';
import { type AxisGuide, axisGuide, type GuideLine, guideLineFor } from './guides';
import { ptLength, snapLength } from './lengths';
import { baseLength, manipulationFor, record } from './manipulate';
import {
  axisOp,
  guideTargets,
  type ManipulationPlan,
  MIN_SIZE_PT,
  type SnapOptions,
  sourceRect,
} from './plan';
import { type Handle, handleKeys } from './resizeHandles';

interface AxisResize {
  readonly position: number;
  readonly size: number;
  readonly guide: AxisGuide | null;
}

/** One axis of a resize: leading-edge handles move position + size, trailing-
 * edge handles move size only; the moving edge guide-snaps to sibling edges,
 * else the moved value grid-snaps; the size clamps at {@link MIN_SIZE_PT}. */
function resizeAxis(
  leading: boolean,
  trailing: boolean,
  basePos: number,
  baseSize: number,
  sourcePos: number,
  sourceSize: number,
  delta: number,
  axis: 'x' | 'y',
  siblings: readonly BoxRect[],
  opts: SnapOptions,
): AxisResize {
  const step = opts.bypass ? 0 : opts.grid;
  if (trailing) {
    const edge = sourcePos + sourceSize + delta;
    const guide = axisGuide([edge], siblings, axis, opts.threshold);
    const size =
      guide !== null ? baseSize + delta + guide.offset : snapLength(baseSize + delta, step);
    return { position: basePos, size: Math.max(size, MIN_SIZE_PT), guide };
  }
  if (leading) {
    const edge = sourcePos + delta;
    const guide = axisGuide([edge], siblings, axis, opts.threshold);
    const position =
      guide !== null ? basePos + delta + guide.offset : snapLength(basePos + delta, step);
    const size = Math.max(baseSize - (position - basePos), MIN_SIZE_PT);
    return { position: basePos + (baseSize - size), size, guide };
  }
  return { position: basePos, size: baseSize, guide: null };
}

/** Plan a resize drag from `handle` at `delta` (page pt). Same validity /
 * changed-keys-only rules as `planMove`; a handle touching a key whose
 * authored form cannot be written back (relative units) yields `null`. */
export function planResize(
  read: ReadFn,
  pageBoxes: readonly PlacedBox[],
  path: string,
  handle: Handle,
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
  let child: Record<string, unknown> | undefined;
  try {
    child = record(read(path));
  } catch {
    return null;
  }
  const box = record(child?.box) ?? {};
  const keys = handleKeys(handle);
  // Only the touched size keys must be writable in their authored form — an
  // untouched relative `w` (say `"100%"` under an n/s handle) never blocks
  // the drag; its base is a placeholder that emits no op.
  const baseW = keys.includes('w') ? baseLength(box.w, source.w) : ptLength(source.w);
  const baseH = keys.includes('h') ? baseLength(box.h, source.h) : ptLength(source.h);
  if (baseW === null || baseH === null) {
    return null;
  }
  const baseX = ability.x;
  const baseY = ability.y;
  const siblings = guideTargets(pageBoxes, path, opts.bypass);
  const horizontal = resizeAxis(
    handle.includes('w'),
    handle.includes('e'),
    baseX.pt,
    baseW.pt,
    source.x,
    source.w,
    delta.x,
    'x',
    siblings,
    opts,
  );
  const vertical = resizeAxis(
    handle.includes('n'),
    handle.includes('s'),
    baseY.pt,
    baseH.pt,
    source.y,
    source.h,
    delta.y,
    'y',
    siblings,
    opts,
  );
  const ghost: BoxRect = {
    x: source.x + (horizontal.position - baseX.pt),
    y: source.y + (vertical.position - baseY.pt),
    w: source.w + (horizontal.size - baseW.pt),
    h: source.h + (vertical.size - baseH.pt),
  };
  const targets = {
    x: { base: baseX, target: horizontal.position },
    y: { base: baseY, target: vertical.position },
    w: { base: baseW, target: horizontal.size },
    h: { base: baseH, target: vertical.size },
  } as const;
  const ops: Op[] = [];
  for (const key of keys) {
    const entry = targets[key];
    const op = axisOp(path, key, entry.base, entry.target);
    if (op === undefined) {
      return null;
    }
    if (op !== null) {
      ops.push(op);
    }
  }
  const guides: GuideLine[] = [];
  if (horizontal.guide !== null) {
    guides.push(guideLineFor(horizontal.guide, ghost, 'x'));
  }
  if (vertical.guide !== null) {
    guides.push(guideLineFor(vertical.guide, ghost, 'y'));
  }
  return { ops, ghost, guides };
}
