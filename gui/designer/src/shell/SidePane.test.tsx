// Designer-level tests for shell/SidePane.tsx — the collapsible/resizable
// left pane (rail ⇄ tabs) and its ergonomics.
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { draw, makeTransport } from '../testkit/harness';

describe('sidebar pane ergonomics', () => {
  it('collapses from the tab row into a rail and re-shows at the same width', () => {
    draw(makeTransport(), { defaultSidebarWidth: 300 });
    // The collapse toggle lives in the sidebar's tab row (gdoc-style), NOT the
    // slim toolbar.
    const toolbar = screen.getByRole('toolbar');
    expect(within(toolbar).queryByRole('button', { name: 'Hide panel' })).toBeNull();
    expect(within(toolbar).queryByRole('button', { name: 'Show panel' })).toBeNull();
    // Expanded: the layers tab, the resize handle (at the seeded 300px), and the
    // tab-row "Hide panel" control are present.
    expect(screen.queryByRole('tab', { name: 'Structure' })).not.toBeNull();
    const handle = screen.getByRole('separator', { name: 'Resize panel' });
    expect(handle.getAttribute('aria-valuenow')).toBe('300');
    // Collapse: the pane, its tabs, and its handle drop out; a rail carrying the
    // "Show panel" control replaces them.
    fireEvent.click(screen.getByRole('button', { name: 'Hide panel' }));
    expect(screen.queryByRole('tab', { name: 'Structure' })).toBeNull();
    expect(screen.queryByRole('separator', { name: 'Resize panel' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Hide panel' })).toBeNull();
    // Re-show from the rail restores the pane at the SAME (300px) width.
    fireEvent.click(screen.getByRole('button', { name: 'Show panel' }));
    expect(screen.queryByRole('tab', { name: 'Structure' })).not.toBeNull();
    expect(
      screen.getByRole('separator', { name: 'Resize panel' }).getAttribute('aria-valuenow'),
    ).toBe('300');
    expect(screen.getByRole('button', { name: 'Hide panel' })).toBeTruthy();
  });

  it('seeds the pane width from the host value, clamped to the bounds', () => {
    draw(makeTransport(), { defaultSidebarWidth: 5000 });
    // An over-max seed clamps to the maximum (read off the splitter's value).
    expect(
      screen.getByRole('separator', { name: 'Resize panel' }).getAttribute('aria-valuenow'),
    ).toBe('480');
  });

  it('persists a keyboard resize through the host callback', () => {
    const onSidebarWidthChange = vi.fn();
    draw(makeTransport(), { defaultSidebarWidth: 300, onSidebarWidthChange });
    const handle = screen.getByRole('separator', { name: 'Resize panel' });
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(onSidebarWidthChange).toHaveBeenCalledWith(316);
    // The splitter reflects the new live width.
    expect(handle.getAttribute('aria-valuenow')).toBe('316');
  });

  it('resizes without a host callback without throwing', () => {
    draw(makeTransport());
    const handle = screen.getByRole('separator', { name: 'Resize panel' });
    expect(() => fireEvent.keyDown(handle, { key: 'ArrowLeft' })).not.toThrow();
    // 240 default nudged left by the 16px step.
    expect(handle.getAttribute('aria-valuenow')).toBe('224');
  });
});
