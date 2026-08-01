// Which sub-template CELL a palette drop is over: a table column's `cell:`, a
// `repeat` cell, a `repeat_flow` card's `item:`. The innermost hit wins (a
// table nested in a card), and everything else refuses — which is what keeps a
// plain table column, with no `cell:` to enter, out of the drop targets.
// Untrusted input: an unparseable path or a throwing read reads as 'not a
// cell'.

import { formatPath, parsePath, type ReadFn } from '@shojiku/designer-core';
import type { BoxRect, PlacedBox } from '../engine/types';
import { record } from './fieldDisplay';

/** The sub-template keys whose `items` a drop can enter: a table column's
 * `cell:`, a `repeat` cell, a `repeat_flow` card's `item:`. */
const CELL_KEYS = new Set(['cell', 'item']);

interface CellTarget {
  /** The `…<cell|item>.items` sequence a drop appends to. */
  readonly items: string;
  /** The sub-template OWNER (the column / the repeat item) — every page box
   * carrying this path is one drawn fragment of it, so they all outline. */
  readonly owner: string;
  /** Path depth, so the INNERMOST hit target wins (a table nested in a card). */
  readonly depth: number;
}

/** The cell a box path sits in — or, for a box that IS the sub-template owner
 * (an empty `cell:` column's rect, a repeat card's own rect), the cell it
 * carries. `null` for everything else, which is the refusal that keeps a plain
 * table column (no `cell:` to enter) out of the drop targets. Untrusted input:
 * an unparseable path or a throwing read reads as "not a cell". */
function cellTargetFor(read: ReadFn, boxPath: string): CellTarget | null {
  let segments: ReturnType<typeof parsePath>;
  try {
    segments = parsePath(boxPath);
  } catch {
    return null;
  }
  // The box IS an owner: it carries the sub-template itself (an empty `cell:`
  // column, a repeat card's own rect). Checked FIRST, because such a box
  // nested inside another cell is the INNER target — its own cell, not the
  // ancestor one its path also crosses. Only a node that already has the
  // sub-template MAP qualifies: `insertItem` auto-creates a missing `items`
  // under it, but never the `cell:`/`item:` key itself.
  let node: Record<string, unknown> | undefined;
  try {
    node = record(read(boxPath));
  } catch {
    return null;
  }
  for (const key of CELL_KEYS) {
    // Own-property-guarded: a node that merely INHERITS `cell` carries no
    // sub-template, and authoring into one would write a key the document
    // does not have.
    if (node !== undefined && Object.hasOwn(node, key) && record(node[key]) !== undefined) {
      return {
        items: `${boxPath}.${key}.items`,
        owner: boxPath,
        depth: segments.length + 2,
      };
    }
  }
  // Otherwise the box sits INSIDE a sub-template: take the innermost
  // `<cell|item>.items` boundary its own path crosses.
  for (let k = segments.length - 1; k > 0; k--) {
    const segment = segments[k];
    const parent = segments[k - 1];
    if (
      segment.kind === 'key' &&
      segment.key === 'items' &&
      parent.kind === 'key' &&
      CELL_KEYS.has(parent.key)
    ) {
      return {
        items: formatPath(segments.slice(0, k + 1)),
        owner: formatPath(segments.slice(0, k - 1)),
        depth: k + 1,
      };
    }
  }
  return null;
}

function contains(rect: BoxRect, point: { readonly x: number; readonly y: number }): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.w &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.h
  );
}

/** The innermost cell under the pointer on this page, or `null` over anything
 * else (the flow body, a plain table, empty page space). */
export function cellUnder(
  read: ReadFn,
  pageBoxes: readonly PlacedBox[],
  point: { readonly x: number; readonly y: number },
): CellTarget | null {
  let best: CellTarget | null = null;
  for (const box of pageBoxes) {
    if (!contains(box.border, point)) {
      continue;
    }
    const target = cellTargetFor(read, box.path);
    if (target !== null && (best === null || target.depth > best.depth)) {
      best = target;
    }
  }
  return best;
}
