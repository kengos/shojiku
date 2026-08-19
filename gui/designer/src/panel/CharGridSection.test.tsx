// The char_grid editing surface, driven through PropertyPanel — the tabs a
// char_grid gets, the controls in each, and the two things the panel must NOT
// offer for this type.
//
// Before this, a char_grid was in NEITHER the content-tab set nor the
// decoration set, so a preset's manuscript paper had no content surface at all
// and no way to change the one thing that decides its drawn size.

import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { EditorController } from '../editor/useEditor';
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

const GRID = {
  type: 'char_grid',
  data: { key: 'manuscript' },
  grid: { charsPerLine: 20, lines: 10, cellSize: '9mm', lineGap: '4.5mm' },
  writingMode: 'vertical_rl',
  box: { w: 372 },
};

function draw(node: unknown, capabilities?: readonly string[], gridStep = 0): EditorController {
  const controller = makeController(node);
  const panel: ReactElement = (
    <PropertyPanel
      controller={controller}
      path={P}
      capabilities={capabilities}
      gridStep={gridStep}
    />
  );
  render(<I18nProvider locale="en">{panel}</I18nProvider>);
  return controller;
}

const openLayout = () => fireEvent.click(screen.getByRole('tab', { name: 'Layout' }));

/** The ▲/▼ belonging to ONE field. The placement tab carries the box steppers
 * too, so an index into all of them would silently address `x`. */
function stepButton(label: string, name: 'Increase' | 'Decrease'): HTMLElement {
  const input = screen.getByLabelText(label);
  // input → the relative wrapper → the row holding the wrapper and the ▲▼ column
  const row = input.parentElement?.parentElement;
  if (row === null || row === undefined) {
    throw new Error(`no stepper row for ${label}`);
  }
  return within(row).getByRole('button', { name });
}

