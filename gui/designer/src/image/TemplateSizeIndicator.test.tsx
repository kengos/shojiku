import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/context';
import { TemplateSizeIndicator } from './TemplateSizeIndicator';

function draw(props: { templateBytes: number; maxBytes: number; onRaise?: () => void }) {
  return render(
    <I18nProvider locale="en">
      <TemplateSizeIndicator
        templateBytes={props.templateBytes}
        maxBytes={props.maxBytes}
        onRaise={props.onRaise}
      />
    </I18nProvider>,
  );
}

describe('TemplateSizeIndicator', () => {
  it('shows the used percentage and no raise prompt below the warn threshold', () => {
    draw({ templateBytes: 500, maxBytes: 1000, onRaise: vi.fn() });
    expect(screen.getByText('Template size 50%')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Raise the limit?' })).toBeNull();
  });

  it('offers the raise prompt when near the cap, and raises on confirm', () => {
    const onRaise = vi.fn();
    draw({ templateBytes: 900, maxBytes: 1000, onRaise });
    expect(screen.getByText('Template size 90%')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Raise the limit?' }));
    expect(screen.getByText(/larger limit/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Raise' }));
    expect(onRaise).toHaveBeenCalledTimes(1);
  });

  it('dismisses the raise prompt on cancel without raising', () => {
    const onRaise = vi.fn();
    draw({ templateBytes: 950, maxBytes: 1000, onRaise });
    fireEvent.click(screen.getByRole('button', { name: 'Raise the limit?' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onRaise).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Raise' })).toBeNull();
  });

  it('shows the at-maximum hint (no raise) when no raise is available', () => {
    draw({ templateBytes: 900, maxBytes: 1000 });
    expect(screen.getByText('At the maximum size.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Raise the limit?' })).toBeNull();
  });
});
