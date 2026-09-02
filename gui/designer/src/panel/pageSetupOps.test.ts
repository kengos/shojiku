import { describe, expect, it } from 'vitest';
import { readPageView } from './pageSetupModel';
import {
  canStepDimension,
  customDimOp,
  customUnitOps,
  orientationOp,
  selectSizeOp,
  stepCustomDimOp,
} from './pageSetupOps';

describe('selectSizeOp', () => {
  it('overwrites the size with a chosen engine name', () => {
    expect(selectSizeOp(readPageView({ size: 'A4' }), 'Letter')).toEqual([
      { op: 'setScalar', keys: ['page', 'size'], value: 'Letter' },
    ]);
  });

  it('switches a default named size to custom without any removeKey', () => {
    const ops = selectSizeOp(readPageView(undefined), 'custom');
    expect(ops).toEqual([
      { op: 'setScalar', keys: ['page', 'size', 'w'], value: '210mm' },
      { op: 'setScalar', keys: ['page', 'size', 'h'], value: '297mm' },
    ]);
  });

  it('clears the orientation and size keys when switching a landscape named size to custom', () => {
    const ops = selectSizeOp(readPageView({ size: 'A4', orientation: 'landscape' }), 'custom');
    expect(ops).toEqual([
      { op: 'removeKey', keys: ['page', 'orientation'] },
      { op: 'removeKey', keys: ['page', 'size'] },
      { op: 'setScalar', keys: ['page', 'size', 'w'], value: '297mm' },
      { op: 'setScalar', keys: ['page', 'size', 'h'], value: '210mm' },
    ]);
  });

  it('clears only the size key when switching a portrait explicit size to custom', () => {
    const ops = selectSizeOp(readPageView({ size: 'Letter' }), 'custom');
    expect(ops).toEqual([
      { op: 'removeKey', keys: ['page', 'size'] },
      { op: 'setScalar', keys: ['page', 'size', 'w'], value: '8.5in' },
      { op: 'setScalar', keys: ['page', 'size', 'h'], value: '11in' },
    ]);
  });

  it('falls back to A4 dimensions when switching an unknown named size to custom', () => {
    const ops = selectSizeOp(readPageView({ size: 'B6' }), 'custom');
    expect(ops).toEqual([
      { op: 'removeKey', keys: ['page', 'size'] },
      { op: 'setScalar', keys: ['page', 'size', 'w'], value: '210mm' },
      { op: 'setScalar', keys: ['page', 'size', 'h'], value: '297mm' },
    ]);
  });

  it('reseeds a custom size from its own dimensions in mm', () => {
    // Re-selecting custom while already custom rebuilds the size from its
    // current points (612 × 936pt → 215.9 × 330.2mm).
    const ops = selectSizeOp(readPageView({ size: { w: '8.5in', h: '13in' } }), 'custom');
    expect(ops).toEqual([
      { op: 'removeKey', keys: ['page', 'size'] },
      { op: 'setScalar', keys: ['page', 'size', 'w'], value: '215.9mm' },
      { op: 'setScalar', keys: ['page', 'size', 'h'], value: '330.2mm' },
    ]);
  });
});

describe('orientationOp', () => {
  it('writes the orientation key for landscape', () => {
    expect(orientationOp(readPageView({ size: 'A4' }), 'landscape')).toEqual({
      op: 'setScalar',
      keys: ['page', 'orientation'],
      value: 'landscape',
    });
  });

  it('clears the orientation key for portrait when it is present', () => {
    expect(
      orientationOp(readPageView({ size: 'A4', orientation: 'landscape' }), 'portrait'),
    ).toEqual({ op: 'removeKey', keys: ['page', 'orientation'] });
  });

  it('dispatches nothing for portrait when no orientation key exists', () => {
    expect(orientationOp(readPageView({ size: 'A4' }), 'portrait')).toBeNull();
  });
});

describe('customDimOp', () => {
  it('composes a wire length for a valid number', () => {
    expect(customDimOp('h', '13', 'in')).toEqual({
      op: 'setScalar',
      keys: ['page', 'size', 'h'],
      value: '13in',
    });
  });

  it('dispatches nothing for an invalid number', () => {
    expect(customDimOp('w', '', 'mm')).toBeNull();
    expect(customDimOp('w', '0', 'mm')).toBeNull();
  });
});

