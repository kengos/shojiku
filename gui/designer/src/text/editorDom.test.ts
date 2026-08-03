import { describe, expect, it } from 'vitest';
import { chipMetaMap, chipSpan } from './chipModel';
import {
  adjacentChip,
  caretBesideChip,
  chipFromTarget,
  insertNode,
  rangeInRoot,
  restoreCaret,
  selectAllContent,
} from './editorDom';

const META = chipMetaMap([]);

function chip(): HTMLElement {
  return chipSpan(document, '{k}', 'k', null, META);
}

function selection(): Selection {
  const sel = document.getSelection();
  if (sel === null) {
    throw new Error('jsdom always exposes a selection');
  }
  return sel;
}

function mounted(...nodes: Node[]): HTMLDivElement {
  const root = document.createElement('div');
  for (const node of nodes) {
    root.appendChild(node);
  }
  document.body.appendChild(root);
  return root;
}

function caretAt(node: Node, offset: number): Range {
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  return range;
}

describe('rangeInRoot', () => {
  it('returns the range when the selection sits inside the root', () => {
    const text = document.createTextNode('abc');
    const root = mounted(text);
    const sel = selection();
    sel.removeAllRanges();
    sel.addRange(caretAt(text, 1));
    expect(rangeInRoot(root, sel)?.startOffset).toBe(1);
    root.remove();
  });

  it('returns null for a null selection, an empty selection, or an outside range', () => {
    const root = mounted(document.createTextNode('abc'));
    expect(rangeInRoot(root, null)).toBeNull();
    const sel = selection();
    sel.removeAllRanges();
    expect(rangeInRoot(root, sel)).toBeNull();
    const outside = mounted(document.createTextNode('out'));
    sel.addRange(caretAt(outside.firstChild as Node, 0));
    expect(rangeInRoot(root, sel)).toBeNull();
    root.remove();
    outside.remove();
  });

  it('rejects a selection spanning out of the editor (deleteContents must never reach UI)', () => {
    const inside = document.createTextNode('abc');
    const root = mounted(inside);
    const after = mounted(document.createTextNode('outside ui'));
    const sel = selection();
    sel.removeAllRanges();
    const range = document.createRange();
    range.setStart(inside, 1);
    range.setEnd(after.firstChild as Node, 3);
    sel.addRange(range);
    expect(rangeInRoot(root, sel)).toBeNull();
    root.remove();
    after.remove();
  });
});

describe('insertNode', () => {
  it('appends at the end when there is no usable range', () => {
    const root = mounted(document.createTextNode('ab'));
    insertNode(root, null, document.createTextNode('!'));
    expect(root.textContent).toBe('ab!');
    root.remove();
  });

  it('inserts at a collapsed caret and leaves the range collapsed after the node', () => {
    const text = document.createTextNode('ab');
    const root = mounted(text);
    const range = caretAt(text, 1);
    const node = document.createTextNode('X');
    insertNode(root, range, node);
    expect(root.textContent).toBe('aXb');
    expect(range.collapsed).toBe(true);
    expect(range.startContainer.childNodes[range.startOffset - 1]).toBe(node);
    root.remove();
  });

  it('replaces a non-collapsed selection with the node', () => {
    const text = document.createTextNode('abcd');
    const root = mounted(text);
    const range = document.createRange();
    range.setStart(text, 1);
    range.setEnd(text, 3);
    insertNode(root, range, document.createTextNode('X'));
    expect(root.textContent).toBe('aXd');
    root.remove();
  });
});

