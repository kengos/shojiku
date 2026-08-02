import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button, IconButton } from './Button';

describe('Button', () => {
  it('renders a type=button, defaults to the default variant, and fires onClick', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Undo</Button>);
    const btn = screen.getByRole('button', { name: 'Undo' });
    expect(btn.getAttribute('type')).toBe('button');
    expect(btn.getAttribute('data-variant')).toBe('default');
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('marks the variant via data-variant', () => {
    const { rerender } = render(<Button variant="primary">Save</Button>);
    expect(screen.getByRole('button').getAttribute('data-variant')).toBe('primary');
    rerender(<Button variant="ghost">More</Button>);
    expect(screen.getByRole('button').getAttribute('data-variant')).toBe('ghost');
  });

  it('merges an extra className and passes disabled through', () => {
    render(
      <Button className="sj-extra" disabled>
        Off
      </Button>,
    );
    const btn = screen.getByRole('button', { name: 'Off' }) as HTMLButtonElement;
    expect(btn.className).toContain('sj-extra');
    expect(btn.disabled).toBe(true);
  });

  it('renders a document-derived label as inert text', () => {
    render(<Button>{'<img src=x onerror=alert(1)>'}</Button>);
    const btn = screen.getByRole('button');
    expect(btn.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(btn.querySelector('img')).toBeNull();
  });
});

describe('IconButton', () => {
  it('exposes the required accessible name and fires onClick', () => {
    const onClick = vi.fn();
    render(
      <IconButton label="Zoom in" onClick={onClick}>
        <span aria-hidden="true">+</span>
      </IconButton>,
    );
    const btn = screen.getByRole('button', { name: 'Zoom in' });
    expect(btn.getAttribute('data-variant')).toBe('default');
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('carries its tooltip in a decorative bubble, never the native title', () => {
    const { container } = render(
      <IconButton label="Zoom in">
        <span aria-hidden="true">+</span>
      </IconButton>,
    );
    const btn = screen.getByRole('button', { name: 'Zoom in' });
    // The OS-delayed native tooltip is banned; the accessible name stays put.
    expect(btn.getAttribute('title')).toBeNull();
    expect(btn.getAttribute('aria-label')).toBe('Zoom in');
    // The bubble repeats the label VISUALLY only — announcing it again would
    // double up on the accessible name.
    const tip = container.querySelector('[data-sj-tip]');
    expect(tip?.textContent).toBe('Zoom in');
    expect(tip?.getAttribute('aria-hidden')).toBe('true');
    // The name is the aria-label alone: the bubble contributes nothing.
    expect(btn.textContent).toBe('+');
  });

  it('keeps the caller className on the BUTTON, not the tooltip wrapper', () => {
    render(
      <IconButton label="Close" className="sj-extra">
        <span aria-hidden="true">x</span>
      </IconButton>,
    );
    expect(screen.getByRole('button', { name: 'Close' }).className).toContain('sj-extra');
  });

  it('renders a document-derived label inertly in both the name and the bubble', () => {
    const hostile = '<img src=x onerror=alert(1)>';
    const { container } = render(
      <IconButton label={hostile}>
        <span aria-hidden="true">x</span>
      </IconButton>,
    );
    const btn = screen.getByRole('button', { name: hostile });
    expect(btn.querySelector('img')).toBeNull();
    const tip = container.querySelector('[data-sj-tip]');
    expect(tip?.textContent).toBe(hostile);
    expect(tip?.querySelector('img')).toBeNull();
  });

  it('applies a variant', () => {
    render(
      <IconButton label="Delete" variant="ghost">
        <span aria-hidden="true">x</span>
      </IconButton>,
    );
    expect(screen.getByRole('button', { name: 'Delete' }).getAttribute('data-variant')).toBe(
      'ghost',
    );
  });
});
