// Pure op builders for the table's row and page settings (`tableSettingsModel`
// reads them). Every builder answers `null` — dispatch nothing, mint no undo
// step — for an entry the wire should not receive, so a refused edit and a
// no-op pick look the same to the caller.
//
// The ingress rules are borrowed from the siblings that already guard each
// value kind rather than invented: a row height is a length like a container
// gap (`layoutOps.gapOp` — absolute units only, a magnitude cap), minus the
// negative clamp, because a negative height is not "0" to the engine but "auto
// with a warning"; the cell padding is a padding (the all-sides rule of
// `edgeModel` — a bare non-negative numeral, since the wire takes a plain number in pt). Turning a
// setting back to its engine default REMOVES the key rather than spelling the
// default out, the `hiddenHeaderToggleOp` precedent: an unset key already means
// it, and the file returns to what it was before the setting was touched.

import type { Op } from '@shojiku/designer-core';
import { readLength, stepLength } from '../canvas/lengths';
import { type GroupRow, groupCoverage } from './groupModel';
import { lengthOp } from './model';
import {
  DEFAULT_CELL_PADDING,
  DEFAULT_ROW_MIN_HEIGHT,
  EMPTY_BEHAVIORS,
  type TableSettingsView,
} from './tableSettingsModel';

/** A magnitude no real row reaches — a hostile paste stops here. */
export const MAX_ROW_HEIGHT_PT = 10000;

/** What a height may go down to: a floor of `0` for the auto-row minimum, and
 * `positive` for a fixed height, where 0 would draw rows with no room at all. */
export type HeightFloor = 'zero' | 'positive';

const ROW_HEIGHT = ['row', 'height'] as const;
const ROW_MIN_HEIGHT = ['row', 'minHeight'] as const;

/** The padding no real cell reaches — the heights' bound, for the same reason. */
export const MAX_CELL_PADDING_PT = 10000;

/** A bare non-negative decimal — the only `cellPadding` spelling the wire takes. */
const BARE_NUMERAL = /^\d+(?:\.\d+)?$/;

/** A committed height entry. Empty clears the key; an absolute length in range
 * is authored in its typed form (`12` stays a number, `10mm` stays mm); a
 * relative unit, garbage, a value under the floor or over the cap is refused. */
export function rowLengthOp(
  path: string,
  keys: readonly string[],
  raw: string,
  floor: HeightFloor,
): Op | null {
  if (raw.trim() === '') {
    return { op: 'removeKey', path, keys };
  }
  const length = readLength(raw);
  if (length === null || length.pt > MAX_ROW_HEIGHT_PT) {
    return null;
  }
  if (length.pt < 0 || (floor === 'positive' && length.pt === 0)) {
    return null;
  }
  return lengthOp(path, keys, raw);
}

/** One ▲▼ click on a height: steps the shown value (or `base` when the field is
 * empty) by a point, in its authored unit. Stopping at the floor dispatches
 * nothing rather than authoring a value the entry path would refuse. */
export function rowLengthStepOp(
  path: string,
  keys: readonly string[],
  current: string,
  base: number,
  dir: 1 | -1,
  floor: HeightFloor,
): Op | null {
  const next = stepLength(current.trim() === '' ? String(base) : current, dir, 1);
  return next === null ? null : rowLengthOp(path, keys, String(next), floor);
}

/** The value a newly-fixed row height starts from: the auto rows' own floor
 * when the document gives a usable one (so switching modes changes nothing on
 * the page for a table whose rows sit at their minimum), else the engine's. */
function fixedSeed(minHeight: string): number | string {
  const length = readLength(minHeight);
  if (length === null || length.pt <= 0 || length.pt > MAX_ROW_HEIGHT_PT) {
    return DEFAULT_ROW_MIN_HEIGHT;
  }
  return length.unit === null ? length.pt : minHeight.trim();
}

/** The auto⇄fixed pick. Fixed authors `row.height` and, in the SAME batch,
 * drops the `row.minHeight` whose field the fixed mode hides — the engine
 * ignores it once a fixed height is set, so leaving it would keep a value in
 * the file that no control shows. Auto removes only `row.height`. Re-picking
 * the mode on screen is no edit. */
