// What a typed entry or a ▲▼ click authors on a numeric field, held to the
// bounds the catalog states for the key. An entry the field refuses returns
// `null` and writes nothing (the input then reseeds to the document's value);
// an empty one returns `undefined`, which removes the key.

import type { FieldBounds } from '@shojiku/designer-core';
import { isFontRelativeLength, readLength, stepLength } from '../../canvas/lengths';

/** One ▲▼ click moves a length or a number by one (pt for a length). */
const STEP = 1;

/** Whether `pt` lies inside the bounds. */
export function inBounds(pt: number, bounds: FieldBounds): boolean {
  const { minimum, exclusiveMinimum, maximum } = bounds;
  return (
    (minimum === undefined || pt >= minimum) &&
    (exclusiveMinimum === undefined || pt > exclusiveMinimum) &&
    (maximum === undefined || pt <= maximum)
  );
}

/** `0` for `-0`, which would be written as `-0` and shown as `0`. */
function unsigned(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

/** A typed length: a bare numeral authors a number, an absolute length its
 * text; either is refused outside the bounds. An `em` / `rem` length is
 * written as typed; any other text is refused — `%` included: the catalog
 * cannot say which keys take it, and one that does not (`letterSpacing`)
 * fails the whole template at parse. */
export function lengthEntry(raw: string, bounds: FieldBounds): number | string | null | undefined {
  const text = raw.trim();
  if (text === '') {
    return undefined;
  }
  const length = readLength(text);
  if (length === null) {
    return isFontRelativeLength(text) ? text : null;
  }
  if (!inBounds(length.pt, bounds)) {
    return null;
  }
  return length.unit === null ? unsigned(length.pt) : text;
}

/** A typed number: refused unless finite and inside the bounds. */
export function numberEntry(raw: string, bounds: FieldBounds): number | null | undefined {
  const text = raw.trim();
  if (text === '') {
    return undefined;
  }
  const value = Number(text);
  return Number.isFinite(value) && inBounds(value, bounds) ? unsigned(value) : null;
}

/** The value one ▲▼ click in `dir` authors over the shown length or number,
 * keeping its unit; `null` when the shown text cannot be stepped (empty, a
 * relative unit) or the step would leave the bounds. */
export function steppedMeasure(
  shown: string,
  dir: 1 | -1,
  bounds: FieldBounds,
): number | string | null {
  const length = readLength(shown);
  if (length === null || !inBounds(length.pt + dir * STEP, bounds)) {
    return null;
  }
  return stepLength(shown, dir, STEP);
}

/** A typed text: empty removes the key, anything else is written as typed. */
export function textEntry(raw: string): string | undefined {
  return raw.trim() === '' ? undefined : raw;
}
