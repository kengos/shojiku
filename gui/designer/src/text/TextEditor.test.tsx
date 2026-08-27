import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/context';
import type { PickerOption } from '../panel/pickerModel';
import type { ChipContext } from './chipContext';
import { CHIP_WIRE_ATTR } from './chipModel';
import { TextEditor } from './TextEditor';

const OPTIONS: readonly PickerOption[] = [
  { key: 'customer.name', label: '顧客名', type: 'string', sample: '山田太郎', enumValues: [] },
  { key: 'total', label: 'Total', type: 'number', sample: '5000', enumValues: [] },
];
/** A field whose key falls outside the interpolation charset — the case a
 * declaration exists for. */
const UNSAFE: PickerOption = {
  key: '品名',
  label: '品名',
  type: 'string',
  sample: 'みかん',
  enumValues: [],
};
const CHIPS: ChipContext = {
  options: OPTIONS,
  documentOptions: OPTIONS,
  scope: null,
  declared: new Map(),
  canDeclare: true,
  otherNames: [],
};

function drawWithChips(props: {
  value: string;
  onCommit?: (v: string) => void;
  onCancel?: () => void;
}) {
  return render(
    <I18nProvider locale="en">
      <TextEditor
        value={props.value}
        onCommit={props.onCommit ?? (() => {})}
        onCancel={props.onCancel}
        ariaLabel="Text"
        chips={CHIPS}
      />
    </I18nProvider>,
  );
}

function editor(): HTMLElement {
  return screen.getByLabelText('Text');
}

