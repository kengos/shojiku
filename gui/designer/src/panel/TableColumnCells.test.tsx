import { describe, expect, it } from 'vitest';
import { displaySample } from './TableColumnCells';

describe('displaySample', () => {
  it('shows a string value as-is', () => {
    expect(displaySample('東京都渋谷区')).toBe('東京都渋谷区');
  });

  it('shows an absent value as empty, never "undefined"/"null"', () => {
    expect(displaySample(undefined)).toBe('');
    expect(displaySample(null)).toBe('');
  });

  it('renders numbers and booleans as their literal text', () => {
    expect(displaySample(0)).toBe('0');
    expect(displaySample(12.5)).toBe('12.5');
    expect(displaySample(false)).toBe('false');
  });

  it('does NOT collapse a falsy 0/false to empty', () => {
    // The absent check is `=== undefined || === null` on purpose: a sample cell
    // holding 0 or false is real data and must stay visible.
    expect(displaySample(0)).not.toBe('');
    expect(displaySample(false)).not.toBe('');
  });

  it('serializes a structured value rather than printing [object Object]', () => {
    expect(displaySample({ a: 1 })).toBe('{"a":1}');
    expect(displaySample([1, 2])).toBe('[1,2]');
  });

  it('keeps a value of exactly the cap unclipped', () => {
    const at = 'x'.repeat(80);
    expect(displaySample(at)).toBe(at);
  });

  it('clips past the cap and marks the clip with an ellipsis', () => {
    const over = 'x'.repeat(81);
    const out = displaySample(over);
    expect(out).toBe(`${'x'.repeat(80)}…`);
    // The ellipsis is a marker, not part of the budget — the kept text is 80.
    expect(out.length).toBe(81);
  });
});