describe('customUnitOps', () => {
  const custom = { w: '1', h: '2', unit: 'in' } as const;

  it('reinterprets both dimensions into the new unit', () => {
    expect(customUnitOps(custom, 'pt')).toEqual([
      { op: 'setScalar', keys: ['page', 'size', 'w'], value: '72pt' },
      { op: 'setScalar', keys: ['page', 'size', 'h'], value: '144pt' },
    ]);
  });

  it('drops a dimension that cannot convert', () => {
    expect(customUnitOps({ w: '', h: '2', unit: 'in' }, 'pt')).toEqual([
      { op: 'setScalar', keys: ['page', 'size', 'h'], value: '144pt' },
    ]);
  });

  it('produces no ops when neither dimension converts', () => {
    expect(customUnitOps({ w: '', h: '', unit: 'in' }, 'pt')).toEqual([]);
  });
});

describe('canStepDimension', () => {
  it('offers the buttons on a positive numeral', () => {
    expect(canStepDimension('210')).toBe(true);
    expect(canStepDimension('8.27')).toBe(true);
  });

  it('withholds them on the values the typed commit also refuses', () => {
    // Each of these is a state `composeDimension` declines, so a stepper that
    // stayed enabled would offer a button that cannot author anything.
    expect(canStepDimension('')).toBe(false);
    expect(canStepDimension('   ')).toBe(false);
    expect(canStepDimension('0')).toBe(false);
    expect(canStepDimension('-5')).toBe(false);
    expect(canStepDimension('wide')).toBe(false);
    expect(canStepDimension('12mm')).toBe(false);
  });
});

describe('stepCustomDimOp', () => {
  const mm = (w: string, h = '297'): { w: string; h: string; unit: 'mm' } => ({
    w,
    h,
    unit: 'mm',
  });

  it('steps the width up by one of the DISPLAYED unit', () => {
    expect(stepCustomDimOp('w', mm('210'), 1)).toEqual({
      op: 'setScalar',
      keys: ['page', 'size', 'w'],
      value: '211mm',
    });
  });

  it('steps the width down by one of the displayed unit', () => {
    expect(stepCustomDimOp('w', mm('210'), -1)).toEqual({
      op: 'setScalar',
      keys: ['page', 'size', 'w'],
      value: '209mm',
    });
  });

  it('steps the height, not the width, when asked for it', () => {
    expect(stepCustomDimOp('h', mm('210', '297'), 1)).toEqual({
      op: 'setScalar',
      keys: ['page', 'size', 'h'],
      value: '298mm',
    });
  });

  it('steps a fractional numeral without leaving binary-float noise behind', () => {
    // 8.27 + 1 is 9.270000000000001 in binary floating point; the wire must
    // carry the numeral a reader would have typed.
    expect(stepCustomDimOp('w', { w: '8.27', h: '11.69', unit: 'in' }, 1)).toEqual({
      op: 'setScalar',
      keys: ['page', 'size', 'w'],
      value: '9.27in',
    });
  });

  it('authors nothing from an EMPTY field', () => {
    // `Number('')` is 0, not NaN, so a numeric guard alone would step a cleared
    // field up to 1.
    expect(stepCustomDimOp('w', mm(''), 1)).toBeNull();
  });

  it('authors nothing from a garbage or unit-bearing value', () => {
    expect(stepCustomDimOp('w', mm('wide'), 1)).toBeNull();
    expect(stepCustomDimOp('w', mm('12mm'), 1)).toBeNull();
  });

  it('refuses to step BELOW the floor the typed field enforces', () => {
    // A dimension of 0 is refused from the keyboard (`composeDimension` wants a
    // positive numeral), so ▼ on a 1 must author nothing rather than reach a
    // value that entry cannot.
    expect(stepCustomDimOp('w', mm('1'), -1)).toBeNull();
  });

  it('keeps the precision the author typed, rather than rounding to 2 places', () => {
    // The typed path accepts any plain decimal, so a third decimal is an
    // ordinary authored value — not float noise to be rounded away. A fixed
    // two-place rounding would author `211.13mm` here and silently discard the
    // digit the author entered.
    expect(stepCustomDimOp('w', mm('210.123456'), 1)).toEqual({
      op: 'setScalar',
      keys: ['page', 'size', 'w'],
      value: '211.123456mm',
    });
  });

  it('authors nothing when the numeral is too large for the step to move it', () => {
    // Past 2^53 the `+ 1` is absorbed, so authoring the result would write back
    // the value the document already had — an undo entry for nothing.
    expect(stepCustomDimOp('w', mm(`1${'0'.repeat(20)}`), 1)).toBeNull();
    // The same guard covers a numeral long enough to overflow to Infinity.
    expect(stepCustomDimOp('w', mm('9'.repeat(400)), 1)).toBeNull();
  });
});
