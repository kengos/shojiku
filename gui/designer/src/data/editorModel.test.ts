import { describe, expect, it } from 'vitest';
import { arrayLength, KIND_OPTION_KEY, SELECTION_SEP, sampleKind } from './editorModel';

describe('SELECTION_SEP', () => {
  it('is one U+0000, kept in the source as an escape, not a raw byte', () => {
    // The separator must be a single NUL: anything else (a space, a dot) is a
    // character a real key can contain, and two keys paths would start colliding.
    expect(SELECTION_SEP).toHaveLength(1);
    expect(SELECTION_SEP.charCodeAt(0)).toBe(0);
  });
});

describe('KIND_OPTION_KEY', () => {
  it('labels the four scalar types and the three containers', () => {
    expect(Object.keys(KIND_OPTION_KEY)).toEqual([
      'string',
      'number',
      'integer',
      'boolean',
      'group',
      'table',
      'list',
    ]);
    expect(KIND_OPTION_KEY.table).toBe('data.kindOption.table');
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
    expect(arrayLength(JSON.stringify({ items: [1, 2, 3] }), ['items'])).toBe(3);
    expect(arrayLength(JSON.stringify({ items: [] }), ['items'])).toBe(0);
  });

  it('counts the rows of an array nested in an object, by path', () => {
    // A table inside an object group (`order.lines`) is one PATH, not a dotted
    // top-level key.
    const params = JSON.stringify({ order: { lines: [{}, {}] }, 'order.lines': [{}] });
    expect(arrayLength(params, ['order', 'lines'])).toBe(2);
  });

  it('walks a numeric segment into an array element', () => {
    expect(arrayLength(JSON.stringify({ rows: [{ tags: ['a', 'b'] }] }), ['rows', 0, 'tags'])).toBe(
      2,
    );
    expect(arrayLength(JSON.stringify({ rows: [] }), ['rows', 0, 'tags'])).toBe(0);
  });

  it('reads 0 for a key that is absent or holds something else', () => {
    expect(arrayLength(JSON.stringify({ items: [1] }), ['other'])).toBe(0);
    expect(arrayLength(JSON.stringify({ items: 'nope' }), ['items'])).toBe(0);
    expect(arrayLength(JSON.stringify({ items: { 0: 'a' } }), ['items'])).toBe(0);
  });

  it('reads 0 for unparseable params rather than throwing', () => {
    expect(arrayLength('nope', ['items'])).toBe(0);
    expect(arrayLength('[1,2]', ['items'])).toBe(0);
  });

  it('does not resolve a prototype key as a row array', () => {
    // `constructor`/`toString` exist on the prototype; the own-property guard
    // must keep them at 0 rather than reading the inherited value.
    expect(arrayLength(JSON.stringify({ a: 1 }), ['constructor'])).toBe(0);
    expect(arrayLength(JSON.stringify({ a: 1 }), ['toString'])).toBe(0);
    expect(arrayLength('{"__proto__":{"x":[1,2]}}', ['__proto__'])).toBe(0);
  });
});
