// What the padding and margin fields AUTHOR (`edgeModel` is what the document
// says): one side of a map as a targeted leaf op so its siblings stay
// byte-exact; the all-sides number expanded into a map in ONE batch when a
// single side changes; the all-sides field's one number over any form. Every
// entry outside the wire's grammar — a negative padding, `auto` where the
// owner ignores it, a unit the engine lacks — is refused (`null`).

import type { Op } from '@shojiku/designer-core';
import {
  EDGE_SIDES,
  type EdgeKey,
  type EdgeRules,
  type EdgeSide,
  type EdgeView,
  LENGTH,
  MAX_EDGE_CHARS,
  NUMERAL,
  steppedEdge,
} from './edgeModel';

/** A typed side value as the wire value it authors, or `null` to refuse it.
 * `''` is not handled here — clearing is its own branch. */
function sideValue(text: string, side: EdgeSide, rules: EdgeRules): number | string | null {
  if (text.length > MAX_EDGE_CHARS) {
    return null;
  }
  if (text === 'auto') {
    return rules.auto.has(side) ? 'auto' : null;
  }
  if (!rules.negative && text.startsWith('-')) {
    return null;
  }
  if (NUMERAL.test(text)) {
    const value = Number(text);
    return Object.is(value, -0) ? 0 : value;
  }
  return LENGTH.test(text) ? text : null;
}

/** The ops for a committed entry on one side. A map gets a leaf op; an
 * all-sides number is expanded into a map holding its value on the other
 * sides; an unset key (or an unreadable one) becomes a one-side map, the other
 * sides left unset — which the wire reads as 0, the value they already had.
 * Clearing the last authored side removes the key. `null` = no edit. */
export function edgeSideOps(
  path: string,
  key: EdgeKey,
  view: EdgeView,
  side: EdgeSide,
  entry: string,
  rules: EdgeRules,
): Op[] | null {
  const text = entry.trim();
  if (text === view.sides[side]) {
    return null;
  }
  const keys = ['box', key];
  if (text === '') {
    const rest = EDGE_SIDES.filter((other) => other !== side && view.sides[other] !== '');
    if (view.mode === 'perSide') {
      return rest.length === 0
        ? [{ op: 'removeKey', path, keys }]
        : [{ op: 'removeKey', path, keys: [...keys, side] }];
    }
    // The all-sides number loses one side: the other three keep it.
    return [
      {
        op: 'putValue',
        path,
        keys,
        value: Object.fromEntries(rest.map((s) => [s, Number(view.uniform)])),
      },
    ];
  }
  const value = sideValue(text, side, rules);
  if (value === null) {
    return null;
  }
  if (view.mode === 'perSide') {
    return [{ op: 'setScalar', path, keys: [...keys, side], value }];
  }
  const map: Record<string, number | string> = {};
  for (const other of EDGE_SIDES) {
    if (other === side) {
      map[other] = value;
    } else if (view.mode === 'uniform') {
      map[other] = Number(view.uniform);
    }
  }
  return [{ op: 'putValue', path, keys, value: map }];
}

/** The ops for the all-sides field: a bare numeral (signed for a margin) sets
 * the key to one number, replacing whatever form it had; empty removes it. */
export function edgeUniformOps(
  path: string,
  key: EdgeKey,
  view: EdgeView,
  entry: string,
  rules: EdgeRules,
): Op[] | null {
  const text = entry.trim();
  const keys = ['box', key];
  if (text === '') {
    return view.mode === 'none' ? null : [{ op: 'removeKey', path, keys }];
  }
  if (text === view.uniform || text.length > MAX_EDGE_CHARS || !NUMERAL.test(text)) {
    return null;
  }
  if (!rules.negative && text.startsWith('-')) {
    return null;
  }
  const value = Number(text);
  return [{ op: 'setScalar', path, keys, value: Object.is(value, -0) ? 0 : value }];
}

/** One ▲▼ click on a side: the stepped entry through the same commit rules. */
export function edgeSideStepOps(
  path: string,
  key: EdgeKey,
  view: EdgeView,
  side: EdgeSide,
  dir: number,
  rules: EdgeRules,
): Op[] | null {
  const next = steppedEdge(view.sides[side], dir, rules);
  return next === null ? null : edgeSideOps(path, key, view, side, next, rules);
}

/** One ▲▼ click on the all-sides field. */
export function edgeUniformStepOps(
  path: string,
  key: EdgeKey,
  view: EdgeView,
  dir: number,
  rules: EdgeRules,
): Op[] | null {
  const next = steppedEdge(view.uniform, dir, rules);
  return next === null ? null : edgeUniformOps(path, key, view, next, rules);
}
