import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/context';
import { FieldDialog, type FieldDialogProps } from './FieldDialog';
import type { FieldChoice, FieldRefusal } from './fieldModel';

function draw(overrides: Partial<FieldDialogProps> = {}) {
  const onConfirm = vi.fn<(choice: FieldChoice) => FieldRefusal | null>(() => null);
  const onClose = vi.fn();
  render(
    <I18nProvider locale="en">
      <FieldDialog onConfirm={onConfirm} onClose={onClose} {...overrides} />
    </I18nProvider>,
  );
  return { onConfirm, onClose };
}

describe('FieldDialog', () => {
  it('confirms a named text field with its edited sample', () => {
    const { onConfirm, onClose } = draw();
    fireEvent.change(screen.getByLabelText('Field name'), { target: { value: '  note  ' } });
    fireEvent.change(screen.getByLabelText('Sample value'), { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onConfirm).toHaveBeenCalledWith({ name: 'note', kind: 'text', sample: 'hello' });
    // onConfirm returned null → the Designer owns closing (no refusal shown).
    expect(screen.queryByRole('status')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('re-seeds and re-widgets the sample per kind', () => {
    const { onConfirm } = draw();
    fireEvent.change(screen.getByLabelText('Field name'), { target: { value: 'amount' } });
    // number: the seed is 0, a number input, and coerces the typed value.
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'number' } });
    const sample = screen.getByLabelText('Sample value') as HTMLInputElement;
    expect(sample.type).toBe('number');
    expect(sample.value).toBe('0');
    fireEvent.change(sample, { target: { value: '300' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onConfirm).toHaveBeenCalledWith({ name: 'amount', kind: 'number', sample: 300 });
  });

  it('edits the currency kind as a whole-number amount (number widget, seed 0)', () => {
    const { onConfirm } = draw();
    fireEvent.change(screen.getByLabelText('Field name'), { target: { value: 'total' } });
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'currency' } });
    const sample = screen.getByLabelText('Sample value') as HTMLInputElement;
    expect(sample.type).toBe('number');
    expect(sample.value).toBe('0');
    fireEvent.change(sample, { target: { value: '300000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onConfirm).toHaveBeenCalledWith({ name: 'total', kind: 'currency', sample: 300000 });
  });

  it('offers a date picker seeded with today for the date kind', () => {
    const { onConfirm } = draw();
    fireEvent.change(screen.getByLabelText('Field name'), { target: { value: 'issued' } });
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'date' } });
    const sample = screen.getByLabelText('Sample value') as HTMLInputElement;
    expect(sample.type).toBe('date');
    expect(sample.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'issued', kind: 'date' }),
    );
  });

  it('uses a checkbox for the boolean kind', () => {
    const { onConfirm } = draw();
    fireEvent.change(screen.getByLabelText('Field name'), { target: { value: 'paid' } });
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'boolean' } });
    const sample = screen.getByLabelText('Sample value') as HTMLInputElement;
    expect(sample.type).toBe('checkbox');
    expect(sample.checked).toBe(false);
    fireEvent.click(sample);
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onConfirm).toHaveBeenCalledWith({ name: 'paid', kind: 'boolean', sample: true });
  });

  it('shows the validation refusal and keeps the dialog open on an empty name', () => {
    const { onConfirm, onClose } = draw();
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a field name.')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('surfaces a refusal the Designer returns (e.g. a duplicate key)', () => {
    const onConfirm = vi.fn<(choice: FieldChoice) => FieldRefusal | null>(() => 'key_exists');
    render(
      <I18nProvider locale="en">
        <FieldDialog onConfirm={onConfirm} onClose={vi.fn()} />
      </I18nProvider>,
    );
    fireEvent.change(screen.getByLabelText('Field name'), { target: { value: 'total' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onConfirm).toHaveBeenCalled();
    expect(screen.getByText(/already has an entry/i)).toBeTruthy();
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

// The RENDERED counterpart to `ui/actionConvention.test.ts`: that gate reads the
// SOURCE and proves each footer names exactly one primary, which is a claim
// about the JSX. This proves the prop actually reaches the DOM on THIS dialog's
// confirming action — Material 3's emphasis hierarchy is only real once the
// element carries it. `data-variant` is the documented hook; never assert the
// utility classes.
describe('FieldDialog — emphasis (Material 3: one primary per screen)', () => {
  it('paints its confirming action as the primary, and its dismissal as a peer', () => {
    draw();
    expect(screen.getByRole('button', { name: 'Create' }).dataset.variant).toBe('primary');
    expect(screen.getByRole('button', { name: 'Cancel' }).dataset.variant).toBe('default');
  });
});
