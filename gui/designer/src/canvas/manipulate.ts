// Pure canvas CLASSIFICATION model: what the canvas may do with a given box —
// MOVE/RESIZE it (carrying the authored x/y bases a plan commits against),
// drag-REORDER it, or nothing, with a typed reason the chrome explains to the
// user. Classification reads the DOCUMENT only; the plans that turn a pointer
// delta into ops live in `plan`/`planMove`/`planResize`, and the resize-handle
// vocabulary in `resizeHandles`. Never throws: a hostile document (a read
// throw, alias bombs, garbage shapes) classifies as fixed.

import type { ReadFn } from '@shojiku/designer-core';
import { BOXLESS_TYPES } from '../panel/itemView';
import { seqPosition } from '../tree/reorder';
import { type ReorderContext, reorderContext } from './dnd';
import { type AuthoredLength, ptLength, readLength } from './lengths';

/** Where a movable item gets its position from (the chip wording). */
export type MovablePlace = 'absolute' | 'band' | 'positioned';
/** Which order-placed layout a reorderable item follows. */
export type ReorderPlace = 'flow' | 'flex';
/** Why a box is neither movable nor reorderable — the user-facing reason. */
export type FixedReason =
  | 'grid'
  | 'repeat'
  | 'noBox'
  | 'relative'
  | 'flowPositioned'
  | 'section'
  | 'unknown';

/** What the canvas may do with a box: drag-move (absolute track, carrying
 * the authored x/y bases the plans commit against), drag-reorder (flow/flex
 * track), or nothing — with the reason. */
export type Manipulation =
  | {
      readonly kind: 'move';
      readonly place: MovablePlace;
      readonly x: AuthoredLength;
      readonly y: AuthoredLength;
    }
  | { readonly kind: 'reorder'; readonly place: ReorderPlace; readonly context: ReorderContext }
  | { readonly kind: 'fixed'; readonly reason: FixedReason };

const ITEMS_SUFFIX = '.items';

// A path inside a repeating sub-template (`table` columns / `cell:` /
// `repeat_flow` `item:`): its geometry repeats per data element, so a single
// box cannot be moved — edits affect every instance.
const SUB_TEMPLATE_RE = /\.columns\[|\.cell\.|\.item\./;

/** Narrow an untrusted materialized value to a plain object, or `undefined`.
 * The ONE guard every document read in this area goes through — exported for
 * the plan and handle models, which read the same untrusted nodes. */
export function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function fixed(reason: FixedReason): Manipulation {
  return { kind: 'fixed', reason };
}

/** An authored base for a `box` key: absent falls back to `fallbackPt` (0 for
 * x/y; the resolved size for w/h), a relative/garbage value is `null`.
 * Exported for the resize plan, which resolves w/h bases the same way. */
export function baseLength(value: unknown, fallbackPt: number): AuthoredLength | null {
  return value === undefined ? ptLength(fallbackPt) : readLength(value);
}

/** A movable classification carrying the authored x/y bases (absent = 0 pt),
 * unless one uses a relative unit — then the drag cannot write the position
 * back in its authored form. */
function movable(place: MovablePlace, box: Record<string, unknown>): Manipulation {
  const x = baseLength(box.x, 0);
  const y = baseLength(box.y, 0);
  if (x === null || y === null) {
    return fixed('relative');
  }
  return { kind: 'move', place, x, y };
}

/** Classify what the canvas may do with the box at `path`. Never throws:
 * hostile documents (a read throw, alias bombs, garbage shapes) classify as
 * fixed. */
export function manipulationFor(read: ReadFn, path: string): Manipulation {
  if (SUB_TEMPLATE_RE.test(path)) {
    return fixed('repeat');
  }
  const position = seqPosition(path);
  if (position === null) {
    return fixed('section');
  }
  if (!position.parent.endsWith(ITEMS_SUFFIX)) {
    return fixed('repeat');
  }
  const ownerPath = position.parent.slice(0, -ITEMS_SUFFIX.length);
  let owner: Record<string, unknown> | undefined;
  let child: Record<string, unknown> | undefined;
  try {
    owner = record(read(ownerPath));
    child = record(read(path));
  } catch {
    return fixed('unknown');
  }
  if (owner === undefined || child === undefined) {
    return fixed('unknown');
  }
  if (typeof child.type === 'string' && BOXLESS_TYPES.has(child.type)) {
    return fixed('noBox');
  }
  const box = record(child.box) ?? {};
  const hasXY = box.x !== undefined || box.y !== undefined;
  if (ownerPath === 'sections.header' || ownerPath === 'sections.footer') {
    return movable('band', box);
  }
  if (ownerPath === 'sections.body') {
    if (owner.type === 'absolute') {
      return movable('absolute', box);
    }
    if (owner.type === 'flow' && hasXY) {
      return fixed('flowPositioned');
    }
  } else {
    if (owner.type !== 'container') {
      return fixed('unknown');
    }
    const ownerBox = record(owner.box);
    const mode = ownerBox?.type;
    if (mode !== undefined && mode !== 'flex') {
      return fixed('grid');
    }
    if (hasXY) {
      return movable('positioned', box);
    }
  }
  const context = reorderContext(read, path);
  if (context === null) {
    return fixed('unknown');
  }
  return {
    kind: 'reorder',
    place: ownerPath === 'sections.body' ? 'flow' : 'flex',
    context,
  };
}
