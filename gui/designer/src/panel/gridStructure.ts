// Pure model for the grid column/row steppers (child layout, grid mode). A column or
// row change is ONE applyAll batch (one undo step) that re-chunks the container's
// CELLS — the children the engine lays out in the grid (`isFlexItem`; a positioned
// child or a `line` occupies no cell and is never moved, counted or dropped) — in
// their FILL order (`gridLines.ts`): across-then-down a column change pads or trims
// every row and a row change adds or drops whole rows; down-then-across
// (`direction: column`) the two swap. `box.columns` follows in its own form (a
// count stays a count, a track LIST gains copies of its last track or loses
// trailing ones, `gridTracks.ts`), and an authored `box.rows` follows a row change
// (a count is rewritten, a longer list trimmed — rows past a list are implicit
// auto). Existing cells keep their nodes and fill order; new cells are honest
// placeholder text children (the scaffold's slot). Framework-free so the index
// math and the content-drop detection are exhaustively unit-testable; the panel
// stays thin. Every op is a designer-core `Op` (AI parity).
//
// The engine wire (docs/engine/grid.md): `box.columns` is a count or a track
// list; rows beyond an explicit list are implicit auto. A grid with a spanning
// child is not re-chunked here at all — its cells no longer map one to a slot,
// so the panel withholds the steppers (`GridSection`).

import type { Op, ReadFn } from '@shojiku/designer-core';
import { relineOps, resizeLinesOps } from './gridLines';
import { clampInt, gridState } from './gridState';
import { trackListResizeOps } from './gridTracks';

/** The engine's per-axis track cap (`MAX_GRID_TRACKS`) — columns clamp here. */
export const MAX_GRID_COLS = 64;
/** The stepper's row ceiling. Implicit auto rows have no engine cap, but a
 * huge row count would author a huge child list; bound it symmetrically. A
 * change whose batch would exceed `MAX_BATCH_OPS` is rejected whole by the op
 * layer (safe no-op) — the ±1 stepper path never approaches it. */
export const MAX_GRID_ROWS = 64;

const ITEMS_SUFFIX = '.items';

/** A grid col/row plan: the batch to apply, and whether it DROPS any
 * content-bearing cell (the panel confirms before a lossy shrink; an
 * all-placeholder shrink is silent). An empty `ops` means no change. */
export interface GridPlan {
  readonly ops: readonly Op[];
  readonly drops: boolean;
}

const NO_CHANGE: GridPlan = { ops: [], drops: false };

/** The batch that changes the grid's column count to `newCols` (clamped
 * `[1, MAX_GRID_COLS]`), keeping the row count: across-then-down every row is
 * padded or trimmed; down-then-across whole columns are appended or dropped.
 * `box.columns` follows in its authored form. */
export function gridColumnsPlan(
  read: ReadFn,
  path: string,
  newCols: number,
  defaultText: string,
): GridPlan {
  const state = gridState(read, path);
  if (state === null) {
    return NO_CHANGE;
  }
  const target = clampInt(newCols, 1, MAX_GRID_COLS);
  if (target === state.cols) {
    return NO_CHANGE;
  }
  const seqPath = `${path}${ITEMS_SUFFIX}`;
  const rows = Math.ceil(state.cells.length / state.cols);
  const edit = state.byColumn
    ? resizeLinesOps(state, seqPath, rows, target, defaultText)
    : relineOps(state, seqPath, state.cols, target, defaultText);
  const columnsOps: Op[] = Array.isArray(state.columns)
    ? trackListResizeOps(path, 'columns', state.columns, target)
    : [{ op: 'setScalar', path, keys: ['box', 'columns'], value: target }];
  return { ops: [...edit.ops, ...columnsOps], drops: edit.drops };
}

/** What a row-count change does to an authored `box.rows`: a COUNT follows the
 * new count (equal rows, as before); a LIST is trimmed when it is longer (rows
 * past a list are implicit, so a shorter one needs nothing); absent stays absent. */
function rowsKeyOps(path: string, rows: unknown, target: number): Op[] {
  if (typeof rows === 'number') {
    return [{ op: 'setScalar', path, keys: ['box', 'rows'], value: target }];
  }
  if (Array.isArray(rows) && rows.length > target) {
    return trackListResizeOps(path, 'rows', rows, target);
  }
  return [];
}

/** The batch that changes the grid's ROW count to `newRows` (clamped
 * `[1, MAX_GRID_ROWS]`), keeping the column count: across-then-down whole rows
 * are appended or dropped (a ragged last row fills up on the way);
 * down-then-across every column is padded or trimmed. An authored `box.rows`
 * follows (`rowsKeyOps`): the engine keeps every listed row, so a longer list
 * would leave empty rows behind. */
export function gridRowsPlan(
  read: ReadFn,
  path: string,
  newRows: number,
  defaultText: string,
): GridPlan {
  const state = gridState(read, path);
  if (state === null) {
    return NO_CHANGE;
  }
  const rows = Math.ceil(state.cells.length / state.cols);
  const target = clampInt(newRows, 1, MAX_GRID_ROWS);
  if (target === rows) {
    return NO_CHANGE;
  }
  const seqPath = `${path}${ITEMS_SUFFIX}`;
  const edit = state.byColumn
    ? relineOps(state, seqPath, rows, target, defaultText)
    : resizeLinesOps(state, seqPath, state.cols, target, defaultText);
  return { ops: [...edit.ops, ...rowsKeyOps(path, state.rows, target)], drops: edit.drops };
}

/** The current row count shown by the row stepper: `ceil(children / columns)`,
 * or `null` when the node is not a grid. */
export function gridRowCount(read: ReadFn, path: string): number | null {
  const state = gridState(read, path);
  return state === null ? null : Math.ceil(state.cells.length / state.cols);
}
