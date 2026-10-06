// The grid container the column/row steppers edit, as their plans need it: its
// column count, its children, and which of them are CELLS — the children the
// grid lays out (`isFlexItem`; a positioned child or a `line` occupies none).
// Split from `gridStructure.ts`, whose plans are the only consumer.

import type { ReadFn } from '@shojiku/designer-core';
import { isFlexItem } from './flexParticipants';
import { MAX_GRID_TRACKS } from './layoutModel';

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function clampInt(value: number, min: number, max: number): number {
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
    return Math.min(MAX_GRID_TRACKS, Math.floor(value));
  }
  if (Array.isArray(value) && value.length >= 1) {
    return Math.min(MAX_GRID_TRACKS, value.length);
  }
  return 1;
}

export interface GridState {
  readonly cols: number;
  readonly items: readonly unknown[];
  /** The child-list index of every CELL, in order. */
  readonly cells: readonly number[];
  /** The authored `columns` / `rows` values (a list is resized in place). */
  readonly columns: unknown;
  readonly rows: unknown;
  /** The grid fills down then across (`direction: column`): its LINES are
   * columns rather than rows. */
  readonly byColumn: boolean;
}

/** The grid container's current column count + children, or `null` when the
 * node at `path` is not a grid container (a read throw is also `null`). */
export function gridState(read: ReadFn, path: string): GridState | null {
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
  const items = Array.isArray(node.items) ? node.items : [];
  const cells: number[] = [];
  items.forEach((child, index) => {
    if (isFlexItem(child)) {
      cells.push(index);
    }
  });
  return {
    cols: columnCount(box.columns),
    items,
    cells,
    columns: box.columns,
    rows: box.rows,
    byColumn: box.direction === 'column',
  };
}
