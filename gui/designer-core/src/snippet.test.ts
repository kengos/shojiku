// Tests for snippet.ts — the snippet-shape rule's ONE public home,
// `isSnippetValue` (the same `checkSnippet` walk the ops run). The op-level
// refusals (insertItem/putValue rejecting a bad snippet before mutating)
// stay with keyOps.test.ts / seqOps.test.ts.
import { describe, expect, it } from 'vitest';
import { isSnippetValue, MAX_SNIPPET_DEPTH, MAX_SNIPPET_NODES, type SnippetValue } from './ops';

describe('isSnippetValue', () => {
  it('accepts finite-scalar / array / plain-map trees', () => {
    expect(isSnippetValue('text')).toBe(true);
    expect(isSnippetValue(42)).toBe(true);
    expect(isSnippetValue(true)).toBe(true);
    expect(isSnippetValue({ type: 'text', box: { w: 120, h: 60 }, items: ['a', 'b'] })).toBe(true);
    // A literal `__proto__` key arriving as own JSON data is inert ordinary data.
    expect(isSnippetValue(JSON.parse('{"__proto__": {"x": 1}}'))).toBe(true);
  });

  it('rejects non-finite numbers, exotic objects, and functions', () => {
    expect(isSnippetValue(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isSnippetValue(Number.NaN)).toBe(false);
    expect(isSnippetValue(new Date())).toBe(false);
    expect(isSnippetValue(10n)).toBe(false);
  });

  it('rejects a tree deeper than the cap', () => {
    let value: SnippetValue = 'leaf';
    for (let i = 0; i <= MAX_SNIPPET_DEPTH; i++) {
      value = [value];
    }
    expect(isSnippetValue(value)).toBe(false);
  });

  it('rejects a tree over the node cap', () => {
    const wide = Array.from({ length: MAX_SNIPPET_NODES + 1 }, (_, i) => i);
    expect(isSnippetValue(wide)).toBe(false);
  });
});
