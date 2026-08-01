import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/context';
import { ContainerPickerDialog } from './ContainerPickerDialog';
import { PICKER_MAX_COLUMNS, PICKER_MAX_ROWS } from './containerModel';

function draw(onPick = vi.fn(), onClose = vi.fn()) {
  render(
    <I18nProvider locale="en">
      <ContainerPickerDialog open onClose={onClose} onPick={onPick} />
    </I18nProvider>,
  );
  return { onPick, onClose };
}

function cell(c: number, r: number): HTMLButtonElement {
  const el = document.querySelector<HTMLButtonElement>(`[data-cell="${c}x${r}"]`);
  if (el === null) {
    throw new Error(`missing cell ${c}x${r}`);
  }
  return el;
}

describe('ContainerPickerDialog', () => {
  it('renders the full trace grid with coordinate identities and the hint line', () => {
    draw();
    expect(document.querySelectorAll('[data-cell]')).toHaveLength(
      PICKER_MAX_COLUMNS * PICKER_MAX_ROWS,
    );
    expect(screen.getByText('Trace the grid to choose columns × rows')).toBeTruthy();
  });

  it('previews the kind on hover: one row reads side by side', () => {
    draw();
    fireEvent.mouseEnter(cell(3, 1));
    expect(screen.getByText('3 × 1 — side by side')).toBeTruthy();
  });

  it('previews 縦積み for one column and 表組み for a 2D trace, marking traced cells', () => {
    draw();
    fireEvent.mouseEnter(cell(1, 3));
    expect(screen.getByText('1 × 3 — stacked')).toBeTruthy();
    fireEvent.mouseEnter(cell(3, 2));
    expect(screen.getByText('3 × 2 — table grid')).toBeTruthy();
    // The trace marks every cell inside the hovered rectangle.
    expect(cell(1, 1).getAttribute('aria-pressed')).toBe('true');
    expect(cell(3, 2).getAttribute('aria-pressed')).toBe('true');
    expect(cell(4, 2).getAttribute('aria-pressed')).toBe('false');
    expect(cell(3, 3).getAttribute('aria-pressed')).toBe('false');
  });

  it('clears the trace when the pointer leaves the grid', () => {
    draw();
    fireEvent.mouseEnter(cell(2, 2));
    const grid = cell(2, 2).parentElement as HTMLElement;
    fireEvent.mouseLeave(grid);
    expect(cell(1, 1).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText('Trace the grid to choose columns × rows')).toBeTruthy();
  });

  it('picks the traced cell on click', () => {
    const { onPick } = draw();
    fireEvent.click(cell(3, 2));
    expect(onPick).toHaveBeenCalledWith(3, 2);
  });

  it('moves the trace with arrow keys from the focused cell and clamps at the edges', () => {
    draw();
    fireEvent.focus(cell(1, 1));
    const grid = cell(1, 1).parentElement as HTMLElement;
    fireEvent.keyDown(grid, { key: 'ArrowRight' });
    expect(cell(2, 1).getAttribute('aria-pressed')).toBe('true');
    fireEvent.keyDown(grid, { key: 'ArrowDown' });
    expect(cell(2, 2).getAttribute('aria-pressed')).toBe('true');
    fireEvent.keyDown(grid, { key: 'ArrowLeft' });
    fireEvent.keyDown(grid, { key: 'ArrowLeft' });
    fireEvent.keyDown(grid, { key: 'ArrowUp' });
    fireEvent.keyDown(grid, { key: 'ArrowUp' });
    expect(cell(1, 1).getAttribute('aria-pressed')).toBe('true');
    fireEvent.keyDown(grid, { key: 'ArrowRight' });
    // A non-arrow key changes nothing.
    fireEvent.keyDown(grid, { key: 'a' });
    expect(cell(2, 1).getAttribute('aria-pressed')).toBe('true');
    // Clamp at the far edges.
    for (let i = 0; i < PICKER_MAX_COLUMNS + 1; i++) {
      fireEvent.keyDown(grid, { key: 'ArrowRight' });
    }
    for (let i = 0; i < PICKER_MAX_ROWS + 1; i++) {
      fireEvent.keyDown(grid, { key: 'ArrowDown' });
    }
    expect(cell(PICKER_MAX_COLUMNS, PICKER_MAX_ROWS).getAttribute('aria-pressed')).toBe('true');
  });

  it('ignores arrow keys before any cell is traced', () => {
    draw();
    const grid = cell(1, 1).parentElement as HTMLElement;
    fireEvent.keyDown(grid, { key: 'ArrowRight' });
    expect(cell(1, 1).getAttribute('aria-pressed')).toBe('false');
  });

  it('wires Escape and the × button to onClose', () => {
    const { onClose } = draw();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('renders nothing when closed', () => {
    render(
      <I18nProvider locale="en">
        <ContainerPickerDialog open={false} onClose={vi.fn()} onPick={vi.fn()} />
      </I18nProvider>,
    );
    expect(document.querySelector('[data-cell]')).toBeNull();
  });

  it('shows the nest-destination hint when the pick will replace the selected slot', () => {
    render(
      <I18nProvider locale="en">
        <ContainerPickerDialog
          open
          onClose={vi.fn()}
          onPick={vi.fn()}
          nestHint="Inserts into the selected slot"
        />
      </I18nProvider>,
    );
    expect(screen.getByText('Inserts into the selected slot')).toBeTruthy();
    // The trace hint still shows below (both lines are informative).
    expect(screen.getByText('Trace the grid to choose columns × rows')).toBeTruthy();
  });
});
