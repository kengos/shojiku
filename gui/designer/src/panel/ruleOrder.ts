// Where a table's row-condition rule SITS: the list shows `row.conditionalStyles`
// REVERSED — the top card is the last entry, the one that wins — because the
// engine applies the entries in listed order and a later one overrides an
// earlier one, while a spreadsheet's rule list reads top-down as "this one
// first". Only the list maps; the wire, every op builder and the open rule
// stay in wire indices.
//
// A reorder is ONE `moveItem` on the sequence (never a whole-list rewrite, which
// would re-serialize every rule), so the moved rule keeps its own text and
// comments, and the move is one undo step — including the comment directly
// above the first entry, which `moveItem` hands to that entry although the
// YAML library files it on the sequence; a note separated from it by a blank
// line stays at the top as the list's. The drag's slot math is the layer
// tree's (`moveOpFor`), run in display space and then mapped.

import type { Op } from '@shojiku/designer-core';
import { moveOpFor } from '../tree/reorder';

/** The engine applies only the first this-many entries
 * (`MAX_ROW_CONDITIONAL_STYLES`); the list stops offering "add" there, and a
 * hand-authored entry past it is marked as not applied. */
export const MAX_ROW_CONDITIONS = 16;

/** The wire index of the card at display position `display` among `count`
 * rules — and, since the reversal is its own inverse, the display position of
 * wire index `display` too. */
export function wireIndex(count: number, display: number): number {
  return count - 1 - display;
}

/** The sequence every reorder addresses. */
export function rulesPath(tablePath: string): string {
  return `${tablePath}.row.conditionalStyles`;
}

/** Moves the rule at wire index `from` to wire index `to` (the post-splice
 * index `moveItem` takes). `null` when either end is out of range or the rule
 * would not move — no edit, no undo step. */
export function moveRuleOp(
  tablePath: string,
  entries: readonly unknown[],
  from: number,
  to: number,
): Op | null {
  const inRange = (index: number) => index >= 0 && index < entries.length;
  if (!inRange(from) || !inRange(to) || from === to) {
    return null;
  }
  return { op: 'moveItem', path: rulesPath(tablePath), from, to };
}

/** The move a drag realizes: the card at display position `from` dropped into
 * display insertion `slot` (0..count). The ONE function the drop line and the
 * release both read, so a slot that paints a line is a slot that moves. */
export function dragMoveOp(
  tablePath: string,
  entries: readonly unknown[],
  from: number,
  slot: number,
): Op | null {
  const count = entries.length;
  const shown = moveOpFor('', from, slot);
  if (shown === null) {
    return null;
  }
  return moveRuleOp(tablePath, entries, wireIndex(count, from), wireIndex(count, shown.to));
}
