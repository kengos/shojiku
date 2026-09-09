// What the format bar shows, and what a press means. The rule under every case
// is the one every editor a reader has met follows: a mark reads as SET only
// when the WHOLE selection carries it, so two presses of one button are a round
// trip rather than a ratchet.

import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyShortcut,
  runsTouching,
  selectionMarks,
  setColor,
  toggleBold,
  toggleDecoration,
  toggleItalic,
  UNSELECTED_MARKS,
} from './runMarks';
import { RUN_ATTR } from './runNodes';
import { NO_MARKS, type RunMarks } from './spanRuns';

function host(...runs: readonly (readonly [string, string])[]): HTMLElement {
  const root = document.createElement('div');
  for (const [text, className] of runs) {
    const el = document.createElement('span');
    el.setAttribute(RUN_ATTR, '0');
    el.className = className;
    el.appendChild(document.createTextNode(text));
    root.appendChild(el);
  }
  document.body.appendChild(root);
  return root;
}

function selectAll(root: HTMLElement): Selection | null {
  const range = document.createRange();
  range.selectNodeContents(root);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  return sel;
}

beforeEach(() => {
  document.body.textContent = '';
});

describe('runsTouching', () => {
  it('never mutates the surface it inspects', () => {
    // This runs on every selection change; a splitting read would rewrite the
    // document as the reader dragged over it.
    const root = host(['abcdef', 'sj-run']);
    const before = root.innerHTML;
    const range = document.createRange();
    range.setStart(root.firstChild?.firstChild as Text, 2);
    range.setEnd(root.firstChild?.firstChild as Text, 4);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    expect(runsTouching(root, sel)).toHaveLength(1);
    expect(root.innerHTML).toBe(before);
  });

  it('returns nothing for a collapsed caret or no selection', () => {
    const root = host(['abc', 'sj-run']);
    const range = document.createRange();
    range.setStart(root.firstChild?.firstChild as Text, 1);
    range.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    expect(runsTouching(root, sel)).toEqual([]);
    expect(runsTouching(root, null)).toEqual([]);
  });
});

describe('selectionMarks', () => {
  it('is null when nothing is selected, which is what disables the bar', () => {
    expect(selectionMarks(host(['a', 'sj-run']), null)).toBeNull();
  });

  it('reports a mark the whole selection carries', () => {
    const root = host(['a', 'sj-run sj-run--bold'], ['b', 'sj-run sj-run--bold']);
    expect(selectionMarks(root, selectAll(root))).toMatchObject({ bold: true });
  });

  it('reports a MIXED mark as unset, so a press sets it throughout', () => {
    const root = host(['a', 'sj-run sj-run--bold'], ['b', 'sj-run']);
    expect(selectionMarks(root, selectAll(root))).toMatchObject({ bold: false });
  });

  it('reports mixed DECORATIONS as none rather than picking one', () => {
    const root = host(['a', 'sj-run sj-run--underline'], ['b', 'sj-run sj-run--strike']);
    expect(selectionMarks(root, selectAll(root))?.decoration).toBe('none');
  });

  it('reports one shared decoration', () => {
    const root = host(['a', 'sj-run sj-run--underline'], ['b', 'sj-run sj-run--underline']);
    expect(selectionMarks(root, selectAll(root))?.decoration).toBe('underline');
  });

  it('reports mixed COLOURS as unset', () => {
    const root = host(['a', 'sj-run'], ['b', 'sj-run']);
    (root.children[0] as HTMLElement).style.setProperty('color', '#c2402a');
    expect(selectionMarks(root, selectAll(root))?.color).toBe('');
  });

  it('keeps an italic BOTH runs carry', () => {
    // The right-hand side of the `&&` only runs when the left is already true,
    // so a selection where the FIRST run lacks the mark never reaches it.
    const root = host(['a', 'sj-run sj-run--italic'], ['b', 'sj-run sj-run--italic']);
    expect(selectionMarks(root, selectAll(root))).toMatchObject({ italic: true });
  });

  it('keeps a colour BOTH runs share', () => {
    const root = host(['a', 'sj-run'], ['b', 'sj-run']);
    for (const child of root.children) {
      (child as HTMLElement).style.setProperty('color', '#c2402a');
    }
    expect(selectionMarks(root, selectAll(root))?.color).toBe('#c2402a');
  });

  it('answers for a single run without consulting a second', () => {
    const root = host(['a', 'sj-run sj-run--italic']);
    expect(selectionMarks(root, selectAll(root))).toMatchObject({ italic: true });
  });
});

describe('the presses', () => {
  const current: RunMarks = { bold: false, italic: false, decoration: 'none', color: '' };

  it('sets a boolean mark the selection does not all carry, and clears one it does', () => {
    expect(toggleBold(current, NO_MARKS).bold).toBe(true);
    expect(toggleBold(current, { ...NO_MARKS, bold: true }).bold).toBe(false);
    expect(toggleItalic(current, NO_MARKS).italic).toBe(true);
    expect(toggleItalic(current, { ...NO_MARKS, italic: true }).italic).toBe(false);
  });

  it('leaves the run OWN other marks alone — the toggle is per key', () => {
    const bolded: RunMarks = { ...current, italic: true, color: '#112233' };
    expect(toggleBold(bolded, NO_MARKS)).toEqual({ ...bolded, bold: true });
  });

  it('REPLACES a decoration rather than adding a second line', () => {
    // `textDecoration` is ONE wire key with three values, so underline over a
    // struck selection is a replacement, not an addition.
    expect(
      toggleDecoration(current, { ...NO_MARKS, decoration: 'line_through' }, 'underline')
        .decoration,
    ).toBe('underline');
  });

  it('clears the decoration when the selection already shares it', () => {
    expect(
      toggleDecoration(current, { ...NO_MARKS, decoration: 'underline' }, 'underline').decoration,
    ).toBe('none');
  });

  it('sets a colour outright, and clears it with the empty value', () => {
    expect(setColor(current, '#c2402a').color).toBe('#c2402a');
    expect(setColor({ ...current, color: '#c2402a' }, '').color).toBe('');
  });
});

describe('applyShortcut', () => {
  const off: RunMarks = { bold: false, italic: false, decoration: 'none', color: '' };

  it('routes each shortcut to its own mark', () => {
    expect(applyShortcut('bold', off, off).bold).toBe(true);
    expect(applyShortcut('italic', off, off).italic).toBe(true);
    expect(applyShortcut('underline', off, off).decoration).toBe('underline');
  });

  it('compares against the SELECTION when the bar knows it', () => {
    expect(applyShortcut('bold', off, { ...off, bold: true }).bold).toBe(false);
  });

  it("falls back to the fragment's own marks when the bar has not seen the selection", () => {
    // A shortcut can land before `selectionchange` or any surface event has
    // told the bar there is a selection. Treating that as "nothing selected"
    // would make the first ⌘B of an edit do nothing.
    expect(applyShortcut('bold', { ...off, bold: true }, null).bold).toBe(false);
    expect(applyShortcut('italic', { ...off, italic: true }, null).italic).toBe(false);
    expect(applyShortcut('underline', { ...off, decoration: 'underline' }, null).decoration).toBe(
      'none',
    );
  });
});

describe('UNSELECTED_MARKS', () => {
  it('is the nothing-pressed state', () => {
    expect(UNSELECTED_MARKS).toEqual(NO_MARKS);
  });
});
