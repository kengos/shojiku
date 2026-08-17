// Selection-scoped document operations: delete / duplicate a sequence item,
// wrap it in a container, and the right-click context menu that offers the same
// actions as accelerators. The window keyboard shortcuts that reach the same
// ops live in `useSelectionShortcuts`.

import { useCallback, useState } from 'react';
import type { EditorController } from '../editor/useEditor';
import { wrapInContainerOps } from '../insert/wrap';
import { seqPosition } from '../tree/reorder';
import { nextSelectionAfterRemove, seqLength } from '../tree/selection';
import { useSelectionShortcuts } from './useSelectionShortcuts';

export interface SelectionOpsOptions {
  readonly editor: EditorController;
  readonly deselectClearing: () => void;
  /** Escape closes an open fullscreen view first (its own dismissal), before
   * falling through to canvas deselect. */
  readonly docViewOpenRef: { readonly current: boolean };
  readonly dataViewOpenRef: { readonly current: boolean };
  readonly closeDocView: () => void;
  readonly closeDataView: () => void;
}

export interface SelectionOps {
  /** Remove the item at `path` (the context menu's row; the keyboard and the
   * Edit menu reach it through `deleteSelected`). */
  readonly deleteAt: (path: string) => void;
  readonly duplicateAt: (path: string) => void;
  readonly deleteSelected: () => void;
  readonly duplicateSelected: () => void;
  readonly wrapSelected: (path: string) => void;
  /** The right-click context menu (canvas box / tree row): its position + the
   * path it targets. */
  readonly contextMenu: { readonly x: number; readonly y: number; readonly path: string } | null;
  readonly openContextMenu: (path: string, x: number, y: number) => void;
  readonly closeContextMenu: () => void;
}

export function useSelectionOps({
  editor,
  deselectClearing,
  docViewOpenRef,
  dataViewOpenRef,
  closeDocView,
  closeDataView,
}: SelectionOpsOptions): SelectionOps {
  // Destructured ONCE: the controller object is rebuilt every render, so the
  // memo/effect deps below must be these stable fields, never `editor` itself.
  const { selection, read, apply, applyAll, select, clearSelection, undo, redo } = editor;
  const [contextMenu, setContextMenu] = useState<{
    readonly x: number;
    readonly y: number;
    readonly path: string;
  } | null>(null);
  const openContextMenu = useCallback((path: string, x: number, y: number) => {
    setContextMenu({ x, y, path });
  }, []);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const wrapSelected = useCallback(
    (path: string) => {
      const ops = wrapInContainerOps(read, path);
      // The new container occupies the wrapped item's old path (insert-then-
      // remove leaves it at the same index), so re-selecting `path` lands on it.
      if (ops !== null && applyAll(ops).ok) {
        select(path);
      }
    },
    [read, applyAll, select],
  );

  // Delete removes a sequence item; ⌘/Ctrl+D duplicates it. Both act only on a
  // sequence-addressed path (`…items[n]`) — a section root is a no-op, and an
  // op-layer rejection changes nothing. After a delete the selection travels to
  // the surviving neighbour (or the enclosing node when the sequence empties) so
  // the panel does not snap back to page setup — the user keeps their place.
  // Both are PATH-scoped, with the selection-scoped pair below as the wrappers
  // the keyboard and the Edit menu use: the right-click menu acts on the path it
  // was opened at, never on whatever the selection happens to be by then.
  const deleteAt = useCallback(
    (path: string) => {
      const pos = seqPosition(path);
      if (pos === null) {
        return;
      }
      // Read the sequence length BEFORE the removal (a hostile/alias-bomb read
      // degrades to a plain deselect, never a crash).
      const lengthBefore = seqLength(read, pos.parent);
      if (!apply({ op: 'removeItem', path: pos.parent, index: pos.index }).ok) {
        return;
      }
      const next = nextSelectionAfterRemove(pos.parent, pos.index, lengthBefore);
      if (next === null) {
        clearSelection();
      } else {
        select(next);
      }
    },
    [read, apply, select, clearSelection],
  );
  const duplicateAt = useCallback(
    (path: string) => {
      const pos = seqPosition(path);
      if (pos !== null && apply({ op: 'duplicateItem', path: pos.parent, index: pos.index }).ok) {
        select(`${pos.parent}[${pos.index + 1}]`);
      }
    },
    [apply, select],
  );
  const deleteSelected = useCallback(() => {
    if (selection !== null) {
      deleteAt(selection);
    }
  }, [selection, deleteAt]);
  const duplicateSelected = useCallback(() => {
    if (selection !== null) {
      duplicateAt(selection);
    }
  }, [selection, duplicateAt]);

  useSelectionShortcuts({
    undo,
    redo,
    deleteSelected,
    duplicateSelected,
    deselectClearing,
    docViewOpenRef,
    dataViewOpenRef,
    closeDocView,
    closeDataView,
  });

  return {
    deleteAt,
    duplicateAt,
    deleteSelected,
    duplicateSelected,
    wrapSelected,
    contextMenu,
    openContextMenu,
    closeContextMenu,
  };
}
