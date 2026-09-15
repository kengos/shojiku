// What the DOCUMENT says about an n-up `repeat`'s sheet — its grid, where the
// grid starts, whether it is marked for cutting — and the named ops the
// placement tab's controls dispatch. Framework-free so both halves are
// exhaustively unit testable; `RepeatSection.tsx` stays thin over it.
//
// The wire (docs/engine/repeat.md): `grid.columns`/`grid.rows` are OPTIONAL
// counts defaulting to 1, `grid.direction` is `row | column`, the gaps are
// lengths where an axis key wins over the `gap` shorthand, `breakBefore` is
// `page | auto` and `cutMarks` a boolean. Every default is expressed by leaving
// the key out, so each control that picks a default REMOVES its key (the
// minimal-wire rule the rest of the panel follows).
//
// Reads are hostile-input safe in the area's usual way: a non-map `grid`, a
// container where a scalar belongs, or a read that throws all degrade to the
// engine's defaults — never a throw.

import type { Op, ReadFn } from '@shojiku/designer-core';
import { isRelativeLength, readLength, stepLength } from '../canvas/lengths';
import { display, record } from './itemView';
import { MAX_GAP_PT } from './layoutOps';
import { lengthOp, plainTextOp } from './model';

/** The engine capability keys the two newer controls are gated on: an engine
 * without them parse-rejects the key. */
export const BREAK_BEFORE_CAPABILITY = 'repeat.breakBefore';
export const CUT_MARKS_CAPABILITY = 'repeat.cutMarks';

/** Cells one sheet may hold — the engine's `MAX_IMPOSITION_PER_PAGE`, which
 * clamps a larger grid with `imposition_grid_clamped`. Mirrored rather than
 * approached: a count the engine would clamp is a count the panel refuses. The
 * drift guard is this module's suite. */
export const MAX_CELLS_PER_SHEET = 64;

export const GRID_COUNT_KEYS = ['columns', 'rows'] as const;
export const GRID_GAP_KEYS = ['columnGap', 'rowGap'] as const;
export type GridCountKey = (typeof GRID_COUNT_KEYS)[number];
export type GridGapKey = (typeof GRID_GAP_KEYS)[number];

/** The fill orders the engine accepts, the default first. */
export const FILL_ORDERS = ['row', 'column'] as const;
export type FillOrder = (typeof FILL_ORDERS)[number];

/** The authored sheet, as display strings ('' = unset) plus the EFFECTIVE
 * choices, so a segment or a checkbox always shows what the engine will do. */
export interface RepeatGridView {
  readonly columns: string;
  readonly rows: string;
  readonly columnGap: string;
  readonly rowGap: string;
  /** The `gap` shorthand both axis gaps fall back to ('' = unset). */
  readonly gap: string;
  readonly direction: FillOrder;
  /** `breakBefore` is `page` (or unset) — the grid aligns to a fresh sheet. */
  readonly startsOnNewPage: boolean;
  readonly cutMarks: boolean;
}

const DEFAULTS: RepeatGridView = {
  columns: '',
  rows: '',
  columnGap: '',
  rowGap: '',
  gap: '',
  direction: 'row',
  startsOnNewPage: true,
  cutMarks: false,
};

/** Read the repeat at `path`. A hostile or absent node reads as the defaults. */
export function readRepeatGrid(read: ReadFn, path: string): RepeatGridView {
  let item: Record<string, unknown> | undefined;
  try {
    item = record(read(path));
  } catch {
    return DEFAULTS;
  }
  if (item === undefined) {
    return DEFAULTS;
  }
  const grid = record(item.grid) ?? {};
  return {
    columns: display(grid.columns),
    rows: display(grid.rows),
    columnGap: display(grid.columnGap),
    rowGap: display(grid.rowGap),
    gap: display(grid.gap),
    // A value outside the vocabulary is not echoed as a selection: it would
    // misreport what the engine does with it (it refuses to parse it).
    direction: FILL_ORDERS.find((order) => order === grid.direction) ?? 'row',
    startsOnNewPage: item.breakBefore !== 'auto',
    cutMarks: item.cutMarks === true,
  };
}

