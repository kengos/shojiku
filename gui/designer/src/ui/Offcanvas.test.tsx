import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Offcanvas } from './Offcanvas';

describe('Offcanvas', () => {
  it('renders nothing when closed', () => {
    render(
      <Offcanvas open={false} onClose={vi.fn()} title="Columns" closeLabel="Close">
        body
      </Offcanvas>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders a labelled sheet with its title and body when open', () => {
    render(
      <Offcanvas open onClose={vi.fn()} title="Column editor" closeLabel="Close">
        <p>sheet body</p>
      </Offcanvas>,
    );
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Column editor')).toBeTruthy();
    expect(screen.getByText('sheet body')).toBeTruthy();
  });

  it('requests close via the × button and via Escape', () => {
    const onClose = vi.fn();
    render(
      <Offcanvas open onClose={onClose} title="T" closeLabel="Close">
        body
      </Offcanvas>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('renders a document-derived title as inert text, never HTML', () => {
    render(
      <Offcanvas open onClose={vi.fn()} title={'<img src=x onerror=alert(1)>'} closeLabel="Close">
        x
      </Offcanvas>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(dialog.querySelector('img')).toBeNull();
  });
});
