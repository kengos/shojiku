import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/context';
import { BlockDialog, type BlockDialogProps } from './BlockDialog';
import type { BlockRefusal } from './blockModel';

function draw(overrides: Partial<BlockDialogProps> = {}) {
  const onConfirm = vi.fn<(name: string) => BlockRefusal | null>(() => null);
  const onClose = vi.fn();
  render(
    <I18nProvider locale="en">
      <BlockDialog onConfirm={onConfirm} onClose={onClose} {...overrides} />
    </I18nProvider>,
  );
  return { onConfirm, onClose };
}

describe('BlockDialog', () => {
  it('confirms the typed name on the Save button', () => {
    const { onConfirm, onClose } = draw();
    fireEvent.change(screen.getByLabelText('Block name'), { target: { value: '社判＋住所' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onConfirm).toHaveBeenCalledWith('社判＋住所');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('commits on Enter, guarding IME composition', () => {
    const { onConfirm } = draw();
    const input = screen.getByLabelText('Block name');
    fireEvent.change(input, { target: { value: '枠' } });
    // Enter while composing a kanji conversion must NOT commit.
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(onConfirm).not.toHaveBeenCalled();
    // A plain Enter commits.
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onConfirm).toHaveBeenCalledWith('枠');
  });

  it('shows a refusal the Designer returns and keeps the dialog open', () => {
    const onConfirm = vi.fn<(name: string) => BlockRefusal | null>(() => 'name_exists');
    render(
      <I18nProvider locale="en">
        <BlockDialog onConfirm={onConfirm} onClose={vi.fn()} />
      </I18nProvider>,
    );
    fireEvent.change(screen.getByLabelText('Block name'), { target: { value: '社判' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('A block with this name already exists.')).toBeTruthy();
  });

  // Escape, the outside click, the focus trap and focus restore are `ui/Modal`'s
  // (Headless UI's Dialog) and are covered in `ui/Modal.test.tsx`. What stays
  // here is this dialog's own wiring of the two close affordances it owns.
  it('closes from Cancel and from the Modal close button', () => {
    const { onClose } = draw();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