export function rowModeOps(
  path: string,
  view: TableSettingsView,
  mode: 'auto' | 'fixed',
): Op[] | null {
  if (mode === view.rowMode) {
    return null;
  }
  if (mode === 'auto') {
    return [{ op: 'removeKey', path, keys: ROW_HEIGHT }];
  }
  const ops: Op[] = [{ op: 'setScalar', path, keys: ROW_HEIGHT, value: fixedSeed(view.minHeight) }];
  if (view.minHeightAuthored) {
    ops.push({ op: 'removeKey', path, keys: ROW_MIN_HEIGHT });
  }
  return ops;
}

/** A committed `cellPadding`: a bare numeral sets it, empty removes an authored
 * one (and is no edit when there is none), a sign, a unit or garbage is
 * refused. */
export function cellPaddingOp(path: string, current: string, raw: string): Op | null {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return current === '' ? null : { op: 'removeKey', path, keys: ['cellPadding'] };
  }
  if (!BARE_NUMERAL.test(trimmed) || Number(trimmed) > MAX_CELL_PADDING_PT) {
    return null;
  }
  return { op: 'setScalar', path, keys: ['cellPadding'], value: Number(trimmed) };
}

/** Whether ▲▼ can move the padding: unset (it steps from the engine default)
 * or a bare numeral. */
export function canStepCellPadding(current: string): boolean {
  return current === '' || BARE_NUMERAL.test(current.trim());
}

/** One ▲▼ click on the padding: a point from the shown value, clamped at 0;
 * the floor itself dispatches nothing. */
export function cellPaddingStepOp(path: string, current: string, dir: 1 | -1): Op | null {
  if (!canStepCellPadding(current)) {
    return null;
  }
  const base = current === '' ? DEFAULT_CELL_PADDING : Number(current.trim());
  const next = Math.max(0, Math.round((base + dir) * 1000) / 1000);
  return next === base ? null : cellPaddingOp(path, current, String(next));
}

/** An `emptyBehavior` pick. `collapse` is the engine default, so picking it
 * removes an authored `reserve`; re-picking what is on screen, or anything
 * outside the engine's two values, is no edit. */
export function emptyBehaviorOp(
  path: string,
  current: TableSettingsView['emptyBehavior'],
  next: string,
): Op | null {
  if (next === current || !(EMPTY_BEHAVIORS as readonly string[]).includes(next)) {
    return null;
  }
  return next === 'reserve'
    ? { op: 'setScalar', path, keys: ['emptyBehavior'], value: 'reserve' }
    : { op: 'removeKey', path, keys: ['emptyBehavior'] };
}

/** The four table switches and the value each takes when unset. */
export const TABLE_FLAG_DEFAULTS = {
  autoPageBreak: true,
  repeatHeader: true,
  keepTogether: false,
  mergeEmptyCells: false,
} as const;
export type TableFlag = keyof typeof TABLE_FLAG_DEFAULTS;

/** Flip one switch from `current`. Moving AWAY from the engine default writes
 * the boolean; moving back to it removes the key. */
export function flagToggleOp(path: string, flag: TableFlag, current: boolean): Op {
  const next = !current;
  return next === TABLE_FLAG_DEFAULTS[flag]
    ? { op: 'removeKey', path, keys: [flag] }
    : { op: 'setScalar', path, keys: [flag], value: next };
}

/** How many columns no header group covers yet — the engine's own
 * accumulation, asked as "where would one more group start". */
export function uncoveredColumns(groups: readonly GroupRow[], columnCount: number): number {
  const next = groupCoverage([...groups, { label: '', span: '1' }], columnCount, groups.length);
  return next === null ? 0 : columnCount - next.start;
}

/** Append a header group over every column still uncovered, or `null` when
 * there is none. `span` is REQUIRED by the wire, so it is always written. */
export function addHeaderGroupOp(
  path: string,
  groups: readonly GroupRow[],
  columnCount: number,
  label: string,
): Op | null {
  const span = uncoveredColumns(groups, columnCount);
  if (span <= 0) {
    return null;
  }
  return {
    op: 'insertItem',
    path: `${path}.headerGroups`,
    index: groups.length,
    value: { label, span },
  };
}

/** Remove group `index` of `length`. The last one takes the `headerGroups` key
 * with it, so a table that never had groups returns to exactly what it was. */
export function removeHeaderGroupOp(path: string, index: number, length: number): Op {
  return length <= 1
    ? { op: 'removeKey', path, keys: ['headerGroups'] }
    : { op: 'removeItem', path: `${path}.headerGroups`, index };
}
