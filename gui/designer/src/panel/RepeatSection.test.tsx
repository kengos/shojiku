// The n-up grid's editing surface, driven through PropertyPanel: each control
// on a `repeat`'s placement tab dispatches exactly its op, the two newer keys
// follow their engine capabilities, and — against a live editor — a refused
// count authors nothing while an accepted edit touches only its own line.

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { EditorController } from '../editor/useEditor';
import { useEditor } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import { PropertyPanel } from './PropertyPanel';

const P = 'sections.body.items[0]';

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

const REPEAT = {
  type: 'repeat',
  data: { key: 'tickets' },
  grid: { columns: 2, rows: 4, columnGap: 8 },
  cell: { items: [] },
};

function draw(node: unknown, capabilities?: readonly string[], gridStep = 0): EditorController {
  const controller = makeController(node);
  render(
    <I18nProvider locale="en">
      <PropertyPanel
        controller={controller}
        path={P}
        capabilities={capabilities}
        gridStep={gridStep}
      />
    </I18nProvider>,
  );
  fireEvent.click(screen.getByRole('tab', { name: 'Layout' }));
  return controller;
}

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

function stepButton(label: string, name: 'Increase' | 'Decrease'): HTMLElement {
  const row = screen.getByLabelText(label).parentElement?.parentElement;
  if (row === null || row === undefined) {
    throw new Error(`no stepper row for ${label}`);
  }
  return within(row).getByRole('button', { name: `${name} ${label}` });
}

describe('RepeatSection', () => {
  it('seeds every control from the document, stating what unset means', () => {
    draw({ ...REPEAT, grid: { columns: 2 }, breakBefore: 'auto', cutMarks: true });
    expect(field('Columns').value).toBe('2');
    expect(field('Rows').value).toBe('');
    expect(field('Rows').placeholder).toBe('1');
    expect(field('Column gap').placeholder).toBe('0');
    expect((screen.getByRole('radio', { name: 'Fill across' }) as HTMLInputElement).checked).toBe(
      true,
    );
    expect(
      (screen.getByRole('checkbox', { name: 'Start on a new page' }) as HTMLInputElement).checked,
    ).toBe(false);
    expect(
      (screen.getByRole('checkbox', { name: 'Draw cut marks' }) as HTMLInputElement).checked,
    ).toBe(true);
  });

  it('shows the gap shorthand as what an unset axis gap falls back to', () => {
    draw({ ...REPEAT, grid: { gap: 15, columnGap: 4 } });
    expect(field('Column gap').value).toBe('4');
    expect(field('Row gap').value).toBe('');
    expect(field('Row gap').placeholder).toBe('15');
  });

  it('authors a typed count, and clears an emptied one back to a single cell', () => {
    const controller = draw(REPEAT);
    fireEvent.change(field('Columns'), { target: { value: '3' } });
    fireEvent.blur(field('Columns'));
    expect(controller.apply).toHaveBeenCalledExactlyOnceWith({
      op: 'setScalar',
      path: P,
      keys: ['grid', 'columns'],
      value: 3,
    });
    vi.mocked(controller.apply).mockClear();
    fireEvent.change(field('Rows'), { target: { value: '' } });
    fireEvent.blur(field('Rows'));
    expect(controller.apply).toHaveBeenCalledExactlyOnceWith({
      op: 'removeKey',
      path: P,
      keys: ['grid', 'rows'],
    });
  });

  it('dispatches NOTHING for a count the sheet cannot hold', () => {
    const controller = draw(REPEAT);
    // 17 columns × 4 rows = 68 cells, past the engine's 64.
    fireEvent.change(field('Columns'), { target: { value: '17' } });
    fireEvent.blur(field('Columns'));
    expect(controller.apply).not.toHaveBeenCalled();
  });

  it('steps a count by one cell, and a gap by the canvas grid step', () => {
    const controller = draw(REPEAT, undefined, 2);
    fireEvent.click(stepButton('Rows', 'Increase'));
    expect(controller.apply).toHaveBeenCalledExactlyOnceWith({
      op: 'setScalar',
      path: P,
      keys: ['grid', 'rows'],
      value: 5,
    });
    vi.mocked(controller.apply).mockClear();
    fireEvent.click(stepButton('Column gap', 'Decrease'));
    expect(controller.apply).toHaveBeenCalledExactlyOnceWith({
      op: 'setScalar',
      path: P,
      keys: ['grid', 'columnGap'],
      value: 6,
    });
  });

  it('falls back to a 1pt gap step when the canvas grid is off, and greys a relative gap', () => {
    const controller = draw({ ...REPEAT, grid: { columnGap: 8, rowGap: '5%' } });
    fireEvent.click(stepButton('Column gap', 'Increase'));
    expect(controller.apply).toHaveBeenCalledExactlyOnceWith({
      op: 'setScalar',
      path: P,
      keys: ['grid', 'columnGap'],
      value: 9,
    });
    expect((stepButton('Row gap', 'Increase') as HTMLButtonElement).disabled).toBe(true);
  });

  it('authors a typed column gap, and a negative one as zero', () => {
    const controller = draw(REPEAT);
    fireEvent.change(field('Column gap'), { target: { value: '12' } });
    fireEvent.blur(field('Column gap'));
    expect(controller.apply).toHaveBeenCalledExactlyOnceWith({
      op: 'setScalar',
      path: P,
      keys: ['grid', 'columnGap'],
      value: 12,
    });
    vi.mocked(controller.apply).mockClear();
    fireEvent.change(field('Column gap'), { target: { value: '-3' } });
    fireEvent.blur(field('Column gap'));
    expect(controller.apply).toHaveBeenCalledExactlyOnceWith({
      op: 'setScalar',
      path: P,
      keys: ['grid', 'columnGap'],
      value: 0,
    });
  });

  it('authors a typed gap and the fill order, never the default order', () => {
    const controller = draw({ ...REPEAT, grid: { direction: 'column' } });
    fireEvent.change(field('Row gap'), { target: { value: '3mm' } });
    fireEvent.blur(field('Row gap'));
    expect(controller.apply).toHaveBeenCalledExactlyOnceWith({
      op: 'setScalar',
      path: P,
      keys: ['grid', 'rowGap'],
      value: '3mm',
    });
    vi.mocked(controller.apply).mockClear();
    fireEvent.click(screen.getByRole('radio', { name: 'Fill across' }));
    expect(controller.apply).toHaveBeenCalledExactlyOnceWith({
      op: 'removeKey',
      path: P,
      keys: ['grid', 'direction'],
    });
  });

  it('toggles where the grid starts and its cut marks, one op each', () => {
    const controller = draw(REPEAT);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Start on a new page' }));
    expect(controller.apply).toHaveBeenCalledExactlyOnceWith({
      op: 'setScalar',
      path: P,
      keys: ['breakBefore'],
      value: 'auto',
    });
    vi.mocked(controller.apply).mockClear();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Draw cut marks' }));
    expect(controller.apply).toHaveBeenCalledExactlyOnceWith({
      op: 'setScalar',
      path: P,
      keys: ['cutMarks'],
      value: true,
    });
  });

  it('turns both back to their defaults by REMOVING the keys', () => {
    const controller = draw({ ...REPEAT, breakBefore: 'auto', cutMarks: true });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Start on a new page' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Draw cut marks' }));
    expect(vi.mocked(controller.apply).mock.calls.map((call) => call[0])).toEqual([
      { op: 'removeKey', path: P, keys: ['breakBefore'] },
      { op: 'removeKey', path: P, keys: ['cutMarks'] },
    ]);
  });

  it('withholds each newer control from an engine without its capability', () => {
    draw(REPEAT, ['repeat']);
    expect(screen.queryByRole('checkbox', { name: 'Start on a new page' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Draw cut marks' })).toBeNull();
    // The grid itself parses on any engine with `repeat`, so it stays.
    expect(field('Columns')).toBeTruthy();
  });

  it('offers each one when the engine carries its key', () => {
    draw(REPEAT, ['repeat', 'repeat.breakBefore']);
    expect(screen.getByRole('checkbox', { name: 'Start on a new page' })).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: 'Draw cut marks' })).toBeNull();
  });
});

