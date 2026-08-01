import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal';

describe('Modal', () => {
  it('renders nothing when closed', () => {
    render(
      <Modal open={false} onClose={vi.fn()} closeLabel="Close">
        body
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders a labelled dialog with title, body, and footer when open', () => {
    render(
      <Modal
        open
        onClose={vi.fn()}
        title="Create field"
        closeLabel="Close"
        footer={<button type="button">OK</button>}
      >
        <p>body content</p>
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeTruthy();
    expect(screen.getByText('Create field')).toBeTruthy();
    expect(screen.getByText('body content')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'OK' })).toBeTruthy();
  });

  it('renders without a title and without a footer', () => {
    render(
      <Modal open onClose={vi.fn()} closeLabel="Close">
        just body
      </Modal>,
    );
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByText('just body')).toBeTruthy();
  });

  it('requests close via the × button and via Escape', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="T" closeLabel="Close">
        body
      </Modal>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('renders a document-derived title as inert text, never HTML', () => {
    render(
      <Modal open onClose={vi.fn()} title={'<img src=x onerror=alert(1)>'} closeLabel="Close">
        x
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(dialog.querySelector('img')).toBeNull();
  });
});
