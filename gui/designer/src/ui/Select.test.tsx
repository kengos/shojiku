import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Select, type SelectOption } from './Select';

const OPTIONS: readonly SelectOption[] = [
  { value: '', label: '(none)' },
  { value: 'left', label: '左揃え' },
  { value: 'center', label: '中央揃え' },
];

describe('Select', () => {
  it('renders the selected option label on the labelled trigger', () => {
    render(<Select value="left" options={OPTIONS} onChange={vi.fn()} label="Align" />);
    const trigger = screen.getByRole('button', { name: 'Align' });
    expect(trigger.textContent).toContain('左揃え');
  });

  it('renders the none option label for the empty value', () => {
    render(<Select value="" options={OPTIONS} onChange={vi.fn()} label="Align" />);
    expect(screen.getByRole('button', { name: 'Align' }).textContent).toContain('(none)');
  });

  it('displays an unknown value verbatim as inert text, never HTML', () => {
    render(
      <Select
        value={'<img src=x onerror=alert(1)>'}
        options={OPTIONS}
        onChange={vi.fn()}
        label="Align"
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Align' });
    expect(trigger.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(trigger.querySelector('img')).toBeNull();
  });

  it('opens the option list on click and marks the selected option', () => {
    render(<Select value="center" options={OPTIONS} onChange={vi.fn()} label="Align" />);
    fireEvent.click(screen.getByRole('button', { name: 'Align' }));
    const listbox = screen.getByRole('listbox');
    expect(listbox).toBeTruthy();
    const selected = screen.getByRole('option', { name: '中央揃え' });
    expect(selected.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('option', { name: '左揃え' }).getAttribute('aria-selected')).toBe(
      'false',
    );
  });

  it('commits the picked option wire value and closes the list', async () => {
    const onChange = vi.fn();
    render(<Select value="" options={OPTIONS} onChange={onChange} label="Align" />);
    fireEvent.click(screen.getByRole('button', { name: 'Align' }));
    fireEvent.click(screen.getByRole('option', { name: '左揃え' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('left');
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
  });

  it('does not open when disabled', () => {
    render(<Select value="left" options={OPTIONS} onChange={vi.fn()} label="Align" disabled />);
    const trigger = screen.getByRole('button', { name: 'Align' });
    expect(trigger.hasAttribute('disabled')).toBe(true);
    fireEvent.click(trigger);
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
