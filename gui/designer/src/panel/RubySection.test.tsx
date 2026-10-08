// The ruby section on a text item's content tab, driven through PropertyPanel.
// Most cases run over a REAL editor so each assertion reads the file the action
// produced; the "authors nothing" cases run over a mock controller, whose
// `apply` / `applyAll` spies are the load-bearing half (a refused commit and an
// accepted one look alike in a fixture that never moves).

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type EditorController, useEditor } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import { PropertyPanel } from './PropertyPanel';
import { MAX_RUBY_CHARS, MAX_RUBY_ENTRIES } from './rubyModel';

const P = 'sections.body.items[0]';

afterEach(cleanup);

function doc(item: string): string {
  return `sections:
  body:
    type: flow
    items:
      - ${item}
`;
}

const RUBY = doc(`type: text
        text: 吾輩は猫である
        rubySize: 6
        ruby:
          - base: 吾輩
            text: わがはい
          - base: 猫
            text: ねこ`);

function Harness({ text, capabilities }: { text: string; capabilities?: readonly string[] }) {
  const editor = useEditor(text);
  return (
    <I18nProvider locale="en">
      <PropertyPanel controller={editor} path={P} capabilities={capabilities} />
      <pre data-testid="doc">{editor.text}</pre>
    </I18nProvider>
  );
}

function open(text: string, capabilities?: readonly string[]) {
  render(<Harness text={text} capabilities={capabilities} />);
}

function makeController(node: unknown): EditorController {
  return {
    text: '',
    revision: 0,
    selection: null,
    canUndo: false,
    canRedo: false,
    apply: vi.fn(() => ({ ok: true as const })),
    applyAll: vi.fn(() => ({ ok: true as const })),
    read: (path: string) => (path === P ? node : undefined),
    undo: vi.fn(),
    redo: vi.fn(),
    select: vi.fn(),
    clearSelection: vi.fn(),
    setMaxBytes: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    replaceDocument: vi.fn(),
  };
}

function mock(node: unknown): EditorController {
  const controller = makeController(node);
  render(
    <I18nProvider locale="en">
      <PropertyPanel controller={controller} path={P} />
    </I18nProvider>,
  );
  return controller;
}

const file = () => screen.getByTestId('doc').textContent ?? '';
const heading = () => screen.queryByRole('heading', { name: 'Ruby (furigana)' });
const input = (name: string) => screen.getByRole('textbox', { name }) as HTMLInputElement;
const addButton = () => screen.getByRole('button', { name: 'Add reading' }) as HTMLButtonElement;
const sizeField = () => screen.getByLabelText('Ruby size') as HTMLInputElement;

describe('which selections get the ruby section', () => {
  it('offers it on a typed, a bound, a spans and a vertical text', () => {
    for (const item of [
      '{ type: text, text: 猫 }',
      '{ type: text, data: { key: name } }',
      '{ type: text, spans: [{ text: 猫 }] }',
      '{ type: text, text: 猫, style: { writingMode: vertical_rl } }',
    ]) {
      open(doc(item));
      expect(heading(), item).not.toBeNull();
      cleanup();
    }
  });

  it('does not offer it on a type whose struct has no `ruby` field', () => {
    for (const item of [
      '{ type: page_number }',
      '{ type: list, data: { key: rows }, text: "{a}" }',
      '{ type: char_grid, text: 猫, grid: { columns: 2, rows: 1, cell: 10 } }',
      '{ type: qr_code, text: x }',
    ]) {
      open(doc(item));
      expect(heading(), item).toBeNull();
      cleanup();
    }
  });

  it('withholds it from an engine that would reject the key at parse', () => {
    open(doc('{ type: text, text: 猫 }'), ['item.visible', 'link.url']);
    expect(heading()).toBeNull();
    cleanup();
    open(doc('{ type: text, text: 猫 }'), ['text.ruby']);
    expect(heading()).not.toBeNull();
  });

  it('names the line-height and padding fields by their own labels in the spacing sentence', () => {
    open(doc('{ type: text, text: 猫 }'));
    const sentence = screen.getByText(/increase “Line height”/).textContent ?? '';
    // ...and the padding field by its own, for the first line, which stands out of the box.
    expect(sentence).toContain(
      'to its right in vertical text); to keep them inside, add “Padding”.',
    );
  });
});

