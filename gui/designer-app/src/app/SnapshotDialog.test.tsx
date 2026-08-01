import { I18nProvider } from '@shojiku/designer';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { APP_CATALOG } from '../i18n/appCatalog';
import type { Snapshot } from '../persistence/snapshotEntry';
import { MAX_SNAPSHOTS } from '../persistence/snapshots';
import { SnapshotDialog } from './SnapshotDialog';

const NOW = 1_000_000_000_000;

function snap(over: Partial<Snapshot> = {}): Snapshot {
  return { id: 's1', name: 'first point', createdAt: NOW - 60_000, text: 't', fonts: [], ...over };
}

interface Handlers {
  onClose?: () => void;
  onCapture?: (name: string) => void;
  onRestore?: (s: Snapshot) => void;
  onDelete?: (id: string) => void;
}

function renderDialog(
  props: {
    open?: boolean;
    snapshots?: readonly Snapshot[];
    busy?: boolean;
    error?: boolean;
  } & Handlers = {},
) {
  const handlers = {
    onClose: props.onClose ?? vi.fn(),
    onCapture: props.onCapture ?? vi.fn(),
    onRestore: props.onRestore ?? vi.fn(),
    onDelete: props.onDelete ?? vi.fn(),
  };
  const ui = (open: boolean) => (
    <I18nProvider locale="en-US" catalog={APP_CATALOG}>
      <SnapshotDialog
        open={open}
        snapshots={props.snapshots ?? []}
        now={NOW}
        busy={props.busy}
        error={props.error}
        {...handlers}
      />
    </I18nProvider>
  );
  const result = render(ui(props.open ?? true));
  return { ...result, handlers, rerender: (open: boolean) => result.rerender(ui(open)) };
}

describe('SnapshotDialog', () => {
  it('shows an empty state when there are no points', () => {
    renderDialog();
    expect(screen.getByText(/No restore points yet/)).not.toBeNull();
  });

  it('lists points with a count and relative freshness', () => {
    renderDialog({ snapshots: [snap({ id: 'a', name: 'alpha' })] });
    expect(screen.getByText('alpha')).not.toBeNull();
    expect(screen.getByText(`1 / ${MAX_SNAPSHOTS}`)).not.toBeNull();
    // Intl relative time for -1 minute (numeric auto) → "1 minute ago" in en.
    expect(screen.getByText(/minute ago/)).not.toBeNull();
  });

  it('captures a trimmed name via the button and clears the input', () => {
    const onCapture = vi.fn();
    renderDialog({ onCapture });
    const input = screen.getByLabelText('Restore point name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '  before change  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save point' }));
    expect(onCapture).toHaveBeenCalledWith('before change');
    expect(input.value).toBe('');
  });

  it('captures on Enter, but never mid-IME-composition', () => {
    const onCapture = vi.fn();
    renderDialog({ onCapture });
    const input = screen.getByLabelText('Restore point name');
    fireEvent.change(input, { target: { value: 'x' } });
    // A non-Enter key does nothing.
    fireEvent.keyDown(input, { key: 'a' });
    // Enter mid-IME-composition does nothing.
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(onCapture).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCapture).toHaveBeenCalledWith('x');
  });

  it('does not capture an empty/whitespace name', () => {
    const onCapture = vi.fn();
    renderDialog({ onCapture });
    const input = screen.getByLabelText('Restore point name');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Save point' }));
    expect(onCapture).not.toHaveBeenCalled();
  });

  it('disables capture while a capture is in flight', () => {
    renderDialog({ busy: true });
    expect((screen.getByRole('button', { name: 'Save point' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('shows a storage-error banner', () => {
    renderDialog({ error: true });
    expect(screen.getByRole('alert').textContent).toMatch(/Could not save/);
  });

  it('shows the full note and disables capture at the cap', () => {
    const snapshots = Array.from({ length: MAX_SNAPSHOTS }, (_, i) =>
      snap({ id: `s${i}`, name: `s${i}` }),
    );
    renderDialog({ snapshots });
    expect(screen.getByText(/maximum \(10\)/)).not.toBeNull();
    expect((screen.getByRole('button', { name: 'Save point' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('confirms before restoring, and restores on confirm', () => {
    const onRestore = vi.fn();
    renderDialog({ snapshots: [snap({ id: 'a', name: 'alpha' })], onRestore });
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    // Confirm view: the name and a warning appear.
    expect(screen.getByText(/will replace your current work/)).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(onRestore).toHaveBeenCalledTimes(1);
    expect(onRestore.mock.calls[0][0].id).toBe('a');
  });

  it('cancels a restore confirm back to the row', () => {
    const onRestore = vi.fn();
    renderDialog({ snapshots: [snap({ id: 'a', name: 'alpha' })], onRestore });
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('alpha')).not.toBeNull();
    expect(onRestore).not.toHaveBeenCalled();
  });

  it('deletes a point', () => {
    const onDelete = vi.fn();
    renderDialog({ snapshots: [snap({ id: 'a', name: 'alpha' })], onDelete });
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledWith('a');
  });

  it('closes via the × button', () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('forgets in-progress input and confirm when closed', () => {
    const onCapture = vi.fn();
    const { rerender } = renderDialog({ snapshots: [snap({ id: 'a', name: 'alpha' })], onCapture });
    fireEvent.change(screen.getByLabelText('Restore point name'), {
      target: { value: 'draft name' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    rerender(false);
    rerender(true);
    // The input is cleared and the confirm is gone (the row is back).
    expect((screen.getByLabelText('Restore point name') as HTMLInputElement).value).toBe('');
    expect(screen.getByText('alpha')).not.toBeNull();
  });
});
