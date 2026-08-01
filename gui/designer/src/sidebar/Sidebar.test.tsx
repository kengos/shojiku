import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Sidebar, type SidebarTab } from './Sidebar';

const TABS: readonly SidebarTab[] = [
  { id: 'layers', label: 'Layers', content: <p>tree here</p> },
  { id: 'data', label: 'Data fields', content: <p>palette here</p> },
];

describe('Sidebar', () => {
  it('shows the first tab by default and switches on click', () => {
    render(<Sidebar tabs={TABS} />);
    expect(screen.getByRole('tab', { name: 'Layers' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('tree here')).toBeTruthy();
    expect(screen.queryByText('palette here')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Data fields' }));
    expect(screen.getByText('palette here')).toBeTruthy();
    expect(screen.queryByText('tree here')).toBeNull();
  });

  it('labels the panel by its tab and keeps a roving tabindex', () => {
    render(<Sidebar tabs={TABS} />);
    const panel = screen.getByRole('tabpanel', { name: 'Layers' });
    expect(panel).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Layers' }).tabIndex).toBe(0);
    expect(screen.getByRole('tab', { name: 'Data fields' }).tabIndex).toBe(-1);
  });

  it('cycles tabs with ArrowRight and ArrowLeft, moving focus', () => {
    render(<Sidebar tabs={TABS} />);
    const layers = screen.getByRole('tab', { name: 'Layers' });
    fireEvent.keyDown(layers, { key: 'ArrowRight' });
    expect(screen.getByText('palette here')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Data fields' }));
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Data fields' }), { key: 'ArrowRight' });
    expect(screen.getByText('tree here')).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Layers' }), { key: 'ArrowLeft' });
    expect(screen.getByText('palette here')).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Data fields' }), { key: 'Tab' });
    expect(screen.getByText('palette here')).toBeTruthy();
  });

  it('clamps a stranded active tab to the first tab', () => {
    const { rerender } = render(<Sidebar tabs={TABS} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Data fields' }));
    rerender(<Sidebar tabs={[TABS[0]]} />);
    expect(screen.getByRole('tab', { name: 'Layers' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('tree here')).toBeTruthy();
  });

  it('renders an empty frame for an empty tab set', () => {
    const { container } = render(<Sidebar tabs={[]} />);
    expect(container.querySelector('.sj-sidebar')).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('renders a trailing control in the tab row and still switches tabs', () => {
    render(<Sidebar tabs={TABS} trailing={<button type="button">collapse</button>} />);
    // The trailing control shares the tab row without joining the tablist.
    const trailing = screen.getByRole('button', { name: 'collapse' });
    expect(trailing).toBeTruthy();
    expect(screen.queryAllByRole('tab').includes(trailing)).toBe(false);
    // Tab switching is unaffected by the trailing slot.
    fireEvent.click(screen.getByRole('tab', { name: 'Data fields' }));
    expect(screen.getByText('palette here')).toBeTruthy();
  });

  it('omits the trailing slot when none is given', () => {
    render(<Sidebar tabs={TABS} />);
    expect(screen.queryByRole('button', { name: 'collapse' })).toBeNull();
  });
});