describe('CharGridSection', () => {
  it('renders the grid controls on the placement tab, seeded from the document', () => {
    draw(GRID);
    openLayout();
    expect(screen.getByText('Manuscript grid')).not.toBeNull();
    expect((screen.getByLabelText('Cells per line') as HTMLInputElement).value).toBe('20');
    expect((screen.getByLabelText('Lines') as HTMLInputElement).value).toBe('10');
    // Lengths keep the unit they were authored in.
    expect((screen.getByLabelText('Cell size') as HTMLInputElement).value).toBe('9mm');
    expect((screen.getByLabelText('Line gap') as HTMLInputElement).value).toBe('4.5mm');
    expect((screen.getByRole('radio', { name: 'Vertical' }) as HTMLInputElement).checked).toBe(
      true,
    );
  });

  it('is ABSENT when the engine lacks the char_grid capability', () => {
    draw(GRID, ['item.visible']);
    openLayout();
    expect(screen.queryByText('Manuscript grid')).toBeNull();
    expect(screen.queryByLabelText('Cells per line')).toBeNull();
  });

  it('is PRESENT when the capability list carries the key', () => {
    draw(GRID, ['char_grid']);
    openLayout();
    expect(screen.getByLabelText('Cells per line')).not.toBeNull();
  });

  it('labels an unset cell size rather than leaving a bare empty box', () => {
    draw({ ...GRID, grid: { charsPerLine: 20, lines: 10 } });
    openLayout();
    const cell = screen.getByLabelText('Cell size') as HTMLInputElement;
    expect(cell.value).toBe('');
    // An unset cell side is not "nothing": the engine derives it.
    expect(cell.placeholder).toBe('auto');
    // …and an unset GAP means 0, the same rule the coordinates follow.
    expect((screen.getByLabelText('Line gap') as HTMLInputElement).placeholder).toBe('0');
    expect((screen.getByLabelText('Cell gap') as HTMLInputElement).placeholder).toBe('0');
    // The COUNTS deliberately get none: they are REQUIRED keys, so an empty
    // one is a broken document, not a default worth stating.
    expect((screen.getByLabelText('Cells per line') as HTMLInputElement).placeholder).toBe('');
  });

  it('authors a count, and clearing one authors NOTHING (a required key)', () => {
    const controller = draw(GRID);
    openLayout();
    const cells = screen.getByLabelText('Cells per line') as HTMLInputElement;
    fireEvent.change(cells, { target: { value: '24' } });
    fireEvent.blur(cells);
    expect(controller.apply).toHaveBeenCalledExactlyOnceWith({
      op: 'setScalar',
      path: P,
      keys: ['grid', 'charsPerLine'],
      value: 24,
    });
    vi.mocked(controller.apply).mockClear();
    const lines = screen.getByLabelText('Lines') as HTMLInputElement;
    fireEvent.change(lines, { target: { value: '' } });
    fireEvent.blur(lines);
    expect(controller.apply).not.toHaveBeenCalled();
  });

  it('clears the cell size, returning it to the derived width', () => {
    const controller = draw(GRID);
    openLayout();
    const cell = screen.getByLabelText('Cell size') as HTMLInputElement;
    fireEvent.change(cell, { target: { value: '' } });
    fireEvent.blur(cell);
    expect(controller.apply).toHaveBeenCalledExactlyOnceWith({
      op: 'removeKey',
      path: P,
      keys: ['grid', 'cellSize'],
    });
  });

  it('steps a count by one whole cell', () => {
    const controller = draw(GRID);
    openLayout();
    fireEvent.click(stepButton('Cells per line', 'Increase'));
    expect(controller.apply).toHaveBeenCalledExactlyOnceWith({
      op: 'setScalar',
      path: P,
      keys: ['grid', 'charsPerLine'],
      value: 21,
    });
  });

  it('steps a grid LENGTH by the canvas grid step, keeping its unit', () => {
    // The lengths step by the canvas grid (the box fields' rule); only the
    // COUNTS are pinned to one whole cell.
    const controller = draw(GRID, undefined, 2);
    openLayout();
    fireEvent.click(stepButton('Line gap', 'Decrease'));
    expect(controller.apply).toHaveBeenCalledExactlyOnceWith({
      op: 'setScalar',
      path: P,
      keys: ['grid', 'lineGap'],
      value: '3.8mm',
    });
  });

  it('falls back to a 1pt step when the canvas grid is off', () => {
    const controller = draw({ ...GRID, grid: { charsPerLine: 20, lines: 10, charGap: 4 } });
    openLayout();
    fireEvent.click(stepButton('Cell gap', 'Increase'));
    expect(controller.apply).toHaveBeenCalledExactlyOnceWith({
      op: 'setScalar',
      path: P,
      keys: ['grid', 'charGap'],
      value: 5,
    });
  });

  it('never authors the engine-default writing mode', () => {
    const controller = draw(GRID);
    openLayout();
    fireEvent.click(screen.getByRole('radio', { name: 'Horizontal' }));
    expect(controller.apply).toHaveBeenCalledExactlyOnceWith({
      op: 'removeKey',
      path: P,
      keys: ['writingMode'],
    });
  });
});

describe('char_grid panel tabs', () => {
  it('gets a content tab and a placement tab, and NO decoration tab', () => {
    draw(GRID);
    // `borderWidth` on a char_grid is the GRID RULING width, not a border box —
    // the border cluster would author a different property under the same
    // spelling, so the decoration tab stays away from this type.
    expect(screen.getByRole('tab', { name: 'Content' })).not.toBeNull();
    expect(screen.getByRole('tab', { name: 'Layout' })).not.toBeNull();
    expect(screen.queryByRole('tab', { name: 'Style' })).toBeNull();
  });

  it('offers the binding on the content tab but NOT format or placeholder', () => {
    draw(GRID);
    fireEvent.click(screen.getByRole('tab', { name: 'Content' }));
    expect(screen.getByLabelText('Data key')).not.toBeNull();
    // `CharGridItem` is `deny_unknown_fields` and carries neither key, so
    // offering them would author wire the engine refuses.
    expect(screen.queryByLabelText('Format')).toBeNull();
    expect(screen.queryByLabelText('Blank placeholder')).toBeNull();
  });
});
