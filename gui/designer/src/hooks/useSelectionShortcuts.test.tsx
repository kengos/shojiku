// Escape's window-level meaning — deselect — and where it stands down: inside
// an editable field (the field's own cancel) and inside a dialog (the dialog's
// own dismissal).

import { fireEvent, render, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSelectionShortcuts } from './useSelectionShortcuts';

function setup() {
  const options = {
    undo: vi.fn(),
    redo: vi.fn(),
    deleteSelected: vi.fn(),
    duplicateSelected: vi.fn(),
    deselectClearing: vi.fn(),
    docViewOpenRef: { current: false },
    dataViewOpenRef: { current: false },
    closeDocView: vi.fn(),
    closeDataView: vi.fn(),
  };
  renderHook(() => useSelectionShortcuts(options));
  return options;
}

describe('Escape', () => {
  it('deselects from the page', () => {
    const options = setup();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(options.deselectClearing).toHaveBeenCalledTimes(1);
  });

  it('leaves the selection alone when pressed inside a dialog', () => {
    const options = setup();
    const { getByRole } = render(
      <div role="dialog" aria-label="Confirm">
        <button type="button">Cancel</button>
      </div>,
    );
    fireEvent.keyDown(getByRole('button', { name: 'Cancel' }), { key: 'Escape' });
    expect(options.deselectClearing).not.toHaveBeenCalled();
    expect(options.closeDocView).not.toHaveBeenCalled();
  });

  it('still undoes from inside a dialog — only Escape belongs to it', () => {
    const options = setup();
    const { getByRole } = render(
      <div role="dialog" aria-label="Sheet">
        <button type="button">Cell</button>
      </div>,
    );
    fireEvent.keyDown(getByRole('button', { name: 'Cell' }), { key: 'z', ctrlKey: true });
    expect(options.undo).toHaveBeenCalledTimes(1);
  });
});
