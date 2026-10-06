import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { EditorController } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import { LayoutSection } from './LayoutSection';
import { containerLayoutFor } from './layoutModel';

const PATH = 'sections.body.items[0]';
const SEQ = `${PATH}.box.columns`;

function makeController(reads: Record<string, unknown>): EditorController {
  return {
    text: '',
    revision: 0,
    selection: null,
    canUndo: false,
    canRedo: false,
    apply: vi.fn(() => ({ ok: true as const })),
    applyAll: vi.fn(() => ({ ok: true as const })),
    read: (path: string) => reads[path],
    undo: vi.fn(),
    redo: vi.fn(),
    select: vi.fn(),
    clearSelection: vi.fn(),
    setMaxBytes: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    replaceDocument: vi.fn(),
  };
}

function draw(node: ReactElement) {
  return render(<I18nProvider locale="en">{node}</I18nProvider>);
}

const TEXT = { type: 'text', text: 'a' };

function grid(box: Record<string, unknown>, items: unknown[] = [TEXT, TEXT]) {
  return makeController({ [PATH]: { type: 'container', box: { type: 'grid', ...box }, items } });
}

function drawGrid(controller: EditorController, capabilities?: readonly string[]) {
  const layout = containerLayoutFor(controller.read, PATH);
  if (layout === null) {
    throw new Error('fixture is not a container');
  }
  return draw(
    <LayoutSection
      controller={controller}
      path={PATH}
      layout={layout}
      capabilities={capabilities}
    />,
  );
}

const ALL = ['box.grid', 'grid.fr', 'grid.auto', 'grid.span', 'box.flexBasis'];
const without = (...keys: string[]) => ALL.filter((key) => !keys.includes(key));

describe('grid column widths', () => {
  it('switches all-the-same to per-column as equal shares, in one op', () => {
    const controller = grid({ columns: 2 });
    drawGrid(controller);
    expect((screen.getByLabelText('All the same width') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByLabelText('Per column'));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'putValue',
      path: PATH,
      keys: ['box', 'columns'],
      value: ['1fr', '1fr'],
    });
  });

  it('switches a list back to one equal count of its length', () => {
    const controller = grid({ columns: [90, '1fr', 'auto'] });
    drawGrid(controller);
    fireEvent.click(screen.getByLabelText('All the same width'));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: PATH,
      keys: ['box', 'columns'],
      value: 3,
    });
  });

  it('shows one row per track: the kind picked, a number for a share or a fixed width', () => {
    drawGrid(grid({ columns: [90, '2fr', 'auto'] }));
    expect(screen.getByLabelText('Column 1').textContent).toContain('Fixed');
    expect((screen.getByLabelText('Column 1 width') as HTMLInputElement).defaultValue).toBe('90');
    expect(screen.getByLabelText('Column 2').textContent).toContain('Share');
    expect((screen.getByLabelText('Share for Column 2') as HTMLInputElement).defaultValue).toBe(
      '2',
    );
    expect(screen.getByLabelText('Column 3').textContent).toContain('Fit the content');
    // A fit-the-content track has nothing to type.
    expect(screen.queryByLabelText('Column 3 width')).toBeNull();
  });

  it('shows an entry it cannot classify as a fixed width carrying its text verbatim', () => {
    drawGrid(grid({ columns: ['wide', 40] }));
    expect(screen.getByLabelText('Column 1').textContent).toContain('Fixed');
    expect((screen.getByLabelText('Column 1 width') as HTMLInputElement).defaultValue).toBe('wide');
  });

  it('commits a typed share as one in-place entry replacement; a refused value authors nothing', () => {
    const controller = grid({ columns: [90, '2fr'] });
    drawGrid(controller);
    const share = screen.getByLabelText('Share for Column 2') as HTMLInputElement;
    fireEvent.blur(share);
    expect(controller.applyAll).not.toHaveBeenCalled();
    fireEvent.change(share, { target: { value: '3' } });
    fireEvent.blur(share);
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'removeItem', path: SEQ, index: 1 },
      { op: 'insertItem', path: SEQ, index: 1, value: '3fr' },
    ]);
    const size = screen.getByLabelText('Column 1 width') as HTMLInputElement;
    fireEvent.change(size, { target: { value: '-4' } });
    fireEvent.blur(size);
    expect(controller.applyAll).toHaveBeenCalledTimes(1);
    // The refused entry comes back off the screen: the field shows the wire again.
    expect((screen.getByLabelText('Column 1 width') as HTMLInputElement).value).toBe('90');
  });

  it('changes a kind to that kind default; a re-pick authors nothing', () => {
    const controller = grid({ columns: [90, '2fr'] });
    drawGrid(controller);
    fireEvent.click(screen.getByLabelText('Column 1'));
    fireEvent.click(screen.getByRole('option', { name: 'Share' }));
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'removeItem', path: SEQ, index: 0 },
      { op: 'insertItem', path: SEQ, index: 0, value: '1fr' },
    ]);
    fireEvent.click(screen.getByLabelText('Column 2'));
    fireEvent.click(screen.getByRole('option', { name: 'Share' }));
    expect(controller.applyAll).toHaveBeenCalledTimes(1);
  });

  it('offers only the kinds the engine reads, and keeps an authored one pickable', () => {
    drawGrid(grid({ columns: ['2fr', 90] }), without('grid.fr', 'grid.auto'));
    fireEvent.click(screen.getByLabelText('Column 2'));
    expect(screen.queryByRole('option', { name: 'Share' })).toBeNull();
    expect(screen.queryByRole('option', { name: 'Fit the content' })).toBeNull();
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
    fireEvent.click(screen.getByLabelText('Column 1'));
    expect(screen.getByRole('option', { name: 'Share' })).toBeTruthy();
  });

  it('without shares alone, keeps fit-the-content offered but not the share kind', () => {
    drawGrid(grid({ columns: [90, 'auto'] }), without('grid.fr'));
    fireEvent.click(screen.getByLabelText('Column 1'));
    expect(screen.queryByRole('option', { name: 'Share' })).toBeNull();
    expect(screen.getByRole('option', { name: 'Fit the content' })).toBeTruthy();
  });

  it('disables per-column against an engine without shares, saying why', () => {
    drawGrid(grid({ columns: 2 }), without('grid.fr'));
    expect((screen.getByLabelText(/^Per column/) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getAllByText('Not available in this version.').length).toBeGreaterThan(0);
  });

  it('treats an absent columns key as one column and gives a hostile one no controls', () => {
    const { unmount } = drawGrid(grid({}, [TEXT]));
    expect((screen.getByLabelText('Columns') as HTMLInputElement).value).toBe('1');
    unmount();
    drawGrid(grid({ columns: 'garbage' }));
    expect(screen.queryByLabelText('Column widths')).toBeNull();
    expect(screen.queryByLabelText('Columns')).toBeNull();
  });
});

