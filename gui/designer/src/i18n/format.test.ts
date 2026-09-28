import { describe, expect, it } from 'vitest';
import { formatList, formatMessage } from './format';

describe('formatMessage', () => {
  it('substitutes a named placeholder', () => {
    expect(formatMessage('key `{key}` missing', { key: 'total' }, 'en')).toBe(
      'key `total` missing',
    );
  });

  it('substitutes several placeholders in one pass', () => {
    expect(formatMessage('{a} + {b}', { a: 1, b: 2 }, 'en')).toBe('1 + 2');
  });

  it('renders a boolean arg as text', () => {
    expect(formatMessage('checked: {v}', { v: true }, 'en')).toBe('checked: true');
  });

  it('formats a number arg with the locale grouping', () => {
    expect(formatMessage('over {max, number}', { max: 12345 }, 'en')).toBe('over 12,345');
  });

  it('groups a number under a regional locale', () => {
    // en-IN groups in the Indian numbering system (lakh/crore).
    expect(formatMessage('over {max, number}', { max: 100000 }, 'en-IN')).toBe('over 1,00,000');
  });

  it('retries under en when the locale tag is invalid for Intl.NumberFormat', () => {
    // A structurally invalid BCP 47 tag throws RangeError; the number must still
    // render rather than blowing up the whole message.
    expect(formatMessage('over {max, number}', { max: 12345 }, 'not a valid tag!!')).toBe(
      'over 12,345',
    );
  });

  it('shows a measured length to at most two decimals, not its float noise', () => {
    expect(
      formatMessage('{content}pt vs {avail}pt', { content: 13.299999999999999, avail: 12 }, 'ja'),
    ).toBe('13.3pt vs 12pt');
    expect(formatMessage('{v}', { v: -0.125 }, 'en')).toBe('-0.13');
  });

  it('keeps the two sides of an overflow apart at the engine tolerance', () => {
    // The engine warns only past `avail + 0.01`, so the smallest reported
    // content still reads larger than the room it overflows.
    expect(formatMessage('{c} > {a}', { c: 12.0100001, a: 12 }, 'en')).toBe('12.01 > 12');
  });

  it('leaves integers, strings and non-finite values exactly as they were', () => {
    expect(formatMessage('{year} {n}', { year: 2026, n: 12345 }, 'en')).toBe('2026 12345');
    expect(formatMessage('{v}', { v: '12.3456789' }, 'en')).toBe('12.3456789');
    expect(formatMessage('{v}', { v: Number.NaN }, 'en')).toBe('NaN');
  });

  it('rounds a plain length even under an invalid locale tag', () => {
    expect(formatMessage('{v}', { v: 1.23456 }, 'not a valid tag!!')).toBe('1.23');
  });

  it('returns null when a referenced arg is missing (caller falls back)', () => {
    expect(formatMessage('{key} missing', {}, 'en')).toBeNull();
  });

  it('does not re-scan an interpolated value (no format-string injection)', () => {
    // The arg value contains what looks like another placeholder; it must be
    // emitted verbatim, not expanded against `args.injected`.
    const out = formatMessage('name: {name}', { name: '{injected}', injected: 'BAD' }, 'en');
    expect(out).toBe('name: {injected}');
  });

  it('does not resolve an inherited property name as an arg', () => {
    expect(formatMessage('{toString}', {}, 'en')).toBeNull();
  });

  it('unescapes a doubled apostrophe to a single one', () => {
    expect(formatMessage("it''s here", {}, 'en')).toBe("it's here");
  });

  it('emits a quoted brace literally', () => {
    expect(formatMessage("a '{' b '}' c", {}, 'en')).toBe('a { b } c');
  });

  it('runs an unterminated quote to the end of the template', () => {
    expect(formatMessage("x '{", {}, 'en')).toBe('x {');
  });

  it('keeps a lone apostrophe literal', () => {
    expect(formatMessage("it's fine", {}, 'en')).toBe("it's fine");
  });

  it('emits an unbalanced opening brace literally', () => {
    expect(formatMessage('a { b', { b: 1 }, 'en')).toBe('a { b');
  });

  it('trims whitespace inside a placeholder token', () => {
    expect(formatMessage('{ key }', { key: 'x' }, 'en')).toBe('x');
  });
});

describe('formatList', () => {
  it('joins as an "and" list in the reader\u2019s locale', () => {
    expect(formatList(['a', 'b', 'c'], 'en')).toBe('a, b, and c');
    expect(formatList(['a', 'b', 'c'], 'ja')).toBe('a\u3001b\u3001c');
    expect(formatList(['only'], 'en')).toBe('only');
  });

  it('falls back to English on a hostile BCP 47 tag rather than throwing', () => {
    // A structurally invalid tag makes `Intl.ListFormat` throw RangeError; a
    // chrome sentence must never blow up over the locale tag.
    expect(formatList(['a', 'b'], '!!not-a-locale')).toBe('a and b');
  });
});
