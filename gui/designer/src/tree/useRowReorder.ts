// The layer tree's row-drag gesture: a pointer drag over the VISIBLE rows —
// its vertical position picks the gap, its horizontal position picks which
// parent that gap means — plus its Alt+↑/↓ keyboard equivalent, which stays
// within the row's own parent. Every drop is ONE transactional batch (AI
// parity, one undo step) and the selection travels with the moved row; an
// op-layer rejection changes nothing.
//
// The pure models are `reorder.ts` (same-parent slot math + op) and
// `rowDrop.ts` (which gap, and which of its meanings); what a drag IS while it
// runs — which row it carries, the live row rects, the per-row drop-indicator
// marks, the ops a release commits — is `rowDrag.ts`. The pointer gesture is
// the shared `hooks/usePointerReorder`; this hook feeds it those models and
// adds the tree's own click-to-select and keyboard path.

import type { Op, OpResult, ReadFn } from '@shojiku/designer-core';
import type { PointerEvent } from 'react';
import { usePointerReorder } from '../hooks/usePointerReorder';
import type { TreeNode } from './model';
import { seqPosition } from './reorder';
import {
  acceptsFor,
  applyDrop,
  type RowDragKey,
  type RowDragMarks,
  type RowRefs,
  rowDragMarks,
  rowDropOps,
  siblingEnd,
  visibleRows,
} from './rowDrag';
import { type RowSlot, rowDropAt } from './rowDrop';

export type { RowDragMarks } from './rowDrag';

/** What a release commits: the batch, and where the moved row then is. */
type RowDrop = NonNullable<ReturnType<typeof rowDropOps>>;

export interface RowReorderOptions {
  /** Dispatches a drop as ONE transactional batch — the editor's `applyAll`. */
  readonly applyAll: (ops: readonly Op[]) => OpResult;
  /** The document read the drop model classifies destinations over. */
  readonly read: ReadFn;
  readonly onSelect: (path: string) => void;
  /** The live row elements by path — the row rects are measured off them. */
  readonly rowRefs: RowRefs;
  /** The paths the tree currently shows, in the order it shows them. */
  readonly order: readonly string[];
}

export interface RowReorder {
  readonly onPointerDown: (node: TreeNode) => (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerUp: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
  /** Row click-to-select — a completed drag swallows the trailing click. */
  readonly onClick: (node: TreeNode) => () => void;
  /** Alt+↑/↓ on a row: the keyboard equivalent of the drag. It owns the
   * preventDefault, which only fires for a row that IS a sequence entry. */
  readonly onArrowMove: (node: TreeNode, event: { key: string; preventDefault(): void }) => void;
  readonly marksFor: (node: TreeNode) => RowDragMarks;
}

export function useRowReorder({
  applyAll,
  read,
  onSelect,
  rowRefs,
  order,
}: RowReorderOptions): RowReorder {
  const reorder = usePointerReorder<RowDragKey, RowSlot | null, RowDrop>({
    axis: 'y',
    dropAt: (key, point) =>
      rowDropAt(visibleRows(rowRefs, order), point, acceptsFor(read, key.path, key.parent)),
    resolve: (key, drop) => (drop === null ? null : rowDropOps(read, key, drop)),
    onDrop: ({ ops, selectPath }) => applyDrop(applyAll, onSelect, ops, selectPath),
  });

  const onPointerDown = (node: TreeNode) => (event: PointerEvent<HTMLElement>) => {
    const position = seqPosition(node.path);
    if (position !== null) {
      reorder.onPointerDown({ path: node.path, parent: position.parent, from: position.index })(
        event,
      );
    }
  };

  const onClick = (node: TreeNode) => () => {
    if (!reorder.consumeClick()) {
      onSelect(node.path);
    }
  };

  const onArrowMove = (node: TreeNode, event: { key: string; preventDefault(): void }) => {
    const position = seqPosition(node.path);
    if (position === null) {
      return;
    }
    event.preventDefault();
    const to = event.key === 'ArrowUp' ? position.index - 1 : position.index + 1;
    if (to >= 0) {
      // An out-of-range `to` (last row moving down) is rejected by the op
      // layer with the document untouched — no sibling count needed here.
      applyDrop(
        applyAll,
        onSelect,
        [{ op: 'moveItem', path: position.parent, from: position.index, to }],
        `${position.parent}[${to}]`,
      );
    }
  };

  const marksFor = (node: TreeNode): RowDragMarks =>
    rowDragMarks(reorder.active, node.path, seqPosition(node.path), (parent, index) =>
      siblingEnd(rowRefs, parent, index),
    );

  return {
    onPointerDown,
    onPointerMove: reorder.onPointerMove,
    onPointerUp: reorder.onPointerUp,
    onPointerCancel: reorder.onPointerCancel,
    onClick,
    onArrowMove,
    marksFor,
  };
}
