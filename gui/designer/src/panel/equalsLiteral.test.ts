// @vitest-environment node
//
// The one literal rule the three presence surfaces share: the literal follows
// the FIELD's type, because the engine's predicate is type-strict.
import { describe, expect, it } from 'vitest';
import { equalsLiteral } from './equalsLiteral';

describe('equalsLiteral', () => {
  it('authors a number for a numeric field, whatever display type names it', () => {
    for (const type of ['number', 'currency', 'percentage', 'quantity']) {
      expect(equalsLiteral(' 40.0 ', type), type).toBe(40);
    }
  });

  it('keeps an unparseable or non-finite numeric entry as text rather than authoring NaN', () => {
    expect(equalsLiteral('abc', 'number')).toBe('abc');
    expect(equalsLiteral('Infinity', 'number')).toBe('Infinity');
    expect(equalsLiteral('  ', 'number')).toBe('  ');
  });

  it('authors the BOOLEAN for true/false on a boolean field', () => {
    expect(equalsLiteral('false', 'boolean')).toBe(false);
    expect(equalsLiteral('true', 'boolean')).toBe(true);
  });

  it('keeps any other entry on a boolean field as the text it is', () => {
    expect(equalsLiteral('yes', 'boolean')).toBe('yes');
    expect(equalsLiteral('False', 'boolean')).toBe('False');
  });

  it('keeps text verbatim for a text field, including "false"', () => {
    expect(equalsLiteral('false', 'string')).toBe('false');
    expect(equalsLiteral('2', '')).toBe('2');
  });
});