/** A count's effective value: unset means the engine's 1; anything that is not
 * a whole number ≥ 1 is `null`. `Number('')` is 0, so emptiness is tested
 * first, never inferred from the number. */
function effectiveCount(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return 1;
  }
  const value = Number(trimmed);
  return Number.isInteger(value) && value >= 1 ? value : null;
}

/** A columns/rows edit. Empty CLEARS the key (the engine's 1). A value that is
 * not a whole number ≥ 1, or that would make the sheet hold more than
 * `MAX_CELLS_PER_SHEET` cells alongside the OTHER axis as authored, authors
 * nothing — the field reseeds. */
export function gridCountOp(
  path: string,
  key: GridCountKey,
  raw: string,
  other: string,
): Op | null {
  const keys = ['grid', key];
  if (raw.trim() === '') {
    return { op: 'removeKey', path, keys };
  }
  const value = effectiveCount(raw);
  const across = effectiveCount(other) ?? 1;
  if (value === null || value * across > MAX_CELLS_PER_SHEET) {
    return null;
  }
  return { op: 'setScalar', path, keys, value };
}

/** Whether a count's ▲▼ can act: its effective value is readable. */
export function countSteppable(current: string): boolean {
  return effectiveCount(current) !== null;
}

/** Step a count by one whole cell from its EFFECTIVE value (unset steps from
 * 1), through the same guard as a typed value — so ▼ cannot reach 0 and ▲
 * cannot pass the sheet's cap. */
export function gridCountStepOp(
  path: string,
  key: GridCountKey,
  current: string,
  dir: number,
  other: string,
): Op | null {
  const value = effectiveCount(current);
  return value === null ? null : gridCountOp(path, key, String(value + dir), other);
}

/** A column/row gap edit — unit-preserving; empty clears the axis key, which
 * hands the axis back to the `gap` shorthand (or to 0). The container gap's
 * ingress rule (`layoutOps.gapOp`), widened by the one thing this wire adds: a
 * RELATIVE gap is legal here (`%` of the region). A negative authors 0 — the
 * engine reads it as 0, and an engine from before the shorthand let it overlap
 * the cells instead — while garbage or an over-cap magnitude authors nothing. */
export function gridGapOp(path: string, key: GridGapKey, raw: string): Op | null {
  const keys = ['grid', key];
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { op: 'removeKey', path, keys };
  }
  const length = readLength(trimmed);
  if (length === null) {
    if (!isRelativeLength(trimmed)) {
      return null;
    }
    return trimmed.startsWith('-')
      ? { op: 'setScalar', path, keys, value: 0 }
      : lengthOp(path, keys, raw);
  }
  if (length.pt > MAX_GAP_PT) {
    return null;
  }
  return length.pt < 0 ? { op: 'setScalar', path, keys, value: 0 } : lengthOp(path, keys, raw);
}

/** A gap ▲▼ step in the authored unit, through the same ingress rule — so ▼
 * from a small gap lands on 0 rather than below it. An unset or relative gap
 * cannot be stepped (its ▲▼ are disabled). */
export function gridGapStepOp(
  path: string,
  key: GridGapKey,
  current: string,
  dir: number,
  step: number,
): Op | null {
  const next = stepLength(current, dir, step);
  return next === null ? null : gridGapOp(path, key, String(next));
}

/** A fill-order pick; the default `row` removes the key. */
export function fillOrderOp(path: string, order: FillOrder): Op {
  return plainTextOp(path, ['grid', 'direction'], order === 'row' ? '' : order);
}

/** "Start on a new page": on is the engine default (`page`, key removed), off
 * authors `auto` — the grid starts under whatever precedes it. */
export function newPageOp(path: string, on: boolean): Op {
  return plainTextOp(path, ['breakBefore'], on ? '' : 'auto');
}

/** "Draw cut marks": on authors `true`; off removes the key (default false). */
export function cutMarksOp(path: string, on: boolean): Op {
  return on
    ? { op: 'setScalar', path, keys: ['cutMarks'], value: true }
    : { op: 'removeKey', path, keys: ['cutMarks'] };
}