describe('adjacentChip', () => {
  it('finds the chip before a caret at offset 0 of the following text node', () => {
    const c = chip();
    const text = document.createTextNode('tail');
    mounted(c, text);
    expect(adjacentChip(caretAt(text, 0), 'backward')).toBe(c);
    expect(adjacentChip(caretAt(text, 1), 'backward')).toBeNull();
    (c.parentElement as HTMLElement).remove();
  });

  it('finds the chip after a caret at the end of the preceding text node', () => {
    const text = document.createTextNode('head');
    const c = chip();
    mounted(text, c);
    expect(adjacentChip(caretAt(text, text.data.length), 'forward')).toBe(c);
    expect(adjacentChip(caretAt(text, 1), 'forward')).toBeNull();
    (c.parentElement as HTMLElement).remove();
  });

  it('resolves element-container offsets on both sides', () => {
    const c = chip();
    const root = mounted(document.createTextNode('a'), c, document.createTextNode('b'));
    expect(adjacentChip(caretAt(root, 2), 'backward')).toBe(c);
    expect(adjacentChip(caretAt(root, 0), 'backward')).toBeNull();
    expect(adjacentChip(caretAt(root, 1), 'forward')).toBe(c);
    expect(adjacentChip(caretAt(root, 3), 'forward')).toBeNull();
    root.remove();
  });

  it('sees only chip elements, and only from a collapsed range', () => {
    const plain = document.createElement('span');
    plain.textContent = 'not a chip';
    const text = document.createTextNode('t');
    const root = mounted(plain, text);
    expect(adjacentChip(caretAt(text, 0), 'backward')).toBeNull();
    const wide = document.createRange();
    wide.setStart(text, 0);
    wide.setEnd(text, 1);
    expect(adjacentChip(wide, 'backward')).toBeNull();
    root.remove();
  });

  it('returns null for a caret in a non-text non-element container', () => {
    const comment = document.createComment('c');
    mounted(comment);
    expect(adjacentChip(caretAt(comment, 0), 'backward')).toBeNull();
    (comment.parentNode as HTMLElement).remove();
  });
});

describe('restoreCaret / selectAllContent', () => {
  it('re-applies a range as the live selection', () => {
    const text = document.createTextNode('abc');
    const root = mounted(text);
    const sel = selection();
    restoreCaret(sel, caretAt(text, 2));
    expect(sel.getRangeAt(0).startOffset).toBe(2);
    // Null arguments are inert.
    restoreCaret(null, caretAt(text, 1));
    restoreCaret(sel, null);
    expect(sel.getRangeAt(0).startOffset).toBe(2);
    root.remove();
  });

  it('selects the whole content, and tolerates a null selection', () => {
    const root = mounted(document.createTextNode('abc'), chip());
    const sel = selection();
    selectAllContent(root, sel);
    const range = sel.getRangeAt(0);
    expect(range.startContainer).toBe(root);
    expect(range.startOffset).toBe(0);
    expect(range.endOffset).toBe(2);
    selectAllContent(root, null);
    root.remove();
  });
});

describe('chipFromTarget', () => {
  it('finds the chip a click landed on, pill or label', () => {
    const pill = chip();
    const root = mounted(document.createTextNode('a'), pill);
    expect(chipFromTarget(root, pill)).toBe(pill);
    expect(chipFromTarget(root, pill.firstChild)).toBe(pill);
    root.remove();
  });

  it('is null for ordinary text, for a node outside the root, and for a non-node', () => {
    const text = document.createTextNode('abc');
    const root = mounted(text, chip());
    const outside = mounted(chip());
    expect(chipFromTarget(root, text)).toBeNull();
    expect(chipFromTarget(root, outside.firstChild)).toBeNull();
    expect(chipFromTarget(root, null)).toBeNull();
    root.remove();
    outside.remove();
  });
});

describe('caretBesideChip', () => {
  // jsdom lays nothing out, so the pill states its own box.
  function placed(pill: HTMLElement, clientX: number): number {
    pill.getBoundingClientRect = () => ({ left: 100, width: 40, top: 0, height: 20 }) as DOMRect;
    caretBesideChip(pill, clientX, selection());
    return selection().getRangeAt(0).startOffset;
  }

  it('lands after the chip past its midline and before it otherwise', () => {
    const pill = chip();
    const root = mounted(document.createTextNode('a'), pill, document.createTextNode('b'));
    expect(placed(pill, 135)).toBe(2);
    expect(placed(pill, 105)).toBe(1);
    root.remove();
  });
});
