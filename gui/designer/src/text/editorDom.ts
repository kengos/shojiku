// Selection/Range helpers for the chip editor, kept as plain functions over
// explicit arguments (root, selection, range) so every branch is drivable
// from jsdom without a real caret. No execCommand (deprecated, absent in
// jsdom): insertion is Range surgery, chip-adjacency is sibling inspection.

import { CHIP_WIRE_ATTR } from './chipModel';

/** The selection's first range when it sits WHOLLY inside `root`, else
 * `null`. Both ends are checked: a selection spanning from the editor out
 * into surrounding UI would otherwise hand `deleteContents()` React-managed
 * nodes outside the editor. */
export function rangeInRoot(root: Node, sel: Selection | null): Range | null {
  if (sel === null || sel.rangeCount === 0) {
    return null;
  }
  const range = sel.getRangeAt(0);
  return root.contains(range.startContainer) && root.contains(range.endContainer) ? range : null;
}

/** Insert `node` at the range (replacing any selected content) or, with no
 * usable range, append it at the editor's end; the range is left collapsed
 * after the inserted node so a follow-up `addRange` restores the caret. */
export function insertNode(root: HTMLElement, range: Range | null, node: Node): void {
  if (range === null) {
    root.appendChild(node);
    return;
  }
  range.deleteContents();
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
}

function chipOf(node: Node | null): Element | null {
  return node instanceof Element && node.hasAttribute(CHIP_WIRE_ATTR) ? node : null;
}

/** The chip span immediately adjacent to a collapsed caret — the one a
 * Backspace (`backward`) or Delete (`forward`) would erode character by
 * character if we let the browser at it; the editor removes it atomically. */
export function adjacentChip(range: Range, direction: 'backward' | 'forward'): Element | null {
  if (!range.collapsed) {
    return null;
  }
  const container = range.startContainer;
  const offset = range.startOffset;
  if (container instanceof Text) {
    if (direction === 'backward') {
      return offset === 0 ? chipOf(container.previousSibling) : null;
    }
    return offset === container.data.length ? chipOf(container.nextSibling) : null;
  }
  if (container instanceof Element) {
    if (direction === 'backward') {
      // A collapsed range's offset never exceeds the child count, so
      // `offset - 1` indexes an existing child whenever offset > 0.
      return offset > 0 ? chipOf(container.childNodes[offset - 1]) : null;
    }
    // At the very end `childNodes[offset]` is undefined — normalize to null.
    return chipOf(container.childNodes[offset] ?? null);
  }
  return null;
}

/** Re-apply a range (left collapsed by `insertNode`) as the live caret. */
export function restoreCaret(sel: Selection | null, range: Range | null): void {
  if (sel === null || range === null) {
    return;
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

/** Select the editor's whole content (the autoFocus open-ready-to-replace
 * behaviour the textarea's `select()` used to provide). */
export function selectAllContent(root: HTMLElement, sel: Selection | null): void {
  if (sel === null) {
    return;
  }
  const range = root.ownerDocument.createRange();
  range.selectNodeContents(root);
  sel.removeAllRanges();
  sel.addRange(range);
}
