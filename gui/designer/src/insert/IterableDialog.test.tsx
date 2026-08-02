import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/context';
import type { PaletteGroup } from '../palette/model';
import { IterableDialog, type IterableDialogProps } from './IterableDialog';
import type { IterableRefusal } from './iterableModel';

const ITEMS: PaletteGroup = {
  id: 'order_items',
  label: '明細',
  description: '',
  isArray: true,
  fields: [
    { key: 'name', label: '品名', type: 'string', description: '', sample: '', enumOptions: [] },
  ],
};

const TAGS: PaletteGroup = {
  id: 'tags',
  label: 'タグ',
  description: '',
  isArray: true,
  fields: [],
};

function draw(overrides: Partial<IterableDialogProps> = {}) {
  const onConfirm = vi.fn<(choice: unknown) => IterableRefusal | null>(() => null);
  const onClose = vi.fn();
  render(
    <I18nProvider locale="en">
      <IterableDialog
        groups={[ITEMS, TAGS]}
        workshop={false}
        onConfirm={onConfirm as IterableDialogProps['onConfirm']}
        onClose={onClose}
        {...overrides}
      />
    </I18nProvider>,
  );
  return { onConfirm, onClose };
}

describe('IterableDialog — group flow', () => {
  it('confirms the picked group and variant', () => {
    const { onConfirm } = draw();
    fireEvent.click(screen.getByRole('radio', { name: 'Cards' }));
    fireEvent.click(screen.getByRole('button', { name: 'Insert list' }));
    expect(onConfirm).toHaveBeenCalledWith({
      kind: 'group',
      group: ITEMS,
      variant: 'repeat_flow',
    });
  });

  it('offers only the list for a field-less group (clamping the picked variant)', () => {
    const { onConfirm } = draw();
    const table = screen.getByRole('radio', { name: 'Table' });
    expect((table as HTMLInputElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('radio', { name: /タグ/ }));
    expect((screen.getByRole('radio', { name: 'Table' }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('radio', { name: 'Cards' }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('radio', { name: 'List' }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Insert list' }));
    expect(onConfirm).toHaveBeenCalledWith({ kind: 'group', group: TAGS, variant: 'list' });
  });

  it('hides the mode switch outside workshop mode and shows no create form', () => {
    draw();
    expect(screen.queryByRole('radiogroup', { name: 'How to choose data' })).toBeNull();
    expect(screen.queryByLabelText('List name')).toBeNull();
  });

  it('displays a refusal the confirm handler returns and stays open', () => {
    draw({ onConfirm: () => 'insert_failed' });
    fireEvent.click(screen.getByRole('button', { name: 'Insert list' }));
    expect(screen.getByText('Could not insert here.')).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});

describe('IterableDialog — create flow (workshop)', () => {
  it('opens straight into the create form when no groups exist, prefilled with 3 fields', () => {
    draw({ groups: [], workshop: true });
    expect(screen.queryByRole('radiogroup', { name: 'How to choose data' })).toBeNull();
    expect(screen.getByLabelText('List name')).toBeTruthy();
    const names = screen.getAllByLabelText('Name of field') as HTMLInputElement[];
    expect(names.map((input) => input.value)).toEqual(['Field 1', 'Field 2', 'Field 3']);
  });

  it('switches between group and create modes in workshop with groups', () => {
    draw({ workshop: true });
    expect(screen.getByRole('radiogroup', { name: 'How to choose data' })).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Create new data' }));
    expect(screen.getByLabelText('List name')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Use existing data' }));
    expect(screen.queryByLabelText('List name')).toBeNull();
  });

  it('adds and removes field rows, disabling add at the cap', () => {
    draw({ groups: [], workshop: true });
    const add = screen.getByRole('button', { name: 'Add another field' });
    fireEvent.click(add);
    expect(screen.getAllByLabelText('Name of field')).toHaveLength(4);
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove this field' })[3]);
    expect(screen.getAllByLabelText('Name of field')).toHaveLength(3);
    for (let i = 0; i < 13; i += 1) {
      fireEvent.click(add);
    }
    expect(screen.getAllByLabelText('Name of field')).toHaveLength(16);
    expect((add as HTMLButtonElement).disabled).toBe(true);
  });

  it('hides the fields list for the list variant (scalar rows)', () => {
    draw({ groups: [], workshop: true });
    fireEvent.click(screen.getByRole('radio', { name: 'List' }));
    expect(screen.queryByLabelText('Name of field')).toBeNull();
  });

  it('confirms a typed create choice with trimmed names and picked kinds', () => {
    const { onConfirm } = draw({ groups: [], workshop: true });
    fireEvent.change(screen.getByLabelText('List name'), { target: { value: ' 明細 ' } });
    const names = screen.getAllByLabelText('Name of field');
    fireEvent.change(names[0], { target: { value: '品名' } });
    fireEvent.change(names[1], { target: { value: '数量' } });
    fireEvent.change(screen.getAllByLabelText('Field type')[1], { target: { value: 'number' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove this field' })[2]);
    fireEvent.click(screen.getByRole('button', { name: 'Insert list' }));
    expect(onConfirm).toHaveBeenCalledWith({
      kind: 'create',
      name: '明細',
      fields: [
        { name: '品名', kind: 'text' },
        { name: '数量', kind: 'number' },
      ],
      variant: 'table',
    });
  });

  it('confirms a currency-kind create field (maps to number+currency downstream)', () => {
    const { onConfirm } = draw({ groups: [], workshop: true });
    fireEvent.change(screen.getByLabelText('List name'), { target: { value: '明細' } });
    const names = screen.getAllByLabelText('Name of field');
    fireEvent.change(names[0], { target: { value: '品名' } });
    fireEvent.change(names[1], { target: { value: '金額' } });
    fireEvent.change(screen.getAllByLabelText('Field type')[1], { target: { value: 'currency' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove this field' })[2]);
    fireEvent.click(screen.getByRole('button', { name: 'Insert list' }));
    expect(onConfirm).toHaveBeenCalledWith({
      kind: 'create',
      name: '明細',
      fields: [
        { name: '品名', kind: 'text' },
        { name: '金額', kind: 'currency' },
      ],
      variant: 'table',
    });
  });

  it('shows a validation refusal without calling the confirm handler', () => {
    const { onConfirm } = draw({ groups: [], workshop: true });
    fireEvent.click(screen.getByRole('button', { name: 'Insert list' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a list name.')).toBeTruthy();
  });
});

describe('IterableDialog — dismissal', () => {
  // Escape, the outside click, the focus trap and focus restore are `ui/Modal`'s
  // (Headless UI's Dialog) and are covered in `ui/Modal.test.tsx`. What stays
  // here is this dialog's own wiring of the close affordances it owns.
  it('closes from the cancel button and from the Modal close button', () => {
    const { onClose } = draw();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
