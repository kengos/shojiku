// The display keys of a field — currency, decimal places, unit, default display
// format: what is read, the ops written, the refusals before any op, and that an
// unchanged entry authors nothing.

import { describe, expect, it } from 'vitest';
import {
  currencyOp,
  displayFormatOp,
  MAX_PRECISION,
  precisionOp,
  readDisplayRules,
  unitOp,
} from './displayRules';

const DEFS = `type: object
properties:
  total: { type: number, format: currency, currency: USD, precision: 2, displayFormat: symbol }
  qty: { type: integer, format: quantity, unit: kg }
  odd: { type: number, currency: 3, precision: two }
`;
const AT = ['properties', 'total'];

describe('readDisplayRules', () => {
  it('reads each key as shown', () => {
    expect(readDisplayRules(DEFS, AT)).toEqual({
      currency: 'USD',
      precision: '2',
      unit: '',
      displayFormat: 'symbol',
    });
    expect(readDisplayRules(DEFS, ['properties', 'qty']).unit).toBe('kg');
  });

  it('shows a non-string code as nothing and a non-number precision verbatim', () => {
    expect(readDisplayRules(DEFS, ['properties', 'odd'])).toMatchObject({
      currency: '',
      precision: 'two',
    });
  });

  it('reads an absent node or unparseable text as all empty', () => {
    const empty = { currency: '', precision: '', unit: '', displayFormat: '' };
    expect(readDisplayRules(DEFS, ['properties', 'nope'])).toEqual(empty);
    expect(readDisplayRules('a: [', AT)).toEqual(empty);
  });
});

describe('currencyOp / unitOp / displayFormatOp', () => {
  it('writes what was typed verbatim, clears on empty, and authors nothing unchanged', () => {
    expect(currencyOp(AT, 'USD', 'eur')).toEqual({
      op: 'setScalar',
      keys: [...AT, 'currency'],
      value: 'eur',
    });
    expect(currencyOp(AT, 'USD', '')).toEqual({ op: 'removeKey', keys: [...AT, 'currency'] });
    expect(currencyOp(AT, 'USD', 'USD')).toBeNull();
    expect(currencyOp(AT, '', '')).toBeNull();
    expect(unitOp(AT, '', 'kg')).toEqual({ op: 'setScalar', keys: [...AT, 'unit'], value: 'kg' });
    expect(unitOp(AT, 'kg', 'kg')).toBeNull();
    expect(displayFormatOp(AT, 'symbol', '')).toEqual({
      op: 'removeKey',
      keys: [...AT, 'displayFormat'],
    });
    expect(displayFormatOp(AT, '', 'name')).toEqual({
      op: 'setScalar',
      keys: [...AT, 'displayFormat'],
      value: 'name',
    });
    expect(displayFormatOp(AT, 'name', 'name')).toBeNull();
  });

  it('keeps a hostile code as a plain value (the op layer quotes it)', () => {
    expect(currencyOp(AT, '', 'a: b\nc')).toMatchObject({ value: 'a: b\nc' });
  });
});

describe('precisionOp', () => {
  const op = (current: string, raw: string) => precisionOp(AT, current, raw);
  const keys = [...AT, 'precision'];

  it('writes 0 and the engine maximum, and clears on empty', () => {
    expect(op('', '0')).toEqual({ ok: true, op: { op: 'setScalar', keys, value: 0 } });
    expect(op('', String(MAX_PRECISION))).toEqual({
      ok: true,
      op: { op: 'setScalar', keys, value: MAX_PRECISION },
    });
    expect(op('2', ' ')).toEqual({ ok: true, op: { op: 'removeKey', keys } });
    expect(op('', '')).toEqual({ ok: true, op: null });
  });

  it('writes -0 as 0 and authors nothing for the shown number in another spelling', () => {
    expect(op('', '-0')).toEqual({ ok: true, op: { op: 'setScalar', keys, value: 0 } });
    expect(op('2', '2.0')).toEqual({ ok: true, op: null });
  });

  it('refuses everything the u32 wire or the engine clamp would not take', () => {
    expect(op('', String(MAX_PRECISION + 1))).toEqual({ ok: false, refusal: 'over_max' });
    expect(op('', '1.5')).toEqual({ ok: false, refusal: 'not_whole' });
    expect(op('', '-1')).toEqual({ ok: false, refusal: 'negative' });
    expect(op('', '1e400')).toEqual({ ok: false, refusal: 'too_large' });
    expect(op('', 'abc')).toEqual({ ok: false, refusal: 'not_a_number' });
  });
});
