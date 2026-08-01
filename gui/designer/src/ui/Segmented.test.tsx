import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Segmented } from './Segmented';

const OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'pin', label: 'Fixed' },
] as const;

const radio = (name: string) => screen.getByRole('radio', { name }) as HTMLInputElement;

describe('Segmented', () => {
  it('exposes a named group whose current value is the checked radio', () => {
    render(<Segmented ariaLabel="Placement" value="auto" options={OPTIONS} onChange={vi.fn()} />);
    expect(screen.getByRole('group', { name: 'Placement' })).toBeTruthy();
    expect(radio('Auto').checked).toBe(true);
    expect(radio('Fixed').checked).toBe(false);
  });

  it('reports the picked value, but not a re-pick of the active one', () => {
    const onChange = vi.fn();
    render(<Segmented ariaLabel="Placement" value="auto" options={OPTIONS} onChange={onChange} />);
    fireEvent.click(radio('Fixed'));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('pin');
    // A native radio fires no change when the checked option is clicked again.
    fireEvent.click(radio('Auto'));
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('does not fire onChange for a disabled option', () => {
    const onChange = vi.fn();
    const options = [
      { value: 'auto', label: 'Auto' },
      { value: 'pin', label: 'Fixed', disabled: true },
    ];
    render(<Segmented ariaLabel="Placement" value="auto" options={options} onChange={onChange} />);
    const pin = radio('Fixed');
    expect(pin.disabled).toBe(true);
    fireEvent.click(pin);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders a tooltip bubble for an option that carries one', () => {
    const options = [
      { value: 'auto', label: 'Auto', tip: 'Auto tip' },
      { value: 'pin', label: 'Fixed' },
    ];
    render(<Segmented ariaLabel="Placement" value="auto" options={options} onChange={vi.fn()} />);
    expect(screen.getByText('Auto tip')).toBeTruthy();
  });
});
