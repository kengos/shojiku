import { describe, expect, it } from 'vitest';
import { arrayLength, SELECTION_SEP, sampleKind, selectionKey } from './editorModel';

describe('selectionKey', () => {
  it('joins the group id and the field key with U+0000', () => {
    expect(SELECTION_SEP).toBe(String.fromCharCode(0));
    expect(selectionKey('order', 'total')).toBe(`order${String.fromCharCode(0)}total`);
  });

  it('keeps the separator out of the source as an escape, not a raw byte', () => {
    // The separator must be a single NUL: anything else (a space, a dot) is a
    // character a real key can contain, and pairs would start colliding.
    expect(SELECTION_SEP).toHaveLength(1);
    expect(SELECTION_SEP.charCodeAt(0)).toBe(0);
  });

  it('cannot be forged across a pair boundary by keys carrying separators', () => {
    // Keys legally hold spaces and dots; only a NUL discriminates the split.
    expect(selectionKey('a b', 'c')).not.toBe(selectionKey('a', 'b c'));
    expect(selectionKey('a.b', 'c')).not.toBe(selectionKey('a', 'b.c'));
    expect(selectionKey('', 'a')).not.toBe(selectionKey('a', ''));
  });

  it('passes hostile keys through verbatim (no escaping, no lookup)', () => {
    expect(selectionKey('__proto__', 'constructor')).toBe(
      `__proto__${String.fromCharCode(0)}constructor`,
    );
  });
});

describe('sampleKind', () => {
  it('maps a string field to its format-specific widget', () => {
    expect(sampleKind('string', '')).toBe('string');
    expect(sampleKind('string', 'date')).toBe('date');
    expect(sampleKind('string', 'date-time')).toBe('datetime');
  });

  it('maps the numeric and boolean base types', () => {
    expect(sampleKind('number', '')).toBe('number');
    expect(sampleKind('integer', '')).toBe('number');
    expect(sampleKind('boolean', '')).toBe('boolean');
  });

  it('falls back to the string widget for anything it does not know', () => {
    // A definitions document is authored input: an unknown/absent type, or a
    // format that does not apply to the type, must still yield an editable
    // widget rather than nothing.
    expect(sampleKind('', '')).toBe('string');
    expect(sampleKind('object', '')).toBe('string');
    expect(sampleKind('__proto__', 'constructor')).toBe('string');
    expect(sampleKind('number', 'date')).toBe('number');
    expect(sampleKind('string', 'currency')).toBe('string');
  });
});

describe('arrayLength', () => {
  it('counts the rows of a top-level array', () => {
    expect(arrayLength(JSON.stringify({ items: [1, 2, 3] }), 'items')).toBe(3);
    expect(arrayLength(JSON.stringify({ items: [] }), 'items')).toBe(0);
  });

  it('reads 0 for a key that is absent or holds something else', () => {
    expect(arrayLength(JSON.stringify({ items: [1] }), 'other')).toBe(0);
    expect(arrayLength(JSON.stringify({ items: 'nope' }), 'items')).toBe(0);
    expect(arrayLength(JSON.stringify({ items: { 0: 'a' } }), 'items')).toBe(0);
  });

  it('reads 0 for unparseable params rather than throwing', () => {
    expect(arrayLength('nope', 'items')).toBe(0);
    expect(arrayLength('[1,2]', 'items')).toBe(0);
  });

  it('does not resolve a prototype key as a row array', () => {
    // `constructor`/`toString` exist on the prototype; the own-property guard
    // must keep them at 0 rather than reading the inherited value.
    expect(arrayLength(JSON.stringify({ a: 1 }), 'constructor')).toBe(0);
    expect(arrayLength(JSON.stringify({ a: 1 }), 'toString')).toBe(0);
    expect(arrayLength('{"__proto__":{"x":[1,2]}}', '__proto__')).toBe(0);
  });
});
