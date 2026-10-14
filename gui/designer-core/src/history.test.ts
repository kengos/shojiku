// Tests for history.ts — the pure undo-stack budget (`trimHistory` over the
// count + byte caps) and what an entry weighs (`historyEntry`). The session that pushes/pops entries (and the
// MAX_HISTORY cap as the Editor sees it) is pinned in editor.test.ts.
import { describe, expect, it } from 'vitest';
import { historyEntry, trimHistory } from './history';

describe('trimHistory', () => {
  // A zero-weight companion keeps the byte arithmetic on the text alone.
  const entry = (text: string, selection: string | null = null) => ({
    text,
    selection,
    companion: undefined,
    bytes: text.length,
  });

  it('keeps everything within both budgets', () => {
    const stack = [entry('a'), entry('b'), entry('c')];
    expect(trimHistory(stack, 10, 100)).toEqual(stack);
  });

  it('drops the oldest past the count budget', () => {
    expect(trimHistory([entry('a'), entry('b'), entry('c'), entry('d')], 2, 100)).toEqual([
      entry('c'),
      entry('d'),
    ]);
  });

  it('drops the oldest past the byte budget (accounted over the entry weight)', () => {
    // Each entry's text is 2 bytes; a 5-byte budget keeps the two newest (4 bytes).
    expect(trimHistory([entry('aa'), entry('bb'), entry('cc')], 10, 5)).toEqual([
      entry('bb'),
      entry('cc'),
    ]);
  });

  it('always retains the newest entry even if its text alone exceeds the budget', () => {
    expect(trimHistory([entry('old'), entry('huge-newest')], 10, 2)).toEqual([
      entry('huge-newest'),
    ]);
  });

  it('preserves each entry selection when trimming', () => {
    const stack = [entry('a', 'sections.body.items[0]'), entry('b', 'sections.body.items[1]')];
    expect(trimHistory(stack, 10, 100)).toEqual(stack);
  });

  it('returns an empty array for an empty stack', () => {
    expect(trimHistory([], 10, 100)).toEqual([]);
  });
});

describe('historyEntry', () => {
  it('weighs the text plus the serialized companion and effect', () => {
    const plain = historyEntry('abc', null, undefined, undefined);
    expect(plain).toEqual({ text: 'abc', selection: null, companion: undefined, bytes: 14 });
    expect('effect' in plain).toBe(false);
    const step = historyEntry('abc', 'x', ['op'], { kind: 'edit' });
    expect(step.effect).toEqual({ kind: 'edit' });
    expect(step.bytes).toBe(3 + JSON.stringify([['op'], { kind: 'edit' }]).length);
  });
});
