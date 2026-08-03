// The chip editor's keyboard and text-ingress handling, lifted out of
// `text/TextEditor` so the component stays the seeding/commit shell.
//
// Every path here exists because a contenteditable's NATIVE behavior would
// author markup the wire cannot carry: Enter would mint `<div>`/`<br>`
// structure, ⌘/Ctrl+B|I|U would mint `<b>`/`<i>` elements, and a paste or drop
// of HTML would mint live elements outright (an `<img onerror=…>` dragged from
// a hostile page would execute in the host origin). All of them are replaced
// with plain-text insertion at the caret.

import type { KeyboardEvent, MouseEvent } from 'react';
import { type ChipMeta, chipSpan } from './chipModel';
import type { ChipInsert } from './declMint';
import {
  adjacentChip,
  caretBesideChip,
  chipFromTarget,
  insertNode,
  rangeInRoot,
  restoreCaret,
} from './editorDom';

/** Insert `text` as a plain text node at the caret (the ONE ingress the editor
 * offers pasted, dropped and Enter-typed content). */
export function insertPlainTextAt(el: HTMLElement, text: string): void {
  const sel = document.getSelection();
  const range = rangeInRoot(el, sel);
  insertNode(el, range, el.ownerDocument.createTextNode(text));
  restoreCaret(sel, range);
}

/** Insert the planned chip at the caret and hand focus back to the editor. The
 * chip's label comes from the row JUST picked: a staged declaration reaches the
 * component's `meta` only on the next render, and the seed never runs again, so
 * this insertion carries its own entry. */
export function insertChipAt(
  el: HTMLElement,
  plan: ChipInsert,
  picked: ChipMeta,
  meta: ReadonlyMap<string, ChipMeta>,
): void {
  const spanMeta = new Map(meta);
  spanMeta.set(plan.name, picked);
  const sel = document.getSelection();
  const range = rangeInRoot(el, sel);
  insertNode(el, range, chipSpan(el.ownerDocument, plan.wire, plan.name, null, spanMeta));
  el.focus();
  restoreCaret(sel, range);
}

/** Clicking a chip has to land the caret beside it. A chip is `user-select:
 * none` (so a drag across the field never selects half a label), and the
 * browser answers a click on unselectable content inside a contenteditable by
 * doing NOTHING: no focus, no caret. Since the pill is the widest target in a
 * short field, that read as "the field will not take the cursor". */
export function handleEditorMouseDown(event: MouseEvent<HTMLDivElement>): void {
  const el = event.currentTarget;
  const chip = chipFromTarget(el, event.target);
  if (chip === null) {
    return;
  }
  event.preventDefault();
  el.focus();
  caretBesideChip(chip, event.clientX, document.getSelection());
}

export interface EditorKeyHandlers {
  /** Write the editor's current serialization back to the host. */
  readonly commit: (el: HTMLElement) => void;
  /** Escape's action — present only on the canvas overlay (close without
   * committing); absent in the panel, where Escape stays the field's native
   * no-op. */
  readonly cancel?: () => void;
}

/** The editor's keydown behavior: ⌘/Ctrl+Enter commits, Enter inserts a
 * newline (`white-space: pre-wrap` renders it), Escape cancels when the host
 * offers it, the native formatting shortcuts are blocked, and Backspace/Delete
 * erode an adjacent chip ATOMICALLY — the whole expression goes, never a
 * character of its label. */
export function handleEditorKeyDown(
  event: KeyboardEvent<HTMLDivElement>,
  handlers: EditorKeyHandlers,
): void {
  const el = event.currentTarget;
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    handlers.commit(el);
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    insertPlainTextAt(el, '\n');
    return;
  }
  if (event.key === 'Escape' && handlers.cancel !== undefined) {
    event.preventDefault();
    // Stop the window-level Escape (deselect) from also firing.
    event.stopPropagation();
    handlers.cancel();
    return;
  }
  if ((event.metaKey || event.ctrlKey) && ['b', 'i', 'u'].includes(event.key.toLowerCase())) {
    // Block the browser's native contenteditable formatting (⌘B → <b>
    // elements): the wire is plain text + chips, so any visual formatting
    // would silently vanish on the next open.
    event.preventDefault();
    return;
  }
  if (event.key === 'Backspace' || event.key === 'Delete') {
    const range = rangeInRoot(el, document.getSelection());
    if (range !== null) {
      const chip = adjacentChip(range, event.key === 'Backspace' ? 'backward' : 'forward');
      if (chip !== null) {
        event.preventDefault();
        chip.remove();
      }
    }
  }
}
