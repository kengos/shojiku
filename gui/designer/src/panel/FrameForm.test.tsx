// Tests for the sub-template FRAME surface: `CellPanel` routing a selected
// grid cell / card / column cell to `FrameForm`, the form's fields pointed at the
// frame's own path, and the jumps into the frame from its owner's panel.
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { EditorController } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import { PropertyPanel } from './PropertyPanel';

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

const OWNER = 'sections.body.items[0]';
const CELL = `${OWNER}.cell`;
const ALL = ['style.backgroundColor', 'style.border'];

function gridDoc(cell: Record<string, unknown>) {
  return makeController({
    [OWNER]: { type: 'repeat', data: { key: 'rows' }, cell },
    [CELL]: cell,
  });
}

describe('FrameForm via CellPanel', () => {
  it('turns a selected grid cell into a frame form instead of the dead end', () => {
    const controller = gridDoc({ box: { padding: 8 }, style: { borderWidth: 0.5 }, items: [] });
    draw(<PropertyPanel controller={controller} path={CELL} capabilities={ALL} />);
    expect(screen.queryByText('This item type has no editable fields yet.')).toBeNull();
    expect(screen.getByText('Cell frame')).toBeTruthy();
    expect(screen.getByText('Every cell of the grid uses this frame.')).toBeTruthy();
    expect((screen.getByLabelText('Padding') as HTMLInputElement).value).toBe('8');
    expect(screen.getByText('Background')).toBeTruthy();
    expect(screen.getByText('Border')).toBeTruthy();
    // The column note is the column cell's alone.
    expect(screen.queryByText(/cell padding does not apply/)).toBeNull();
  });

  it('writes the padding at the FRAME path, not the owner', () => {
    const controller = gridDoc({ box: { padding: 8 }, items: [] });
    draw(<PropertyPanel controller={controller} path={CELL} capabilities={ALL} />);
    const field = screen.getByLabelText('Padding');
    fireEvent.change(field, { target: { value: '4' } });
    fireEvent.blur(field);
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'setScalar', path: CELL, keys: ['box', 'padding'], value: 4 },
    ]);
  });

  it('steps the padding by a point and refuses what the wire cannot take', () => {
    const controller = gridDoc({ box: { padding: 8 }, items: [] });
    draw(<PropertyPanel controller={controller} path={CELL} capabilities={ALL} />);
    fireEvent.click(screen.getByRole('button', { name: 'Increase Padding' }));
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'setScalar', path: CELL, keys: ['box', 'padding'], value: 9 },
    ]);
    const field = screen.getByLabelText('Padding');
    fireEvent.change(field, { target: { value: '-3' } });
    fireEvent.blur(field);
    // A negative is a parse error on this wire: nothing is written.
    expect(controller.applyAll).toHaveBeenCalledTimes(1);
  });

  it('says so when the padding differs per side, and when it cannot show it', () => {
    const { unmount } = draw(
      <PropertyPanel
        controller={gridDoc({ box: { padding: { top: 4 } }, items: [] })}
        path={CELL}
        capabilities={ALL}
      />,
    );
    expect(screen.getByText(/Differs per side/)).toBeTruthy();
    unmount();
    draw(
      <PropertyPanel
        controller={gridDoc({ box: { padding: '4mm' }, items: [] })}
        path={CELL}
        capabilities={ALL}
      />,
    );
    expect(screen.getByText(/can't show/)).toBeTruthy();
  });

  it('withholds the fill and the border without their capabilities', () => {
    draw(<PropertyPanel controller={gridDoc({ items: [] })} path={CELL} capabilities={[]} />);
    expect(screen.getByText('Cell frame')).toBeTruthy();
    expect(screen.queryByText('Background')).toBeNull();
    expect(screen.queryByText('Border')).toBeNull();
  });

  it('names a card frame and a column cell frame, the latter with its note', () => {
    const card = makeController({
      [OWNER]: { type: 'repeat_flow', item: { items: [] } },
      [`${OWNER}.item`]: { items: [] },
    });
    const { unmount } = draw(<PropertyPanel controller={card} path={`${OWNER}.item`} />);
    expect(screen.getByText('Card frame')).toBeTruthy();
    expect(screen.getByText('Every card uses this frame.')).toBeTruthy();
    unmount();
    const column = `${OWNER}.columns[0]`;
    const table = makeController({
      [OWNER]: { type: 'table', columns: [{ label: 'A', cell: {} }] },
      [column]: { label: 'A', cell: {} },
      [`${column}.cell`]: {},
    });
    draw(<PropertyPanel controller={table} path={`${column}.cell`} />);
    expect(screen.getByText('Column cell frame')).toBeTruthy();
    expect(screen.getByText(/cell padding does not apply/)).toBeTruthy();
  });

  it('jumps back to the owner', () => {
    const onSelectPath = vi.fn();
    draw(
      <PropertyPanel controller={gridDoc({ items: [] })} path={CELL} onSelectPath={onSelectPath} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Select the grid' }));
    expect(onSelectPath).toHaveBeenCalledWith(OWNER);
  });

  it('keeps the unsupported note for a cell under something that is not a repeat', () => {
    const controller = makeController({
      [OWNER]: { type: 'container', cell: {} },
      [CELL]: {},
    });
    draw(<PropertyPanel controller={controller} path={CELL} />);
    expect(screen.getByText('This item type has no editable fields yet.')).toBeTruthy();
  });
});

describe('jumps into the frame', () => {
  it('offers the cell frame from the grid and the card frame from the cards', () => {
    const onSelectPath = vi.fn();
    const grid = makeController({
      [OWNER]: { type: 'repeat', data: { key: 'rows' }, cell: { items: [] } },
      [CELL]: { items: [] },
    });
    const { unmount } = draw(
      <PropertyPanel controller={grid} path={OWNER} onSelectPath={onSelectPath} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit the cell frame' }));
    expect(onSelectPath).toHaveBeenLastCalledWith(CELL);
    unmount();
    const cards = makeController({
      [OWNER]: { type: 'repeat_flow', data: { key: 'rows' }, item: { items: [] } },
      [`${OWNER}.item`]: { items: [] },
    });
    draw(<PropertyPanel controller={cards} path={OWNER} onSelectPath={onSelectPath} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit the card frame' }));
    expect(onSelectPath).toHaveBeenLastCalledWith(`${OWNER}.item`);
  });

  it('offers none for a list, or for cards whose frame is not a map', () => {
    const list = makeController({ [OWNER]: { type: 'list', data: { key: 'rows' } } });
    const { unmount } = draw(
      <PropertyPanel controller={list} path={OWNER} onSelectPath={vi.fn()} />,
    );
    expect(screen.queryByRole('button', { name: /frame/ })).toBeNull();
    unmount();
    const broken = makeController({
      [OWNER]: { type: 'repeat_flow', data: { key: 'rows' }, item: 'oops' },
      [`${OWNER}.item`]: 'oops',
    });
    draw(<PropertyPanel controller={broken} path={OWNER} onSelectPath={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /frame/ })).toBeNull();
  });

  it('offers the cell frame from a cell: column, and not from a bound one', () => {
    const onSelectPath = vi.fn();
    const column = `${OWNER}.columns[0]`;
    const table = makeController({
      [OWNER]: {
        type: 'table',
        columns: [
          { label: 'A', cell: { items: [] } },
          { label: 'B', data: { key: 'b' } },
        ],
      },
      [column]: { label: 'A', cell: { items: [] } },
      [`${OWNER}.columns[1]`]: { label: 'B', data: { key: 'b' } },
    });
    const { unmount } = draw(
      <PropertyPanel controller={table} path={column} onSelectPath={onSelectPath} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit the cell frame' }));
    expect(onSelectPath).toHaveBeenCalledWith(`${column}.cell`);
    unmount();
    draw(
      <PropertyPanel controller={table} path={`${OWNER}.columns[1]`} onSelectPath={onSelectPath} />,
    );
    expect(screen.queryByRole('button', { name: 'Edit the cell frame' })).toBeNull();
  });
});
