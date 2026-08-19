// What a gesture on ONE overlay box MEANS, decided from the DOCUMENT: the
// keyboard vocabulary (Alt+arrows reorder within the parent, plain arrows nudge
// by the grid step, Enter/Space select-or-edit) and the drag task a pointer
// press arms. Pure — a plan is RETURNED, never dispatched, so the rect that
// paints stays a thin dispatcher and every arm is unit-testable without a
// rendered tree.
//
// A `null` plan means the key is NOT ours: the caller leaves the event alone
// (no preventDefault). Every non-null plan is consumed, which is why `consume`
// exists as its own arm rather than as a null — the key IS ours and the
// document simply does not change (the first item moving up, a nudge the
// authored form cannot express).

import type { Op, ReadFn } from '@shojiku/designer-core';
import type { MoveItemOp } from '../tree/reorder';
import { manipulationFor } from './manipulate';
import type { CanvasManipulate, DragTask } from './overlayDragModel';
import { arrowDelta } from './overlayGeometry';
import { nudgeOps } from './planMove';

/** The keys that reorder (Alt held) or nudge (plain) the focused box. */
const ARROW_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

/** What a keypress on the focused box asks for. */
export type BoxKeyPlan =
  | { readonly kind: 'reorder'; readonly op: MoveItemOp }
  | { readonly kind: 'apply'; readonly ops: readonly Op[] }
  /** The key is ours, but nothing changes — swallow it, emit no op. */
  | { readonly kind: 'consume' }
  | { readonly kind: 'edit' }
  | { readonly kind: 'select' };

/** What a keypress is classified against. */
export interface BoxKeyContext {
  readonly path: string;
  /** This box is the PRIMARY selection — Enter then means "edit". */
  readonly selected: boolean;
  /** Absent = direct manipulation is off, so arrow keys are not ours. */
  readonly manipulate: CanvasManipulate | undefined;
}

function arrowPlan(
  key: string,
  altKey: boolean,
  path: string,
  manipulate: CanvasManipulate,
): BoxKeyPlan | null {
  const ability = manipulationFor(manipulate.read, path);
  if (altKey && ability.kind === 'reorder') {
    const context = ability.context;
    const to = key === 'ArrowUp' || key === 'ArrowLeft' ? context.from - 1 : context.from + 1;
    // A negative `to` is the first item moving up — a no-op; an over-the-end
    // `to` is rejected by the op layer untouched.
    return to >= 0
      ? { kind: 'reorder', op: { op: 'moveItem', path: context.parent, from: context.from, to } }
      : { kind: 'consume' };
  }
  if (!altKey && ability.kind === 'move') {
    const step = manipulate.grid > 0 ? manipulate.grid : 1;
    const { dx, dy } = arrowDelta(key, step);
    const ops = nudgeOps(manipulate.read, path, dx, dy);
    // A null batch means the delta itself was unusable — `grid` is a plain
    // number on the wiring contract, so a host that never ran it through
    // `normalizeGridStep` can hand us a non-finite step. Swallow the key
    // rather than dispatching a garbage op.
    if (ops === null) {
      return { kind: 'consume' };
    }
    return ops.length > 0 ? { kind: 'apply', ops } : { kind: 'consume' };
  }
  return null;
}

export function boxKeyPlan(key: string, altKey: boolean, ctx: BoxKeyContext): BoxKeyPlan | null {
  const manipulate = ctx.manipulate;
  if (ARROW_KEYS.has(key) && manipulate !== undefined) {
    return arrowPlan(key, altKey, ctx.path, manipulate);
  }
  if (key === 'Enter' || key === ' ') {
    // Enter on the already-selected box requests editing (keyboard parity
    // with double-click); otherwise Enter/Space just selects.
    return key === 'Enter' && ctx.selected ? { kind: 'edit' } : { kind: 'select' };
  }
  return null;
}

/** The two arms that CHANGE the document. */
export type BoxKeyDocumentPlan = Extract<BoxKeyPlan, { readonly kind: 'reorder' | 'apply' }>;

/** Dispatch a document-changing plan. Only `boxKeyPlan` mints these, and only
 * when the wiring is present, so the absent-wiring arm is a guard the rect
 * cannot reach — it lives here, with the rest of the vocabulary, rather than
 * as an optional chain at the call site (which would leave a branch leg no
 * render can cover). */
export function applyBoxKeyPlan(
  plan: BoxKeyDocumentPlan,
  path: string,
  manipulate: CanvasManipulate | undefined,
): void {
  if (manipulate === undefined) {
    return;
  }
  if (plan.kind === 'reorder') {
    // Alt+Arrow stays within the item's own parent, so its destination path is
    // simply the new index in the same sequence.
    manipulate.onReorder([plan.op], `${plan.op.path}[${plan.op.to}]`);
    return;
  }
  manipulate.onApply(path, plan.ops);
}

/** The drag a pointer press on this box arms, per the document's own
 * classification: a movable box drags freely, a list child reorders, and
 * anything else arms a TYPED refusal so the release can report why. */
export function boxDragTask(read: ReadFn, path: string, startX: number, startY: number): DragTask {
  const ability = manipulationFor(read, path);
  if (ability.kind === 'move') {
    return { mode: 'move', path, startX, startY };
  }
  if (ability.kind === 'reorder') {
    return { mode: 'reorder', path };
  }
  return { mode: 'refused', reason: ability.reason };
}