// Against the REAL editor: a mock document never moves, so it cannot show that a
// refusal left the file alone or that an accepted edit changed one line only.
const LIVE = `sections:
  body:
    type: flow
    items:
      # the ticket sheet
      - type: repeat
        data: { key: tickets }
        grid: { columns: 2, rows: 4 } # two across
        cell:
          items:
            - type: text
              data: { key: code }
`;

function LiveHarness() {
  const editor = useEditor(LIVE);
  return (
    <I18nProvider locale="en">
      <PropertyPanel controller={editor} path={P} />
      <pre data-testid="doc">{editor.text}</pre>
    </I18nProvider>
  );
}

const liveDoc = () => screen.getByTestId('doc').textContent ?? '';

describe('RepeatSection against a live document', () => {
  it('changes only the edited key, keeping comments and every other line', () => {
    render(<LiveHarness />);
    fireEvent.click(screen.getByRole('tab', { name: 'Layout' }));
    fireEvent.change(field('Columns'), { target: { value: '3' } });
    fireEvent.blur(field('Columns'));
    const before = LIVE.split('\n');
    const after = liveDoc().split('\n');
    expect(after).toHaveLength(before.length);
    const changed = after.filter((line, index) => line !== before[index]);
    expect(changed).toEqual(['        grid: { columns: 3, rows: 4 } # two across']);
    expect(field('Columns').value).toBe('3');
  });

  it('snaps a refused count back and leaves the file untouched', () => {
    render(<LiveHarness />);
    fireEvent.click(screen.getByRole('tab', { name: 'Layout' }));
    const before = liveDoc();
    fireEvent.change(field('Rows'), { target: { value: '33' } });
    fireEvent.blur(field('Rows'));
    expect(liveDoc()).toBe(before);
    expect(field('Rows').value).toBe('4');
  });
});
