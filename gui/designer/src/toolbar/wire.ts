// The minimal wire a cascade-aware control authors — the DECISION half of every
// control in the app that shows an effective value rather than a bare own one.
// Shared by the format toolbar (`toolbar/model` wraps these at `style.*`) and
// the table's band / column style editors, which is why it takes a full `keys`
// array instead of a style key: a band's properties do not live at `style.*`.
// The header row's sit at `header.style.*`, the body row's at `row.style.*`, and
// a column's at `style.*` under the column itself.
//
// One rule, three shapes of it: never author what the cascade already yields,
// and never restate a default. `normal` appears ONLY as a cascade override —
// authored because something below says `bold` and this level must say otherwise
// — never as an unset value spelled out.
//
// `null` = dispatch nothing. That is a real outcome, not a failure: clicking the
// alignment the row band already supplies is a no-op, and authoring an own key
// there would make a later change to the band stop reaching this level.

import type { Op } from '@shojiku/designer-core';
import { lengthOp, plainTextOp } from '../panel/model';
import type { EffectiveValue } from './effective';

/** Move an on/off property toward `next`. When the below-own cascade already
 * yields the target the own key just goes away (or nothing happens if it never
 * existed); otherwise the own key authors the target. */
export function toggleWire(
  path: string,
  keys: readonly string[],
  eff: EffectiveValue,
  onValue: string,
  next: boolean,
): Op | null {
  const cascadeOn = eff.cascade === onValue;
  if (cascadeOn === next) {
    return eff.own === '' ? null : { op: 'removeKey', path, keys };
  }
  return { op: 'setScalar', path, keys, value: next ? onValue : 'normal' };
}

/** The alignment a resolution MEANS on canvas (`''` = the engine default). */
export function alignedValue(value: string): string {
  return value === '' ? 'left' : value;
}

/** Pick alignment `value`: picking the one already shown — or the one the
 * cascade would yield on its own — reverts to the cascade (drops the own key);
 * anything else authors the own key. */
export function alignWire(
  path: string,
  keys: readonly string[],
  eff: EffectiveValue,
  value: string,
): Op | null {
  if (value === alignedValue(eff.value) || value === alignedValue(eff.cascade)) {
    return eff.own === '' ? null : { op: 'removeKey', path, keys };
  }
  return { op: 'setScalar', path, keys, value };
}

/** Commit a free value (a colour, a family, a size) over the effective seed:
 * empty falls back to the cascade (drops the own key; nothing when none
 * exists), anything else authors the own key through the shared panel builders
 * so the length/plain-text policies keep one home. */
export function comboWire(
  path: string,
  keys: readonly string[],
  eff: EffectiveValue,
  raw: string,
  length: boolean,
): Op | null {
  if (raw.trim() === '' && eff.own === '') {
    return null;
  }
  return length ? lengthOp(path, keys, raw) : plainTextOp(path, keys, raw);
}
