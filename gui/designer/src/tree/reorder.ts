// What a row DRAG decides: the insertion slot a pointer is over, the sequence
// position a tree path names, and the `moveItem` op that realizes the drop.
// Pure geometry + op building — the drag machinery that feeds it is
// `useRowReorder`, and the selection that survives an edit is `selection.ts`.

/** One sibling row's vertical extent, in any consistent coordinate space. */
export interface RowRect {
  readonly top: number;
  readonly height: number;
}

/** The insertion slot (0..=rects.length) for a pointer at `y`: before the
 * first row whose midpoint the pointer is above, else after the last. */
export function dropIndexFor(rects: readonly RowRect[], y: number): number {
  for (let index = 0; index < rects.length; index++) {
    const rect = rects[index];
    if (y < rect.top + rect.height / 2) {
      return index;
    }
  }
  return rects.length;
}

/** The one op shape the tree emits (assignable to designer-core's `Op`). */
export interface MoveItemOp {
  readonly op: 'moveItem';
  readonly path: string;
  readonly from: number;
  readonly to: number;
}

/** The `moveItem` op that realizes dropping the row at `from` into insertion
 * `slot` within the sequence at `path` — adjusted for the op's post-splice
 * `to` index. `null` when the drop lands where the row already is (no edit,
 * no undo step). */
export function moveOpFor(path: string, from: number, slot: number): MoveItemOp | null {
  const to = slot > from ? slot - 1 : slot;
  if (to === from) {
    return null;
  }
  return { op: 'moveItem', path, from, to };
}

/** Split a tree node's path into its parent sequence path and its own index;
 * `null` for a node that is not a sequence entry (a section root). */
export function seqPosition(
  path: string,
): { readonly parent: string; readonly index: number } | null {
  const matched = /^(.*)\[(\d+)\]$/.exec(path);
  if (matched === null) {
    return null;
  }
  return { parent: matched[1], index: Number(matched[2]) };
}
