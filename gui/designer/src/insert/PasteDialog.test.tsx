import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/context';
import { PasteDialog, type PasteDialogProps } from './PasteDialog';
import type { PasteRefusal } from './paste';
import type { PasteGrid } from './pasteGrid';

function draw(overrides: Partial<PasteDialogProps> = {}) {
  const onConfirm = vi.fn<(grid: PasteGrid) => PasteRefusal | null>(() => null);
  const onClose = vi.fn();
  render(
    <I18nProvider locale="en">
      <PasteDialog onConfirm={onConfirm} onClose={onClose} {...overrides} />
    </I18nProvider>,
  );
  return { onConfirm, onClose };
}

function paste(value: string) {
  fireEvent.change(screen.getByLabelText('Pasted data'), { target: { value } });
}

describe('PasteDialog', () => {
  it('shows the instruction only (no error) before anything is pasted', () => {
    draw();
    expect(screen.queryByText(/Nothing to import/i)).toBeNull();
    // Insert is disabled with no valid grid.
    expect(
      (screen.getByRole('button', { name: 'Insert table' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('previews the parsed columns, their kinds, and the row count', () => {
    draw();
    paste('name\tamount\nAlice\t¥300\nBob\t¥120');
    expect(screen.getByText('2 columns · 2 rows')).toBeTruthy();
    expect(screen.getByText('name')).toBeTruthy();
    expect(screen.getByText('amount')).toBeTruthy();
    // amount is a currency column → the money kind label appears.
    expect(screen.getByText('Money')).toBeTruthy();
  });

  it('falls back to the derived key when a column header is blank', () => {
    draw();
    paste('\tage\n1\t2');
    // First header is empty → the preview chip shows its derived key.
    expect(screen.getByText('col1')).toBeTruthy();
  });

  it('confirms the parsed grid on insert', () => {
    const { onConfirm } = draw();
    paste('name\tage\nAlice\t30');
    fireEvent.click(screen.getByRole('button', { name: 'Insert table' }));
    expect(onConfirm).toHaveBeenCalledWith({
      headers: ['name', 'age'],
      rows: [['Alice', '30']],
    });
  });

  it('shows an inline refusal for a header-only paste and keeps insert disabled', () => {
    const { onConfirm } = draw();
    paste('name\tage');
    expect(screen.getByText(/at least one data row/i)).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Insert table' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Insert table' }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('surfaces a refusal the Designer returns', () => {
    const onConfirm = vi.fn<(grid: PasteGrid) => PasteRefusal | null>(() => 'invalid_params');
    render(
      <I18nProvider locale="en">
        <PasteDialog onConfirm={onConfirm} onClose={vi.fn()} />
      </I18nProvider>,
    );
    paste('a\n1');
    fireEvent.click(screen.getByRole('button', { name: 'Insert table' }));
    expect(screen.getByText(/Sample data could not be read/i)).toBeTruthy();
  });

  it('notes when the paste was trimmed to the limits', () => {
    draw();
    // A ragged wide row forces truncation.
    paste('a\tb\n1\t2\t3');
    expect(screen.getByText(/trimmed to fit the limits/i)).toBeTruthy();
  });

  // Escape, the outside click, the focus trap and focus restore are `ui/Modal`'s
  // (Headless UI's Dialog) and are covered in `ui/Modal.test.tsx`. What stays
  // here is this dialog's own wiring of the close affordances it owns.
  it('closes from Cancel and from the Modal close button', () => {
    const { onClose } = draw();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
