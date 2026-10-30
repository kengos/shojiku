// The catalog section's value reads and entry rules: what an edited object
// holds, whether an edit changes it, the op a live host makes of one, and what
// a typed or stepped numeric entry authors under the catalog's bounds.

import { describe, expect, it } from 'vitest';
import { inBounds, lengthEntry, numberEntry, steppedMeasure, textEntry } from './entries';
import { fieldEditOp, isSet, sameValue, scalarText, setCount, valueAt } from './fieldEdit';

describe('the edited object', () => {
  it('reads own keys only, and counts a `~` as unset', () => {
    const values = { lineBreak: 'strict', opacity: null };
    expect(valueAt(values, 'lineBreak')).toBe('strict');
    expect(valueAt(values, 'constructor')).toBeUndefined();
    expect(isSet(values, 'lineBreak')).toBe(true);
    expect(isSet(values, 'opacity')).toBe(false);
    expect(isSet(values, 'overflow')).toBe(false);
    expect(setCount(values, ['lineBreak', 'opacity', 'overflow'])).toBe(1);
  });

  it('shows a string or a finite number as text, and nothing else', () => {
    expect(scalarText('12mm')).toBe('12mm');
    expect(scalarText(0.5)).toBe('0.5');
    expect(scalarText(Number.NaN)).toBeNull();
    expect(scalarText(true)).toBeNull();
    expect(scalarText({ top: 1 })).toBeNull();
  });
});

describe('sameValue', () => {
  it('treats absent and `~` as one unset state', () => {
    expect(sameValue(undefined, undefined)).toBe(true);
    expect(sameValue(null, undefined)).toBe(true);
    expect(sameValue('strict', undefined)).toBe(false);
    expect(sameValue(undefined, 'strict')).toBe(false);
    expect(sameValue(null, 'strict')).toBe(false);
  });

  it('compares scalars by value and maps by their serialized form', () => {
    expect(sameValue(12, 12)).toBe(true);
    expect(sameValue('12', 12)).toBe(false);
    expect(sameValue({ digits: 2 }, { digits: 2 })).toBe(true);
    expect(sameValue({ digits: 2 }, { digits: 3 })).toBe(false);
  });
});

describe('fieldEditOp', () => {
  it('removes, writes a scalar in place, or replaces a map, under the base keys', () => {
    expect(
      fieldEditOp(undefined, ['styles', 's'], { keys: ['opacity'], value: undefined }),
    ).toEqual({ op: 'removeKey', path: undefined, keys: ['styles', 's', 'opacity'] });
    expect(fieldEditOp('body.items[0]', [], { keys: ['overflowText'], value: 'more' })).toEqual({
      op: 'setScalar',
      path: 'body.items[0]',
      keys: ['overflowText'],
      value: 'more',
    });
    expect(
      fieldEditOp(undefined, ['defaults', 'style'], {
        keys: ['textCombineUpright'],
        value: { digits: 2 },
      }),
    ).toEqual({
      op: 'putValue',
      path: undefined,
      keys: ['defaults', 'style', 'textCombineUpright'],
      value: { digits: 2 },
    });
  });
});

describe('numeric entries', () => {
  const bounds = { minimum: 0, maximum: 1000 };

  it('holds a value to every bound the catalog states', () => {
    expect(inBounds(0, bounds)).toBe(true);
    expect(inBounds(-1, bounds)).toBe(false);
    expect(inBounds(1001, bounds)).toBe(false);
    expect(inBounds(0, { exclusiveMinimum: 0 })).toBe(false);
    expect(inBounds(0.1, { exclusiveMinimum: 0 })).toBe(true);
    expect(inBounds(-5, {})).toBe(true);
  });

  it('authors a bare length as a number, a unit length as typed, and refuses one out of bounds', () => {
    expect(lengthEntry('  ', bounds)).toBeUndefined();
    expect(lengthEntry(' 12 ', bounds)).toBe(12);
    expect(lengthEntry('3mm', bounds)).toBe('3mm');
    expect(lengthEntry('-1', bounds)).toBeNull();
    expect(lengthEntry('40cm', bounds)).toBeNull();
    // A font-relative unit is passed on; `%` is refused, since not every
    // length key takes it.
    expect(lengthEntry('2rem', bounds)).toBe('2rem');
    expect(lengthEntry('50%', bounds)).toBeNull();
  });

  it('authors a finite number within bounds and refuses anything else', () => {
    expect(numberEntry('', bounds)).toBeUndefined();
    expect(numberEntry('1.5', bounds)).toBe(1.5);
    expect(numberEntry('abc', bounds)).toBeNull();
    expect(numberEntry('2000', bounds)).toBeNull();
  });

  it('steps by one, keeping the unit, and not past a bound or over an unsteppable value', () => {
    expect(steppedMeasure('12', 1, bounds)).toBe(13);
    expect(steppedMeasure('2mm', -1, bounds)).toBe('1.6mm');
    expect(steppedMeasure('0', -1, bounds)).toBeNull();
    expect(steppedMeasure('1000', 1, bounds)).toBeNull();
    expect(steppedMeasure('', 1, bounds)).toBeNull();
    expect(steppedMeasure('50%', 1, bounds)).toBeNull();
  });

  it('removes the key for an empty text and keeps any other text as typed', () => {
    expect(textEntry('  ')).toBeUndefined();
    expect(textEntry(' +{count} more')).toBe(' +{count} more');
  });
});
