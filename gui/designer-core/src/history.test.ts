// Tests for history.ts — the pure undo-stack budget (`trimHistory` over the
// count + byte caps). The session that pushes/pops entries (and the
// MAX_HISTORY cap as the Editor sees it) is pinned in editor.test.ts.
import { describe, expect, it } from 'vitest';
import { trimHistory } from './history';

describe('trimHistory', () => {
  const entry = (text: string, selection: string | null = null) => ({ text, selection });

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

  it('drops the oldest past the byte budget (accounted over the entry text)', () => {
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
