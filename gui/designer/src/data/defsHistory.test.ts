import type { Op } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import {
  canUndoDefs,
  EMPTY_DEFS_HISTORY,
  MAX_DEFS_HISTORY,
  popDefsHistory,
  pushDefsHistory,
} from './defsHistory';

const edit = (value: string): readonly Op[] => [{ op: 'setScalar', keys: ['title'], value }];

describe('defs history', () => {
  it('starts empty and reports no undo target', () => {
    expect(canUndoDefs(EMPTY_DEFS_HISTORY)).toBe(false);
    expect(popDefsHistory(EMPTY_DEFS_HISTORY)).toBeNull();
  });

  it('pushes and pops newest-first', () => {
    const one = pushDefsHistory(EMPTY_DEFS_HISTORY, []);
    const two = pushDefsHistory(one, edit('a'));
    expect(canUndoDefs(two)).toBe(true);
    const popped = popDefsHistory(two);
    // The newest snapshot (the list BEFORE the second edit) is restored first.
    expect(popped?.snapshot).toEqual(edit('a'));
    // The remaining ring still holds the earlier (empty) snapshot.
    expect(popDefsHistory(popped?.history ?? EMPTY_DEFS_HISTORY)?.snapshot).toEqual([]);
  });

  it('caps the ring at the count budget, dropping the oldest', () => {
    let history = EMPTY_DEFS_HISTORY;
    for (let i = 0; i < MAX_DEFS_HISTORY + 5; i += 1) {
      history = pushDefsHistory(history, edit(`entry-${i}`));
    }
    expect(history.entries).toHaveLength(MAX_DEFS_HISTORY);
    // The newest survives; the oldest were dropped.
    expect(history.entries[history.entries.length - 1]).toEqual(
      edit(`entry-${MAX_DEFS_HISTORY + 4}`),
    );
    expect(history.entries[0]).toEqual(edit('entry-5'));
  });

  it('caps the ring at the byte budget, keeping the newest', () => {
    // A single snapshot larger than the byte budget still keeps at least the
    // newest when it fits alone; two over-budget snapshots drop the older.
    const big = edit('x'.repeat(3 * 1_048_576));
    const one = pushDefsHistory(EMPTY_DEFS_HISTORY, big);
    const two = pushDefsHistory(one, big);
    // 2 × ~3 MiB exceeds the 4 MiB budget → only the newest is kept.
    expect(two.entries).toHaveLength(1);
    expect(two.entries[0]).toEqual(big);
  });
});
