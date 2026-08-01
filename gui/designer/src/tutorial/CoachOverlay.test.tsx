import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { bubblePosition, CoachOverlay } from './CoachOverlay';

const RECT = { left: 100, top: 200, width: 60, height: 20 };

function draw(over: Partial<React.ComponentProps<typeof CoachOverlay>> = {}) {
  const onExit = vi.fn();
  const result = render(
    <CoachOverlay
      copy="Insert → Text places a box for text."
      title="A title"
      progressLabel="3 / 45"
      rect={RECT}
      nextLabel="Next"
      exitLabel="Leave"
      onExit={onExit}
      {...over}
    />,
  );
  return { ...result, onExit };
}

describe('CoachOverlay', () => {
  it('shows the step sentence, its chapter and the progress', () => {
    draw();
    expect(screen.getByText('Insert → Text places a box for text.')).toBeTruthy();
    expect(screen.getByText('A title')).toBeTruthy();
    expect(screen.getByText('3 / 45')).toBeTruthy();
  });

  it('places the spotlight around the anchor, with a halo', () => {
    draw();
    const spotlight = screen.getByTestId('coach-spotlight');
    // jsdom does no layout, so the inline placement IS the behavior under test.
    expect(spotlight.style.left).toBe('94px');
    expect(spotlight.style.top).toBe('194px');
    expect(spotlight.style.width).toBe('72px');
    expect(spotlight.style.height).toBe('32px');
  });

  it('drops the spotlight and centers the bubble when the anchor is off screen', () => {
    draw({ rect: null });
    expect(screen.queryByTestId('coach-spotlight')).toBeNull();
    // The copy still shows: a step never disappears because its control did.
    expect(screen.getByText('Insert → Text places a box for text.')).toBeTruthy();
  });

  it('lets pointer events through, so the pointed-at control stays usable', () => {
    draw();
    expect(screen.getByTestId('coach-overlay').className).toContain('pointer-events-none');
  });

  it('offers Next only when the step advances by acknowledgement', () => {
    const { rerender } = draw();
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    const onNext = vi.fn();
    rerender(
      <CoachOverlay
        copy="c"
        title="t"
        progressLabel="1 / 1"
        rect={null}
        nextLabel="Next"
        exitLabel="Leave"
        onExit={vi.fn()}
        onNext={onNext}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('always offers the way out', () => {
    const { onExit } = draw();
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(onExit).toHaveBeenCalledOnce();
  });

  it('renders copy as text, never as markup', () => {
    draw({ copy: '<img src=x onerror="alert(1)">' });
    expect(screen.getByText('<img src=x onerror="alert(1)">')).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
  });
});

describe('bubblePosition', () => {
  it('sits under the anchor', () => {
    expect(bubblePosition(RECT)).toEqual({ left: 100, top: 232 });
  });

  it('centers with no anchor', () => {
    const { left, top } = bubblePosition(null);
    expect(top).toBe(80);
    expect(left).toBeGreaterThanOrEqual(16);
  });

  it('keeps the bubble on screen at either edge', () => {
    expect(bubblePosition({ ...RECT, left: -500 }).left).toBe(16);
    expect(bubblePosition({ ...RECT, left: 99999 }).left).toBeLessThan(window.innerWidth);
  });
});
