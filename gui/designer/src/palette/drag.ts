// Where a palette→canvas drag LANDS: the flow-body insertion slot (reusing the
// canvas DnD substrate's slot math — `canvas/dnd` — never a second
// implementation) and the cell-vs-body decision. What the drag carries is
// `dragSnippet.ts`; which cell is under the pointer is `cellTarget.ts`.

import type { ReadFn } from '@shojiku/designer-core';
import { siblingRects } from '../canvas/dnd';
import { dropSlotFor, type IndicatorLine, indicatorLine, slotToDocIndex } from '../canvas/dropPlan';
import type { BoxRect, PlacedBox } from '../engine/types';
import { BODY_ITEMS_PATH } from '../insert/model';
import { bindingScopeFor } from '../panel/pickerModel';
import { seqLength } from '../tree/selection';
import { cellUnder } from './cellTarget';
import type { PaletteDragPayload } from './dragSnippet';
import { record } from './fieldDisplay';

/** Where a palette drop lands in the flow body. `line` is the insertion
 * indicator (in page-pt space), `null` at the append fallback. */
export interface InsertDropPlan {
  readonly index: number;
  readonly line: IndicatorLine | null;
}
/** The flow body's item count, 0 when missing/not a list (the op layer still
 * validates the real insert). A read throw reads as 0. */
function bodyLength(read: ReadFn): number {
  try {
    const value = read(BODY_ITEMS_PATH);
    return Array.isArray(value) ? value.length : 0;
  } catch {
    return 0;
  }
}

/** Plan a palette drop at `point` (page-pt) over one page's boxes: the slot
 * among the flow body's laid-out items (the reorder rule — before the first
 * sibling whose midpoint the pointer precedes). Falls back to append-at-end
 * (no indicator) when the body is not a flow, its geometry is ambiguous
 * (repeat fragments duplicating indices), or the pointer is hostile — a drop
 * on the page always means "add it", never a silent nothing. */
export function planInsertDrop(
  read: ReadFn,
  pageBoxes: readonly PlacedBox[],
  point: { readonly x: number; readonly y: number },
): InsertDropPlan {
  let body: Record<string, unknown> | undefined;
  try {
    body = record(read('sections.body'));
  } catch {
    body = undefined;
  }
  if (body === undefined || body.type !== 'flow') {
    return { index: bodyLength(read), line: null };
  }
  // No body items laid out on THIS page (an empty body, or a page carrying
  // only band furniture) → append at the document end rather than guessing a
  // slot from nothing.
  const siblings = siblingRects(pageBoxes, BODY_ITEMS_PATH);
  if (siblings === null || siblings.length === 0) {
    return { index: bodyLength(read), line: null };
  }
  const slot = dropSlotFor(siblings, point.y, 'y');
  if (slot === null) {
    return { index: bodyLength(read), line: null };
  }
  return {
    index: slotToDocIndex(siblings, slot),
    line: indicatorLine(siblings, slot, 'y'),
  };
}

/** Where a completed palette drop inserts, and what the canvas paints while it
 * hovers there. A flow-body drop keeps the insertion LINE (a slot between
 * siblings); a cell drop paints outline RECTS instead — a table row / repeat
 * fragment is one authored sub-template drawn many times, so there is no
 * single slot to point at, only "it goes in here". */
export interface PaletteDropPlan {
  /** The `items` sequence the drop inserts into. */
  readonly path: string;
  readonly index: number;
  /** Author `scope: document` on the bound item — a document field that landed
   * inside a row scope, which would otherwise resolve against the row. */
  readonly documentScoped: boolean;
  /** The flow-body insertion indicator; `null` for a cell drop. */
  readonly line: IndicatorLine | null;
  /** The outlined cell fragments; empty for a body drop. */
  readonly rects: readonly BoxRect[];
}

const NO_RECTS: readonly BoxRect[] = [];
/** Plan a palette drop: into the cell under the pointer when the dragged thing
 * can live there, else into the flow body. `null` means the combination has no
 * meaning — the canvas paints NOTHING and the release does nothing (the
 * canvas-dnd refusal posture), rather than silently landing the item somewhere
 * the user did not aim.
 *
 * `scopeArmed` reports whether the engine understands `binding.scope`: without
 * it a document field cannot be made to resolve inside a row, so the drop is
 * refused rather than authored as a binding that would read the row. */
export function planPaletteDrop(
  read: ReadFn,
  pageBoxes: readonly PlacedBox[],
  point: { readonly x: number; readonly y: number },
  payload: PaletteDragPayload,
  scopeArmed: boolean,
): PaletteDropPlan | null {
  const cell = cellUnder(read, pageBoxes, point);
  if (cell === null) {
    // A row-relative key addresses a field of one array element — meaningless
    // in the document-scope body, so those rows simply do not drop there.
    if (payload.kind === 'field' && payload.field.group !== null) {
      return null;
    }
    const slot = planInsertDrop(read, pageBoxes, point);
    return {
      path: BODY_ITEMS_PATH,
      index: slot.index,
      documentScoped: false,
      line: slot.line,
      rects: NO_RECTS,
    };
  }
  // A group's scaffold is a body-level construct (`repeat_flow` is flow-body
  // only); nesting one by drag would author a shape the insert dialog refuses.
  if (payload.kind === 'group') {
    return null;
  }
  const group = payload.field.group;
  if (group === null ? !scopeArmed : bindingScopeFor(read, `${cell.items}[0]`) !== group) {
    return null;
  }
  return {
    path: cell.items,
    index: seqLength(read, cell.items),
    documentScoped: group === null,
    line: null,
    rects: pageBoxes.filter((box) => box.path === cell.owner).map((box) => box.border),
  };
}
