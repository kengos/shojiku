import { describe, expect, it, vi } from 'vitest';
import { mostVisiblePageIndex, type PageSpan, scrollPageIntoView } from './pageNav';

/** Three stacked 100px pages with 10px gaps: [0,100] [110,210] [220,320]. */
const STACK: PageSpan[] = [
  { top: 0, bottom: 100 },
  { top: 110, bottom: 210 },
  { top: 220, bottom: 320 },
];

describe('mostVisiblePageIndex', () => {
  it('picks the page filling most of the viewport', () => {
    // Viewport [130,230] sees 80px of page 1 and 10px of page 2.
    expect(mostVisiblePageIndex(STACK, 130, 230)).toBe(1);
  });

  it('breaks an exact visible-height tie toward the earlier page', () => {
    // Viewport [50,160] straddles page 0 ([50,100]=50) and page 1 ([110,160]=50).
    expect(mostVisiblePageIndex(STACK, 50, 160)).toBe(0);
  });

  it('falls back to the nearest-center page when nothing overlaps the viewport', () => {
    // Viewport [104,108] lands in the gap between page 0 and page 1; page 1's
    // center (160) is nearer to the view center (106) than page 0's (50).
    expect(mostVisiblePageIndex(STACK, 104, 108)).toBe(1);
  });

  it('returns 0 for a single page regardless of scroll', () => {
    expect(mostVisiblePageIndex([{ top: 500, bottom: 600 }], 0, 100)).toBe(0);
  });

  it('returns 0 for an empty page list', () => {
    expect(mostVisiblePageIndex([], 0, 100)).toBe(0);
  });
});

describe('scrollPageIntoView', () => {
  it('scrolls a present element to the viewport top', () => {
    const scrollIntoView = vi.fn();
    scrollPageIntoView({ scrollIntoView } as unknown as HTMLElement);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' });
  });

  it('is a no-op for a missing element (stale index)', () => {
    expect(() => scrollPageIntoView(undefined)).not.toThrow();
  });

  it('is a no-op where scrollIntoView is unavailable (jsdom)', () => {
    expect(() => scrollPageIntoView({} as HTMLElement)).not.toThrow();
  });
});
