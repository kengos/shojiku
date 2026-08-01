// Pure model for the grid column/row steppers (child layout, grid mode). A column or
// row change is ONE applyAll batch (one undo step) that re-chunks the container's
// row-major children: the column stepper rewrites `box.columns` and pads/removes cells at row
// boundaries, the row stepper edits the child list only (implicit auto rows — no `box.rows`
// key). Existing cells keep their nodes and row-major order; new cells are honest
// placeholder text children (the scaffold's slot). Framework-free so the index
// math and the content-drop detection are exhaustively unit-testable; the panel
// stays thin. Every op is a designer-core `Op` (AI parity).
//
// The engine wire (docs/engine/grid.md): `box.columns` is a count or a track
// list; rows beyond an explicit list are implicit auto, row-major fill. A col
// change writes a COUNT (equal split) — any authored track list collapses to the
// count, ratio-track authoring stays a YAML/AI concern.

import type { Op, ReadFn, SnippetValue } from '@shojiku/designer-core';
import { isPlaceholderSlot } from '../insert/containerModel';

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

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.floor(value)));
}

/** The grid's column COUNT from the wire `columns` value: a finite count ≥1
 * (floored), a non-empty track list's length, or 1 (the engine default) when
 * unset/unresolvable — all clamped to the engine cap. */
function columnCount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 1) {
    return Math.min(MAX_GRID_COLS, Math.floor(value));
  }
  if (Array.isArray(value) && value.length >= 1) {
    return Math.min(MAX_GRID_COLS, value.length);
  }
  return 1;
}

interface GridState {
  readonly cols: number;
  readonly items: readonly unknown[];
}

/** The grid container's current column count + children, or `null` when the
 * node at `path` is not a grid container (a read throw is also `null`). */
function gridState(read: ReadFn, path: string): GridState | null {
  let node: Record<string, unknown> | undefined;
  try {
    node = record(read(path));
  } catch {
    return null;
  }
  const box = record(node?.box);
  if (node?.type !== 'container' || box?.type !== 'grid') {
    return null;
  }
  return {
    cols: columnCount(box.columns),
    items: Array.isArray(node.items) ? node.items : [],
  };
}

function insertPlaceholder(seqPath: string, index: number, defaultText: string): Op {
  const value: SnippetValue = { type: 'text', text: defaultText };
  return { op: 'insertItem', path: seqPath, index, value };
}

/** The batch that changes the grid's column count to `newCols` (clamped
 * `[1, MAX_GRID_COLS]`). Growing pads each row to the new width with
 * placeholders; shrinking drops each row's trailing cells. Item ops emit
 * back-to-front so every index is valid against the intermediate document, then
 * one `setScalar` rewrites `box.columns` to the count. */
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
  const oldCols = state.cols;
  const target = clampInt(newCols, 1, MAX_GRID_COLS);
  if (target === oldCols) {
    return NO_CHANGE;
  }
  const len = state.items.length;
  const seqPath = `${path}${ITEMS_SUFFIX}`;
  const rowCount = Math.ceil(len / oldCols);
  const ops: Op[] = [];
  let drops = false;
  for (let r = rowCount - 1; r >= 0; r--) {
    const rowStart = r * oldCols;
    const rowLen = Math.min(oldCols, len - rowStart);
    if (target > oldCols) {
      for (let k = 0; k < target - rowLen; k++) {
        ops.push(insertPlaceholder(seqPath, rowStart + rowLen, defaultText));
      }
    } else {
      const keep = Math.min(target, rowLen);
      for (let c = rowLen - 1; c >= keep; c--) {
        const index = rowStart + c;
        if (!isPlaceholderSlot(state.items[index], defaultText)) {
          drops = true;
        }
        ops.push({ op: 'removeItem', path: seqPath, index });
      }
    }
  }
  ops.push({ op: 'setScalar', path, keys: ['box', 'columns'], value: target });
  return { ops, drops };
}

/** The batch that changes the grid's ROW count to `newRows` (clamped
 * `[1, MAX_GRID_ROWS]`). Rows are implicit (auto), so this edits the child list
 * only — NO `box.rows` key: growing appends whole rows of placeholders (filling
 * a ragged last row on the way), shrinking truncates trailing children. */
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
  const cols = state.cols;
  const len = state.items.length;
  const oldRows = Math.ceil(len / cols);
  const target = clampInt(newRows, 1, MAX_GRID_ROWS);
  if (target === oldRows) {
    return NO_CHANGE;
  }
  const seqPath = `${path}${ITEMS_SUFFIX}`;
  const ops: Op[] = [];
  if (target > oldRows) {
    // Grow to exactly target×cols cells: a ragged last row fills up on the way,
    // so the stepper's row count lands exactly on the target.
    const add = target * cols - len;
    for (let k = 0; k < add; k++) {
      ops.push(insertPlaceholder(seqPath, len + k, defaultText));
    }
    return { ops, drops: false };
  }
  let drops = false;
  const keepCount = target * cols;
  for (let index = len - 1; index >= keepCount; index--) {
    if (!isPlaceholderSlot(state.items[index], defaultText)) {
      drops = true;
    }
    ops.push({ op: 'removeItem', path: seqPath, index });
  }
  return { ops, drops };
}

/** The current row count shown by the row stepper: `ceil(children / columns)`,
 * or `null` when the node is not a grid. */
export function gridRowCount(read: ReadFn, path: string): number | null {
  const state = gridState(read, path);
  return state === null ? null : Math.ceil(state.items.length / state.cols);
}
