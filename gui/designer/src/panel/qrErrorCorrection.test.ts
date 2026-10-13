// The QR error-correction model: what each shape of the item's own key reads as,
// and the op a pick dispatches — including the picks that must dispatch nothing.

import { describe, expect, it } from 'vitest';
import {
  EC_LEVELS,
  errorCorrectionOf,
  errorCorrectionOp,
  UNREADABLE_LEVEL,
} from './qrErrorCorrection';

const P = 'sections.body.items[0]';
const read = (node: unknown) => (path: string) => (path === P ? node : undefined);
const qr = (errorCorrection?: unknown) =>
  read(
    errorCorrection === undefined
      ? { type: 'qr_code', text: 'x' }
      : { type: 'qr_code', text: 'x', errorCorrection },
  );
const ABSENT = { shown: '', present: false };

describe('errorCorrectionOf', () => {
  it('reads each engine level as its own spelling', () => {
    for (const level of EC_LEVELS) {
      expect(errorCorrectionOf(qr(level), P)).toEqual({ shown: level, present: true });
    }
  });

  it('keeps the engine order, least damage tolerated first', () => {
    expect(EC_LEVELS).toEqual(['low', 'medium', 'quartile', 'high']);
  });

  it('reads an absent key as the default, with nothing to remove', () => {
    expect(errorCorrectionOf(qr(), P)).toEqual(ABSENT);
  });

  it('reads a `~` as the default too, though the key is in the file', () => {
    // The engine reads `~` as unset, so it draws the default and is no error.
    expect(errorCorrectionOf(qr(null), P)).toEqual({ shown: '', present: true });
  });

  it('shows a string or a number the engine refuses as itself', () => {
    // `LOW` makes the engine refuse the whole document; showing it as the default
    // would let the next pick overwrite it without the author ever seeing it.
    expect(errorCorrectionOf(qr('LOW'), P)).toEqual({ shown: 'LOW', present: true });
    expect(errorCorrectionOf(qr(1), P)).toEqual({ shown: '1', present: true });
  });

  it.each([
    ['an empty string', ''],
    ['a boolean', true],
    ['false', false],
    ['a list', ['high']],
    ['a map', { a: 1 }],
  ])('reads %s, which the engine refuses too, as unreadable — never as the default', (_, value) => {
    expect(errorCorrectionOf(qr(value), P)).toEqual({ shown: UNREADABLE_LEVEL, present: true });
  });

  it('reads an item that is not a map as having no key, rather than throwing', () => {
    expect(errorCorrectionOf(read('not a map'), P)).toEqual(ABSENT);
    expect(errorCorrectionOf(read(undefined), P)).toEqual(ABSENT);
  });

  it('reads only the item’s own key, never one it inherits', () => {
    const item = Object.create({ errorCorrection: 'high' }) as Record<string, unknown>;
    item.type = 'qr_code';
    expect(errorCorrectionOf(read(item), P)).toEqual(ABSENT);
  });
});

describe('errorCorrectionOp', () => {
  it('writes a picked level at the item’s top level, not under style', () => {
    expect(errorCorrectionOp(P, ABSENT, 'high')).toEqual({
      op: 'setScalar',
      path: P,
      keys: ['errorCorrection'],
      value: 'high',
    });
  });

  it('removes the key when the default row is picked', () => {
    expect(errorCorrectionOp(P, { shown: 'high', present: true }, '')).toEqual({
      op: 'removeKey',
      path: P,
      keys: ['errorCorrection'],
    });
  });

  it('removes an unreadable value when the default row is picked', () => {
    expect(errorCorrectionOp(P, { shown: UNREADABLE_LEVEL, present: true }, '')).toEqual({
      op: 'removeKey',
      path: P,
      keys: ['errorCorrection'],
    });
  });

  it('replaces a spelling the engine refuses', () => {
    expect(errorCorrectionOp(P, { shown: 'LOW', present: true }, 'low')).toEqual({
      op: 'setScalar',
      path: P,
      keys: ['errorCorrection'],
      value: 'low',
    });
  });

  it('dispatches nothing for a re-pick of the shown value', () => {
    expect(errorCorrectionOp(P, { shown: 'high', present: true }, 'high')).toBeNull();
    const unreadable = { shown: UNREADABLE_LEVEL, present: true };
    expect(errorCorrectionOp(P, unreadable, UNREADABLE_LEVEL)).toBeNull();
  });

  it('dispatches nothing for the default row over no key', () => {
    // A removal there would fail on the missing key.
    expect(errorCorrectionOp(P, ABSENT, '')).toBeNull();
  });
});
