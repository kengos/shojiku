// Where a row drag DROPS, now that a drop may leave the dragged row's own
// parent. The vertical position picks the GAP between two visible rows, and
// the horizontal position picks which of that gap's meanings was intended:
// between a deeply nested last child and a shallow row that follows it, one
// gap is "after the child, inside its container" AND "after the container" —
// and every ancestor level in between. That is the file-tree rule, and the
// only place the tree reads a pointer's x to decide a DROP (a row also
// forwards `clientX` to the host context menu, which decides nothing here).
//
// Purely structural: the ancestor chain comes out of the PATHS, so no depth
// bookkeeping travels with the rows. What a chosen slot then commits is the
// shared `canvas/reparent` model.

import type { TreeNode, TreeView } from './model';
import { dropIndexFor, seqPosition } from './reorder';

/** One visible row as the drop math sees it: its vertical extent and its own
 * left edge, all in client px. The left edge is the indent — a deeper row
 * starts one `ROW_INDENT_PX` further right. */
export interface VisibleRow {
  readonly path: string;
  readonly top: number;
  readonly height: number;
  readonly left: number;
}

/** The tree's per-level indent in px — `TreeRow`'s nested `pl-3`. The
 * horizontal pointer position is read in these units, so the two must agree. */
export const ROW_INDENT_PX = 12;

/** A drop position: the item sequence and the index within it. */
export interface RowSlot {
  readonly parent: string;
  readonly index: number;
}

const ITEMS_SUFFIX = '.items';

/** Every slot "after `path`" up its ancestor chain, deepest first: after it
 * among its own siblings, then after its parent among ITS siblings, and so on
 * to the section. This chain IS the ambiguity a gap carries. Levels that are
 * not item lists (a table's `columns`) contribute no slot but do not stop the
 * walk — their own ancestors are still item lists. */
function slotsAfter(path: string): RowSlot[] {
  const slots: RowSlot[] = [];
  let at = path;
  for (;;) {
    const position = seqPosition(at);
    if (position === null) {
      return slots;
    }
    if (position.parent.endsWith(ITEMS_SUFFIX)) {
      slots.push({ parent: position.parent, index: position.index + 1 });
    }
    const dot = position.parent.lastIndexOf('.');
    if (dot < 0) {
      return slots;
    }
    at = position.parent.slice(0, dot);
  }
}

/** The slot before `row`, when it is the first thing in the list. */
function slotBefore(row: VisibleRow): RowSlot | null {
  const position = seqPosition(row.path);
  return position === null || !position.parent.endsWith(ITEMS_SUFFIX)
    ? null
    : { parent: position.parent, index: position.index };
}

/** Where a pointer drops among the visible rows, or `null` when nothing there
 * can take an item: an empty tree, a hostile pointer, or a gap whose every
 * candidate parent `accepts` refuses. The caller paints only what this
 * returns, so an indicator can never point at a drop that would do nothing. */
export function rowDropAt(
  rows: readonly VisibleRow[],
  point: { readonly x: number; readonly y: number },
  accepts: (parent: string) => boolean,
): RowSlot | null {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    return null;
  }
  const gap = dropIndexFor(rows, point.y);
  const previous = rows[gap - 1];
  const next = rows[gap];
  if (previous === undefined) {
    const slot = next === undefined ? null : slotBefore(next);
    return slot !== null && accepts(slot.parent) ? slot : null;
  }
  // The gap sits at the START of `previous`'s own children — the one place it
  // can mean, however far left the pointer wanders.
  if (next?.path.startsWith(`${previous.path}.`) === true) {
    const parent = `${previous.path}${ITEMS_SUFFIX}`;
    return accepts(parent) ? { parent, index: 0 } : null;
  }
  let slots = slotsAfter(previous.path);
  if (next !== undefined) {
    // Never shallower than the row that FOLLOWS the gap: past that the drop
    // would land after `next`, which is a different gap.
    const boundary = seqPosition(next.path)?.parent;
    const stop = slots.findIndex((slot) => slot.parent === boundary);
    if (stop >= 0) {
      slots = slots.slice(0, stop + 1);
    }
  }
  // A container showing no children — empty, or collapsed — has no gap of its
  // OWN, so "inside it" is offered as the deepest reading of the gap that
  // follows its row. Without this the tree could never fill a container the
  // canvas can drop into, which is exactly the surface someone reaches for
  // when the box is small or off-screen.
  const inside = `${previous.path}${ITEMS_SUFFIX}`;
  slots = [{ parent: inside, index: 0 }, ...slots].filter((slot) => accepts(slot.parent));
  if (slots.length === 0) {
    return null;
  }
  // Measured against the DEEPEST candidate's own indent: at or right of it is
  // the deepest reading, and every indent step LEFT is one level out. That
  // deepest indent is one step in from the row above when "inside it" is on
  // offer, and the row's own otherwise.
  const deepestLeft = previous.left + (slots[0].parent === inside ? ROW_INDENT_PX : 0);
  const steps = Math.round((deepestLeft - point.x) / ROW_INDENT_PX);
  return slots[Math.min(Math.max(steps, 0), slots.length - 1)];
}

/** The paths the tree currently SHOWS, in the order it shows them — the run a
 * gap is picked out of. A collapsed node keeps its own row and hides its
 * subtree, exactly as the rendered tree does. */
export function visiblePaths(
  view: TreeView | null,
  collapsed: ReadonlySet<string>,
): readonly string[] {
  const paths: string[] = [];
  const walk = (nodes: readonly TreeNode[]): void => {
    for (const node of nodes) {
      paths.push(node.path);
      if (!collapsed.has(node.path)) {
        walk(node.children);
      }
    }
  };
  walk(view?.roots ?? []);
  return paths;
}
