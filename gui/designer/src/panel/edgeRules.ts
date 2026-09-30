// What a padding or margin admits at one item, decided by its TYPE and by how
// its owner places it (`placementModel`). Written against the layout source:
//
//   * `auto` margin sides take free space only where an owner distributes it —
//     the flow body, horizontally (`flex/slots.rs`), and a container laying its
//     children out by flex or grid, on every side (`flex/offsets.rs`,
//     `flex/column.rs`, `grid.rs`). A band, the absolute body, a pinned
//     container child and a sub-template item resolve it to 0, so it is not
//     offered there.
//   * a TABLE in the flow body honours only its left and right padding and
//     margin (`table.rs`), and a left/right `auto` pair centres it.

import type { EdgeKey, EdgeRules, EdgeSide } from './edgeModel';
import { EDGE_SIDES } from './edgeModel';
import type { Placement } from './placementModel';

const NONE: ReadonlySet<EdgeSide> = new Set();
const HORIZONTAL: readonly EdgeSide[] = ['left', 'right'];

/** The margin sides on which `auto` does something for this placement. */
export function autoSides(placement: Placement): ReadonlySet<EdgeSide> {
  if (placement.kind === 'flow') {
    return new Set(HORIZONTAL);
  }
  return placement.kind === 'pinnable' && !placement.pinned ? new Set(EDGE_SIDES) : NONE;
}

/** Whether only the horizontal sides reach the page: a table in the flow body. */
export function horizontalOnly(type: string, placement: Placement): boolean {
  return type === 'table' && placement.kind === 'flow';
}

export function edgeRules(key: EdgeKey, type: string, placement: Placement): EdgeRules {
  const sides = horizontalOnly(type, placement) ? HORIZONTAL : EDGE_SIDES;
  return key === 'padding'
    ? { negative: false, auto: NONE, sides }
    : { negative: true, auto: autoSides(placement), sides };
}

/** A sub-template frame's padding (a repeat cell, a card, a column cell). */
export const FRAME_PADDING_RULES: EdgeRules = { negative: false, auto: NONE, sides: EDGE_SIDES };
