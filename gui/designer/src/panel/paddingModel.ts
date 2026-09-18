// A box's `padding`, as ONE all-sides field. The wire takes a bare non-negative
// number (every side, in pt) or a per-side map whose entries may carry units;
// negatives and `auto` are parse errors. This field edits the first form only:
// a map whose sides really differ is shown as such and typing a number replaces
// it — one value, said out loud — rather than rewriting four entries the reader
// cannot see. A map giving all four sides the same number IS one value, and
// reads as it.
//
// The ingress rule is the page margin's uniform field's (`marginModel`), the
// sibling that already guards a value of this kind: a bare numeral or nothing,
// ▲▼ by one point, clamped at 0, and no op at the floor. Unset steps from the
// 0 it means, so clearing the field never leaves its own ▲▼ dead.

import type { Op } from '@shojiku/designer-core';
import { stepNumeral } from './model';

/** A bare non-negative decimal — the only all-sides spelling the wire accepts. */
const BARE_NUMERAL = /^\d+(?:\.\d+)?$/;

export type PaddingMode = 'none' | 'uniform' | 'perSide' | 'other';

export interface PaddingView {
  readonly mode: PaddingMode;
  /** The stepper's text: the uniform number, else empty. */
  readonly text: string;
}

function isMap(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const SIDES = ['top', 'right', 'bottom', 'left'] as const;

/** A value the all-sides field can show: a finite, non-negative number. */
function showable(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** The one value a per-side map gives every side, or `undefined` when the
 * sides differ. An unset side is 0 on the wire, so it counts as 0 here: `{}`
 * and `{ top: 0 }` are one value, `{ top: 4 }` is not. */
function sameOnEverySide(map: Record<string, unknown>): unknown {
  const sides = SIDES.map((side) => (Object.hasOwn(map, side) ? map[side] : 0));
  return sides.every((value) => value === sides[0]) ? sides[0] : undefined;
}

/** Read `box.padding` off a node. A number the wire could have written (finite,
 * non-negative) is `uniform`, and so is a map giving all four sides that same
 * number; a map whose sides differ is `perSide`; anything else a document can
 * still carry (a string, a negative, four equal unit strings, garbage) is
 * `other`, shown but not seeded. */
export function readPadding(node: unknown): PaddingView {
  const box = isMap(node) ? node.box : undefined;
  const padding = isMap(box) ? box.padding : undefined;
  if (padding === undefined) {
    return { mode: 'none', text: '' };
  }
  const value = isMap(padding) ? sameOnEverySide(padding) : padding;
  if (showable(value)) {
    return { mode: 'uniform', text: String(value) };
  }
  return { mode: isMap(padding) && value === undefined ? 'perSide' : 'other', text: '' };
}

/** The ops for a committed entry at the frame (or item) `path`: a bare numeral
 * sets `box.padding`; an empty entry removes an authored padding (and is no edit
 * when there is none); anything else — a sign, a unit, garbage — is refused. */
export function paddingOps(path: string, view: PaddingView, text: string): Op[] | null {
  const trimmed = text.trim();
  if (trimmed === '') {
    return view.mode === 'none' ? null : [{ op: 'removeKey', path, keys: ['box', 'padding'] }];
  }
  if (!BARE_NUMERAL.test(trimmed)) {
    return null;
  }
  return [{ op: 'setScalar', path, keys: ['box', 'padding'], value: Number(trimmed) }];
}

/** Whether ▲▼ can move the value: a number shown in the field, or unset —
 * which is 0 on the wire, so it steps from there. */
export function canStepPadding(view: PaddingView): boolean {
  return view.mode === 'uniform' || view.mode === 'none';
}

/** One ▲▼ click: a point, clamped at 0; the floor itself dispatches nothing. */
export function stepPaddingOps(path: string, view: PaddingView, dir: number): Op[] | null {
  if (!canStepPadding(view)) {
    return null;
  }
  const base = view.mode === 'none' ? '0' : view.text;
  const next = stepNumeral(base, dir);
  if (next === null) {
    return null;
  }
  const clamped = Number(next) < 0 ? '0' : next;
  return clamped === base ? null : paddingOps(path, view, clamped);
}
