import { describe, expect, it } from 'vitest';
import {
  interpolationKeys,
  MAX_TEXT_EXPRS,
  parseRawSegments,
  parseSegments,
  type Segment,
} from './interpolate';

const lit = (text: string): Segment => ({ kind: 'literal', text });
const expr = (key: string, format: string | null = null): Segment => ({
  kind: 'expr',
  key,
  format,
});

describe('parseSegments (the engine parser, mirrored)', () => {
  it('keeps plain text as one literal', () => {
    expect(parseSegments('hello world')).toEqual([lit('hello world')]);
  });

  it('parses an expression', () => {
    expect(parseSegments('code: {order.code}')).toEqual([lit('code: '), expr('order.code')]);
  });

  it('parses an expression with a format', () => {
    expect(parseSegments('{amount.total:currency}!')).toEqual([
      expr('amount.total', 'currency'),
      lit('!'),
    ]);
  });

  it('treats escaped braces as literal', () => {
    expect(parseSegments('{{not_a_key}}')).toEqual([lit('{not_a_key}}')]);
  });

  it('keeps an unclosed brace literal', () => {
    expect(parseSegments('broken {order.code')).toEqual([lit('broken {order.code')]);
  });

  it('keeps non-ASCII text around expressions intact', () => {
    expect(parseSegments('合計 {amount.total_in_tax:currency} です')).toEqual([
      lit('合計 '),
      expr('amount.total_in_tax', 'currency'),
      lit(' です'),
    ]);
  });

  it('accepts the full format-name charset (letters, digits, underscore, hyphen)', () => {
    expect(parseSegments('{k:wareki-compact_2}')).toEqual([expr('k', 'wareki-compact_2')]);
  });

  it('keeps invalid characters inside braces literal', () => {
    expect(parseSegments('{a b}')).toEqual([lit('{a b}')]);
    expect(parseSegments('{key:bad char} tail')).toEqual([lit('{key:bad char} tail')]);
  });

  it('keeps an empty key or empty format literal', () => {
    expect(parseSegments('{}')).toEqual([lit('{}')]);
    expect(parseSegments('{:fmt}')).toEqual([lit('{:fmt}')]);
    expect(parseSegments('{key:}')).toEqual([lit('{key:}')]);
  });

  it('a brace opened inside an invalid attempt stays consumed (engine parity)', () => {
    expect(parseSegments('{a{b}')).toEqual([lit('{a{b}')]);
  });

  it('caps extracted expressions; the rest reads as literal', () => {
    const text = Array.from({ length: MAX_TEXT_EXPRS + 2 }, (_, i) => `{k${i}}`).join('');
    const segments = parseSegments(text);
    const exprs = segments.filter((s) => s.kind === 'expr');
    expect(exprs).toHaveLength(MAX_TEXT_EXPRS);
    // The over-cap expressions survive as literal text, never dropped.
    const tail = segments[segments.length - 1];
    expect(tail).toEqual(lit(`{k${MAX_TEXT_EXPRS}}{k${MAX_TEXT_EXPRS + 1}}`));
  });

  it('stays linear on a large hostile text (no pathological growth)', () => {
    const text = `${'{'.repeat(50_000)}x`;
    const started = Date.now();
    const segments = parseSegments(text);
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(segments.filter((s) => s.kind === 'expr')).toHaveLength(0);
  });
});

describe('parseRawSegments (the wire-slice projection)', () => {
  it('keeps the escape spelling in a literal raw while the text view unescapes', () => {
    const segments = parseRawSegments('a {{ b');
    expect(segments).toEqual([{ kind: 'literal', raw: 'a {{ b', text: 'a { b' }]);
  });

  it('carries an expression raw slice beside its parsed parts', () => {
    expect(parseRawSegments('x{amount.total:currency}y')).toEqual([
      { kind: 'literal', raw: 'x', text: 'x' },
      { kind: 'expr', raw: '{amount.total:currency}', key: 'amount.total', format: 'currency' },
      { kind: 'literal', raw: 'y', text: 'y' },
    ]);
  });

  it('concatenating raw slices reproduces the input byte-for-byte', () => {
    const overCap = Array.from({ length: MAX_TEXT_EXPRS + 2 }, (_, i) => `{k${i}}`).join('');
    const corpus = [
      '',
      'plain text',
      'escaped {{ brace and {{key}}',
      'unclosed {order.code',
      'empty {} and {:fmt} and {key:}',
      'invalid {a b} chars',
      'ok {key} and {key:format} pair',
      '合計 {amount.total:currency} です\n二行目',
      'multi\nline\n{name}\ntext',
      overCap,
    ];
    for (const text of corpus) {
      const joined = parseRawSegments(text)
        .map((s) => s.raw)
        .join('');
      expect(joined).toBe(text);
    }
  });
});

describe('interpolationKeys', () => {
  it('collects distinct keys in first-appearance order', () => {
    expect(interpolationKeys('{b} {a:currency} {b}')).toEqual(['b', 'a']);
  });

  it('collects nothing from malformed or escaped text', () => {
    expect(interpolationKeys('{{a}} {b c} {')).toEqual([]);
  });
});
