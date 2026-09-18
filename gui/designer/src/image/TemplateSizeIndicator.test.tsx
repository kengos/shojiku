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
  it('shows how much is used OF the limit, and no raise prompt below the warn threshold', () => {
    draw({ templateBytes: 1024 * 1024, maxBytes: 2 * 1024 * 1024, onRaise: vi.fn() });
    expect(screen.getByText('Template size 1 MB / 2 MB')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Raise the limit?' })).toBeNull();
  });

  it('offers the raise prompt when near the cap, and raises on confirm', () => {
    const onRaise = vi.fn();
    draw({ templateBytes: 1.8 * 1024 * 1024, maxBytes: 2 * 1024 * 1024, onRaise });
    const readout = screen.getByText('Template size 1.8 MB / 2 MB');
    expect(readout.className).toContain('font-semibold');
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

  it('says the limit cannot rise (no raise) when no raise is available', () => {
    // Beside the two amounts, the hint must not read as "full": 6.5 MB of 8 MB
    // still has room — what is exhausted is the RAISE.
    draw({ templateBytes: 6.5 * 1024 * 1024, maxBytes: 8 * 1024 * 1024 });
    expect(screen.getByText('Template size 6.5 MB / 8 MB')).toBeTruthy();
    expect(screen.getByText('The limit cannot go any higher.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Raise the limit?' })).toBeNull();
  });

  it('writes a typical document in KB rather than as 0%', () => {
    draw({ templateBytes: 12_345, maxBytes: 2 * 1024 * 1024 });
    expect(screen.getByText('Template size 12 KB / 2 MB')).toBeTruthy();
  });

  it('says what the limit is for behind its ?', () => {
    draw({ templateBytes: 12_345, maxBytes: 2 * 1024 * 1024 });
    fireEvent.click(screen.getByRole('button', { name: 'About the size limit' }));
    expect(screen.getByText(/embedded images included/)).toBeTruthy();
  });
});
