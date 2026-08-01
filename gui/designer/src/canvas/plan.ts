// The vocabulary every canvas manipulation plan is expressed in — the editor
// grid steps a drag quantizes against, the snap options a pointer state
// resolves to, the plan shape a drag returns — plus the authored-space commit
// math each plan shares: the dragged box's page rect, its sibling guide
// targets, and the ONE changed-keys-only op an axis produces. Pure: no DOM, no
// re-derived layout (geometry comes from the engine's inspect boxes).

import type { Op } from '@shojiku/designer-core';
import type { BoxRect, PlacedBox } from '../engine/types';
import { siblingRects } from './dnd';
import type { GuideLine } from './guides';
import { type AuthoredLength, formatLength } from './lengths';

/** The editor-side grid steps offered (pt — the engine unit). 0 is "off". */
export const GRID_STEPS: readonly number[] = [1, 2, 4, 6, 8];
export const DEFAULT_GRID_STEP = 1;

/** Clamp an untrusted grid-step value (a pref read, a hostile storage write)
 * to the offered set; anything else — including non-numbers — degrades to the
 * default. The step reaches the SVG grid pattern only through this. */
export function normalizeGridStep(value: unknown): number {
  return typeof value === 'number' && (value === 0 || GRID_STEPS.includes(value))
    ? value
    : DEFAULT_GRID_STEP;
}

/** The smallest size a resize drag may leave (pt) — the panel can author
 * thinner boxes; the drag just refuses to collapse one. */
export const MIN_SIZE_PT = 1;

/** Snap behavior for a move/resize plan: the grid step (pt; ≤0 off), the
 * guide-snap threshold (pt, converted from screen px by the caller), the
 * Alt-held bypass that disables both, and the Shift-held axis lock (move only)
 * that constrains the drag to its dominant axis. */
export interface SnapOptions {
  readonly grid: number;
  readonly threshold: number;
  readonly bypass: boolean;
  /** Constrain a MOVE to its dominant axis (the minor axis stays at its base —
   * "slide sideways, keep y"). Resize ignores it. Default off. */
  readonly axisLock?: boolean;
}

/** A planned manipulation at one pointer position: the (possibly empty)
 * changed-keys-only op batch a release commits, the ghost rect to paint, and
 * the active alignment guides. */
export interface ManipulationPlan {
  readonly ops: readonly Op[];
  readonly ghost: BoxRect;
  readonly guides: readonly GuideLine[];
}

/** The dragged box's border rect on the page — exactly-one match, since a
 * duplicated path (repeat fragments) has ambiguous geometry. Exported for the
 * align/distribute model, which resolves the same per-item page rect. */
export function sourceRect(pageBoxes: readonly PlacedBox[], path: string): BoxRect | null {
  let found: BoxRect | null = null;
  for (const box of pageBoxes) {
    if (box.path === path) {
      if (found !== null) {
        return null;
      }
      found = box.border;
    }
  }
  return found;
}

/** The same-parent sibling rects available as guide targets (self excluded);
 * empty when sibling geometry is ambiguous or guides are bypassed. */
export function guideTargets(
  pageBoxes: readonly PlacedBox[],
  path: string,
  bypass: boolean,
): readonly BoxRect[] {
  if (bypass) {
    return [];
  }
  // Callers guarantee a sequence path (the box classified movable), so the
  // parent is everything before the final `[index]`.
  const parent = path.slice(0, path.lastIndexOf('['));
  const siblings = siblingRects(pageBoxes, parent);
  if (siblings === null) {
    return [];
  }
  return siblings.filter((sibling) => `${parent}[${sibling.index}]` !== path).map((s) => s.rect);
}

/** The op for one axis, or nothing when the committed form equals the base's
 * committed form (an untouched axis never dirties the diff). `undefined`
 * signals a non-finite target (refuse the whole plan). Exported so the
 * align/distribute model authors the SAME minimal changed-key wire. */
export function axisOp(
  path: string,
  key: 'x' | 'y' | 'w' | 'h',
  base: AuthoredLength,
  targetPt: number,
): Op | null | undefined {
  const committed = formatLength(targetPt, base.unit);
  if (committed === null) {
    return undefined;
  }
  if (committed === formatLength(base.pt, base.unit)) {
    return null;
  }
  return { op: 'setScalar', path, keys: ['box', key], value: committed };
}
