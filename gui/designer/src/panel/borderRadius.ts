// The `borderRadius` property, end to end. It resolves through the same
// non-inherited cascade as the per-side keys (own > named styles, reusing
// `borderModel`'s primitives) but is ONE authored length rather than a
// scalar-or-map, so it sits outside the per-side keys and outside the pen —
// and its AUTHORED FORM is load-bearing: `50%` must round-trip as `50%`.

import type { Op, ReadFn } from '@shojiku/designer-core';
import { namedValue, ownValue, readRecord } from './borderModel';
import type { RadiusView } from './borderTypes';

/** The wire key this module owns. */
const BORDER_RADIUS_KEY = 'borderRadius';

/** A `borderRadius` wire value as the author wrote it: a bare number is pt and
 * shows as the numeral, a string keeps its unit verbatim. Anything else
 * (map, array, boolean) is not a length and reads as unset. */
function radiusText(raw: unknown): string {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? String(raw) : '';
  }
  return typeof raw === 'string' ? raw : '';
}

/** Resolve `borderRadius` for the item at `path`. */
export function readRadius(read: ReadFn, path: string): RadiusView {
  const item = readRecord(read, path);
  const registry = readRecord(read, 'styles');
  const ownRaw = ownValue(item, BORDER_RADIUS_KEY);
  if (ownRaw !== undefined) {
    return {
      effective: radiusText(ownRaw),
      origin: 'own',
      styleName: '',
      ownPresent: true,
    };
  }
  const named = namedValue(item, registry, BORDER_RADIUS_KEY);
  if (named !== null) {
    return {
      effective: radiusText(named.raw),
      origin: 'style',
      styleName: named.styleName,
      ownPresent: false,
    };
  }
  return { effective: '', origin: 'unset', styleName: '', ownPresent: false };
}

/** The wire form of a typed radius: a bare numeral authors a NUMBER (the
 * engine's canonical pt form), anything else stays the author's string so its
 * unit survives. */
function radiusWire(text: string): string | number {
  const bare = /^-?\d+(\.\d+)?$/.test(text);
  return bare ? Number(text) : text;
}

/** Ops for a new `borderRadius`, or `[]` when nothing must change.
 *
 * The comparison is against the cascade-EFFECTIVE authored text, so a
 * commit that types back what the field already showed writes nothing — the
 * commit-on-blur identity rule that keeps a tab-through from rewriting an
 * inherited `50%` as an own `50`. Clearing the field removes the own key. */
export function radiusOps(path: string, radius: RadiusView, next: string): Op[] {
  const text = next.trim();
  if (text === radius.effective) {
    return [];
  }
  const keys = ['style', BORDER_RADIUS_KEY];
  if (text === '') {
    // Clearing a radius a NAMED STYLE supplies must author an explicit 0:
    // removing the own key would fall back to the style's rounding, so the
    // field would snap straight back to the value the user just cleared
    // (the same cascade-override rule the width uses).
    // Only 'own' or 'style' reach here: an 'unset' radius has an empty
    // effective value, which the equality check above already returned on.
    return radius.origin === 'style'
      ? [{ op: 'setScalar', path, keys, value: 0 }]
      : [{ op: 'removeKey', path, keys }];
  }
  return [{ op: 'setScalar', path, keys, value: radiusWire(text) }];
}
