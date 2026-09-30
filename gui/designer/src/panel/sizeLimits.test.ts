// Tests for sizeLimits.ts — the four size bounds as authored, and their ingress.

import { describe, expect, it } from 'vitest';
import {
  readSizeLimits,
  SIZE_LIMIT_KEYS,
  sizeLimitKeys,
  sizeLimitOp,
  sizeLimitStepOp,
  steppedLimit,
} from './sizeLimits';

const P = 'sections.body.items[0]';

describe('readSizeLimits', () => {
  it('reads each bound as authored, and unset from a hostile node', () => {
    expect(readSizeLimits({ box: { minWidth: 40, maxHeight: '50%' } })).toEqual({
      minWidth: '40',
      maxWidth: '',
      minHeight: '',
      maxHeight: '50%',
    });
    for (const n of [
      undefined,
      'x',
      { box: 'x' },
      { box: JSON.parse('{"__proto__": {"minWidth": 1}}') },
    ]) {
      expect(readSizeLimits(n).minWidth).toBe('');
    }
  });
});

describe('sizeLimitOp', () => {
  it('sets a number or a unit length, and removes on empty', () => {
    expect(sizeLimitOp(P, 'minWidth', '', '40')).toEqual({
      op: 'setScalar',
      path: P,
      keys: ['box', 'minWidth'],
      value: 40,
    });
    expect(sizeLimitOp(P, 'maxHeight', '', '50%')).toEqual({
      op: 'setScalar',
      path: P,
      keys: ['box', 'maxHeight'],
      value: '50%',
    });
    expect(sizeLimitOp(P, 'minHeight', '20', '')).toEqual({
      op: 'removeKey',
      path: P,
      keys: ['box', 'minHeight'],
    });
  });

  it('authors nothing unchanged, and refuses a sign, garbage or a hostile length', () => {
    expect(sizeLimitOp(P, 'minWidth', '40', ' 40 ')).toBeNull();
    for (const bad of ['-5', 'wide', '5px', '1'.repeat(17)]) {
      expect(sizeLimitOp(P, 'minWidth', '', bad)).toBeNull();
    }
  });
});

describe('steppedLimit / sizeLimitKeys', () => {
  it('steps a bare number by the step, floored at 0, and not a unit', () => {
    expect(steppedLimit('', 1, 5)).toBe('5');
    expect(steppedLimit('', -1, 5)).toBeNull();
    expect(steppedLimit('3', -1, 5)).toBe('0');
    expect(steppedLimit('0', -1, 5)).toBeNull();
    expect(steppedLimit('10%', 1, 5)).toBeNull();
    expect(steppedLimit('10mm', 1, 5)).toMatch(/^11\.\d+mm$/);
  });

  it('steps through the same ingress, and authors nothing at the floor', () => {
    expect(sizeLimitStepOp(P, 'minWidth', '10', 1, 5)).toEqual({
      op: 'setScalar',
      path: P,
      keys: ['box', 'minWidth'],
      value: 15,
    });
    expect(sizeLimitStepOp(P, 'minWidth', '', -1, 5)).toBeNull();
  });

  it('withholds the height bounds from a flow-body table', () => {
    expect(sizeLimitKeys(true)).toEqual(['minWidth', 'maxWidth']);
    expect(sizeLimitKeys(false)).toBe(SIZE_LIMIT_KEYS);
  });
});
