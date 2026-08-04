import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StringListField } from './StringListField';

function renderField(entries: readonly string[], max = 8) {
  const onCommit = vi.fn();
  const onRemove = vi.fn();
  render(
    <StringListField
      label="Keywords"
      entries={entries}
      removeLabel="Remove"
      addPlaceholder="Type to add"
      max={max}
      onCommit={onCommit}
      onRemove={onRemove}
    />,
  );
  return { onCommit, onRemove };
}

function rows(): HTMLInputElement[] {
  return screen.getAllByLabelText('Keywords') as HTMLInputElement[];
}

describe('StringListField', () => {
  it('shows one row per entry plus a trailing blank row that adds', () => {
    renderField(['a', 'b']);
    expect(rows().map((input) => input.value)).toEqual(['a', 'b', '']);
    // Only the blank row advertises itself as the way to add.
    expect(screen.getByPlaceholderText('Type to add')).toBeTruthy();
    // …and only the authored rows can be removed.
    expect(screen.getAllByLabelText('Remove')).toHaveLength(2);
  });

  it('drops the blank row at the cap, so it never offers an entry the engine would reject', () => {
    renderField(['a', 'b'], 2);
    expect(rows().map((input) => input.value)).toEqual(['a', 'b']);
    expect(screen.queryByPlaceholderText('Type to add')).toBeNull();
  });

  it('commits a changed row by index and stays silent on an unchanged blur', () => {
    const { onCommit } = renderField(['a']);
    fireEvent.blur(rows()[0], { target: { value: 'A' } });
    expect(onCommit).toHaveBeenCalledWith(0, 'A');
    onCommit.mockClear();
    fireEvent.blur(rows()[0], { target: { value: 'a' } });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('removes by index', () => {
    const { onRemove } = renderField(['a', 'b']);
    fireEvent.click(screen.getAllByLabelText('Remove')[1]);
    expect(onRemove).toHaveBeenCalledWith(1);
  });

  it('blurs on Enter, but not while an IME composition is open', () => {
    const { onCommit } = renderField([]);
    const blank = rows()[0];
    blank.focus();
    fireEvent.change(blank, { target: { value: 'にほんご' } });
    fireEvent.keyDown(blank, { key: 'Enter', isComposing: true });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.keyDown(blank, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith(0, 'にほんご');
  });

  it('ignores other keys', () => {
    const { onCommit } = renderField([]);
    const blank = rows()[0];
    blank.focus();
    fireEvent.change(blank, { target: { value: 'x' } });
    fireEvent.keyDown(blank, { key: 'a' });
    expect(onCommit).not.toHaveBeenCalled();
  });
});
