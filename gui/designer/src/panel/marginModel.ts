// Pure form model for the page-margin editor (the `page.margin` wire): reads the
// display view out of the materialized `page:` map and builds the named
// `designer-core` ops each control dispatches (AI parity — the panel never
// mutates the document). Two modes, wire-derived like the size named/custom
// split: a bare pt NUMBER = uniform (all sides), a `{ top, right, bottom, left }`
// MAP = per-side. Per-side values are carried and written VERBATIM (a bare
// numeral → a pt number, a unit/`%` value → the string as-is): no display↔wire
// unit conversion, so a mere tab-through can never rewrite an authored length
// (the round-trip trap the custom-size code hit). A legacy `[t,r,b,l]` array is
// shown per-side and canonicalized to a map on the first edit.

import type { Op } from '@shojiku/designer-core';
import { stepNumeral } from './model';

export type MarginMode = 'uniform' | 'perSide';
export type MarginSide = 'top' | 'right' | 'bottom' | 'left';

/** The four sides in wire order (also the legacy array order [t, r, b, l]). */
export const MARGIN_SIDES: readonly MarginSide[] = ['top', 'right', 'bottom', 'left'];

/** The engine's default all-sides margin (pt) when `page.margin` is absent. */
const DEFAULT_MARGIN = '25';

/** Hostile-string clip: a side value longer than this is rejected (no-op). */
const MAX_MARGIN_CHARS = 12;

/** A bare non-negative decimal — a pt margin written as a plain number. */
const BARE_NUMERAL = /^\d+(?:\.\d+)?$/;
/** A non-negative decimal with a length unit or `%` — written verbatim. */
const UNIT_VALUE = /^\d+(?:\.\d+)?(?:mm|cm|in|pt|%)$/;

type Sides = Record<MarginSide, string>;

export interface MarginView {
  readonly mode: MarginMode;
  /** The uniform all-sides numeral as text (the `uniform` input seed). */
  readonly uniform: string;
  /** Each side's authored value verbatim; an unset side reads `"0"` (the wire
   * treats an unset per-side entry as 0, not the 25 default). */
  readonly sides: Sides;
  readonly hasMarginKey: boolean;
  /** The wire form currently under `page.margin` — drives the per-side edit op
   * (a `map` takes a single-side set; anything else materializes the full map). */
  readonly backing: 'none' | 'scalar' | 'map' | 'array';
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** A wire side value as text: a string verbatim, a finite number stringified,
 * anything else (missing / null / object) the wire-default `"0"`. */
function sideText(raw: unknown): string {
  if (typeof raw === 'string') {
    return raw;
  }
  return typeof raw === 'number' && Number.isFinite(raw) ? String(raw) : '0';
}

/** Seed all four sides uniformly (a scalar/absent margin collapsed for the
 * per-side switch). */
function uniformSides(value: string): Sides {
  return { top: value, right: value, bottom: value, left: value };
}

/** Read the margin view from a materialized `page:` node (or `undefined` — no
 * `page:` key, treated as the default 25pt uniform). */
export function readMarginView(pageRaw: unknown): MarginView {
  const page = record(pageRaw);
  const raw = page?.margin;
  const hasMarginKey = raw !== undefined;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const value = String(raw);
    return {
      mode: 'uniform',
      uniform: value,
      sides: uniformSides(value),
      hasMarginKey,
      backing: 'scalar',
    };
  }
  const map = record(raw);
  if (map !== undefined) {
    const sides = {
      top: sideText(map.top),
      right: sideText(map.right),
      bottom: sideText(map.bottom),
      left: sideText(map.left),
    };
    return { mode: 'perSide', uniform: uniformSeed(sides), sides, hasMarginKey, backing: 'map' };
  }
  if (Array.isArray(raw)) {
    const sides = {
      top: sideText(raw[0]),
      right: sideText(raw[1]),
      bottom: sideText(raw[2]),
      left: sideText(raw[3]),
    };
    return { mode: 'perSide', uniform: uniformSeed(sides), sides, hasMarginKey, backing: 'array' };
  }
  // Absent, or an unrecognized scalar (a hand-authored bad value the engine
  // reports separately): show the uniform default; a uniform write replaces it.
  return {
    mode: 'uniform',
    uniform: DEFAULT_MARGIN,
    sides: uniformSides(DEFAULT_MARGIN),
    hasMarginKey,
    backing: hasMarginKey ? 'scalar' : 'none',
  };
}

