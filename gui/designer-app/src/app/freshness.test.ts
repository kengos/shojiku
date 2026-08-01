import { describe, expect, it } from 'vitest';
import { freshness } from './freshness';

const NOW = 1_000_000_000_000;
const sec = (n: number) => NOW - n * 1000;
const min = (n: number) => NOW - n * 60_000;
const hour = (n: number) => NOW - n * 3_600_000;
const day = (n: number) => NOW - n * 86_400_000;

describe('freshness', () => {
  it('renders under a minute as "now"', () => {
    expect(freshness(NOW, NOW)).toEqual({ value: 0, unit: 'second' });
    expect(freshness(sec(59), NOW)).toEqual({ value: 0, unit: 'second' });
  });

  it('buckets minutes', () => {
    expect(freshness(min(1), NOW)).toEqual({ value: -1, unit: 'minute' });
    expect(freshness(min(59), NOW)).toEqual({ value: -59, unit: 'minute' });
  });

  it('buckets hours', () => {
    expect(freshness(hour(1), NOW)).toEqual({ value: -1, unit: 'hour' });
    expect(freshness(hour(23), NOW)).toEqual({ value: -23, unit: 'hour' });
  });

  it('buckets days', () => {
    expect(freshness(day(1), NOW)).toEqual({ value: -1, unit: 'day' });
    expect(freshness(day(3), NOW)).toEqual({ value: -3, unit: 'day' });
  });

  it('clamps a future createdAt (clock skew) to "now"', () => {
    expect(freshness(NOW + 5000, NOW)).toEqual({ value: 0, unit: 'second' });
  });
});
