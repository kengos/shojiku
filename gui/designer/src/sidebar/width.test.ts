import { describe, expect, it } from 'vitest';
import {
  clampSidebarWidth,
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
} from './width';

describe('clampSidebarWidth', () => {
  it('passes a value already inside the bounds through unchanged', () => {
    expect(clampSidebarWidth(300)).toBe(300);
  });

  it('clamps a value below the minimum up to the minimum', () => {
    expect(clampSidebarWidth(10)).toBe(MIN_SIDEBAR_WIDTH);
  });

  it('clamps a value above the maximum down to the maximum', () => {
    expect(clampSidebarWidth(9000)).toBe(MAX_SIDEBAR_WIDTH);
  });

  it('degrades an absent value to the default', () => {
    expect(clampSidebarWidth(undefined)).toBe(DEFAULT_SIDEBAR_WIDTH);
  });

  it('degrades NaN to the default', () => {
    expect(clampSidebarWidth(Number.NaN)).toBe(DEFAULT_SIDEBAR_WIDTH);
  });

  it('degrades Infinity to the default', () => {
    expect(clampSidebarWidth(Number.POSITIVE_INFINITY)).toBe(DEFAULT_SIDEBAR_WIDTH);
  });

  it('degrades a negative value to the default via the min clamp', () => {
    // A negative width is finite, so it clamps to MIN rather than degrading —
    // still a safe bound, never a negative column.
    expect(clampSidebarWidth(-500)).toBe(MIN_SIDEBAR_WIDTH);
  });
});