function caretAt(node: Node, offset: number): void {
  const sel = document.getSelection();
  if (sel === null) {
    throw new Error('jsdom always exposes a selection');
  }
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

describe('TextEditor', () => {
  it('is an accessible multiline textbox', () => {
    render(<TextEditor value="a" onCommit={() => {}} ariaLabel="Text" />);
    const el = editor();
    expect(el.getAttribute('role')).toBe('textbox');
    expect(el.getAttribute('aria-multiline')).toBe('true');
    expect(el.getAttribute('contenteditable')).toBe('true');
  });

  it('seeds chips from the value: labels, wire attributes, atomicity', () => {
    drawWithChips({ value: '宛先: {customer.name} 様' });
    const chip = editor().querySelector('.sj-chip');
    if (chip === null) {
      throw new Error('chip not rendered');
    }
    expect(chip.textContent).toBe('顧客名');
    expect(chip.getAttribute(CHIP_WIRE_ATTR)).toBe('{customer.name}');
    expect(chip.getAttribute('contenteditable')).toBe('false');
  });

  it('commits on blur only when the value changed', () => {
    const onCommit = vi.fn();
    render(<TextEditor value="hello" onCommit={onCommit} ariaLabel="Text" />);
    // Unchanged blur → no commit (a bare tab-through must not rewrite wire).
    fireEvent.blur(editor());
    expect(onCommit).not.toHaveBeenCalled();
    editor().appendChild(document.createTextNode(' world'));
    fireEvent.blur(editor());
    expect(onCommit).toHaveBeenCalledWith('hello world', []);
  });

  it('does not commit when focus moves within the editor chrome (the insert menu)', () => {
    const onCommit = vi.fn();
    drawWithChips({ value: 'a', onCommit });
    editor().appendChild(document.createTextNode('X'));
    fireEvent.blur(editor(), {
      relatedTarget: screen.getByRole('button', { name: 'Insert a data field' }),
    });
    expect(onCommit).not.toHaveBeenCalled();
    // Leaving the whole editor commits.
    fireEvent.blur(editor());
    expect(onCommit).toHaveBeenCalledWith('aX', []);
  });

  it('commits chips back as their wire text (identity for untouched content)', () => {
    const onCommit = vi.fn();
    drawWithChips({ value: '{customer.name}:{total:currency}', onCommit });
    fireEvent.blur(editor());
    expect(onCommit).not.toHaveBeenCalled();
    editor().appendChild(document.createTextNode('!'));
    fireEvent.blur(editor());
    expect(onCommit).toHaveBeenCalledWith('{customer.name}:{total:currency}!', []);
  });

  it('commits on ⌘Enter and on Ctrl+Enter', () => {
    const onCommit = vi.fn();
    render(<TextEditor value="a" onCommit={onCommit} ariaLabel="Text" />);
    editor().appendChild(document.createTextNode('b'));
    fireEvent.keyDown(editor(), { key: 'Enter', metaKey: true });
    expect(onCommit).toHaveBeenCalledWith('ab', []);
    editor().appendChild(document.createTextNode('c'));
    fireEvent.keyDown(editor(), { key: 'Enter', ctrlKey: true });
    expect(onCommit).toHaveBeenCalledWith('abc', []);
  });

  it('leaves plain Enter to the browser, and does not commit on it', () => {
    // Enter is no longer answered here: a caret cannot rest after a break we
    // insert at the end of a value, so the next character landed on the
    // previous line (see `editorHandlers.handleEditorKeyDown`). jsdom
    // implements no contenteditable editing at all, so what a real browser then
    // does is proven by the app e2e; what THIS asserts is the half that is
    // still ours — Enter is not a commit, and nothing is written until blur.
    const onCommit = vi.fn();
    render(<TextEditor value="ab" onCommit={onCommit} ariaLabel="Text" />);
    const text = editor().firstChild;
    if (text === null) {
      throw new Error('seeded text missing');
    }
    caretAt(text, 1);
    const before = editor().innerHTML;
    fireEvent.keyDown(editor(), { key: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();
    // Untouched by US — the default action is the browser's to apply.
    expect(editor().innerHTML).toBe(before);
    fireEvent.blur(editor());
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('takes a pasted multi-line value verbatim', () => {
    const onCommit = vi.fn();
    render(<TextEditor value="" onCommit={onCommit} ariaLabel="Text" />);
    fireEvent.paste(editor(), {
      clipboardData: { getData: () => '東京都渋谷区1-2-3\nシブヤビル 5F\n〒150-0001' },
    });
    fireEvent.blur(editor());
    expect(onCommit).toHaveBeenCalledWith('東京都渋谷区1-2-3\nシブヤビル 5F\n〒150-0001', []);
  });

  it('commits NOTHING while a multi-line value is being typed', () => {
    // The field is two lines high and grows with its content, both in CSS
    // alone. Were any of that done by remounting, each growth step would fire
    // the commit-on-unmount path and mint an undo step per line.
    const onCommit = vi.fn();
    render(<TextEditor value="one" onCommit={onCommit} ariaLabel="Text" />);
    for (const line of ['two', 'three', 'four']) {
      // The DOM Chromium leaves after Enter-then-type: a line container per
      // new line. Built here directly, since jsdom applies no default action.
      const div = document.createElement('div');
      div.textContent = line;
      editor().appendChild(div);
      fireEvent.input(editor());
    }
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.blur(editor());
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('one\ntwo\nthree\nfour', []);
  });

  it('commits ONE break for an Enter the reader has not typed into yet', () => {
    // Chromium's Enter at the end of a value leaves `<div><br></div>`: the
    // container ends the line, and the <br> only keeps the now-empty line
    // visible. Reading that <br> as a second break would add a blank line to
    // the document on every such Enter.
    const onCommit = vi.fn();
    render(<TextEditor value="one" onCommit={onCommit} ariaLabel="Text" />);
    const div = document.createElement('div');
    div.appendChild(document.createElement('br'));
    editor().appendChild(div);
    fireEvent.blur(editor());
    expect(onCommit).toHaveBeenCalledWith('one\n', []);
  });

  it('cancels on Escape without committing, and the trailing blur stays silent', () => {
    const onCommit = vi.fn();
    const onCancel = vi.fn();
    render(<TextEditor value="a" onCommit={onCommit} onCancel={onCancel} ariaLabel="Text" />);
    editor().appendChild(document.createTextNode('edited'));
    fireEvent.keyDown(editor(), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
    // The unmount blur (simulated) must not commit the abandoned edit.
    fireEvent.blur(editor());
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('leaves Escape to the field when no onCancel is provided (panel use)', () => {
    const onCommit = vi.fn();
    render(<TextEditor value="a" onCommit={onCommit} ariaLabel="Text" />);
    fireEvent.keyDown(editor(), { key: 'Escape' });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('preserves a multiline value', () => {
    const onCommit = vi.fn();
    render(<TextEditor value={'one\ntwo'} onCommit={onCommit} ariaLabel="Text" />);
    expect(editor().textContent).toBe('one\ntwo');
    editor().appendChild(document.createTextNode('\nthree'));
    fireEvent.blur(editor());
    expect(onCommit).toHaveBeenCalledWith('one\ntwo\nthree', []);
  });

  it('keeps hand-typed expression syntax as plain text until commit (expert path)', () => {
    const onCommit = vi.fn();
    drawWithChips({ value: '', onCommit });
    editor().appendChild(document.createTextNode('{total}'));
    expect(editor().querySelector('.sj-chip')).toBeNull();
    fireEvent.blur(editor());
    expect(onCommit).toHaveBeenCalledWith('{total}', []);
  });

  it('pastes plain text only — pasted HTML never becomes editor nodes', () => {
    const onCommit = vi.fn();
    render(<TextEditor value="a" onCommit={onCommit} ariaLabel="Text" />);
    const text = editor().firstChild;
    if (text === null) {
      throw new Error('seeded text missing');
    }
    caretAt(text, 1);
    fireEvent.paste(editor(), {
      clipboardData: {
        getData: (kind: string) =>
          kind === 'text/plain' ? 'safe' : '<script>alert(1)</script><img onerror=x src=y>',
      },
    });
    expect(editor().querySelector('script, img')).toBeNull();
    fireEvent.blur(editor());
    expect(onCommit).toHaveBeenCalledWith('asafe', []);
  });

  it('ignores a paste with no plain text', () => {
    const onCommit = vi.fn();
    render(<TextEditor value="a" onCommit={onCommit} ariaLabel="Text" />);
    fireEvent.paste(editor(), { clipboardData: { getData: () => '' } });
    fireEvent.blur(editor());
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('inserts dropped content as plain text only (no native HTML drop)', () => {
    const onCommit = vi.fn();
    render(<TextEditor value="a" onCommit={onCommit} ariaLabel="Text" />);
    const text = editor().firstChild;
    if (text === null) {
      throw new Error('seeded text missing');
    }
    caretAt(text, 1);
    // jsdom has no DragEvent — dispatch a real MouseEvent carrying a
    // synthetic dataTransfer, the shape a native drop delivers.
    const drop = new MouseEvent('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', {
      value: {
        getData: (kind: string) => (kind === 'text/plain' ? 'dropped' : '<img onerror=x src=y>'),
      },
    });
    editor().dispatchEvent(drop);
    expect(editor().querySelector('img')).toBeNull();
    fireEvent.blur(editor());
    expect(onCommit).toHaveBeenCalledWith('adropped', []);
  });

  it('ignores a drop with no plain text', () => {
    const onCommit = vi.fn();
    render(<TextEditor value="a" onCommit={onCommit} ariaLabel="Text" />);
    const drop = new MouseEvent('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', { value: { getData: () => '' } });
    editor().dispatchEvent(drop);
    fireEvent.blur(editor());
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('blocks the browser formatting shortcuts (⌘B/I/U mint elements the wire cannot keep)', () => {
    render(<TextEditor value="a" onCommit={() => {}} ariaLabel="Text" />);
    for (const key of ['b', 'i', 'u', 'B']) {
      // fireEvent returns false when the handler called preventDefault.
      expect(fireEvent.keyDown(editor(), { key, metaKey: true })).toBe(false);
      expect(fireEvent.keyDown(editor(), { key, ctrlKey: true })).toBe(false);
    }
    // A plain letter stays native typing.
    expect(fireEvent.keyDown(editor(), { key: 'b' })).toBe(true);
  });

  it('removes a whole chip on Backspace right after it', () => {
    const onCommit = vi.fn();
    drawWithChips({ value: '{customer.name}tail', onCommit });
    const tail = editor().lastChild;
    if (tail === null) {
      throw new Error('tail text missing');
    }
    caretAt(tail, 0);
    fireEvent.keyDown(editor(), { key: 'Backspace' });
    expect(editor().querySelector('.sj-chip')).toBeNull();
    fireEvent.blur(editor());
    expect(onCommit).toHaveBeenCalledWith('tail', []);
  });

  it('removes a whole chip on Delete right before it', () => {
    const onCommit = vi.fn();
    drawWithChips({ value: 'head{customer.name}', onCommit });
    const head = editor().firstChild;
    if (head === null) {
      throw new Error('head text missing');
    }
    caretAt(head, 'head'.length);
    fireEvent.keyDown(editor(), { key: 'Delete' });
    expect(editor().querySelector('.sj-chip')).toBeNull();
    fireEvent.blur(editor());
    expect(onCommit).toHaveBeenCalledWith('head', []);
  });

  it('leaves Backspace alone when no chip is adjacent (native editing)', () => {
    const onCommit = vi.fn();
    drawWithChips({ value: 'ab{customer.name}', onCommit });
    const head = editor().firstChild;
    if (head === null) {
      throw new Error('head text missing');
    }
    caretAt(head, 1);
    fireEvent.keyDown(editor(), { key: 'Backspace' });
    // The chip survives; jsdom performs no native deletion, so content is
    // unchanged and the blur stays a no-commit.
    expect(editor().querySelector('.sj-chip')).not.toBeNull();
    fireEvent.blur(editor());
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('inserts a picked field as a chip at the caret and commits its wire text', () => {
    const onCommit = vi.fn();
    drawWithChips({ value: 'ab', onCommit });
    const text = editor().firstChild;
    if (text === null) {
      throw new Error('seeded text missing');
    }
    caretAt(text, 1);
    fireEvent.click(screen.getByRole('button', { name: 'Insert a data field' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /顧客名/ }));
    const chip = editor().querySelector('.sj-chip');
    expect(chip?.textContent).toBe('顧客名');
    fireEvent.blur(editor());
    expect(onCommit).toHaveBeenCalledWith('a{customer.name}b', []);
  });

  it('appends an inserted chip when the caret is elsewhere', () => {
    const onCommit = vi.fn();
    drawWithChips({ value: 'ab', onCommit });
    document.getSelection()?.removeAllRanges();
    fireEvent.click(screen.getByRole('button', { name: 'Insert a data field' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Total/ }));
    fireEvent.blur(editor());
    expect(onCommit).toHaveBeenCalledWith('ab{total}', []);
  });

  it('stages a declaration for a key the grammar cannot spell, and hands it up', () => {
    const onCommit = vi.fn();
    render(
      <I18nProvider locale="en">
        <TextEditor
          value=""
          onCommit={onCommit}
          ariaLabel="Text"
          chips={{ ...CHIPS, options: [...OPTIONS, UNSAFE], documentOptions: [...OPTIONS, UNSAFE] }}
        />
      </I18nProvider>,
    );
    document.getSelection()?.removeAllRanges();
    fireEvent.click(screen.getByRole('button', { name: 'Insert a data field' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /品名/ }));
    // The chip reads as the FIELD; only the wire underneath carries the alias.
    expect(editor().querySelector('.sj-chip')?.textContent).toBe('品名');
    fireEvent.blur(editor());
    expect(onCommit).toHaveBeenCalledWith('{f1}', [{ name: 'f1', key: '品名', scope: null }]);
  });

  it('discards a staged declaration when Escape cancels the edit', () => {
    const onCommit = vi.fn();
    const onCancel = vi.fn();
    render(
      <I18nProvider locale="en">
        <TextEditor
          value=""
          onCommit={onCommit}
          onCancel={onCancel}
          ariaLabel="Text"
          chips={{ ...CHIPS, options: [UNSAFE], documentOptions: [UNSAFE] }}
        />
      </I18nProvider>,
    );
    document.getSelection()?.removeAllRanges();
    fireEvent.click(screen.getByRole('button', { name: 'Insert a data field' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /品名/ }));
    fireEvent.keyDown(editor(), { key: 'Escape' });
    fireEvent.blur(editor());
    // Nothing is written, so the declaration never reaches the document —
    // the staging list is why a cancelled edit leaves no orphan behind.
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('shows no insert button without the chips wiring', () => {
    render(<TextEditor value="a" onCommit={() => {}} ariaLabel="Text" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('focuses and selects all on mount when autoFocus is set', () => {
    render(<TextEditor value="pick me" onCommit={() => {}} ariaLabel="Text" autoFocus />);
    expect(document.activeElement).toBe(editor());
    const sel = document.getSelection();
    expect(sel?.getRangeAt(0).startContainer).toBe(editor());
    expect(sel?.getRangeAt(0).endOffset).toBe(1);
  });
});

describe('clicking a chip', () => {
  // A chip is `user-select: none`, and the browser answers a click on
  // unselectable content inside a contenteditable by doing nothing at all —
  // no focus, no caret. The pill is the widest target in a short field, so
  // that read as "this field will not take the cursor".
  function pill(value: string) {
    drawWithChips({ value });
    const editor = screen.getByRole('textbox');
    const chip = editor.querySelector(`[${CHIP_WIRE_ATTR}]`);
    if (!(chip instanceof HTMLElement)) {
      throw new Error('the chip is seeded');
    }
    chip.getBoundingClientRect = () => ({ left: 100, width: 40, top: 0, height: 20 }) as DOMRect;
    return { editor, chip };
  }

  it('focuses the editor and lands the caret past the chip', () => {
    const { editor, chip } = pill('{customer.name} 様');
    fireEvent.mouseDown(chip, { clientX: 135 });
    expect(document.activeElement).toBe(editor);
    const range = document.getSelection()?.getRangeAt(0);
    expect(range?.startContainer).toBe(editor);
    expect(range?.startOffset).toBe(1);
    expect(range?.collapsed).toBe(true);
  });

  it('lands before the chip when the near half was clicked', () => {
    const { chip } = pill('{customer.name} 様');
    fireEvent.mouseDown(chip, { clientX: 105 });
    expect(document.getSelection()?.getRangeAt(0).startOffset).toBe(0);
  });

  it('leaves a click on ordinary text to the browser', () => {
    const { editor } = pill('{customer.name} 様');
    const before = document.activeElement;
    fireEvent.mouseDown(editor, { clientX: 300 });
    // No takeover: the editor is not focused BY the handler (jsdom performs no
    // native caret placement, which is exactly the path being left alone).
    expect(document.activeElement).toBe(before);
  });

  it('marks the clicked chip as the selected one', () => {
    const { chip } = pill('{customer.name} 様');
    fireEvent.mouseDown(chip, { clientX: 135 });
    expect(chip.classList.contains('sj-chip--selected')).toBe(true);
  });

  it('clears the selection when the next click lands on ordinary text', () => {
    const { editor, chip } = pill('{customer.name} 様');
    fireEvent.mouseDown(chip, { clientX: 135 });
    fireEvent.mouseDown(editor, { clientX: 300 });
    expect(chip.classList.contains('sj-chip--selected')).toBe(false);
  });
});

describe('re-picking a selected chip', () => {
  /** Seed, then select the chip the way a click does. */
  function selectChip(value: string, over: Partial<ChipContext> = {}) {
    const onCommit = vi.fn();
    render(
      <I18nProvider locale="en">
        <TextEditor
          value={value}
          onCommit={onCommit}
          ariaLabel="Text"
          chips={{ ...CHIPS, ...over }}
        />
      </I18nProvider>,
    );
    const el = screen.getByRole('textbox');
    const chip = el.querySelector(`[${CHIP_WIRE_ATTR}]`);
    if (!(chip instanceof HTMLElement)) {
      throw new Error('the chip is seeded');
    }
    chip.getBoundingClientRect = () => ({ left: 100, width: 40, top: 0, height: 20 }) as DOMRect;
    fireEvent.mouseDown(chip, { clientX: 135 });
    return { el, chip, onCommit };
  }

  function replaceTrigger(name: RegExp) {
    return screen.getByRole('button', { name });
  }

  it('offers no replace control until a chip is selected', () => {
    drawWithChips({ value: '{customer.name} 様' });
    expect(screen.queryByRole('button', { name: /^Replace/ })).toBeNull();
  });

  it('names the ACTION in an instant tooltip on BOTH triggers', () => {
    // Neither visible label states its action: the replace trigger reads as the
    // bound field's name (a noun) and the insert trigger is icon-only. The
    // bubble is the convention for both — never a native `title`.
    selectChip('{customer.name} 様');
    const replace = replaceTrigger(/^Replace 顧客名/);
    expect(replace.querySelector('[data-sj-tip]')?.textContent).toBe('Replace 顧客名');
    const insert = screen.getByRole('button', { name: 'Insert a data field' });
    expect(insert.querySelector('[data-sj-tip]')?.textContent).toBe('Insert a data field');
    expect(insert.getAttribute('title')).toBeNull();
    // Icon-only, so the two triggers fit the panel's field on one row.
    expect(insert.querySelector('svg')).not.toBeNull();
  });

  it('names the selected chip on the trigger', () => {
    selectChip('{customer.name} 様');
    // The trigger says which binding it would repoint — the same label the
    // pill beside it shows.
    expect(replaceTrigger(/^Replace 顧客名/).textContent).toContain('顧客名');
  });

  it('swaps the binding in place, keeping the surrounding text', () => {
    const { el, onCommit } = selectChip('宛先: {customer.name} 様');
    fireEvent.click(replaceTrigger(/^Replace 顧客名/));
    fireEvent.click(screen.getByRole('menuitem', { name: /Total/ }));
    fireEvent.blur(el.parentElement as HTMLElement);
    expect(onCommit).toHaveBeenCalledWith('宛先: {total} 様', []);
  });

  it('re-picking the SAME field authors nothing and mints no undo step', () => {
    const { el, onCommit } = selectChip('宛先: {customer.name} 様');
    fireEvent.click(replaceTrigger(/^Replace 顧客名/));
    fireEvent.click(screen.getByRole('menuitem', { name: /顧客名/ }));
    fireEvent.blur(el.parentElement as HTMLElement);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('drops the selection once the replace lands', () => {
    selectChip('{customer.name} 様');
    fireEvent.click(replaceTrigger(/^Replace 顧客名/));
    fireEvent.click(screen.getByRole('menuitem', { name: /Total/ }));
    // The node the trigger named is gone from the document.
    expect(screen.queryByRole('button', { name: /^Replace/ })).toBeNull();
  });

  it('stages a declaration when the picked field needs one', () => {
    const { el, onCommit } = selectChip('{customer.name} 様', {
      options: [...OPTIONS, UNSAFE],
      documentOptions: [...OPTIONS, UNSAFE],
    });
    fireEvent.click(replaceTrigger(/^Replace 顧客名/));
    fireEvent.click(screen.getByRole('menuitem', { name: /品名/ }));
    fireEvent.blur(el.parentElement as HTMLElement);
    expect(onCommit).toHaveBeenCalledWith('{f1} 様', [{ name: 'f1', key: '品名', scope: null }]);
  });

  it('offers the same rows the insert menu does', () => {
    selectChip('{customer.name} 様');
    fireEvent.click(screen.getByRole('button', { name: 'Insert a data field' }));
    const inserting = screen.getAllByRole('menuitem').map((row) => row.textContent);
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(replaceTrigger(/^Replace 顧客名/));
    expect(screen.getAllByRole('menuitem').map((row) => row.textContent)).toEqual(inserting);
  });

  it('withholds a charset-unsafe field from an engine that cannot declare', () => {
    selectChip('{customer.name} 様', {
      canDeclare: false,
      options: [...OPTIONS, UNSAFE],
      documentOptions: [...OPTIONS, UNSAFE],
    });
    fireEvent.click(replaceTrigger(/^Replace 顧客名/));
    expect(screen.queryByRole('menuitem', { name: /品名/ })).toBeNull();
  });

  it('offers it once the engine understands declarations', () => {
    selectChip('{customer.name} 様', {
      options: [...OPTIONS, UNSAFE],
      documentOptions: [...OPTIONS, UNSAFE],
    });
    fireEvent.click(replaceTrigger(/^Replace 顧客名/));
    expect(screen.getByRole('menuitem', { name: /品名/ })).toBeDefined();
  });

  it('drops the selection when the chip is eroded away under it', () => {
    // Backspace removes a chip atomically, so the node the trigger names can
    // leave the document between selecting and picking.
    const { el, chip } = selectChip('{customer.name}');
    caretAt(el, 1);
    fireEvent.keyDown(el, { key: 'Backspace' });
    expect(el.contains(chip)).toBe(false);
    expect(screen.queryByRole('button', { name: /^Replace/ })).toBeNull();
  });

  it('puts both triggers on ONE row, so selecting a chip does not add a line', () => {
    // A second block row under the insert button pushed the whole panel down on
    // every click in the field; the row is also the positioning context both
    // popovers resolve against, so each still spans the field's width.
    const { el } = selectChip('{customer.name} 様');
    const row = el.parentElement?.querySelector('.relative.flex');
    expect(row?.className).toContain('flex');
    expect(row?.querySelectorAll('button')).toHaveLength(2);
  });

  it('drops the selection when a NATIVE edit detaches the chip', () => {
    // `keydown` fires BEFORE the browser applies its default action, so a
    // recheck there cannot see a chip that typing-over-a-selection, a cut or a
    // native undo removes. `input` fires after the edit and is what closes it —
    // otherwise the trigger stays, naming a field the text no longer has, and
    // picking from it silently does nothing.
    const { el, chip } = selectChip('{customer.name} 様');
    expect(screen.getByRole('button', { name: /^Replace 顧客名/ })).toBeDefined();
    chip.remove();
    fireEvent.input(el);
    expect(screen.queryByRole('button', { name: /^Replace/ })).toBeNull();
  });

  it('drops the selection when a paste replaces the chip', () => {
    // Our own Range surgery fires no `input`, so the paste handler says so
    // itself.
    const { el, chip } = selectChip('{customer.name} 様');
    chip.remove();
    fireEvent.paste(el, { clipboardData: { getData: () => 'x' } });
    expect(screen.queryByRole('button', { name: /^Replace/ })).toBeNull();
  });

  it('drops the selection when a drop replaces the chip', () => {
    const { el, chip } = selectChip('{customer.name} 様');
    chip.remove();
    fireEvent.drop(el, { dataTransfer: { getData: () => 'x' } });
    expect(screen.queryByRole('button', { name: /^Replace/ })).toBeNull();
  });

  it('writes nothing and stages nothing when the target left between opening and picking', () => {
    // Planning STAGES a declaration, so a replace that cannot land must not
    // plan at all — otherwise the minted name is burned on a chip nobody wrote.
    const { el, chip, onCommit } = selectChip('{customer.name} 様', {
      options: [...OPTIONS, UNSAFE],
      documentOptions: [...OPTIONS, UNSAFE],
    });
    fireEvent.click(replaceTrigger(/^Replace 顧客名/));
    chip.remove();
    fireEvent.click(screen.getByRole('menuitem', { name: /品名/ }));
    el.appendChild(document.createTextNode('!'));
    fireEvent.blur(el.parentElement as HTMLElement);
    // The text loses the chip (it was removed) and gains the typed character —
    // and carries NO staged declaration for the pick that never landed.
    expect(onCommit).toHaveBeenCalledWith(' 様!', []);
    expect(screen.queryByRole('button', { name: /^Replace/ })).toBeNull();
  });

  it('keeps the selection through a keystroke that does not remove the chip', () => {
    const { el } = selectChip('{customer.name} 様');
    fireEvent.keyDown(el, { key: 'a' });
    expect(screen.getByRole('button', { name: /^Replace 顧客名/ })).toBeDefined();
  });

  it('re-points at a field whose key is a prototype name, with no pollution', () => {
    // `__proto__` is a legal YAML key, so it reaches here as an ordinary field
    // key: every table it is looked up in is a real Map, never a plain object.
    const hostile: PickerOption = {
      key: '__proto__',
      label: 'Proto',
      type: 'string',
      sample: '',
      enumValues: [],
    };
    const { el, onCommit } = selectChip('{customer.name} 様', {
      options: [...OPTIONS, hostile],
      documentOptions: [...OPTIONS, hostile],
    });
    fireEvent.click(replaceTrigger(/^Replace 顧客名/));
    fireEvent.click(screen.getByRole('menuitem', { name: /Proto/ }));
    fireEvent.blur(el.parentElement as HTMLElement);
    expect(onCommit).toHaveBeenCalledWith('{__proto__} 様', []);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('renders a brace-carrying field label verbatim without breaking the trigger name', () => {
    // The label is document data reaching an ICU message as an ARG — arg
    // values are emitted as text and never re-scanned, so a `{…}` in one
    // cannot inject a second placeholder.
    const braced: PickerOption = {
      key: 'braced',
      label: 'A {customer.name} label',
      type: 'string',
      sample: '',
      enumValues: [],
    };
    render(
      <I18nProvider locale="ja">
        <TextEditor
          value="{braced}"
          onCommit={() => {}}
          ariaLabel="Text"
          chips={{ ...CHIPS, options: [braced], documentOptions: [braced] }}
        />
      </I18nProvider>,
    );
    const el = screen.getByRole('textbox');
    const chip = el.querySelector(`[${CHIP_WIRE_ATTR}]`) as HTMLElement;
    chip.getBoundingClientRect = () => ({ left: 100, width: 40, top: 0, height: 20 }) as DOMRect;
    fireEvent.mouseDown(chip, { clientX: 135 });
    expect(screen.getByRole('button', { name: 'A {customer.name} labelを差し替え' })).toBeDefined();
  });
});

describe('TextEditor — the in-progress draft', () => {
  it('publishes the edit as it is typed, before any commit', () => {
    const onDraft = vi.fn();
    const onCommit = vi.fn();
    render(<TextEditor value="hello" onCommit={onCommit} onDraft={onDraft} ariaLabel="Text" />);
    editor().appendChild(document.createTextNode(' world'));
    fireEvent.input(editor());
    expect(onDraft).toHaveBeenCalledWith({ value: 'hello world', declarations: [] });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('publishes NOTHING mid-IME-composition, then exactly one on compositionend', () => {
    // The case the whole guard exists for: without it a Japanese reader watches
    // `りょうしゅうしょ` render on the way to `領収書`. jsdom defaults
    // `isComposing` to false, so this is only testable by driving the
    // composition events themselves.
    const onDraft = vi.fn();
    render(<TextEditor value="" onCommit={() => {}} onDraft={onDraft} ariaLabel="Text" />);
    fireEvent.compositionStart(editor());
    for (const step of ['り', 'りょ', 'りょうしゅうしょ']) {
      editor().textContent = step;
      fireEvent.input(editor());
    }
    expect(onDraft).not.toHaveBeenCalled();
    editor().textContent = '領収書';
    fireEvent.compositionEnd(editor());
    expect(onDraft).toHaveBeenCalledTimes(1);
    expect(onDraft).toHaveBeenCalledWith({ value: '領収書', declarations: [] });
  });

  it('resumes publishing after the composition closes', () => {
    const onDraft = vi.fn();
    render(<TextEditor value="" onCommit={() => {}} onDraft={onDraft} ariaLabel="Text" />);
    fireEvent.compositionStart(editor());
    fireEvent.compositionEnd(editor());
    onDraft.mockClear();
    editor().textContent = 'a';
    fireEvent.input(editor());
    expect(onDraft).toHaveBeenCalledWith({ value: 'a', declarations: [] });
  });

  it('withdraws the draft BEFORE the commit lands, on blur', () => {
    const calls: string[] = [];
    render(
      <TextEditor
        value="a"
        onCommit={() => calls.push('commit')}
        onDraft={(draft) => calls.push(draft === null ? 'withdraw' : 'publish')}
        ariaLabel="Text"
      />,
    );
    editor().appendChild(document.createTextNode('b'));
    fireEvent.input(editor());
    fireEvent.blur(editor());
    expect(calls).toEqual(['publish', 'withdraw', 'commit']);
  });

  it('withdraws on a blur that commits nothing, so no draft outlives the edit', () => {
    const onDraft = vi.fn();
    const onCommit = vi.fn();
    render(<TextEditor value="a" onCommit={onCommit} onDraft={onDraft} ariaLabel="Text" />);
    fireEvent.blur(editor());
    expect(onCommit).not.toHaveBeenCalled();
    expect(onDraft).toHaveBeenCalledWith(null);
  });

  it('withdraws on Escape and still commits nothing', () => {
    const onDraft = vi.fn();
    const onCommit = vi.fn();
    render(
      <TextEditor
        value="a"
        onCommit={onCommit}
        onCancel={() => {}}
        onDraft={onDraft}
        ariaLabel="Text"
      />,
    );
    editor().appendChild(document.createTextNode('b'));
    fireEvent.input(editor());
    onDraft.mockClear();
    fireEvent.keyDown(editor(), { key: 'Escape' });
    expect(onDraft).toHaveBeenCalledWith(null);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('COMMITS the pending edit when the field is taken away without a blur', () => {
    // A panel tab switch (or a selection change) unmounts the field while it
    // still holds focus, and the browser fires no blur for a node removed under
    // the caret — so before this the reader's typing was simply discarded.
    const onCommit = vi.fn();
    const view = render(<TextEditor value="a" onCommit={onCommit} ariaLabel="Text" />);
    editor().appendChild(document.createTextNode('b'));
    view.unmount();
    expect(onCommit).toHaveBeenCalledWith('ab', []);
  });

  it('does not commit a SECOND time when a blur already committed', () => {
    // The host reseeds the field on its new value, so the committed instance
    // unmounts moments later — a repeat here would mint a second undo step for
    // one edit.
    const onCommit = vi.fn();
    const view = render(<TextEditor value="a" onCommit={onCommit} ariaLabel="Text" />);
    editor().appendChild(document.createTextNode('b'));
    fireEvent.blur(editor());
    expect(onCommit).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('never commits on the way out of a CANCELLED edit', () => {
    const onCommit = vi.fn();
    const view = render(
      <TextEditor value="a" onCommit={onCommit} onCancel={() => {}} ariaLabel="Text" />,
    );
    editor().appendChild(document.createTextNode('b'));
    fireEvent.keyDown(editor(), { key: 'Escape' });
    view.unmount();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('withdraws on unmount — a selection change takes the field with it', () => {
    const onDraft = vi.fn();
    const view = render(
      <TextEditor value="a" onCommit={() => {}} onDraft={onDraft} ariaLabel="Text" />,
    );
    editor().appendChild(document.createTextNode('b'));
    fireEvent.input(editor());
    onDraft.mockClear();
    view.unmount();
    expect(onDraft).toHaveBeenCalledWith(null);
  });

  it('publishes a paste and a drop, which fire no input event of their own', () => {
    const onDraft = vi.fn();
    render(<TextEditor value="" onCommit={() => {}} onDraft={onDraft} ariaLabel="Text" />);
    caretAt(editor(), 0);
    fireEvent.paste(editor(), { clipboardData: { getData: () => 'pasted' } });
    expect(onDraft).toHaveBeenLastCalledWith({ value: 'pasted', declarations: [] });
  });

  it('acts on NO key while an IME conversion is open', () => {
    // A Japanese reader pressing Enter to CONFIRM a conversion must reach the
    // browser's own IME handling, never a key this file acts on. jsdom defaults
    // `isComposing` to false, so this is only visible by setting it — no ASCII
    // smoke and no other test in this file can see a regression here.
    const onCommit = vi.fn();
    render(<TextEditor value="" onCommit={onCommit} ariaLabel="Text" />);
    editor().textContent = 'りょうしゅうしょ';
    fireEvent.keyDown(editor(), { key: 'Enter', isComposing: true });
    expect(editor().textContent).toBe('りょうしゅうしょ');
    fireEvent.keyDown(editor(), { key: 'Enter', metaKey: true, isComposing: true });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('stops swallowing keys once the composition has closed', () => {
    // The guard is a gate on the WHOLE handler, so the check that it opens
    // again is that a key it owns acts: ⌘Enter commits after the conversion.
    const onCommit = vi.fn();
    render(<TextEditor value="" onCommit={onCommit} ariaLabel="Text" />);
    editor().textContent = '領収書';
    fireEvent.keyDown(editor(), { key: 'Enter', metaKey: true, isComposing: true });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.keyDown(editor(), { key: 'Enter', metaKey: true });
    expect(onCommit).toHaveBeenCalledWith('領収書', []);
  });

  it('does nothing at all without the prop — every other host is unchanged', () => {
    const onCommit = vi.fn();
    render(<TextEditor value="a" onCommit={onCommit} ariaLabel="Text" />);
    editor().appendChild(document.createTextNode('b'));
    fireEvent.input(editor());
    fireEvent.compositionEnd(editor());
    fireEvent.blur(editor());
    expect(onCommit).toHaveBeenCalledWith('ab', []);
  });
});
