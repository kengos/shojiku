import { describe, expect, it } from 'vitest';
import {
  canUndoSample,
  EMPTY_SAMPLE_HISTORY,
  MAX_SAMPLE_HISTORY,
  popSampleHistory,
  pushSampleHistory,
} from './history';

describe('sample history', () => {
  it('starts empty and reports no undo target', () => {
    expect(canUndoSample(EMPTY_SAMPLE_HISTORY)).toBe(false);
    expect(popSampleHistory(EMPTY_SAMPLE_HISTORY)).toBeNull();
  });

  it('pushes and pops newest-first', () => {
    const one = pushSampleHistory(EMPTY_SAMPLE_HISTORY, '{"a":1}');
    const two = pushSampleHistory(one, '{"a":2}');
    expect(canUndoSample(two)).toBe(true);
    const popped = popSampleHistory(two);
    expect(popped?.text).toBe('{"a":2}');
    // The remaining ring still holds the earlier entry.
    expect(popSampleHistory(popped?.history ?? EMPTY_SAMPLE_HISTORY)?.text).toBe('{"a":1}');
  });

  it('caps the ring at the count budget, dropping the oldest', () => {
    let history = EMPTY_SAMPLE_HISTORY;
    for (let i = 0; i < MAX_SAMPLE_HISTORY + 5; i += 1) {
      history = pushSampleHistory(history, `entry-${i}`);
    }
    expect(history.entries).toHaveLength(MAX_SAMPLE_HISTORY);
    // The newest survives; the oldest were dropped.
    expect(history.entries[history.entries.length - 1]).toBe(`entry-${MAX_SAMPLE_HISTORY + 4}`);
    expect(history.entries[0]).toBe('entry-5');
  });

  it('caps the ring at the byte budget, keeping the newest', () => {
    // A single entry larger than the byte budget still keeps at least the newest
    // when it fits alone; two over-budget entries drop the older.
    const big = 'x'.repeat(3 * 1_048_576);
    const one = pushSampleHistory(EMPTY_SAMPLE_HISTORY, big);
    const two = pushSampleHistory(one, big);
    // 2 × 3 MiB = 6 MiB exceeds the 4 MiB budget → only the newest is kept.
    expect(two.entries).toHaveLength(1);
    expect(two.entries[0]).toBe(big);
  });
});
