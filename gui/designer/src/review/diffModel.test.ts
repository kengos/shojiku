import { describe, expect, it } from 'vitest';
import { computeLineDiff, MAX_LCS_LINES } from './diffModel';

/** Kinds present in a result's rows, for terse assertions. */
function kinds(text: string, current: string): string[] {
  return computeLineDiff(text, current).rows.map((r) => r.kind);
}

describe('computeLineDiff', () => {
  it('reports no changes for identical text', () => {
    const doc = 'a\nb\nc\n';
    const { summary, truncated } = computeLineDiff(doc, doc);
    expect(summary).toEqual({ changed: 0, added: 0, removed: 0 });
    expect(truncated).toBe(false);
  });

  it('normalizes CRLF so a line-ending difference alone is not a change', () => {
    const { summary } = computeLineDiff('a\r\nb\r\nc', 'a\nb\nc');
    expect(summary).toEqual({ changed: 0, added: 0, removed: 0 });
  });

  it('counts a pure insertion as added lines in one hunk', () => {
    const base = 'a\nb\nc';
    const cur = 'a\nb\nX\nY\nc';
    const { summary, rows } = computeLineDiff(base, cur);
    expect(summary.added).toBe(2);
    expect(summary.removed).toBe(0);
    expect(summary.changed).toBe(1);
    const added = rows.filter((r) => r.kind === 'added');
    expect(added.map((r) => r.text)).toEqual(['X', 'Y']);
    expect(added[0]?.newLine).toBe(3);
    expect(added[0]?.oldLine).toBeNull();
  });

  it('counts a pure removal as removed lines', () => {
    const { summary, rows } = computeLineDiff('a\nb\nc\nd', 'a\nd');
    expect(summary.removed).toBe(2);
    expect(summary.added).toBe(0);
    const removed = rows.filter((r) => r.kind === 'removed');
    expect(removed.map((r) => r.text)).toEqual(['b', 'c']);
    expect(removed[0]?.oldLine).toBe(2);
    expect(removed[0]?.newLine).toBeNull();
  });

  it('counts a modification as one removed + one added line, one hunk', () => {
    const { summary } = computeLineDiff('a\nb\nc', 'a\nB\nc');
    expect(summary).toEqual({ changed: 1, added: 1, removed: 1 });
  });

  it('counts TWO separated edits as two hunks with a gap between (not by line count)', () => {
    // 20 identical middle lines keep the two edits far apart, so the run count
    // (2 hunks) is what「N 箇所」means — never the raw changed-line count.
    const middle = Array.from({ length: 20 }, (_, i) => `m${i}`).join('\n');
    const base = `x\n${middle}\ny`;
    const cur = `X\n${middle}\nY`;
    const { summary, rows } = computeLineDiff(base, cur);
    expect(summary.changed).toBe(2);
    expect(rows.some((r) => r.kind === 'gap')).toBe(true);
    // The far-apart context collapses: not every middle line is a row.
    expect(rows.filter((r) => r.kind === 'context').length).toBeLessThan(20);
  });

  it('diffs a line with binding syntax and YAML punctuation verbatim', () => {
    const base = '        data: { key: total }';
    const cur = '        data: { key: total, format: currency }';
    const { rows } = computeLineDiff(base, cur);
    expect(rows.find((r) => r.kind === 'added')?.text).toBe(cur);
    expect(rows.find((r) => r.kind === 'removed')?.text).toBe(base);
  });

  it('keeps context rows around a change', () => {
    // A single change in a short doc keeps its neighbours as context rows.
    expect(kinds('a\nb\nc\nd\ne', 'a\nb\nC\nd\ne')).toEqual([
      'context',
      'context',
      'removed',
      'added',
      'context',
      'context',
    ]);
  });

  it('degrades to a truncated coarse summary when the differing middle is huge', () => {
    const cur = Array.from({ length: MAX_LCS_LINES + 5 }, (_, i) => `line ${i}`).join('\n');
    const { truncated, rows, summary } = computeLineDiff('', cur);
    expect(truncated).toBe(true);
    expect(rows).toEqual([]);
    expect(summary.added).toBe(MAX_LCS_LINES + 5);
    expect(summary.removed).toBe(1);
    expect(summary.changed).toBe(1);
  });

  it('a huge but IDENTICAL document is not truncated (prefix trim consumes it)', () => {
    const doc = Array.from({ length: MAX_LCS_LINES + 50 }, (_, i) => `line ${i}`).join('\n');
    const { truncated, summary } = computeLineDiff(doc, doc);
    expect(truncated).toBe(false);
    expect(summary.changed).toBe(0);
  });

  it('treats a __proto__ line as ordinary text (positional, no object indexing)', () => {
    const { rows, summary } = computeLineDiff('a\nb', 'a\n__proto__\nb');
    expect(summary.added).toBe(1);
    expect(rows.find((r) => r.kind === 'added')?.text).toBe('__proto__');
  });
});
