// What the DOCUMENT says about a `char_grid` item's grid, and the named ops its
// controls dispatch. Framework-free so both halves are exhaustively unit
// testable; `CharGridSection.tsx` stays thin over it.
//
// Why this exists at all: the drawn size of manuscript paper is decided by the
// CELLS (`grid.cellSize` × `grid.charsPerLine`/`lines`, plus the gaps), not by
// `box.w` — a wider box simply leaves the same grid sitting in more space. The
// panel offered only `box.w`, so the one control an author could reach was the
// one that does not resize the thing (docs/engine/char_grid.md).
//
// Reads are hostile-input safe in the area's usual way: a non-map `grid`, a
// container where a scalar belongs, or a read that throws all degrade to
// UNSET — never a throw, never a partial object with holes.

import type { Op, ReadFn } from '@shojiku/designer-core';
import { display, record } from './itemView';
import { lengthOp, plainTextOp } from './model';

/** The item type this section edits. */
export const CHAR_GRID_TYPE = 'char_grid';

/** The engine capability the whole section is gated on. An engine without it
 * parse-rejects the item entirely, so the controls must not be offered. */
export const CHAR_GRID_CAPABILITY = 'char_grid';

/** `writingMode` values the engine accepts (docs/engine/char_grid.md). Copied
 * from the wire, never guessed — the drift guard is the section's test. */
export const WRITING_MODES = ['horizontal_tb', 'vertical_rl'] as const;
export type WritingMode = (typeof WRITING_MODES)[number];

/** The engine's default when `writingMode` is unset. */
export const DEFAULT_WRITING_MODE: WritingMode = 'horizontal_tb';

/** The `grid.*` length/count keys, in the order the section renders them. */
export const GRID_COUNT_KEYS = ['charsPerLine', 'lines'] as const;
export const GRID_LENGTH_KEYS = ['cellSize', 'lineGap', 'charGap'] as const;
export type GridCountKey = (typeof GRID_COUNT_KEYS)[number];
export type GridLengthKey = (typeof GRID_LENGTH_KEYS)[number];

/** The authored grid, as display strings ('' = unset). Display strings rather
 * than numbers because the fields are the shipped commit-on-blur widgets and
 * a length keeps its authored unit (`9mm` stays `9mm`). */
export interface CharGridView {
  readonly charsPerLine: string;
  readonly lines: string;
  readonly cellSize: string;
  readonly lineGap: string;
  readonly charGap: string;
  /** The EFFECTIVE writing mode — the engine's default when unset, so the
   * segment always shows a real choice rather than an empty state. */
  readonly writingMode: WritingMode;
}

const EMPTY: CharGridView = {
  charsPerLine: '',
  lines: '',
  cellSize: '',
  lineGap: '',
  charGap: '',
  writingMode: DEFAULT_WRITING_MODE,
};

/** Read the `grid` map and `writingMode` at `path`. A hostile or absent node
 * degrades to every field unset with the default mode. */
export function readCharGrid(read: ReadFn, path: string): CharGridView {
  let item: Record<string, unknown> | undefined;
  try {
    item = record(read(path));
  } catch {
    return EMPTY;
  }
  if (item === undefined) {
    return EMPTY;
  }
  const grid = record(item.grid) ?? {};
  const mode = item.writingMode;
  return {
    charsPerLine: display(grid.charsPerLine),
    lines: display(grid.lines),
    cellSize: display(grid.cellSize),
    lineGap: display(grid.lineGap),
    charGap: display(grid.charGap),
    // An unknown/garbage value is NOT echoed back into the segment: showing it
    // as selected would misreport what the engine will do with it.
    writingMode: WRITING_MODES.find((m) => m === mode) ?? DEFAULT_WRITING_MODE,
  };
}

/** The largest count worth authoring. `charsPerLine × lines` is clamped to
 * 4096 cells at layout (`char_grid_clamped`), so a single dimension past that
 * can never take effect — and a `usize` field must not be handed a value that
 * cannot round-trip. */
export const MAX_GRID_COUNT = 4096;

/** A cell/line COUNT edit. NOT the shared `numberOp`: `charsPerLine` and
 * `lines` are REQUIRED, non-optional `usize` fields on the wire
 * (`CharGridSpec`), so the usual "empty clears the key" rule would author a
 * template the engine cannot parse. Empty, non-integer, below 1 or past the
 * layout cap therefore author NOTHING — the field simply reseeds. */
export function countOp(path: string, key: GridCountKey, raw: string): Op | null {
  const value = Number(raw.trim());
  if (raw.trim() === '' || !Number.isInteger(value) || value < 1 || value > MAX_GRID_COUNT) {
    return null;
  }
  return { op: 'setScalar', path, keys: ['grid', key], value };
}

/** Step a count by one whole cell, through the same guard — so `▼` cannot walk
 * a required dimension down to zero. */
export function countStepOp(
  path: string,
  key: GridCountKey,
  current: string,
  dir: number,
): Op | null {
  // `Number('')` is 0, not NaN — without the steppable check an EMPTY field
  // would step to 1 and author a count the author never typed. The ▲▼ are
  // disabled in that state, so this only fires on a mid-render race, which is
  // exactly when it must not author.
  if (!countSteppable(current)) {
    return null;
  }
  return countOp(path, key, String(Number(current.trim()) + dir));
}

/** Whether a count is in a state the ▲▼ can act on. */
export function countSteppable(current: string): boolean {
  const value = Number(current.trim());
  return current.trim() !== '' && Number.isInteger(value) && value >= 1;
}

/** A grid LENGTH edit (cell side, line gap, char gap) — unit-preserving, and
 * an empty value CLEARS the key, which is what returns `cellSize` to the
 * engine's derive-from-the-content-width behaviour. */
export function gridLengthOp(path: string, key: GridLengthKey, raw: string): Op {
  return lengthOp(path, ['grid', key], raw);
}

/** A writing-mode pick. The engine's default is never authored — an unset key
 * already means it — so picking `horizontal_tb` REMOVES the key rather than
 * writing it (the minimal-wire rule the rest of the panel follows). */
export function writingModeOp(path: string, mode: WritingMode): Op {
  return plainTextOp(path, ['writingMode'], mode === DEFAULT_WRITING_MODE ? '' : mode);
}
