import type { Op } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import {
  canUndoDefs,
  EMPTY_DEFS_HISTORY,
  MAX_DEFS_HISTORY,
  peekDefsHistory,
  popDefsHistory,
  pushDefsHistory,
} from './defsHistory';

const edit = (value: string): readonly Op[] => [{ op: 'setScalar', keys: ['title'], value }];

describe('defs history', () => {
  it('starts empty and reports no undo target', () => {
    expect(canUndoDefs(EMPTY_DEFS_HISTORY)).toBe(false);
    expect(peekDefsHistory(EMPTY_DEFS_HISTORY)).toBeNull();
    expect(popDefsHistory(EMPTY_DEFS_HISTORY)).toBeNull();
  });

  it('pushes and pops newest-first', () => {
    const one = pushDefsHistory(EMPTY_DEFS_HISTORY, []);
    const two = pushDefsHistory(one, edit('a'));
    expect(canUndoDefs(two)).toBe(true);
    const popped = popDefsHistory(two);
    // The newest snapshot (the list BEFORE the second edit) is restored first.
    expect(popped?.entry.ops).toEqual(edit('a'));
    // The remaining ring still holds the earlier (empty) snapshot.
    expect(popDefsHistory(popped?.history ?? EMPTY_DEFS_HISTORY)?.entry.ops).toEqual([]);
  });

  it('caps the ring at the count budget, dropping the oldest', () => {
    let history = EMPTY_DEFS_HISTORY;
    for (let i = 0; i < MAX_DEFS_HISTORY + 5; i += 1) {
      history = pushDefsHistory(history, edit(`entry-${i}`));
    }
    expect(history.entries).toHaveLength(MAX_DEFS_HISTORY);
    // The newest survives; the oldest were dropped.
    expect(history.entries[history.entries.length - 1]?.ops).toEqual(
      edit(`entry-${MAX_DEFS_HISTORY + 4}`),
    );
    expect(history.entries[0]?.ops).toEqual(edit('entry-5'));
  });

  it('caps the ring at the byte budget, keeping the newest', () => {
    // A single snapshot larger than the byte budget still keeps at least the
    // newest when it fits alone; two over-budget snapshots drop the older.
    const big = edit('x'.repeat(3 * 1_048_576));
    const one = pushDefsHistory(EMPTY_DEFS_HISTORY, big);
    const two = pushDefsHistory(one, big);
    // 2 × ~3 MiB exceeds the 4 MiB budget → only the newest is kept.
    expect(two.entries).toHaveLength(1);
    expect(two.entries[0]?.ops).toEqual(big);
  });
});

describe('defs history companions', () => {
  it('keeps a rename / delete companion with its op list, and peeks without popping', () => {
    const companion = { kind: 'rename', keysPath: ['properties', 'b'], name: 'a' } as const;
    const history = pushDefsHistory(EMPTY_DEFS_HISTORY, edit('x'), companion);
    expect(peekDefsHistory(history)).toEqual({ ops: edit('x'), companion });
    expect(history.entries).toHaveLength(1);
  });
});

describe('defs history byte budget', () => {
  it('counts a companion’s weight: a heavy delete record pushes older entries out', () => {
    const heavy = {
      kind: 'delete',
      name: 'memo',
      variants: [
        { id: 'd', removed: [{ path: ['memo'], value: 'x'.repeat(3 * 1_048_576), position: 0 }] },
      ],
    } as const;
    const one = pushDefsHistory(EMPTY_DEFS_HISTORY, edit('a'), heavy);
    const two = pushDefsHistory(one, edit('b'), heavy);
    expect(two.entries).toHaveLength(1);
    expect(two.entries[0]?.ops).toEqual(edit('b'));
  });
});
