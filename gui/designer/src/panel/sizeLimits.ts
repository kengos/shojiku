// A box's four size bounds — `minWidth`, `maxWidth`, `minHeight`, `maxHeight` —
// read and written as authored. Each is a non-negative length (a bare number is
// pt; `mm`/`cm`/`in`/`pt`/`%`/`em`/`rem` are written as typed); anything else
// is refused rather than authored for the engine to drop with a diagnostic.

import type { Op } from '@shojiku/designer-core';
import { steppedLength } from './edgeModel';
import { display } from './itemView';

export const SIZE_LIMIT_KEYS = ['minWidth', 'maxWidth', 'minHeight', 'maxHeight'] as const;
export type SizeLimitKey = (typeof SIZE_LIMIT_KEYS)[number];

const NUMERAL = /^\d+(?:\.\d+)?$/;
const LENGTH = /^\d+(?:\.\d+)?(?:pt|mm|cm|in|%|em|rem)$/;
const MAX_CHARS = 16;

function isMap(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The four bounds as display strings (`''` = unset). Own-property reads. */
export function readSizeLimits(node: unknown): Readonly<Record<SizeLimitKey, string>> {
  const box = isMap(node) && isMap(node.box) ? node.box : {};
  const of = (key: SizeLimitKey) => (Object.hasOwn(box, key) ? display(box[key]) : '');
  return {
    minWidth: of('minWidth'),
    maxWidth: of('maxWidth'),
    minHeight: of('minHeight'),
    maxHeight: of('maxHeight'),
  };
}

/** A committed bound: empty removes an authored one, a valid length sets it,
 * anything else (a sign, garbage, an unchanged value) is no edit. */
export function sizeLimitOp(
  path: string,
  key: SizeLimitKey,
  current: string,
  entry: string,
): Op | null {
  const text = entry.trim();
  const keys = ['box', key];
  if (text === current) {
    return null;
  }
  if (text === '') {
    return { op: 'removeKey', path, keys };
  }
  if (text.length > MAX_CHARS) {
    return null;
  }
  if (NUMERAL.test(text)) {
    return { op: 'setScalar', path, keys, value: Number(text) };
  }
  return LENGTH.test(text) ? { op: 'setScalar', path, keys, value: text } : null;
}

/** The bounds that reach the page for this item: a table in the flow body
 * ignores its height bounds (it paginates instead). */
export function sizeLimitKeys(horizontalOnly: boolean): readonly SizeLimitKey[] {
  return horizontalOnly ? ['minWidth', 'maxWidth'] : SIZE_LIMIT_KEYS;
}

/** The entry one ▲▼ click produces: the bound moved by `step` pt in its own
 * unit, floored at 0; unset steps up from 0. `null` for a relative length
 * (`%`, `em`) or when the click would not move it. */
export function steppedLimit(current: string, dir: number, step: number): string | null {
  return steppedLength(current, dir, step, true);
}

/** One ▲▼ click on a bound, through the same ingress as a typed entry. */
export function sizeLimitStepOp(
  path: string,
  key: SizeLimitKey,
  current: string,
  dir: number,
  step: number,
): Op | null {
  const next = steppedLimit(current, dir, step);
  return next === null ? null : sizeLimitOp(path, key, current, next);
}
