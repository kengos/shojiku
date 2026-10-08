// The circle section on a text item's content tab, driven through PropertyPanel.
// Most cases run over a REAL editor so each assertion reads the file the action
// produced; the "authors nothing" cases run over a mock controller, whose
// `apply` / `applyAll` spies are the load-bearing half (a refused commit and an
// accepted one look alike in a fixture that never moves).

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type EditorController, useEditor } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import { PropertyPanel } from './PropertyPanel';

const P = 'sections.body.items[0]';

afterEach(cleanup);

function doc(item: string, styles = ''): string {
  return `${styles}sections:
  body:
    type: flow
    items:
      - ${item}
`;
}

function Harness({ text, capabilities }: { text: string; capabilities?: readonly string[] }) {
  const editor = useEditor(text);
  return (
    <I18nProvider locale="en">
      <PropertyPanel controller={editor} path={P} capabilities={capabilities} />
      <pre data-testid="doc">{editor.text}</pre>
      <button type="button" data-testid="undo" onClick={editor.undo}>
        undo
      </button>
    </I18nProvider>
  );
}

function open(text: string, capabilities?: readonly string[]) {
  render(<Harness text={text} capabilities={capabilities} />);
}

function mock(node: unknown): EditorController {
  const controller: EditorController = {
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
  render(
    <I18nProvider locale="en">
      <PropertyPanel controller={controller} path={P} />
    </I18nProvider>,
  );
  return controller;
}

const file = () => screen.getByTestId('doc').textContent ?? '';
const heading = () => screen.queryByRole('heading', { name: 'Circle' });
const state = () => screen.getByLabelText('Draw a circle') as HTMLSelectElement;
const padding = () =>
  screen.queryByLabelText('Space between text and circle') as HTMLInputElement | null;
const undo = () => fireEvent.click(screen.getByTestId('undo'));
const VERTICAL_NOTE = 'The circle around this text is not drawn while the text is vertical.';

describe('which selections get the circle section', () => {
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

  it('does not offer it on a type whose struct has no `mark` field', () => {
    for (const item of [
      '{ type: page_number }',
      '{ type: ellipse, box: { x: 0, y: 0, w: 10, h: 10 } }',
      '{ type: char_grid, text: 猫, grid: { columns: 2, rows: 1, cell: 10 } }',
      '{ type: qr_code, text: x }',
    ]) {
      open(doc(item));
      expect(heading(), item).toBeNull();
      cleanup();
    }
  });

  it('does not offer it to an engine without the capability', () => {
    open(doc('{ type: text, text: 猫 }'), ['text.ruby']);
    expect(heading()).toBeNull();
    cleanup();
    open(doc('{ type: text, text: 猫 }'), ['text.mark']);
    expect(heading()).not.toBeNull();
  });
});

describe('turning the circle on, binding it, and off', () => {
  it('starts at none with only the switch showing', () => {
    open(doc('{ type: text, text: 猫 }'));
    expect(state().value).toBe('none');
    expect(padding()).toBeNull();
    expect(screen.queryByLabelText('Data field')).toBeNull();
    expect(screen.queryByLabelText('Line width')).toBeNull();
    expect(screen.queryByRole('group', { name: 'Circle styles' })).toBeNull();
  });

  it('turns it on as a bare map, one undo step back to nothing', () => {
    const before = doc('{ type: text, text: 猫 }');
    open(before);
    fireEvent.change(state(), { target: { value: 'always' } });
    expect(file()).toContain('mark: {}');
    expect(padding()).not.toBeNull();
    // The binding fields belong to the bound state only.
    expect(screen.queryByLabelText('Data field')).toBeNull();
    expect(screen.getByRole('group', { name: 'Circle styles' })).not.toBeNull();
    undo();
    expect(file()).toBe(before);
  });

  it('binds it, commits a typed field, and unbinding keeps the circle', () => {
    open(doc('{ type: text, text: 猫, mark: {} }'));
    fireEvent.change(state(), { target: { value: 'bound' } });
    expect(file()).toContain('mark: { data: { key: "" } }');
    fireEvent.blur(screen.getByLabelText('Data field'), { target: { value: 'pay' } });
    expect(file()).toContain('key: pay');
    expect(screen.getByText('Circled when the value is')).not.toBeNull();
    fireEvent.change(state(), { target: { value: 'always' } });
    expect(file()).toContain('mark: {}');
    expect(file()).not.toContain('pay');
  });

  it('turns it off with its clearance and outline, one undo step to get them back', () => {
    const before = doc('{ type: text, text: 猫, mark: { padding: 3, style: { borderWidth: 2 } } }');
    open(before);
    fireEvent.change(state(), { target: { value: 'none' } });
    expect(file()).not.toContain('mark');
    undo();
    expect(file()).toBe(before);
  });
});

describe('the clearance, the outline and the styles', () => {
  it('writes a typed clearance, and clearing it keeps the circle', () => {
    open(doc('{ type: text, text: 猫, mark: {} }'));
    fireEvent.blur(padding() as HTMLInputElement, { target: { value: '0.3em' } });
    expect(file()).toContain('padding: 0.3em');
    fireEvent.blur(padding() as HTMLInputElement, { target: { value: '' } });
    expect(file()).toContain('mark: {}');
  });

  it('names the default when unset', () => {
    open(doc('{ type: text, text: 猫, mark: {} }'));
    expect(padding()?.placeholder).toBe('0.4em');
  });

  it('writes the outline width and fill under the circle, not the text', () => {
    open(doc('{ type: text, text: 猫, mark: {} }'));
    fireEvent.blur(screen.getByLabelText('Line width'), { target: { value: '2' } });
    expect(file()).toContain('mark: { style: { borderWidth: 2 } }');
  });

  it('ticks a named style onto the circle, and unticking the last keeps it', () => {
    open(doc('{ type: text, text: 猫, mark: {} }', 'styles:\n  red: { borderColor: "#c00" }\n'));
    const group = screen.getByRole('group', { name: 'Circle styles' });
    const red = () => group.querySelector('input[type="checkbox"]') as HTMLInputElement;
    fireEvent.click(red());
    expect(file()).toContain('mark: { styleNames: [ red ] }');
    fireEvent.click(red());
    expect(file()).toContain('mark: {}');
  });

  it('shows an unreadable clearance as such and can remove it', () => {
    open(doc('{ type: text, text: 猫, mark: { padding: [1] } }'));
    expect(padding()?.value).toBe('Unreadable value');
    fireEvent.blur(padding() as HTMLInputElement, { target: { value: '' } });
    expect(file()).toContain('mark: {}');
  });
});

describe('what the section refuses', () => {
  it('authors nothing for a negative clearance, says why, and reseeds', () => {
    const controller = mock({ type: 'text', text: '猫', mark: {} });
    fireEvent.blur(padding() as HTMLInputElement, { target: { value: '-1' } });
    expect(controller.apply).not.toHaveBeenCalled();
    expect(controller.applyAll).not.toHaveBeenCalled();
    expect(screen.getByText(/A negative value cannot be used here/)).not.toBeNull();
    expect(padding()?.value).toBe('');
  });

  it('clears the refusal note once an entry is taken', () => {
    const controller = mock({ type: 'text', text: '猫', mark: {} });
    fireEvent.blur(padding() as HTMLInputElement, { target: { value: 'abc' } });
    expect(screen.queryByText(/A negative value cannot be used here/)).not.toBeNull();
    fireEvent.blur(padding() as HTMLInputElement, { target: { value: '2' } });
    expect(controller.apply).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/A negative value cannot be used here/)).toBeNull();
  });

  it('offers only a way out of an unreadable mark', () => {
    open(doc('{ type: text, text: 猫, mark: yes }'));
    expect(screen.getByText('The circle settings for this text cannot be read.')).not.toBeNull();
    expect(screen.queryByLabelText('Draw a circle')).toBeNull();
    expect(padding()).toBeNull();
    expect(screen.queryByLabelText('Line width')).toBeNull();
    expect(screen.queryByRole('group', { name: 'Circle styles' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Remove the circle' }));
    expect(file()).not.toContain('mark');
    expect(state().value).toBe('none');
  });
});

describe('the vertical-text note', () => {
  it('says the circle is not drawn while the text is vertical', () => {
    open(doc('{ type: text, text: 猫, mark: {}, style: { writingMode: vertical_rl } }'));
    expect(screen.getByText(VERTICAL_NOTE)).not.toBeNull();
  });

  it('says nothing for horizontal text, or for vertical text with no circle', () => {
    open(doc('{ type: text, text: 猫, mark: {} }'));
    expect(screen.queryByText(VERTICAL_NOTE)).toBeNull();
    cleanup();
    open(doc('{ type: text, text: 猫, style: { writingMode: vertical_rl } }'));
    expect(screen.queryByText(VERTICAL_NOTE)).toBeNull();
  });

  it('follows a vertical writing mode inherited from a named style', () => {
    open(
      doc(
        '{ type: text, text: 猫, mark: {}, styleNames: [tate] }',
        'styles:\n  tate: { writingMode: vertical_rl }\n',
      ),
    );
    expect(screen.getByText(VERTICAL_NOTE)).not.toBeNull();
  });
});
