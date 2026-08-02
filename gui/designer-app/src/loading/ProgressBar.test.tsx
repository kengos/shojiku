import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProgressBar } from './ProgressBar';
import { readProgress } from './progress';

describe('ProgressBar', () => {
  it('exposes the percentage on the ARIA value when the size is known', () => {
    render(
      <ProgressBar
        reading={readProgress({ loaded: 62, total: 100 })}
        label="Loading fonts"
        heightClass="h-1.5"
      />,
    );
    const bar = screen.getByRole('progressbar', { name: 'Loading fonts' });
    expect(bar.getAttribute('aria-valuenow')).toBe('62');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
    expect(bar.firstElementChild?.getAttribute('style')).toContain('width: 62%');
  });

  // A bar that claims a value it does not have reads as a broken app, so the
  // indeterminate form must carry no value at all.
  it('carries no ARIA value and fills the track when indeterminate', () => {
    render(<ProgressBar reading={null} label="Preparing engine" heightClass="h-[3px]" />);
    const bar = screen.getByRole('progressbar', { name: 'Preparing engine' });
    expect(bar.hasAttribute('aria-valuenow')).toBe(false);
    const fill = bar.firstElementChild;
    expect(fill?.getAttribute('style')).toContain('width: 100%');
    expect(fill?.className).toContain('motion-safe:animate-pulse');
  });

  it('does not animate a determinate fill', () => {
    render(
      <ProgressBar
        reading={readProgress({ loaded: 1, total: 4 })}
        label="Loading fonts"
        heightClass="h-1.5"
      />,
    );
    const fill = screen.getByRole('progressbar').firstElementChild;
    expect(fill?.className).not.toContain('animate-pulse');
  });

  it('takes its track height from the caller (the two sizes in the app)', () => {
    const { unmount } = render(<ProgressBar reading={null} label="a" heightClass="h-1.5" />);
    expect(screen.getByRole('progressbar').className).toContain('h-1.5');
    unmount();
    render(<ProgressBar reading={null} label="b" heightClass="h-[3px] rounded-none" />);
    expect(screen.getByRole('progressbar').className).toContain('h-[3px]');
  });
});
