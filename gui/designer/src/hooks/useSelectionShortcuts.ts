// The window-level keyboard shortcuts that reach the selection ops: undo/redo
// (⌘/Ctrl+Z, ⇧⌘/Ctrl+Z), Delete/Backspace, ⌘/Ctrl+D duplicate, Escape-to-
// deselect. Split out of `useSelectionOps` so that file stays the ops
// themselves; the key→action map is the pure `shortcutAction`.

import { useEffect } from 'react';
import { shortcutAction } from '../shortcuts';

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

export interface SelectionShortcutsOptions {
  readonly undo: () => void;
  readonly redo: () => void;
  readonly deleteSelected: () => void;
  readonly duplicateSelected: () => void;
  readonly deselectClearing: () => void;
  /** Escape closes an open fullscreen view first (its own dismissal), before
   * falling through to canvas deselect. */
  readonly docViewOpenRef: { readonly current: boolean };
  readonly dataViewOpenRef: { readonly current: boolean };
  readonly closeDocView: () => void;
  readonly closeDataView: () => void;
}

export function useSelectionShortcuts(options: SelectionShortcutsOptions): void {
  const {
    undo,
    redo,
    deleteSelected,
    duplicateSelected,
    deselectClearing,
    docViewOpenRef,
    dataViewOpenRef,
    closeDocView,
    closeDataView,
  } = options;
  // Inside an editable element every shortcut is left to the field — hijacking
  // undo/delete there would discard the user's uncommitted typing AND revert the
  // previous committed op in one keystroke, and an Escape usually means "cancel
  // this field" (undo is a trust feature; never overreach).
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
}