describe('grid row heights', () => {
  it('reads absent rows as fit-the-content and switches to a count or a list of the row count', () => {
    const controller = grid({ columns: 1, h: 120 }, [TEXT, TEXT, TEXT]);
    drawGrid(controller);
    expect((screen.getByLabelText('All fit their content') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByLabelText('All the same height'));
    expect(controller.apply).toHaveBeenLastCalledWith({
      op: 'setScalar',
      path: PATH,
      keys: ['box', 'rows'],
      value: 3,
    });
    fireEvent.click(screen.getByLabelText('Per row'));
    expect(controller.apply).toHaveBeenLastCalledWith({
      op: 'putValue',
      path: PATH,
      keys: ['box', 'rows'],
      value: ['auto', 'auto', 'auto'],
    });
  });

  it('withholds equal heights from a container with no height, saying why', () => {
    const controller = grid({ columns: 1 }, [TEXT, TEXT]);
    drawGrid(controller);
    const equal = screen.getByLabelText(/^All the same height/) as HTMLInputElement;
    expect(equal.disabled).toBe(true);
    expect(
      screen.getByText('Set this container’s “Height” in “Layout” first.'.replace('’', "'")),
    ).toBeTruthy();
    fireEvent.click(equal);
    expect(controller.apply).not.toHaveBeenCalled();
  });

  it('withholds per-row heights from an engine without fit-the-content rows, alone', () => {
    drawGrid(grid({ columns: 2, h: 100 }), without('grid.auto'));
    expect((screen.getByLabelText(/^Per row/) as HTMLInputElement).disabled).toBe(true);
    // Columns start as shares, which this engine reads.
    expect((screen.getByLabelText('Per column') as HTMLInputElement).disabled).toBe(false);
  });

  it('switches back to fit-the-content by removing the key', () => {
    const controller = grid({ columns: 1, rows: ['auto', 40] });
    drawGrid(controller);
    expect((screen.getByLabelText('Row 2 height') as HTMLInputElement).defaultValue).toBe('40');
    fireEvent.click(screen.getByLabelText('All fit their content'));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'removeKey',
      path: PATH,
      keys: ['box', 'rows'],
    });
  });

  it('notes that shares and equal heights need a height, only where it applies', () => {
    const note =
      '“Share” and “All the same height” need a height set on this container. Until then, rows fit their content.';
    const cases: [Record<string, unknown>, boolean][] = [
      [{ columns: 1, rows: 2 }, true],
      [{ columns: 1, rows: ['1fr', 'auto'] }, true],
      [{ columns: 1, rows: ['auto', 20] }, false],
      [{ columns: 1 }, false],
      [{ columns: 1, rows: 2, h: 200 }, false],
    ];
    for (const [box, shown] of cases) {
      const { unmount } = drawGrid(grid(box));
      expect(screen.queryByText(note) !== null).toBe(shown);
      unmount();
    }
  });
});

