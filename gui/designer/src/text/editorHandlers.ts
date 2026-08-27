// The chip editor's keyboard and text-ingress handling, lifted out of
// `text/TextEditor` so the component stays the seeding/commit shell.
//
// Most paths here exist because a contenteditable's NATIVE behavior would
// author markup the wire cannot carry: ⌘/Ctrl+B|I|U would mint `<b>`/`<i>`
// elements, and a paste or drop of HTML would mint live elements outright (an
// `<img onerror=…>` dragged from a hostile page would execute in the host
// origin). Both are replaced with plain-text insertion at the caret.
//
// Enter is the exception, and deliberately so: the `<div>`/`<br>` structure it
// mints is LINE structure, which the wire does carry and the serializer now
// reads. See `handleEditorKeyDown` for why intercepting it could not work.

import type { KeyboardEvent, MouseEvent } from 'react';
import {
  CHIP_WIRE_ATTR,
  type ChipMeta,
  chipFormatOf,
  chipSpan,
  chipWireWithFormat,
} from './chipModel';
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

/** Swap `chip` for one standing for the planned pick, keeping the expression's
 * `:format` — a replace repoints the binding, and a chip's format has no other
 * author in the Designer, so dropping it would destroy hand-authored wire.
 *
 * The node was selected renders ago, so it is re-validated against the LIVE
 * editor first: paste, drop and atomic erosion all restructure the content in
 * between, and mutating a detached node would swallow the user's pick in
 * silence. The format written into the span is read back OUT of the composed
 * wire, so a format the grammar could not carry cannot leave the pill showing
 * a badge the wire does not have. */
export function replaceChipAt(
  el: HTMLElement,
  chip: Element,
  plan: ChipInsert,
  picked: ChipMeta,
  meta: ReadonlyMap<string, ChipMeta>,
): void {
  if (!el.contains(chip)) {
    return;
  }
  const wire = chipWireWithFormat(plan.wire, chipFormatOf(chip.getAttribute(CHIP_WIRE_ATTR)));
  const spanMeta = new Map(meta);
  spanMeta.set(plan.name, picked);
  const span = chipSpan(el.ownerDocument, wire, plan.name, chipFormatOf(wire), spanMeta);
  chip.replaceWith(span);
  el.focus();
  const range = el.ownerDocument.createRange();
  range.setStartAfter(span);
  range.collapse(true);
  restoreCaret(document.getSelection(), range);
}

/** Clicking a chip has to land the caret beside it. A chip is `user-select:
 * none` (so a drag across the field never selects half a label), and the
 * browser answers a click on unselectable content inside a contenteditable by
 * doing NOTHING: no focus, no caret. Since the pill is the widest target in a
 * short field, that read as "the field will not take the cursor".
 *
 * Returns the chip the click landed on, which the host holds as the SELECTED
 * one (a chip is unselectable, so it cannot ride the caret's own selection);
 * `null` for a click on ordinary text, which therefore deselects. */
export function handleEditorMouseDown(event: MouseEvent<HTMLDivElement>): Element | null {
  const el = event.currentTarget;
  const chip = chipFromTarget(el, event.target);
  if (chip === null) {
    return null;
  }
  event.preventDefault();
  el.focus();
  caretBesideChip(chip, event.clientX, document.getSelection());
  return chip;
}

export interface EditorKeyHandlers {
  /** Write the editor's current serialization back to the host. */
  readonly commit: (el: HTMLElement) => void;
  /** Escape's action — present only on the canvas overlay (close without
   * committing); absent in the panel, where Escape stays the field's native
   * no-op. */
  readonly cancel?: () => void;
}

/** The ONE plain-text ingress both a PASTE and a DROP go through: the native
 * event is refused (HTML would mint live elements inside the editor), the
 * plain-text flavor is inserted at the caret, and `after` runs over the
 * resulting surface — the selection re-check and the draft publish, neither of
 * which any `input` event would deliver, since this is Range surgery. */
export function handleTextIngress(
  el: HTMLDivElement,
  event: { preventDefault: () => void },
  text: string,
  after: (el: HTMLDivElement) => void,
): void {
  event.preventDefault();
  if (text !== '') {
    insertPlainTextAt(el, text);
  }
  after(el);
}

/** The editor's keydown behavior: ⌘/Ctrl+Enter commits, Escape cancels when the
 * host offers it, the native formatting shortcuts are blocked, and
 * Backspace/Delete erode an adjacent chip ATOMICALLY — the whole expression
 * goes, never a character of its label.
 *
 * **Plain Enter is left to the browser.** It used to be intercepted and
 * answered with a `\n` text node, to keep the content plain text — but a caret
 * cannot REST after a break at the end of a value: with no editable content
 * behind it the browser normalises the caret back before the break, and the
 * next character lands on the line the reader was trying to leave. Typing
 * `line1` Enter `line2` produced `line1line2`, which is what "the field cannot
 * author a line break" actually looked like. Every representation tried
 * (a `\n` node, the caret placed inside it, a `<br>`, a `<br>` kept after the
 * break) behaved identically, because the cause is the missing content, not the
 * spelling. The browser's own Enter has no such trouble: it mints a line
 * container and puts the caret INSIDE it, and `serializeEditor` reads that
 * container as the break it displays. So the fix is to stop answering the key.
 *
 * That is only safe because the serializer carries line structure: a
 * `<div>`/`<p>`/`<li>` contributes its break, and a lone `<br>` inside one is
 * read as the empty-line placeholder it is rather than a second break. The
 * OTHER ingress paths stay locked down — paste and drop are still forced
 * through the plain-text route, which is where hostile markup would arrive.
 * Enter restructures content that is already in the document and can introduce
 * no markup of its own.
 *
 * The IME guard above still covers this key: a Japanese/Chinese reader pressing
 * Enter to CONFIRM a conversion now reaches the browser's native handling,
 * which is exactly what should service it.
 */
export function handleEditorKeyDown(
  event: KeyboardEvent<HTMLDivElement>,
  handlers: EditorKeyHandlers,
): void {
  const el = event.currentTarget;
  if (event.nativeEvent.isComposing) {
    // An IME conversion is open: every key belongs to the composition, not to
    // us. jsdom defaults this to false, so only an explicit `isComposing: true`
    // keydown test can see a regression here.
    return;
  }
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    handlers.commit(el);
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
