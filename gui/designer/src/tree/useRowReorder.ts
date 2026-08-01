// The layer tree's row-reorder gesture: a pointer drag among the row's OWN
// siblings — the drop slot is computed from the sibling rects only, so a drag
// can never reparent — plus its Alt+↑/↓ keyboard equivalent. Both emit ONE
// designer-core `moveItem` op (AI parity) and the selection travels with the
// moved row; an op-layer rejection changes nothing.
//
// The pure model (slot math, op construction) lives in `reorder.ts`; what a drag
// IS while it runs — its state, the live sibling rects, the per-row drop-
// indicator marks — is `rowDrag.ts`. This hook is the pointer + keyboard state
// machine over the two.

import type { Op, OpResult } from '@shojiku/designer-core';
import { type PointerEvent, useEffect, useRef, useState } from 'react';
import { DRAG_THRESHOLD_PX } from '../canvas/useDrag';
import type { TreeNode } from './model';
import { dropIndexFor, moveOpFor, seqPosition } from './reorder';
import {
  applyMove,
  type DragState,
  type RowDragMarks,
  type RowRefs,
  rowDragMarks,
  siblingEnd,
  siblingRects,
} from './rowDrag';

export type { RowDragMarks } from './rowDrag';

export interface RowReorderOptions {
  /** Dispatches the `moveItem` op — the editor's `apply`. */
  readonly apply: (op: Op) => OpResult;
  readonly onSelect: (path: string) => void;
  /** The live row elements by path — the sibling rects are measured off them. */
  readonly rowRefs: RowRefs;
}

export interface RowReorder {
  readonly onPointerDown: (node: TreeNode) => (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerUp: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerCancel: () => void;
  /** Row click-to-select — a completed drag swallows the trailing click. */
  readonly onClick: (node: TreeNode) => () => void;
  /** Alt+↑/↓ on a row: the keyboard equivalent of the drag. It owns the
   * preventDefault, which only fires for a row that IS a sequence entry. */
  readonly onArrowMove: (node: TreeNode, event: { key: string; preventDefault(): void }) => void;
  readonly marksFor: (node: TreeNode) => RowDragMarks;
}

export function useRowReorder({ apply, onSelect, rowRefs }: RowReorderOptions): RowReorder {
  const [drag, setDrag] = useState<DragState | null>(null);
  // A completed drag must not fire the row's click-to-select.
  const suppressClick = useRef(false);

  // Escape cancels an active drag — captured on window so it wins over (and
  // stops) the Designer's own Escape-to-deselect listener.
  useEffect(() => {
    if (drag?.started !== true) {
      return;
    }
    const cancel = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setDrag(null);
        suppressClick.current = true;
      }
    };
    window.addEventListener('keydown', cancel, true);
    return () => window.removeEventListener('keydown', cancel, true);
  }, [drag]);

  const onPointerDown = (node: TreeNode) => (event: PointerEvent<HTMLElement>) => {
    const position = seqPosition(node.path);
    if (position === null || !event.isPrimary) {
      return;
    }
    // Guarded: jsdom implements no pointer capture; in a real browser this
    // keeps the move/up stream on the row while the pointer travels.
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrag({
      path: node.path,
      parent: position.parent,
      from: position.index,
      pointerId: event.pointerId,
      startY: event.clientY,
      started: false,
      slot: position.index,
    });
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (drag === null || event.pointerId !== drag.pointerId) {
      return;
    }
    if (!drag.started && Math.abs(event.clientY - drag.startY) < DRAG_THRESHOLD_PX) {
      return;
    }
    const slot = dropIndexFor(siblingRects(rowRefs, drag.parent), event.clientY);
    setDrag({ ...drag, started: true, slot });
  };

  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    if (drag === null || event.pointerId !== drag.pointerId) {
      return;
    }
    if (drag.started) {
      suppressClick.current = true;
      const op = moveOpFor(drag.parent, drag.from, drag.slot);
      if (op !== null) {
        applyMove(apply, onSelect, op);
      }
    }
    setDrag(null);
  };

  const onClick = (node: TreeNode) => () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    onSelect(node.path);
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
      applyMove(apply, onSelect, {
        op: 'moveItem',
        path: position.parent,
        from: position.index,
        to,
      });
    }
  };

  const marksFor = (node: TreeNode): RowDragMarks =>
    rowDragMarks(drag, node.path, seqPosition(node.path), (parent, index) =>
      siblingEnd(rowRefs, parent, index),
    );

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: () => setDrag(null),
    onClick,
    onArrowMove,
    marksFor,
  };
}
