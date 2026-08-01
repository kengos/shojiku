import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Menubar } from './Menubar';
import type { MenuColumn } from './model';

function columns(over: { fileRun?: () => void; hostRun?: () => void } = {}): MenuColumn[] {
  return [
    {
      id: 'file',
      label: 'File',
      groups: [
        [
          { label: 'Save', run: over.fileRun ?? vi.fn() },
          { label: 'Redo', run: vi.fn(), disabled: true },
        ],
        [{ label: 'Host item', run: over.hostRun ?? vi.fn() }],
      ],
    },
    { id: 'edit', label: 'Edit', groups: [[{ label: 'Undo', run: vi.fn() }]] },
  ];
}

describe('Menubar', () => {
  it('renders a menubar of closed top-level menus', () => {
    render(<Menubar columns={columns()} />);
    expect(screen.getByRole('menubar')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'File' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens a menu and shows its grouped items', () => {
    render(<Menubar columns={columns()} />);
    fireEvent.click(screen.getByRole('button', { name: 'File' }));
    expect(screen.getByRole('menu')).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Save' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Host item' })).toBeTruthy();
  });

  it('dispatches an item run closure and closes', async () => {
    const fileRun = vi.fn();
    render(<Menubar columns={columns({ fileRun })} />);
    fireEvent.click(screen.getByRole('button', { name: 'File' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Save' }));
    expect(fileRun).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('marks a disabled item and does not run it', () => {
    const cols = columns();
    render(<Menubar columns={cols} />);
    fireEvent.click(screen.getByRole('button', { name: 'File' }));
    const disabled = screen.getByRole('menuitem', { name: 'Redo' });
    expect(disabled.getAttribute('data-disabled')).not.toBeNull();
    fireEvent.click(disabled);
    // The disabled item's run is the second item of the first file group.
    expect(cols[0].groups[0][1].run as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it('renders a host-derived label as inert text, never HTML', () => {
    const cols: MenuColumn[] = [
      {
        id: 'file',
        label: 'File',
        groups: [[{ label: '<img src=x onerror=alert(1)>', run: vi.fn() }]],
      },
    ];
    render(<Menubar columns={cols} />);
    fireEvent.click(screen.getByRole('button', { name: 'File' }));
    const menu = screen.getByRole('menu');
    expect(menu.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(menu.querySelector('img')).toBeNull();
  });
});
