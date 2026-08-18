import { describe, expect, it } from 'vitest';
import type { EffectiveValue } from './effective';
import { alignedValue, alignWire, comboWire, toggleWire } from './wire';

const P = 'sections.body.items[0]';
/** A BAND's key path — the whole reason this module is keyed by an array: the
 * header row's properties do not live at `style.*`. */
const BAND = ['header', 'style', 'fontWeight'] as const;
const BAND_ALIGN = ['row', 'style', 'textAlign'] as const;

/** One effective value, defaulting to fully unset. */
function ev(over: Partial<EffectiveValue> = {}): EffectiveValue {
  return { value: '', cascade: '', own: '', origin: 'unset', styleName: '', ...over };
}

describe('alignedValue', () => {
  it('normalizes unset to the engine default left', () => {
    expect(alignedValue('')).toBe('left');
    expect(alignedValue('right')).toBe('right');
  });
});

describe('toggleWire at a band key path', () => {
  it('authors nothing when the cascade already yields the target', () => {
    expect(toggleWire(P, BAND, ev({ value: 'bold', cascade: 'bold' }), 'bold', true)).toBeNull();
  });

  it('authors the explicit override when the cascade says bold and the user says no', () => {
    expect(toggleWire(P, BAND, ev({ value: 'bold', cascade: 'bold' }), 'bold', false)).toEqual({
      op: 'setScalar',
      path: P,
      keys: BAND,
      value: 'normal',
    });
  });

  it('drops the own key rather than restating the default', () => {
    const eff = ev({ value: 'bold', own: 'bold' });
    expect(toggleWire(P, BAND, eff, 'bold', false)).toEqual({
      op: 'removeKey',
      path: P,
      keys: BAND,
    });
  });

  it('authors nothing when neither the cascade nor an own key says bold', () => {
    expect(toggleWire(P, BAND, ev(), 'bold', false)).toBeNull();
  });

  it('authors the target at the band path when the cascade does not give it', () => {
    expect(toggleWire(P, BAND, ev(), 'bold', true)).toEqual({
      op: 'setScalar',
      path: P,
      keys: BAND,
      value: 'bold',
    });
  });
});

describe('alignWire at a band key path', () => {
  it('reverts to the cascade when the picked value is the one already shown', () => {
    const eff = ev({ value: 'right', own: 'right' });
    expect(alignWire(P, BAND_ALIGN, eff, 'right')).toEqual({
      op: 'removeKey',
      path: P,
      keys: BAND_ALIGN,
    });
  });

  it('authors nothing when the cascade already yields the picked value', () => {
    expect(alignWire(P, BAND_ALIGN, ev({ value: 'right', cascade: 'right' }), 'right')).toBeNull();
  });

  it('reverts when the pick matches the cascade under a different own key', () => {
    const eff = ev({ value: 'center', cascade: 'right', own: 'center' });
    expect(alignWire(P, BAND_ALIGN, eff, 'right')).toEqual({
      op: 'removeKey',
      path: P,
      keys: BAND_ALIGN,
    });
  });

  it('treats an unset cascade as the engine default left', () => {
    expect(alignWire(P, BAND_ALIGN, ev(), 'left')).toBeNull();
  });

  it('authors the own key when the cascade does not yield the pick', () => {
    expect(alignWire(P, BAND_ALIGN, ev({ value: 'right', cascade: 'right' }), 'center')).toEqual({
      op: 'setScalar',
      path: P,
      keys: BAND_ALIGN,
      value: 'center',
    });
  });
});

describe('comboWire at a band key path', () => {
  const KEYS = ['row', 'style', 'color'] as const;

  it('authors nothing when clearing a key that was never authored', () => {
    expect(comboWire(P, KEYS, ev({ value: '#000000', cascade: '#000000' }), '', false)).toBeNull();
  });

  it('clears the own key back to the cascade', () => {
    expect(comboWire(P, KEYS, ev({ value: '#c00000', own: '#c00000' }), '', false)).toEqual({
      op: 'removeKey',
      path: P,
      keys: KEYS,
    });
  });

  // The trim guard exits early only when there is nothing to clear; with an own
  // key present the value goes on to the shared leaf builder, whose own rule is
  // that only the EMPTY string clears. Pinned so the two rules stay distinct.
  it('hands a blank-but-not-empty value to the leaf builder, own key present', () => {
    expect(comboWire(P, KEYS, ev({ value: '#c00000', own: '#c00000' }), '  ', false)).toEqual({
      op: 'setScalar',
      path: P,
      keys: KEYS,
      value: '  ',
    });
  });

  it('authors a value at the band path', () => {
    expect(comboWire(P, KEYS, ev(), '#c00000', false)).toEqual({
      op: 'setScalar',
      path: P,
      keys: KEYS,
      value: '#c00000',
    });
  });

  it('routes a length through the length policy rather than plain text', () => {
    expect(comboWire(P, ['style', 'fontSize'], ev(), '12', true)).toEqual({
      op: 'setScalar',
      path: P,
      keys: ['style', 'fontSize'],
      value: 12,
    });
  });
});
