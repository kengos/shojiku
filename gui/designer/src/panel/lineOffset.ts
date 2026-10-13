// Pure model for an anchored `line` endpoint's `offset:` — the shift the
// engine adds to the point it resolved on the target item.
//
// The wire is narrower than every other length the panel edits: each axis is
// a bare pt NUMBER (`AnchorOffset { x: f64, y: f64 }`), so a unit-suffixed
// string — or even a numeric string — fails the parse and refuses the WHOLE
// document. Writes are therefore numbers only, and anything else is refused.
//
// Both axes default to 0 and the engine drops a zero axis when it serializes,
// so the normal form here is the same: an empty, `0` or `-0` entry REMOVES
// the axis, and removing the last axis removes `offset` itself rather than
// leaving `offset: {}`. An offset exists only beside `item:` — on its own the
// endpoint is a `missing field item` parse error — so nothing here writes to
// an endpoint that is not anchored.

import type { Op, ReadFn } from '@shojiku/designer-core';
import { stepLength } from '../canvas/lengths';
import type { LineEnd } from './linePoints';

export type OffsetAxis = 'x' | 'y';

/** One axis as the panel shows it. `present` is whether the key is on the
 * wire at all; `readable` is whether the engine reads it (a finite number).
 * A present but unreadable value keeps its own state rather than reading as
 * absent: a short string (`2mm`) is shown as written, so emptying the field
 * clears it; any other value (`true`, a map) shows as empty, and typing `0` or
 * a number replaces it. */
export interface OffsetAxisView {
  readonly text: string;
  readonly present: boolean;
  readonly readable: boolean;
}

export interface LineOffsetView {
  readonly x: OffsetAxisView;
  readonly y: OffsetAxisView;
  /** `null` = a bare `offset:` (or `offset: ~`), which the engine reads as no
   * shift; `other` = any other value that is not a map (`offset: 5`), which it
   * refuses. Under either, no axis can be written, so a write replaces the key
   * whole — but only `other` is shown as something to fix. */
  readonly shape: 'absent' | 'map' | 'null' | 'other';
}

const MAX_NUMERAL_CHARS = 32;
// At 1e21 `String(n)` switches to exponent form, which this field could
// neither step nor show back as typed — and the engine drops anything past
// ±1e6 anyway, so nothing that large is a shift anyone means.
const MAX_MAGNITUDE = 1e21;
// A plain decimal numeral: no unit, no exponent, no leading `+`.
const NUMERAL_RE = /^-?\d+(?:\.\d+)?$/;

const ABSENT: OffsetAxisView = { text: '', present: false, readable: true };

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function axisView(map: Record<string, unknown>, axis: OffsetAxis): OffsetAxisView {
  if (!Object.hasOwn(map, axis)) {
    return ABSENT;
  }
  const raw = map[axis];
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    // `String(-0)` is already "0".
    return { text: String(raw), present: true, readable: true };
  }
  // A string is shown as written — the engine refuses it, and seeing `2mm`
  // is how the user learns why the document stopped rendering.
  const text = typeof raw === 'string' && raw.length <= MAX_NUMERAL_CHARS ? raw : '';
  return { text, present: true, readable: false };
}

/** Read one endpoint's offset. Never throws: a hostile document shape reads
 * as no offset rather than failing the panel render. */
export function readLineOffset(read: ReadFn, path: string, end: LineEnd): LineOffsetView {
  let offset: unknown;
  try {
    offset = record(record(read(path))?.[end])?.offset;
  } catch {
    offset = undefined;
  }
  if (offset === undefined) {
    return { x: ABSENT, y: ABSENT, shape: 'absent' };
  }
  if (offset === null) {
    return { x: ABSENT, y: ABSENT, shape: 'null' };
  }
  const map = record(offset);
  if (map === undefined) {
    return { x: ABSENT, y: ABSENT, shape: 'other' };
  }
  return { x: axisView(map, 'x'), y: axisView(map, 'y'), shape: 'map' };
}

const other = (axis: OffsetAxis): OffsetAxis => (axis === 'x' ? 'y' : 'x');

/** The ops for one axis's commit, or `[]` when nothing should change: the
 * endpoint is not anchored, the entry is unchanged, or it is not a plain
 * numeral. A refusal keeps a typo from turning a drawable line into a
 * document that will not parse. */
export function lineOffsetOps(
  path: string,
  view: LineOffsetView,
  end: LineEnd,
  axis: OffsetAxis,
  next: string,
  anchored: boolean,
): Op[] {
  if (!anchored) {
    return [];
  }
  const current = view[axis];
  const text = next.trim();
  // Unchanged — the same text, or the same NUMBER (`4.0` over an authored
  // `4` is not an edit) — but only over a value the engine reads: an
  // unreadable value shown in the field must still be clearable.
  const same =
    text === current.text ||
    (current.present && NUMERAL_RE.test(text) && Number(text) === Number(current.text));
  if (same && current.readable && view.shape !== 'other') {
    return [];
  }
  const offsetKeys = [end, 'offset'];
  const dropOffset: Op = { op: 'removeKey', path, keys: offsetKeys };
  if (text === '' || (NUMERAL_RE.test(text) && Number(text) === 0)) {
    if (view.shape === 'other') {
      return [dropOffset];
    }
    if (!current.present) {
      return [];
    }
    return view[other(axis)].present
      ? [{ op: 'removeKey', path, keys: [...offsetKeys, axis] }]
      : [dropOffset];
  }
  if (text.length > MAX_NUMERAL_CHARS || !NUMERAL_RE.test(text)) {
    return [];
  }
  // The regex admits only a plain numeral of ≤32 chars, so `Number` is finite.
  const value = Number(text);
  if (Math.abs(value) >= MAX_MAGNITUDE) {
    return [];
  }
  const write: Op = { op: 'setScalar', path, keys: [...offsetKeys, axis], value };
  return view.shape === 'map' || view.shape === 'absent' ? [write] : [dropOffset, write];
}

/** The ops for one ▲▼ step of `step` pt, or `[]` when the value cannot be
 * stepped (not a plain numeral, not anchored) or the step cannot move it. An
 * empty axis steps from its 0 default. Routed through `lineOffsetOps`, so a
 * step landing on 0 removes the axis like a typed 0 does. */
export function stepLineOffsetOps(
  path: string,
  view: LineOffsetView,
  end: LineEnd,
  axis: OffsetAxis,
  dir: 1 | -1,
  step: number,
  anchored: boolean,
): Op[] {
  const base = view[axis].text === '' ? '0' : view[axis].text;
  if (!anchored || !canStepOffset(view[axis]) || view.shape === 'other') {
    return [];
  }
  const next = stepLength(base, dir, step);
  if (next === null || next === Number(base)) {
    return [];
  }
  return lineOffsetOps(path, view, end, axis, String(next), anchored);
}

/** Whether an axis's ▲▼ can step it: an empty axis (0) or a plain numeral. */
export function canStepOffset(axis: OffsetAxisView): boolean {
  return axis.text === '' ? axis.readable : NUMERAL_RE.test(axis.text);
}