describe('the entries', () => {
  it('shows each entry in its own row', () => {
    open(RUBY);
    expect(input('Base text 1').value).toBe('吾輩');
    expect(input('Reading 1').value).toBe('わがはい');
    expect(input('Base text 2').value).toBe('猫');
    expect(input('Reading 2').value).toBe('ねこ');
  });

  it('edits one side of one entry and leaves the other entry as written', () => {
    open(RUBY);
    fireEvent.blur(input('Reading 1'), { target: { value: 'わがはーい' } });
    expect(file()).toContain('text: わがはーい');
    expect(file()).toContain('- base: 猫\n            text: ねこ');
  });

  it('refuses an emptied side, writes nothing, and puts the value back', () => {
    open(RUBY);
    const before = file();
    fireEvent.blur(input('Base text 2'), { target: { value: '' } });
    expect(file()).toBe(before);
    // Re-queried: the refusal reseeds the input, so the node is a new one.
    expect(input('Base text 2').value).toBe('猫');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('refuses a side over the cap and says why, then clears the message on an accepted edit', () => {
    open(RUBY);
    const before = file();
    fireEvent.blur(input('Reading 2'), { target: { value: 'ね'.repeat(MAX_RUBY_CHARS + 1) } });
    expect(file()).toBe(before);
    expect(screen.getByRole('status').textContent).toContain(String(MAX_RUBY_CHARS));
    fireEvent.blur(input('Reading 2'), { target: { value: 'にゃん' } });
    expect(screen.queryByRole('status')).toBeNull();
    expect(file()).toContain('text: にゃん');
  });

  it('commits on Enter, but not on the Enter that confirms an IME conversion', () => {
    const controller = mock({ type: 'text', text: '猫', ruby: [{ base: '猫', text: 'ねこ' }] });
    input('Reading 1').focus();
    fireEvent.keyDown(input('Reading 1'), { key: 'Enter', isComposing: true });
    expect(document.activeElement).toBe(input('Reading 1'));
    fireEvent.keyDown(input('Reading 1'), { key: 'Enter' });
    expect(document.activeElement).not.toBe(input('Reading 1'));
    expect(controller.apply).not.toHaveBeenCalled();
  });

  it('removes one entry, and the last removal takes the key with it', () => {
    open(RUBY);
    fireEvent.click(screen.getByRole('button', { name: 'Remove row 1' }));
    expect(file()).not.toContain('吾輩\n');
    expect(input('Base text 1').value).toBe('猫');
    fireEvent.click(screen.getByRole('button', { name: 'Remove row 1' }));
    expect(file()).not.toContain('ruby:');
  });

  it('authors nothing on a bare tab-through', () => {
    const controller = mock({ type: 'text', text: '猫', ruby: [{ base: '猫', text: 'ねこ' }] });
    fireEvent.blur(input('Base text 1'), { target: { value: '猫' } });
    fireEvent.blur(input('Reading 1'), { target: { value: 'ねこ' } });
    fireEvent.blur(sizeField(), { target: { value: '' } });
    expect(controller.apply).not.toHaveBeenCalled();
    expect(controller.applyAll).not.toHaveBeenCalled();
  });
});

describe('adding an entry', () => {
  it('writes nothing until both sides are filled, then appends the entry', () => {
    open(doc('{ type: text, text: 吾輩は猫である }'));
    const before = file();
    expect(addButton().disabled).toBe(true);
    fireEvent.change(input('New base text'), { target: { value: '猫' } });
    expect(addButton().disabled).toBe(true);
    fireEvent.click(addButton());
    expect(file()).toBe(before);
    fireEvent.change(input('New reading'), { target: { value: 'ねこ' } });
    fireEvent.click(addButton());
    expect(input('Base text 1').value).toBe('猫');
    expect(input('Reading 1').value).toBe('ねこ');
    // The draft clears and the base input takes the focus for the next entry.
    expect(input('New base text').value).toBe('');
    expect(input('New reading').value).toBe('');
    expect(document.activeElement).toBe(input('New base text'));
  });

  it('adds nothing on Enter while one side is still empty', () => {
    const controller = mock({ type: 'text', text: '猫' });
    fireEvent.change(input('New base text'), { target: { value: '猫' } });
    fireEvent.keyDown(input('New base text'), { key: 'Enter' });
    expect(controller.apply).not.toHaveBeenCalled();
    expect(input('New base text').value).toBe('猫');
  });

  it('adds on Enter, but not on the Enter that confirms an IME conversion', () => {
    open(RUBY);
    fireEvent.change(input('New base text'), { target: { value: '吾輩' } });
    fireEvent.change(input('New reading'), { target: { value: 'わがはい' } });
    fireEvent.keyDown(input('New reading'), { key: 'Enter', isComposing: true });
    expect(screen.queryByRole('textbox', { name: 'Base text 3' })).toBeNull();
    fireEvent.keyDown(input('New reading'), { key: 'Enter' });
    expect(input('Base text 3').value).toBe('吾輩');
  });

  it('keeps the draft when the focus leaves for the Add button or anywhere else', () => {
    const controller = mock({ type: 'text', text: '猫' });
    fireEvent.change(input('New base text'), { target: { value: '猫' } });
    fireEvent.blur(input('New base text'), { relatedTarget: addButton() });
    fireEvent.blur(input('New base text'), { relatedTarget: document.body });
    expect(input('New base text').value).toBe('猫');
    expect(controller.apply).not.toHaveBeenCalled();
  });

  it('refuses an entry over the cap and says why, keeping the draft', () => {
    open(doc('{ type: text, text: 猫 }'));
    const before = file();
    fireEvent.change(input('New base text'), { target: { value: '猫' } });
    fireEvent.change(input('New reading'), { target: { value: 'ね'.repeat(MAX_RUBY_CHARS + 1) } });
    fireEvent.click(addButton());
    expect(file()).toBe(before);
    expect(screen.getByRole('status').textContent).toContain(String(MAX_RUBY_CHARS));
    expect(input('New base text').value).toBe('猫');
  });

  it('is disabled at the entry cap, and says why', () => {
    const ruby = Array.from({ length: MAX_RUBY_ENTRIES }, () => ({ base: 'a', text: 'b' }));
    mock({ type: 'text', text: 'a', ruby });
    expect(input('New base text').disabled).toBe(true);
    expect(addButton().disabled).toBe(true);
    expect(
      screen.getByText(`This text can have up to ${MAX_RUBY_ENTRIES} readings.`),
    ).not.toBeNull();
  });

  it('drops the draft when a different item is selected', () => {
    const controller = makeController({ type: 'text', text: '猫' });
    const view = (path: string) => (
      <I18nProvider locale="en">
        <PropertyPanel
          controller={{ ...controller, read: () => ({ type: 'text', text: '猫' }) }}
          path={path}
        />
      </I18nProvider>
    );
    const { rerender } = render(view(P));
    fireEvent.change(input('New base text'), { target: { value: '猫' } });
    rerender(view('sections.body.items[1]'));
    expect(input('New base text').value).toBe('');
  });
});

describe('a document the section cannot read', () => {
  it('shows an unreadable list as such and clears it', () => {
    open(doc('{ type: text, text: 猫, ruby: 猫 }'));
    expect(screen.getByText('The readings in this file cannot be read.')).not.toBeNull();
    expect(screen.queryByRole('textbox', { name: 'New base text' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Remove all readings' }));
    expect(file()).not.toContain('ruby');
    expect(input('New base text').value).toBe('');
  });

  it('shows an unreadable entry as a row that can only be removed', () => {
    open(doc('{ type: text, text: 猫, ruby: [7, { base: 猫, text: ねこ }] }'));
    expect(screen.getByText('Unreadable entry')).not.toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Base text 1' })).toBeNull();
    expect(input('Base text 2').value).toBe('猫');
    fireEvent.click(screen.getByRole('button', { name: 'Remove row 1' }));
    expect(file()).not.toContain('- 7');
    expect(input('Base text 1').value).toBe('猫');
  });

  it('shows an unreadable size as such, and the auto row removes it', () => {
    open(doc('{ type: text, text: 猫, rubySize: { pt: 6 } }'));
    expect(sizeField().value).toBe('Unreadable value');
    fireEvent.click(screen.getByRole('button', { name: /Ruby size/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /auto/ }));
    expect(file()).not.toContain('rubySize');
  });
});

describe('the size', () => {
  it('shows the authored size and writes a preset', () => {
    open(RUBY);
    expect(sizeField().value).toBe('6');
    fireEvent.click(screen.getByRole('button', { name: /Ruby size/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /^8/ }));
    expect(file()).toContain('rubySize: 8');
  });

  it('writes a typed unit length, and clears back to auto', () => {
    open(RUBY);
    fireEvent.blur(sizeField(), { target: { value: '2mm' } });
    expect(file()).toContain('rubySize: 2mm');
    fireEvent.blur(sizeField(), { target: { value: '' } });
    expect(file()).not.toContain('rubySize');
    expect(sizeField().placeholder).toBe('auto');
  });

  it('refuses a percentage, writes nothing, puts the value back and says why', () => {
    open(RUBY);
    const before = file();
    fireEvent.blur(sizeField(), { target: { value: '50%' } });
    expect(file()).toBe(before);
    expect(sizeField().value).toBe('6');
    expect(screen.getByText(/A percentage cannot be used here/)).not.toBeNull();
    // An accepted size takes the explanation away again.
    fireEvent.blur(sizeField(), { target: { value: '7' } });
    expect(screen.queryByText(/A percentage cannot be used here/)).toBeNull();
  });

  it('says nothing for a value that only differs by spaces', () => {
    open(RUBY);
    fireEvent.blur(sizeField(), { target: { value: ' 6 ' } });
    expect(screen.queryByText(/A percentage cannot be used here/)).toBeNull();
  });
});