/** The uniform seed for a per-side view: the top side when it is a bare pt
 * numeral (so collapsing a uniform-looking map keeps its value), else the
 * default — units/`%` have no single uniform numeral. */
function uniformSeed(sides: Sides): string {
  return BARE_NUMERAL.test(sides.top) ? sides.top : DEFAULT_MARGIN;
}

/** Coerce a side input to its wire scalar: a bare numeral → a pt number, a
 * unit/`%` value → the string verbatim, anything else (empty, over-long,
 * negative, garbage) → null (nothing dispatched). */
function sideScalar(text: string): number | string | null {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_MARGIN_CHARS) {
    return null;
  }
  if (BARE_NUMERAL.test(trimmed)) {
    return Number(trimmed);
  }
  return UNIT_VALUE.test(trimmed) ? trimmed : null;
}

function setSide(side: MarginSide, value: number | string): Op {
  return { op: 'setScalar', keys: ['page', 'margin', side], value };
}

/** The op for the uniform all-sides input commit: a bare pt number replacing
 * the `margin` node, or null when the value is not a non-negative numeral (the
 * all-sides form is a bare number only — a unit there is an engine parse error). */
export function uniformMarginOp(text: string): Op[] | null {
  const trimmed = text.trim();
  if (!BARE_NUMERAL.test(trimmed)) {
    return null;
  }
  return [{ op: 'setScalar', keys: ['page', 'margin'], value: Number(trimmed) }];
}

/** Whether the ▲▼ can move the uniform margin: the same bare-numeral test the
 * typed commit passes through, so the buttons are offered exactly where typing
 * the shown value would be accepted. */
export function canStepUniformMargin(text: string): boolean {
  return BARE_NUMERAL.test(text.trim());
}

/** The ops for one ▲▼ click on the uniform margin: step by one point, then
 * re-author through `uniformMarginOp`.
 *
 * Going back through that builder is what keeps the two entry points honest:
 * the generic `stepValueOp` the item fields use would author `-1` from a `0`
 * margin, a value this field refuses from the keyboard.
 *
 * The floor is CLAMPED rather than declined, because `0` is a legal all-sides
 * margin: ▼ from `0.5` reaches it, the way a native
 * `<input type="number" min="0">` clamps at its minimum instead of going
 * inert. Declining there would leave an enabled button that can never reach a
 * value typing reaches fine. At the floor itself the clamp is a no-op and
 * nothing is dispatched, so no undo entry is minted for a change that did not
 * happen. */
export function stepUniformMarginOp(text: string, dir: number): Op[] | null {
  if (!canStepUniformMargin(text)) {
    return null;
  }
  const next = stepNumeral(text, dir);
  if (next === null) {
    return null;
  }
  const clamped = Number(next) < 0 ? '0' : next;
  return clamped === text.trim() ? null : uniformMarginOp(clamped);
}

/** The batch that switches to per-side: drop the existing `margin` (if any),
 * then write all four sides from the current seeds (so no side is silently
 * zeroed by the "unset = 0" rule). One undo step. */
export function enterPerSideOps(view: MarginView): Op[] {
  const ops: Op[] = [];
  if (view.hasMarginKey) {
    ops.push({ op: 'removeKey', keys: ['page', 'margin'] });
  }
  for (const side of MARGIN_SIDES) {
    ops.push(setSide(side, sideScalar(view.sides[side]) ?? 0));
  }
  return ops;
}

/** The op that switches back to a uniform margin: a single bare pt number
 * (the view's uniform seed) replacing the per-side map. */
export function enterUniformOps(view: MarginView): Op[] {
  return [{ op: 'setScalar', keys: ['page', 'margin'], value: Number(view.uniform) }];
}

/** The op(s) for one per-side input commit: a single-side set when the map
 * already backs the margin; otherwise (a legacy array, or a not-yet-materialized
 * form) the full map is rebuilt with this edit applied. null on an invalid value. */
export function perSideOp(view: MarginView, side: MarginSide, text: string): Op[] | null {
  const scalar = sideScalar(text);
  if (scalar === null) {
    return null;
  }
  if (view.backing === 'map') {
    return [setSide(side, scalar)];
  }
  const ops: Op[] = [];
  if (view.hasMarginKey) {
    ops.push({ op: 'removeKey', keys: ['page', 'margin'] });
  }
  for (const s of MARGIN_SIDES) {
    ops.push(setSide(s, s === side ? scalar : (sideScalar(view.sides[s]) ?? 0)));
  }
  return ops;
}
