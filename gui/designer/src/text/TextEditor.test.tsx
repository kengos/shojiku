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

  it('inserts a newline on plain Enter instead of committing', () => {
    const onCommit = vi.fn();
    render(<TextEditor value="ab" onCommit={onCommit} ariaLabel="Text" />);
    const text = editor().firstChild;
    if (text === null) {
      throw new Error('seeded text missing');
    }
    caretAt(text, 1);
    fireEvent.keyDown(editor(), { key: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();
    // A plain "\n" text node, never browser-minted <div>/<br> structure.
    expect(editor().querySelector('div, br')).toBeNull();
    fireEvent.blur(editor());
    expect(onCommit).toHaveBeenCalledWith('a\nb', []);
  });

  it('appends a newline when Enter arrives with no caret in the editor', () => {
    const onCommit = vi.fn();
    render(<TextEditor value="ab" onCommit={onCommit} ariaLabel="Text" />);
    document.getSelection()?.removeAllRanges();
    fireEvent.keyDown(editor(), { key: 'Enter' });
    fireEvent.blur(editor());
    expect(onCommit).toHaveBeenCalledWith('ab\n', []);
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
});
