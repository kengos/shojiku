import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RawPage } from '../engine/types';
import { I18nProvider } from '../i18n/context';
import { PageRail } from './PageRail';

const page = (w: number, h: number): RawPage => ({
  width: w,
  height: h,
  rgba: new Uint8Array(w * h * 4),
});

function draw(
  current: number,
  onJump = vi.fn(),
  pages = [page(20, 30), page(20, 30), page(20, 30)],
) {
  const view = render(
    <I18nProvider locale="en">
      <PageRail pages={pages} current={current} onJump={onJump} />
    </I18nProvider>,
  );
  return { ...view, onJump };
}

describe('PageRail', () => {
  it('renders one thumbnail per page with a 1-based numbered label', () => {
    const { container } = draw(0);
    const thumbs = screen.getAllByRole('button');
    expect(thumbs).toHaveLength(3);
    expect(screen.getByLabelText('Page 1')).toBeDefined();
    expect(screen.getByLabelText('Page 3')).toBeDefined();
    // Each thumbnail paints a <canvas> at the page's natural pixel size.
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    expect(canvas.width).toBe(20);
    expect(canvas.height).toBe(30);
    // Downscaled to the rail width, aspect-preserving.
    expect(canvas.style.width).toBe('88px');
  });

  it('marks the current page with aria-current', () => {
    draw(1);
    expect(screen.getByLabelText('Page 2').getAttribute('aria-current')).toBe('true');
    expect(screen.getByLabelText('Page 1').getAttribute('aria-current')).toBeNull();
  });

  it('jumps to a page when its thumbnail is clicked', () => {
    const { onJump } = draw(0);
    fireEvent.click(screen.getByLabelText('Page 3'));
    expect(onJump).toHaveBeenCalledWith(2);
  });

  it('falls back to a square thumbnail for a degenerate zero-width page', () => {
    const { container } = draw(0, vi.fn(), [page(0, 0)]);
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    expect(canvas.style.width).toBe('88px');
    expect(canvas.style.height).toBe('88px');
  });
});
