// Selection-scoped document operations and the window keyboard shortcuts that
// reach them: delete / duplicate the selected sequence item, wrap it in a
// container, and the right-click context menu that offers the same actions as
// accelerators.

import { useCallback, useEffect, useState } from 'react';
import type { EditorController } from '../editor/useEditor';
import { wrapInContainerOps } from '../insert/wrap';
import { shortcutAction } from '../shortcuts';
import { seqPosition } from '../tree/reorder';
import { nextSelectionAfterRemove, seqLength } from '../tree/selection';

/** Whether an event target is an editable element whose NATIVE handling must
 * win over a document-level one — the in-field undo against the undo shortcut,
 * and the in-field text paste against the clipboard image import. Any new
 * window-level handler that would consume a user's typing belongs behind it. */
export function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    // `=== true` also normalizes jsdom, where a non-editable element's
    // `isContentEditable` is undefined rather than false — and jsdom never
    // sets it at all, so the attribute lookup is the branch that actually
    // fires there (a chip span's `contenteditable="false"` still resolves to
    // its editing host through `closest`).
    (target instanceof HTMLElement &&
      (target.isContentEditable === true || target.closest('[contenteditable="true"]') !== null))
  );
}

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

  // Delete removes the selected sequence item; ⌘/Ctrl+D duplicates it. Both act
  // only on a sequence-addressed selection (`…items[n]`) — a section root or
  // nothing selected is a no-op, and an op-layer rejection changes nothing.
  // After a delete the selection travels to the surviving neighbour (or the
  // enclosing node when the sequence empties) so the panel does not snap back to
  // page setup — the user keeps their place.
  const deleteSelected = useCallback(() => {
    const pos = selection === null ? null : seqPosition(selection);
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
  }, [selection, read, apply, select, clearSelection]);
  const duplicateSelected = useCallback(() => {
    const pos = selection === null ? null : seqPosition(selection);
    if (pos !== null && apply({ op: 'duplicateItem', path: pos.parent, index: pos.index }).ok) {
      select(`${pos.parent}[${pos.index + 1}]`);
    }
  }, [selection, apply, select]);

  // Document shortcuts: undo/redo (⌘/Ctrl+Z, ⇧⌘/Ctrl+Z), Delete/Backspace,
  // ⌘/Ctrl+D duplicate, Escape-to-deselect. Inside an editable element every
  // shortcut is left to the field — hijacking undo/delete there would discard
  // the user's uncommitted typing AND revert the previous committed op in one
  // keystroke, and an Escape usually means "cancel this field" (undo is a trust
  // feature; never overreach). The key→action map is the pure `shortcutAction`.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return;
      }
      const action = shortcutAction({
        key: event.key,
        meta: event.metaKey,
        ctrl: event.ctrlKey,
        shift: event.shiftKey,
      });
      if (action === null) {
        return;
      }
      if (action === 'deselect') {
        // Escape closes the document view first (its own dismissal), before
        // falling through to canvas deselect. The editable-target guard above
        // means Escape inside a field never reaches here.
        if (docViewOpenRef.current) {
          closeDocView();
          return;
        }
        if (dataViewOpenRef.current) {
          closeDataView();
          return;
        }
        deselectClearing();
        return;
      }
      event.preventDefault();
      if (action === 'undo') {
        undo();
      } else if (action === 'redo') {
        redo();
      } else if (action === 'duplicate') {
        duplicateSelected();
      } else {
        deleteSelected();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    undo,
    redo,
    deselectClearing,
    deleteSelected,
    duplicateSelected,
    docViewOpenRef,
    dataViewOpenRef,
    closeDocView,
    closeDataView,
  ]);

  return {
    deleteSelected,
    duplicateSelected,
    wrapSelected,
    contextMenu,
    openContextMenu,
    closeContextMenu,
  };
}
