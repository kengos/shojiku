import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Switch } from './Switch';

describe('Switch', () => {
  it('renders an accessible switch reflecting the checked state', () => {
    render(<Switch checked onChange={vi.fn()} label="自動改ページ" />);
    const control = screen.getByRole('switch', { name: '自動改ページ' });
    expect(control.getAttribute('aria-checked')).toBe('true');
  });

  it('reports the flipped state on click', () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} label="自動改ページ" />);
    const control = screen.getByRole('switch', { name: '自動改ページ' });
    expect(control.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(control);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('does not toggle when disabled', () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} label="自動改ページ" disabled />);
    const control = screen.getByRole('switch', { name: '自動改ページ' });
    expect(control.hasAttribute('disabled')).toBe(true);
    fireEvent.click(control);
    expect(onChange).not.toHaveBeenCalled();
  });
});
