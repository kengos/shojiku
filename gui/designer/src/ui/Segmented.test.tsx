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

  it('does not CLIP the option row, because a tooltip hangs below it', () => {
    // The row is ~34px tall and a bubble hangs 4px under its trigger, so a
    // clipping overflow here removes the tooltip entirely — measured at ZERO
    // visible pixels in the running app, for as long as this control has
    // existed. Flipping the bubble upward does not help: 24px does not fit a
    // 34px box from either side, so the box must not clip.
    //
    // jsdom lays nothing out, so this can only pin the DECLARATION; the
    // behaviour is pinned in the browser walk (`golden.spec.js`, case
    // `no tooltip is cut off by the box that clips it`). The rounding it
    // replaced moved onto the end options, which is what keeps the control
    // looking like one rounded box — that part no gate can read, and was
    // confirmed by eye.
    const { container } = render(
      <Segmented
        ariaLabel="Placement"
        value="auto"
        options={[
          { value: 'auto', label: 'Auto', tip: 'Auto tip' },
          { value: 'pin', label: 'Fixed', tip: 'Fixed tip' },
        ]}
        onChange={vi.fn()}
      />,
    );
    const row = container.querySelector('fieldset') as HTMLElement;
    expect(row.className).not.toContain('overflow-hidden');
    expect(row.className).toContain('rounded-md');
    const labels = [...container.querySelectorAll('label')];
    expect(labels).toHaveLength(2);
    expect(labels[0]?.className).toContain('first-of-type:rounded-l-md');
    expect(labels[1]?.className).toContain('last-of-type:rounded-r-md');
  });

  it('describes the group AND every focusable radio when given an id', () => {
    // The focusable elements are the sr-only radios; a description on the
    // group container alone is announced far less reliably.
    const { container } = render(
      <Segmented
        value="a"
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ]}
        onChange={() => undefined}
        ariaLabel="Mode"
        describedBy="hint-1"
      />,
    );
    expect(container.querySelector('fieldset')?.getAttribute('aria-describedby')).toBe('hint-1');
    const radios = [...container.querySelectorAll('input[type=radio]')];
    expect(radios).toHaveLength(2);
    for (const radio of radios) {
      expect(radio.getAttribute('aria-describedby')).toBe('hint-1');
    }
  });

  it('leaves aria-describedby off entirely when no hint is given', () => {
    const { container } = render(
      <Segmented
        value="a"
        options={[{ value: 'a', label: 'A' }]}
        onChange={() => undefined}
        ariaLabel="Mode"
      />,
    );
    expect(container.querySelector('fieldset')?.getAttribute('aria-describedby')).toBeNull();
    expect(
      container.querySelector('input[type=radio]')?.getAttribute('aria-describedby'),
    ).toBeNull();
  });
});
