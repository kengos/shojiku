import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ContextMenu } from './ContextMenu';

const AT = { x: 40, y: 60 };

function draw(
  items = [{ label: 'Group into a container', onSelect: vi.fn() }],
  at: { x: number; y: number } | null = AT,
) {
  const onClose = vi.fn();
  render(<ContextMenu at={at} items={items} onClose={onClose} />);
  return { items, onClose };
}

describe('ContextMenu', () => {
  it('renders a role=menu at the pointer with menuitem buttons, first item focused', () => {
    draw();
    const menu = screen.getByRole('menu');
    expect(menu.style.left).toBe('40px');
    expect(menu.style.top).toBe('60px');
    const item = screen.getByRole('menuitem', { name: 'Group into a container' });
    expect(document.activeElement).toBe(item);
  });

  it('renders nothing when closed or when there are no items', () => {
    draw([{ label: 'x', onSelect: vi.fn() }], null);
    expect(screen.queryByRole('menu')).toBeNull();
    draw([]);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('fires the item and closes on click', () => {
    const { items, onClose } = draw();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Group into a container' }));
    expect(items[0].onSelect).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape (capture — wins over other listeners)', () => {
    const { onClose } = draw();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on an outside pointer-down but not an inside one', () => {
    const { onClose } = draw();
    fireEvent.pointerDown(screen.getByRole('menu'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('roves focus with arrow keys, wrapping both directions', () => {
    const items = [
      { label: 'first', onSelect: vi.fn() },
      { label: 'second', onSelect: vi.fn() },
    ];
    draw(items);
    const menu = screen.getByRole('menu');
    const first = screen.getByRole('menuitem', { name: 'first' });
    const second = screen.getByRole('menuitem', { name: 'second' });
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(second);
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(second);
    // A non-arrow key is left alone (no preventDefault path).
    fireEvent.keyDown(menu, { key: 'Tab' });
    expect(document.activeElement).toBe(second);
  });
});
