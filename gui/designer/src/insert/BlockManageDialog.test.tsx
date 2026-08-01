import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/context';
import { BlockManageDialog, type BlockManageDialogProps } from './BlockManageDialog';
import type { SavedBlock } from './blockModel';

const BLOCKS: readonly SavedBlock[] = [
  { id: 'block-1', name: '社判＋住所', value: { type: 'container' } },
  { id: 'block-2', name: '振込先枠', value: { type: 'table' } },
];

function draw(overrides: Partial<BlockManageDialogProps> = {}) {
  const onDelete = vi.fn();
  const onClose = vi.fn();
  render(
    <I18nProvider locale="en">
      <BlockManageDialog blocks={BLOCKS} onDelete={onDelete} onClose={onClose} {...overrides} />
    </I18nProvider>,
  );
  return { onDelete, onClose };
}

describe('BlockManageDialog', () => {
  it('lists every saved block by name', () => {
    draw();
    expect(screen.getByText('社判＋住所')).toBeTruthy();
    expect(screen.getByText('振込先枠')).toBeTruthy();
  });

  it('deletes on the second click (two-step confirm)', () => {
    const { onDelete } = draw();
    const rows = screen.getAllByRole('listitem');
    const firstDelete = () => within(rows[0]).getByRole('button');
    fireEvent.click(firstDelete());
    // Armed: the label changed, nothing deleted yet.
    expect(firstDelete().textContent).toBe('Delete?');
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(firstDelete());
    expect(onDelete).toHaveBeenCalledWith('block-1');
  });

  it('re-arms to another row, disarming the first', () => {
    const { onDelete } = draw();
    const rows = screen.getAllByRole('listitem');
    fireEvent.click(within(rows[0]).getByRole('button'));
    fireEvent.click(within(rows[1]).getByRole('button'));
    expect(within(rows[0]).getByRole('button').textContent).toBe('Delete');
    expect(within(rows[1]).getByRole('button').textContent).toBe('Delete?');
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('shows the empty state when the library is empty', () => {
    draw({ blocks: [] });
    expect(screen.getByText('No saved blocks.')).toBeTruthy();
    expect(screen.queryByRole('listitem')).toBeNull();
  });

  // Escape, the outside click, the focus trap and focus restore are `ui/Modal`'s
  // (Headless UI's Dialog) and are covered in `ui/Modal.test.tsx`. This modal
  // carries NO footer — the × is its only in-panel dismissal, so a second
  // 「閉じる」 button must not come back.
  it('closes from the Modal close button, its only in-panel dismissal', () => {
    const { onClose } = draw();
    const closers = screen.getAllByRole('button', { name: 'Close' });
    expect(closers).toHaveLength(1);
    fireEvent.click(closers[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
