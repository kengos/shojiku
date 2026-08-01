// Pure align/distribute model for a multi-selection of absolutely placed
// items. Given the selected paths, resolve each to its authored x/y base
// (via `manipulationFor`) and its page rect (via `sourceRect`), keep only the
// movable ones found on the given page, and author a changed-keys-only op
// batch (`setScalar box.x`/`box.y`) that aligns their edges/centers to the
// selection's bounding box, or distributes the middle items at equal gaps. One
// `applyAll` upstream = one undo step (AI parity — the SAME wire a hand-move
// authors). Movable-subset only: a non-movable / relative-unit / ambiguous
// (duplicate path) / hostile item is skipped, never crashes the batch. Like
// the rest of the canvas models, DOM-free and never throws — classification
// reads the DOCUMENT, geometry comes from the engine's inspect rects.

import type { Op, ReadFn } from '@shojiku/designer-core';
import type { BoxRect, PlacedBox } from '../engine/types';
import type { AuthoredLength } from './lengths';
import { manipulationFor } from './manipulate';
import { axisOp, sourceRect } from './plan';

/** The six edge/center alignments (three per axis). */
export type AlignKind = 'left' | 'centerX' | 'right' | 'top' | 'middle' | 'bottom';
/** The two equal-gap distributions. */
export type DistributeKind = 'horizontal' | 'vertical';

/** A resolved target: the movable item's path, its page rect (pt), and the
 * authored x/y bases the changed-keys ops commit against. */
interface Target {
  readonly path: string;
  readonly rect: BoxRect;
  readonly x: AuthoredLength;
  readonly y: AuthoredLength;
}

/** Minimum items an align acts on; distribute needs one more (a fixed pair of
 * ends plus at least one item to move between them). */
export const MIN_ALIGN = 2;
export const MIN_DISTRIBUTE = 3;

/** Whether every coordinate of a rect is finite — a hostile inspect geometry
 * (NaN/inf) is dropped so one bad rect never poisons the group's min/max. */
function finiteRect(r: BoxRect): boolean {
  return (
    Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.w) && Number.isFinite(r.h)
  );
}

/** Resolve `paths` to their movable targets on `pageBoxes`, in order, deduped
 * by path (a caller may pass the primary alongside the multi-set). A path that
 * is not movable, uses a relative unit (`manipulationFor` → not `move`), or
 * has ambiguous/absent geometry (`sourceRect` → null) is skipped. */
export function alignTargets(
  read: ReadFn,
  pageBoxes: readonly PlacedBox[],
  paths: readonly string[],
): readonly Target[] {
  const out: Target[] = [];
  const seen = new Set<string>();
  for (const path of paths) {
    if (seen.has(path)) {
      continue;
    }
    seen.add(path);
    const ability = manipulationFor(read, path);
    if (ability.kind !== 'move') {
      continue;
    }
    const rect = sourceRect(pageBoxes, path);
    if (rect === null || !finiteRect(rect)) {
      continue;
    }
    out.push({ path, rect, x: ability.x, y: ability.y });
  }
  return out;
}

/** How many of `paths` are movable on the page — the toolbar's enable gate
 * (`>= MIN_ALIGN` aligns, `>= MIN_DISTRIBUTE` distributes). */
export function movableCount(
  read: ReadFn,
  pageBoxes: readonly PlacedBox[],
  paths: readonly string[],
): number {
  return alignTargets(read, pageBoxes, paths).length;
}

const HORIZONTAL_ALIGN = new Set<AlignKind>(['left', 'centerX', 'right']);

/** Per-axis accessors so the align/distribute math is written once. */
function axisOf(horizontal: boolean) {
  const key = horizontal ? 'x' : 'y';
  return {
    key,
    pos: (r: BoxRect) => (horizontal ? r.x : r.y),
    size: (r: BoxRect) => (horizontal ? r.w : r.h),
    base: (t: Target) => (horizontal ? t.x : t.y),
  } as const;
}

/** The op moving one target's leading edge to `newLead` (page pt), or null
 * when the value is unchanged / cannot be written back in the authored form. */
function moveOp(
  t: Target,
  key: 'x' | 'y',
  base: AuthoredLength,
  currentLead: number,
  newLead: number,
): Op | null {
  const op = axisOp(t.path, key, base, base.pt + (newLead - currentLead));
  return op ?? null;
}

/** Author the op batch aligning every movable target's edge/center to the
 * selection's bounding box on the relevant axis. Fewer than {@link MIN_ALIGN}
 * movable targets → no ops. An already-aligned item emits nothing (changed
 * keys only), so re-applying is idempotent. */
export function alignOps(
  read: ReadFn,
  pageBoxes: readonly PlacedBox[],
  paths: readonly string[],
  kind: AlignKind,
): readonly Op[] {
  const targets = alignTargets(read, pageBoxes, paths);
  if (targets.length < MIN_ALIGN) {
    return [];
  }
  const a = axisOf(HORIZONTAL_ALIGN.has(kind));
  const lo = Math.min(...targets.map((t) => a.pos(t.rect)));
  const hi = Math.max(...targets.map((t) => a.pos(t.rect) + a.size(t.rect)));
  const ops: Op[] = [];
  for (const t of targets) {
    const s = a.size(t.rect);
    const newLead =
      kind === 'left' || kind === 'top'
        ? lo
        : kind === 'right' || kind === 'bottom'
          ? hi - s
          : (lo + hi) / 2 - s / 2; // centerX / middle
    const op = moveOp(t, a.key, a.base(t), a.pos(t.rect), newLead);
    if (op !== null) {
      ops.push(op);
    }
  }
  return ops;
}

/** Author the op batch distributing the MIDDLE targets at equal edge-to-edge
 * gaps; the two extreme items stay put. Fewer than {@link MIN_DISTRIBUTE}
 * movable targets → no ops. */
export function distributeOps(
  read: ReadFn,
  pageBoxes: readonly PlacedBox[],
  paths: readonly string[],
  kind: DistributeKind,
): readonly Op[] {
  const targets = alignTargets(read, pageBoxes, paths);
  if (targets.length < MIN_DISTRIBUTE) {
    return [];
  }
  const a = axisOf(kind === 'horizontal');
  const sorted = [...targets].sort((p, q) => a.pos(p.rect) - a.pos(q.rect));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const span = a.pos(last.rect) + a.size(last.rect) - a.pos(first.rect);
  const totalSize = sorted.reduce((sum, t) => sum + a.size(t.rect), 0);
  const gap = (span - totalSize) / (sorted.length - 1);
  const ops: Op[] = [];
  let cursor = a.pos(first.rect) + a.size(first.rect) + gap;
  for (let i = 1; i < sorted.length - 1; i += 1) {
    const t = sorted[i];
    const op = moveOp(t, a.key, a.base(t), a.pos(t.rect), cursor);
    if (op !== null) {
      ops.push(op);
    }
    cursor += a.size(t.rect) + gap;
  }
  return ops;
}
