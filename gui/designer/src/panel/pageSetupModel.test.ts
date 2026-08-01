import { describe, expect, it } from 'vitest';
import { readPageView, sizeLabel } from './pageSetupModel';

describe('readPageView', () => {
  it('treats a missing page key as the default A4 portrait', () => {
    const view = readPageView(undefined);
    expect(view).toMatchObject({
      mode: 'named',
      sizeName: 'A4',
      orientation: 'portrait',
      hasSizeKey: false,
      hasOrientation: false,
    });
    expect(view.dims).toEqual({ w: 595.28, h: 841.89 });
  });

  // A hand-authored (or hostile) document can put anything under `page:`. Each
  // shape the guard rejects is pinned BY NAME: they all degrade to the same
  // default view as an absent key, and none of them reaches the size reads.
  it.each([
    ['null', null],
    ['an array', []],
    ['a number', 42],
    ['a string', 'A4'],
  ])('treats a non-object page node (%s) as the default A4 portrait', (_label, raw) => {
    const view = readPageView(raw);
    expect(view).toMatchObject({
      mode: 'named',
      sizeName: 'A4',
      orientation: 'portrait',
      hasSizeKey: false,
      hasOrientation: false,
    });
    expect(view.dims).toEqual({ w: 595.28, h: 841.89 });
  });

  it('reads a named size and its dimensions', () => {
    const view = readPageView({ size: 'Letter' });
    expect(view).toMatchObject({ mode: 'named', sizeName: 'Letter', hasSizeKey: true });
    expect(view.dims).toEqual({ w: 612, h: 792 });
  });

  it('swaps the dimensions for a landscape named size', () => {
    const view = readPageView({ size: 'A4', orientation: 'landscape' });
    expect(view.orientation).toBe('landscape');
    expect(view.hasOrientation).toBe(true);
    expect(view.dims).toEqual({ w: 841.89, h: 595.28 });
  });

  it('reports an unknown named size with null dimensions', () => {
    const view = readPageView({ size: 'B6' });
    expect(view).toMatchObject({ mode: 'named', sizeName: 'B6', dims: null });
  });

  it('carries an orientation key even when the size key is absent', () => {
    const view = readPageView({ orientation: 'landscape' });
    expect(view).toMatchObject({
      mode: 'named',
      sizeName: 'A4',
      hasSizeKey: false,
      hasOrientation: true,
      orientation: 'landscape',
    });
  });

  it('reads a custom size, seeding the inputs and deriving the orientation', () => {
    const view = readPageView({ size: { w: '8.5in', h: '13in' } });
    expect(view.mode).toBe('custom');
    if (view.mode !== 'custom') throw new Error('expected custom');
    expect(view.custom).toEqual({ w: '8.5', h: '13', unit: 'in' });
    expect(view.orientation).toBe('portrait');
    expect(view.dims).toEqual({ w: 612, h: 936 });
  });

  it('derives landscape for a custom size wider than tall', () => {
    const view = readPageView({ size: { w: '13in', h: '8.5in' } });
    expect(view.orientation).toBe('landscape');
  });

  it('reads a bare-number custom size as points', () => {
    const view = readPageView({ size: { w: 200, h: 300 } });
    if (view.mode !== 'custom') throw new Error('expected custom');
    expect(view.custom).toEqual({ w: '200', h: '300', unit: 'pt' });
    expect(view.dims).toEqual({ w: 200, h: 300 });
  });

  it('handles an unparseable custom size with empty seeds and null dims', () => {
    const view = readPageView({ size: { w: 'wide', h: -3 } });
    if (view.mode !== 'custom') throw new Error('expected custom');
    expect(view.custom).toEqual({ w: '', h: '', unit: 'pt' });
    expect(view.dims).toBeNull();
    expect(view.orientation).toBe('portrait');
  });

  it('re-expresses a mixed-unit dimension in the shared display unit', () => {
    // `{ w: 8.5in, h: 200mm }` is legitimate wire; showing `200` under `in`
    // would rewrite the height 25× larger on a mere blur-through.
    const view = readPageView({ size: { w: '8.5in', h: '200mm' } });
    if (view.mode !== 'custom') throw new Error('expected custom');
    expect(view.custom).toEqual({ w: '8.5', h: '7.87', unit: 'in' });
  });

  it('re-expresses a bare-pt dimension beside a suffixed one', () => {
    // 936pt is exactly 13in — the numeral must convert, not pass through.
    const view = readPageView({ size: { w: '8.5in', h: 936 } });
    if (view.mode !== 'custom') throw new Error('expected custom');
    expect(view.custom).toEqual({ w: '8.5', h: '13', unit: 'in' });
  });

  it('treats a non-scalar custom dimension as empty', () => {
    const view = readPageView({ size: { w: null, h: null } });
    if (view.mode !== 'custom') throw new Error('expected custom');
    expect(view.custom).toEqual({ w: '', h: '', unit: 'pt' });
    expect(view.dims).toBeNull();
  });

  it('reads unit-less numeral strings as points', () => {
    const view = readPageView({ size: { w: '200', h: '300' } });
    if (view.mode !== 'custom') throw new Error('expected custom');
    expect(view.custom).toEqual({ w: '200', h: '300', unit: 'pt' });
    expect(view.dims).toEqual({ w: 200, h: 300 });
  });

  it('rejects a non-positive custom dimension, leaving dims null', () => {
    const view = readPageView({ size: { w: '0mm', h: '10mm' } });
    expect(view.dims).toBeNull();
  });
});

describe('sizeLabel', () => {
  it('labels a named portrait size in its conventional unit', () => {
    expect(sizeLabel(readPageView({ size: 'A4' }))).toBe('210 × 297 mm');
  });

  it('labels a landscape named size with swapped dimensions', () => {
    expect(sizeLabel(readPageView({ size: 'A4', orientation: 'landscape' }))).toBe('297 × 210 mm');
  });

  it('labels an unknown named size as its bare name', () => {
    expect(sizeLabel(readPageView({ size: 'B6' }))).toBe('B6');
  });

  it('labels a custom size with the entered values and unit', () => {
    expect(sizeLabel(readPageView({ size: { w: '8.5in', h: '13in' } }))).toBe('8.5 × 13 in');
  });

  it('shows a placeholder for an empty custom dimension', () => {
    expect(sizeLabel(readPageView({ size: { w: 'x', h: '13in' } }))).toBe('? × 13 in');
    expect(sizeLabel(readPageView({ size: { w: '8in', h: 'y' } }))).toBe('8 × ? in');
  });
});
