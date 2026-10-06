// The two cell edits every grid count change is made of, over the grid's CELLS
// in fill order. A grid fills its cells in LINES: rows when it fills across then
// down (the default), columns when it fills down then across (`direction:
// column`). So changing the count ALONG a line pads or trims every line
// (`relineOps`), and changing how MANY lines there are appends or drops whole
// lines at the end (`resizeLinesOps`). `gridStructure.ts` picks which is which
// from the fill order — the same edit is a column change in one grid and a row
// change in the other. Item ops are emitted back-to-front so every index stays
// valid against the intermediate document.

import type { Op, SnippetValue } from '@shojiku/designer-core';
import { isPlaceholderSlot } from '../insert/containerModel';
import type { GridState } from './gridState';

/** The ops plus whether any of them deletes a content-bearing cell. */
export interface LineEdit {
  readonly ops: Op[];
  readonly drops: boolean;
}

function insertPlaceholder(seqPath: string, index: number, defaultText: string): Op {
  const value: SnippetValue = { type: 'text', text: defaultText };
  return { op: 'insertItem', path: seqPath, index, value };
}

function removeCell(state: GridState, seqPath: string, cell: number, defaultText: string) {
  const index = state.cells[cell];
  return {
    op: { op: 'removeItem', path: seqPath, index } as Op,
    drops: !isPlaceholderSlot(state.items[index], defaultText),
  };
}

/** Every line from `lineLen` cells to `newLen`: padded with placeholders just
 * after the line's last cell (so a line's cells stay together), or trimmed of
 * its trailing cells. */
export function relineOps(
  state: GridState,
  seqPath: string,
  lineLen: number,
  newLen: number,
  defaultText: string,
): LineEdit {
  const len = state.cells.length;
  const ops: Op[] = [];
  let drops = false;
  for (let line = Math.ceil(len / lineLen) - 1; line >= 0; line--) {
    const start = line * lineLen;
    const count = Math.min(lineLen, len - start);
    if (newLen > lineLen) {
      const after = state.cells[start + count - 1] + 1;
      for (let k = 0; k < newLen - count; k++) {
        ops.push(insertPlaceholder(seqPath, after, defaultText));
      }
      continue;
    }
    for (let c = count - 1; c >= Math.min(newLen, count); c--) {
      const removed = removeCell(state, seqPath, start + c, defaultText);
      ops.push(removed.op);
      drops ||= removed.drops;
    }
  }
  return { ops, drops };
}

/** The grid to exactly `newLines` lines of `lineLen` cells: placeholders
 * appended at the end of the child list (a ragged last line fills up on the
 * way), or the trailing cells dropped. */
export function resizeLinesOps(
  state: GridState,
  seqPath: string,
  lineLen: number,
  newLines: number,
  defaultText: string,
): LineEdit {
  const len = state.cells.length;
  const keep = newLines * lineLen;
  const ops: Op[] = [];
  let drops = false;
  for (let k = 0; k < keep - len; k++) {
    ops.push(insertPlaceholder(seqPath, state.items.length + k, defaultText));
  }
  for (let c = len - 1; c >= keep; c--) {
    const removed = removeCell(state, seqPath, c, defaultText);
    ops.push(removed.op);
    drops ||= removed.drops;
  }
  return { ops, drops };
}
