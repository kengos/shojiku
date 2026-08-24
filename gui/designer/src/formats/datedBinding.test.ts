import { describe, expect, it } from 'vitest';
import { readDefinitionsView } from '../palette/model';
import { datedBinding, datedChip, fieldTypeFor } from './datedBinding';

const DEFS = readDefinitionsView(
  [
    'type: object',
    'properties:',
    '  order:',
    '    type: object',
    '    properties:',
    '      when: { type: string, format: date }',
    '      seen: { type: string, format: date-time }',
    '      total: { type: number, format: currency }',
    '  lines:',
    '    type: array',
    '    items:',
    '      type: object',
    '      properties:',
    '        shipped: { type: string, format: date }',
    '        price: { type: number, format: currency }',
    '',
  ].join('\n'),
);

describe('fieldTypeFor', () => {
  it('reads a document-scope field by its FULL key', () => {
    expect(fieldTypeFor(DEFS, null, 'order.when')).toBe('date');
    expect(fieldTypeFor(DEFS, null, 'order.seen')).toBe('datetime');
    expect(fieldTypeFor(DEFS, null, 'order.total')).toBe('currency');
  });

  it('reads an array-scope field by its ROW-RELATIVE key', () => {
    expect(fieldTypeFor(DEFS, 'lines', 'shipped')).toBe('date');
    expect(fieldTypeFor(DEFS, 'lines', 'price')).toBe('currency');
  });

  it('does not offer a row field at document scope, nor the reverse', () => {
    expect(fieldTypeFor(DEFS, null, 'shipped')).toBeUndefined();
    expect(fieldTypeFor(DEFS, 'lines', 'order.when')).toBeUndefined();
  });

  it('answers nothing with no definitions, or for a scope that is not an array', () => {
    expect(fieldTypeFor(null, null, 'order.when')).toBeUndefined();
    expect(fieldTypeFor(DEFS, 'order', 'when')).toBeUndefined();
  });
});

describe('datedBinding', () => {
  it('is true for the two dated types and false for every other declared one', () => {
    expect(datedBinding(DEFS, null, 'order.when')).toBe(true);
    expect(datedBinding(DEFS, null, 'order.seen')).toBe(true);
    expect(datedBinding(DEFS, null, 'order.total')).toBe(false);
  });

  it('is true whenever the type cannot be resolved — record rather than miss', () => {
    expect(datedBinding(null, null, 'order.total')).toBe(true);
    expect(datedBinding(DEFS, null, 'not.declared')).toBe(true);
    expect(datedBinding(DEFS, null, undefined)).toBe(true);
  });
});

describe('datedChip', () => {
  // A chip can resolve at more than one (key, scope) pair, so the answer is
  // taken over the whole candidate SET rather than one bet.
  it('is true when ANY candidate pair resolves dated', () => {
    expect(datedChip(DEFS, ['lines', null], ['order.total', 'shipped'])).toBe(true);
    expect(datedChip(DEFS, [null], ['order.when'])).toBe(true);
  });

  it('is false when every pair that RESOLVES says non-dated', () => {
    // `order.total` resolves (currency) at document scope and nowhere else;
    // an unresolvable candidate beside it must not flip the answer, or the
    // filter would record everything.
    expect(datedChip(DEFS, [null, 'lines'], ['order.total'])).toBe(false);
    expect(datedChip(DEFS, ['lines', null], ['price'])).toBe(false);
  });

  it('is true when NOTHING resolves — the record-rather-than-miss fallback', () => {
    expect(datedChip(DEFS, [null, 'lines'], ['not.declared'])).toBe(true);
    expect(datedChip(null, [null], ['order.total'])).toBe(true);
  });
});
