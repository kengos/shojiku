// A box's `padding` or `margin` — the two EDGE keys — as one all-sides value
// plus four per-side values, read the way the wire spells them.
//
// The wire (`engine/core/src/edges.rs`) takes a bare number (every side, in pt)
// or a `{ top, right, bottom, left }` map whose sides are numbers or length
// strings (`pt`/`mm`/`cm`/`in`/`%`/`em`/`rem`); an unset side is 0. The two
// keys differ in exactly two ways, which is what `EdgeRules` carries: a margin
// may be negative and a padding may not, and a margin side may be `auto` —
// meaningful only where the item's owner distributes free space, so the caller
// decides which sides offer it.
//
// This module is what the DOCUMENT says (the view, the rules, the ▲▼ step);
// `edgeOps` is what a field AUTHORS. Side values are shown VERBATIM — there is
// no unit conversion, so a tab-through can never rewrite an authored length.

import { readLength, stepLength } from '../canvas/lengths';

export type EdgeKey = 'padding' | 'margin';
export type EdgeSide = 'top' | 'right' | 'bottom' | 'left';

/** The four sides in wire order. */
export const EDGE_SIDES: readonly EdgeSide[] = ['top', 'right', 'bottom', 'left'];

/** What the key admits at this item. */
export interface EdgeRules {
  /** A margin may pull its box outward; a padding may not (parse error). */
  readonly negative: boolean;
  /** The sides on which `auto` does something here (a margin in a flow body
   * or a flex/grid owner); empty for a padding. */
  readonly auto: ReadonlySet<EdgeSide>;
  /** The sides the engine honours here — all four, or left/right for a table
   * in the flow body. */
  readonly sides: readonly EdgeSide[];
}

/** `none`: unset. `uniform`: one number on every side. `perSide`: a map.
 * `other`: something a document can carry that neither form reads (a string,
 * a hostile value) — shown as unset, replaced by the next edit. */
export type EdgeMode = 'none' | 'uniform' | 'perSide' | 'other';

export interface EdgeView {
  readonly mode: EdgeMode;
  /** The all-sides numeral, or `''` when the sides differ. */
  readonly uniform: string;
  /** Each side as authored (`''` = unset, which the wire reads as 0). */
  readonly sides: Readonly<Record<EdgeSide, string>>;
}

/** A value longer than this is refused rather than written (a hostile paste). */
export const MAX_EDGE_CHARS = 16;
/** A bare signed decimal — the all-sides form, and a side authored as a number. */
export const NUMERAL = /^-?\d+(?:\.\d+)?$/;
/** A side written as a length string. */
export const LENGTH = /^-?\d+(?:\.\d+)?(?:pt|mm|cm|in|%|em|rem)$/;

const EMPTY_SIDES: Readonly<Record<EdgeSide, string>> = {
  top: '',
  right: '',
  bottom: '',
  left: '',
};

function isMap(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sideText(value: unknown): string {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }
  return typeof value === 'string' ? value : '';
}

/** Read `box.<key>` off an item (or frame) node. Own-property reads only, so a
 * document's `__proto__` side never resolves to an inherited value. */
export function readEdge(node: unknown, key: EdgeKey): EdgeView {
  const box = isMap(node) ? node.box : undefined;
  const raw = isMap(box) && Object.hasOwn(box, key) ? box[key] : undefined;
  if (raw === undefined) {
    return { mode: 'none', uniform: '', sides: EMPTY_SIDES };
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const text = String(raw);
    return {
      mode: 'uniform',
      uniform: text,
      sides: { top: text, right: text, bottom: text, left: text },
    };
  }
  if (!isMap(raw)) {
    return { mode: 'other', uniform: '', sides: EMPTY_SIDES };
  }
  const sides = {
    top: Object.hasOwn(raw, 'top') ? sideText(raw.top) : '',
    right: Object.hasOwn(raw, 'right') ? sideText(raw.right) : '',
    bottom: Object.hasOwn(raw, 'bottom') ? sideText(raw.bottom) : '',
    left: Object.hasOwn(raw, 'left') ? sideText(raw.left) : '',
  };
  return { mode: 'perSide', uniform: '', sides };
}

/** Whether ▲▼ can move a value: unset (0), or an absolute length — a bare
 * number or a `pt`/`mm`/`cm`/`in` one, stepped in its own unit. A relative
 * length (`%`, `em`, `rem`) and `auto` cannot be stepped by points. */
export function edgeSteppable(text: string): boolean {
  return text === '' || readLength(text) !== null;
}

/** One ▲▼ click on a length field: `text` (unset = 0) moved by `step` pt in
 * its OWN unit (`canvas/lengths.stepLength`), floored at 0 when `floorZero`.
 * `null` when the value cannot be stepped or the click would not move it. */
export function steppedLength(
  text: string,
  dir: number,
  step: number,
  floorZero: boolean,
): string | null {
  const base = text === '' ? '0' : text;
  const current = readLength(base);
  const next = stepLength(base, dir, step);
  if (current === null || next === null) {
    return null;
  }
  if (floorZero && current.pt + dir * step < 0) {
    return current.pt === 0 ? null : '0';
  }
  const nextText = String(next);
  return nextText === base ? null : nextText;
}

/** The entry one ▲▼ click produces from `text`: a point, in the value's own
 * unit; a padding stops at 0. */
export function steppedEdge(text: string, dir: number, rules: EdgeRules): string | null {
  return steppedLength(text, dir, 1, !rules.negative);
}
