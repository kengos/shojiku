// Tests for textLookOps.ts — the letter-spacing and opacity ingress rules, and
// the percentage view of the 0..1 alpha.

import { describe, expect, it } from 'vitest';
import type { EffectiveValue } from '../toolbar/effective';
import {
  decorationToggleOp,
  letterSpacingOp,
  letterSpacingStepOp,
  MAX_LETTER_SPACING_PT,
  opacityOp,
  opacityPercent,
  opacityStepOp,
  steppedOpacity,
} from './textLookOps';

const P = 'sections.body.items[0]';
const KEYS = ['style', 'letterSpacing'];

describe('letterSpacingOp', () => {
  it('authors a signed number, and a unit length as typed', () => {
    expect(letterSpacingOp(P, '', '1.5')).toEqual({
      op: 'setScalar',
      path: P,
      keys: KEYS,
      value: 1.5,
    });
    expect(letterSpacingOp(P, '', '-0.5')).toEqual({
      op: 'setScalar',
      path: P,
      keys: KEYS,
      value: -0.5,
    });
    expect(letterSpacingOp(P, '', '-0')).toEqual({
      op: 'setScalar',
      path: P,
      keys: KEYS,
      value: 0,
    });
    for (const unit of ['0.1em', '1mm', '2pt', '0.5rem', '-1cm', '0.1in']) {
      expect(letterSpacingOp(P, '', unit)).toEqual({
        op: 'setScalar',
        path: P,
        keys: KEYS,
        value: unit,
      });
    }
  });

  it('clears an own value on empty, and authors nothing over none', () => {
    expect(letterSpacingOp(P, '2', ' ')).toEqual({ op: 'removeKey', path: P, keys: KEYS });
    expect(letterSpacingOp(P, '', '')).toBeNull();
  });

  it('refuses a percentage (a parse error), garbage, and past the engine bound', () => {
    for (const bad of [
      '10%',
      'wide',
      '1e2',
      String(MAX_LETTER_SPACING_PT + 1),
      '-1001',
      '1'.repeat(17),
    ]) {
      expect(letterSpacingOp(P, '', bad)).toBeNull();
    }
    expect(letterSpacingOp(P, '', String(MAX_LETTER_SPACING_PT))).not.toBeNull();
  });
});

describe('opacity', () => {
  it('shows the alpha as a percentage, or the raw text it cannot convert', () => {
    expect(opacityPercent('')).toBe('');
    expect(opacityPercent('0.5')).toBe('50');
    expect(opacityPercent('0.333')).toBe('33.3');
    expect(opacityPercent('1')).toBe('100');
    expect(opacityPercent('half')).toBe('half');
  });

  it('authors the alpha from a percentage, clamped, with or without the sign', () => {
    const keys = ['style', 'opacity'];
    expect(opacityOp(P, '', '40')).toEqual({ op: 'setScalar', path: P, keys, value: 0.4 });
    expect(opacityOp(P, '', '12.5%')).toEqual({ op: 'setScalar', path: P, keys, value: 0.125 });
    expect(opacityOp(P, '', '150')).toEqual({ op: 'setScalar', path: P, keys, value: 1 });
    expect(opacityOp(P, '', '-20')).toEqual({ op: 'setScalar', path: P, keys, value: 0 });
    expect(opacityOp(P, '0.4', '')).toEqual({ op: 'removeKey', path: P, keys });
  });

  it('authors nothing unchanged, empty over unset, or not a number', () => {
    expect(opacityOp(P, '0.4', '40')).toBeNull();
    expect(opacityOp(P, '', '')).toBeNull();
    for (const bad of ['abc', '1e1', '%', 'NaN', 'Infinity', '-Infinity', '9'.repeat(17)]) {
      expect(opacityOp(P, '', bad)).toBeNull();
    }
  });

  it('steps ten points, clamped, starting from fully opaque when unset', () => {
    expect(steppedOpacity('', -1)).toBe('90');
    expect(steppedOpacity('', 1)).toBeNull();
    expect(steppedOpacity('95', 1)).toBe('100');
    expect(steppedOpacity('5', -1)).toBe('0');
    expect(steppedOpacity('0', -1)).toBeNull();
    expect(steppedOpacity('half', 1)).toBeNull();
  });
});

describe('the ▲▼ ops', () => {
  it('steps letter spacing by half a point from 0, keeping a unit, and not a relative one', () => {
    expect(letterSpacingStepOp(P, '', '', 1)).toEqual({
      op: 'setScalar',
      path: P,
      keys: KEYS,
      value: 0.5,
    });
    expect(letterSpacingStepOp(P, '1', '1', -1)).toEqual({
      op: 'setScalar',
      path: P,
      keys: KEYS,
      value: 0.5,
    });
    expect(letterSpacingStepOp(P, '0.1em', '0.1em', 1)).toBeNull();
  });

  it('steps opacity through the same commit rules, and not past a bound', () => {
    expect(opacityStepOp(P, '0.5', '50', -1)).toEqual({
      op: 'setScalar',
      path: P,
      keys: ['style', 'opacity'],
      value: 0.4,
    });
    expect(opacityStepOp(P, '', '', 1)).toBeNull();
  });
});

describe('decorationToggleOp', () => {
  const eff = (own: string, cascade = ''): EffectiveValue => ({
    value: own === '' ? cascade : own,
    cascade,
    own,
    origin: own === '' ? (cascade === '' ? 'unset' : 'style') : 'own',
    styleName: '',
  });
  const keys = ['style', 'textDecoration'];
  const set = (value: string) => ({ op: 'setScalar', path: P, keys, value });

  it('adds a line beside the other, and takes one of two away', () => {
    expect(decorationToggleOp(P, eff('underline'), 'line_through', true)).toEqual(
      set('underline line_through'),
    );
    expect(decorationToggleOp(P, eff('underline line_through'), 'underline', true)).toEqual(
      set('line_through'),
    );
    expect(decorationToggleOp(P, eff(''), 'underline', true)).toEqual(set('underline'));
  });

  it('removes the own key when the cascade gives the result anyway', () => {
    expect(decorationToggleOp(P, eff('underline'), 'underline', true)).toEqual({
      op: 'removeKey',
      path: P,
      keys,
    });
    expect(decorationToggleOp(P, eff('', 'underline'), 'line_through', true)).toEqual(
      set('underline line_through'),
    );
  });

  it('writes none to switch off a line only a named style supplies', () => {
    expect(decorationToggleOp(P, eff('', 'underline'), 'underline', true)).toEqual(set('none'));
  });

  it('drops the other line against a one-line engine, and reads an own none', () => {
    expect(decorationToggleOp(P, eff('', 'underline line_through'), 'underline', false)).toEqual(
      set('line_through'),
    );
    expect(decorationToggleOp(P, eff('none', ''), 'underline', true)).toEqual(set('underline'));
  });

  it('keeps the lines exclusive when the engine takes one at a time', () => {
    expect(decorationToggleOp(P, eff('underline'), 'line_through', false)).toEqual(
      set('line_through'),
    );
    expect(decorationToggleOp(P, eff('line_through'), 'line_through', false)).toEqual({
      op: 'removeKey',
      path: P,
      keys,
    });
  });
});