describe('grid count steppers and spans', () => {
  it('steps aside, with a note, while any cell spans more than one cell', () => {
    drawGrid(grid({ columns: 2 }, [{ type: 'text', text: 'a', box: { columnSpan: 2 } }, TEXT]));
    expect(screen.queryByLabelText('Columns')).toBeNull();
    expect(screen.queryByLabelText('Rows')).toBeNull();
    // The note names the controls by their own labels: the counts it replaces
    // and the child fields that bring them back.
    expect(
      screen.getByText(
        "Some items use more than one cell, so Columns and Rows can't be changed. To change them, set every item's “Cells across” and “Cells down” to 1.",
      ),
    ).toBeTruthy();
  });

  it('keeps the steppers when every span is 1', () => {
    drawGrid(grid({ columns: 2 }, [{ type: 'text', text: 'a', box: { rowSpan: 1 } }, TEXT]));
    expect(screen.getByLabelText('Columns')).toBeTruthy();
    expect(screen.queryByText(/use more than one cell/)).toBeNull();
  });
});

describe('grid row heights — hostile', () => {
  it('gives an unreadable rows value no editor, keeping the rest of the grid', () => {
    drawGrid(grid({ columns: 2, rows: 'garbage' }));
    // (Each label shows twice: the visible caption and the group's legend.)
    expect(screen.queryAllByText('Row heights')).toHaveLength(0);
    expect(screen.getAllByText('Column widths').length).toBeGreaterThan(0);
  });
});

describe('grid spacing and fill order', () => {
  it('steps an authored axis gap from its own value, not the shared one', () => {
    const controller = grid({ columns: 2, gap: 6, columnGap: 12 });
    drawGrid(controller);
    fireEvent.click(screen.getByLabelText('Decrease Column spacing'));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: PATH,
      keys: ['box', 'columnGap'],
      value: 11,
    });
  });

  it('writes each axis gap to its own key, showing the shared gap as the placeholder', () => {
    const controller = grid({ columns: 2, gap: 6 });
    drawGrid(controller);
    const column = screen.getByLabelText('Column spacing') as HTMLInputElement;
    expect(column.placeholder).toBe('6');
    fireEvent.change(column, { target: { value: '10' } });
    fireEvent.blur(column);
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: PATH,
      keys: ['box', 'columnGap'],
      value: 10,
    });
    // ▲ on the unset row gap steps from what the engine uses: the shared 6.
    fireEvent.click(screen.getByLabelText('Increase Row spacing'));
    expect(controller.apply).toHaveBeenLastCalledWith({
      op: 'setScalar',
      path: PATH,
      keys: ['box', 'rowGap'],
      value: 7,
    });
  });

  it('refuses a garbage gap and steps an empty one from 0', () => {
    const controller = grid({ columns: 2 });
    drawGrid(controller);
    const row = screen.getByLabelText('Row spacing') as HTMLInputElement;
    expect(row.placeholder).toBe('0');
    fireEvent.change(row, { target: { value: 'wide' } });
    fireEvent.blur(row);
    expect(controller.apply).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Row spacing') as HTMLInputElement).value).toBe('');
    fireEvent.click(screen.getByLabelText('Increase Column spacing'));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: PATH,
      keys: ['box', 'columnGap'],
      value: 1,
    });
  });

  it('fills down-then-across with direction column, and back by removing the key', () => {
    const controller = grid({ columns: 2 });
    drawGrid(controller);
    expect((screen.getByLabelText('Across, then down') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByLabelText('Down, then across'));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: PATH,
      keys: ['box', 'direction'],
      value: 'column',
    });
  });

  it('reads an authored column fill and removes the key for across-then-down', () => {
    const controller = grid({ columns: 2, direction: 'column' });
    drawGrid(controller);
    fireEvent.click(screen.getByLabelText('Across, then down'));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'removeKey',
      path: PATH,
      keys: ['box', 'direction'],
    });
  });
});
