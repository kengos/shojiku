// The two numeric look keys whose wire grammar the shared length builders do
// not guard: `letterSpacing` (a signed length that refuses `%`, capped at
// ±1000pt) and `opacity` (a 0..1 alpha the panel shows as a percentage). Both
// refuse — return `null`, dispatch nothing — rather than author a value the
// engine answers with an `invalid_*` diagnostic and ignores.

import type { Op } from '@shojiku/designer-core';
import { stepLength } from '../canvas/lengths';
import { composeDecoration, decorationOf, hasLineThrough, hasUnderline } from '../text/spanRuns';
import type { EffectiveValue } from '../toolbar/effective';

/** The engine's letter-spacing bound (`invalid_letter_spacing` past it). */
export const MAX_LETTER_SPACING_PT = 1000;

const SIGNED_NUMERAL = /^-?\d+(?:\.\d+)?$/;
/** `%` is a parse error on this key — CSS letter-spacing has no percentage. */
const SPACING_LENGTH = /^-?\d+(?:\.\d+)?(?:pt|mm|cm|in|em|rem)$/;
/** A value longer than this is refused rather than written (a hostile paste). */
const MAX_CHARS = 16;

/** A committed letter-spacing entry: empty clears the item's own key; a bare
 * signed numeral within the bound authors a number; a unit length is written
 * as typed; anything else is refused. */
export function letterSpacingOp(path: string, own: string, entry: string): Op | null {
  const text = entry.trim();
  const keys = ['style', 'letterSpacing'];
  if (text === '') {
    return own === '' ? null : { op: 'removeKey', path, keys };
  }
  if (text.length > MAX_CHARS) {
    return null;
  }
  if (SIGNED_NUMERAL.test(text)) {
    const value = Number(text);
    return Math.abs(value) > MAX_LETTER_SPACING_PT
      ? null
      : { op: 'setScalar', path, keys, value: Object.is(value, -0) ? 0 : value };
  }
  return SPACING_LENGTH.test(text) ? { op: 'setScalar', path, keys, value: text } : null;
}

/** An `opacity` wire value as the percentage the field shows (`0.5` → `50`), or
 * the raw text when it is not a number the field can express. At most one
 * decimal: the engine's alpha has no finer meaning on paper. */
export function opacityPercent(value: string): string {
  if (value === '' || !SIGNED_NUMERAL.test(value)) {
    return value;
  }
  return String(Number((Number(value) * 100).toFixed(1)));
}

/** A committed percentage (with or without a trailing `%`): clamped to
 * 0..100 and authored as the 0..1 alpha; empty clears the own key. `null` when
 * it is not a number, or when it would author the value the item already
 * carries. */
export function opacityOp(path: string, own: string, entry: string): Op | null {
  const text = entry.trim().replace(/%$/, '').trim();
  const keys = ['style', 'opacity'];
  if (text === '') {
    return own === '' ? null : { op: 'removeKey', path, keys };
  }
  if (text.length > MAX_CHARS || !SIGNED_NUMERAL.test(text)) {
    return null;
  }
  const percent = Math.min(100, Math.max(0, Number(text)));
  const value = Number((percent / 100).toFixed(3));
  if (own !== '' && Number(own) === value) {
    return null;
  }
  return { op: 'setScalar', path, keys, value };
}

/** ▲▼ step for the opacity field, in percentage points. */
export const OPACITY_STEP = 10;

/** The percentage one ▲▼ click produces, clamped to 0..100; `null` at the
 * bound or over a value that is not a number. `shown` is what the field shows
 * (`''` = unset, which is fully opaque). */
export function steppedOpacity(shown: string, dir: number): string | null {
  const base = shown === '' ? '100' : shown;
  if (!SIGNED_NUMERAL.test(base)) {
    return null;
  }
  const next = Number((Number(base) + dir * OPACITY_STEP).toFixed(1));
  const clamped = String(Math.min(100, Math.max(0, next)));
  return clamped === base ? null : clamped;
}

/** A letter-spacing ▲▼ moves by half a point — a whole point is a visible jump
 * at body sizes. */
const SPACING_STEP_PT = 0.5;

/** One letter-spacing ▲▼ click over the shown value (`''` = 0), through the
 * same ingress as a typed entry; `null` over a value the stepper cannot move
 * (a relative unit, garbage). */
export function letterSpacingStepOp(
  path: string,
  own: string,
  shown: string,
  dir: number,
): Op | null {
  const next = stepLength(shown === '' ? '0' : shown, dir, SPACING_STEP_PT);
  return next === null ? null : letterSpacingOp(path, own, String(next));
}

/** One opacity ▲▼ click. */
export function opacityStepOp(path: string, own: string, shown: string, dir: number): Op | null {
  const next = steppedOpacity(shown, dir);
  return next === null ? null : opacityOp(path, own, next);
}

/** One decoration line's checkbox: flip `line` in the EFFECTIVE decoration
 * (what the page draws), keeping the other line — or, against an engine that
 * takes only one line at a time (`combined` false), dropping it. The result is
 * authored only where the cascade would not give it anyway: a match with what
 * the item renders without its own key removes that key, and switching off a
 * line a named style supplies writes `none`. The op is never `null`: a click
 * always moves the effective value. */
export function decorationToggleOp(
  path: string,
  effective: EffectiveValue,
  line: 'underline' | 'line_through',
  combined: boolean,
): Op {
  const current = decorationOf(effective.value);
  const underline = line === 'underline' ? !hasUnderline(current) : hasUnderline(current);
  const lineThrough = line === 'line_through' ? !hasLineThrough(current) : hasLineThrough(current);
  const turnedOn = line === 'underline' ? underline : lineThrough;
  const next =
    combined || !turnedOn
      ? composeDecoration(underline, lineThrough)
      : composeDecoration(line === 'underline', line === 'line_through');
  const keys = ['style', 'textDecoration'];
  // A toggle always changes the effective value, so landing on what the
  // cascade gives means the item carried an own key that is now redundant.
  if (next === decorationOf(effective.cascade)) {
    return { op: 'removeKey', path, keys };
  }
  return { op: 'setScalar', path, keys, value: next };
}
