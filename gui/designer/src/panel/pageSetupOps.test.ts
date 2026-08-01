import { describe, expect, it } from 'vitest';
import { readPageView } from './pageSetupModel';
import { customDimOp, customUnitOps, orientationOp, selectSizeOp } from './pageSetupOps';

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
