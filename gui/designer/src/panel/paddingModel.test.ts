// Tests for paddingModel.ts — one all-sides padding over the wire's two forms,
// under the page margin's uniform ingress rule.
import { describe, expect, it } from 'vitest';
import { paddingOps, readPadding, stepPaddingOps } from './paddingModel';

const P = 'sections.body.items[0].cell';

describe('readPadding', () => {
  it('reads unset, a uniform number, a per-side map, and anything else', () => {
    expect(readPadding({})).toEqual({ mode: 'none', text: '' });
    expect(readPadding({ box: {} })).toEqual({ mode: 'none', text: '' });
    expect(readPadding({ box: { padding: 8 } })).toEqual({ mode: 'uniform', text: '8' });
    expect(readPadding({ box: { padding: 0 } })).toEqual({ mode: 'uniform', text: '0' });
    expect(readPadding({ box: { padding: { top: 4 } } })).toEqual({ mode: 'perSide', text: '' });
    // A map is only "per side" when the sides DIFFER — an unset side being 0.
    const same = { top: 8, right: 8, bottom: 8, left: 8 };
    expect(readPadding({ box: { padding: same } })).toEqual({ mode: 'uniform', text: '8' });
    expect(readPadding({ box: { padding: { top: 0 } } })).toEqual({ mode: 'uniform', text: '0' });
    // Four equal unit strings are one value the field cannot show.
    const mm = { top: '2mm', right: '2mm', bottom: '2mm', left: '2mm' };
    expect(readPadding({ box: { padding: mm } })).toEqual({ mode: 'other', text: '' });
    for (const other of ['4mm', -2, Number.NaN, [1, 2]]) {
      expect(readPadding({ box: { padding: other } })).toEqual({ mode: 'other', text: '' });
    }
  });

  it('reads a hostile node as unset', () => {
    expect(readPadding(undefined)).toEqual({ mode: 'none', text: '' });
    expect(readPadding('text')).toEqual({ mode: 'none', text: '' });
    expect(readPadding({ box: 'not a map' })).toEqual({ mode: 'none', text: '' });
  });
});

describe('paddingOps', () => {
  const uniform = readPadding({ box: { padding: 8 } });
  const none = readPadding({});

  it('sets a bare numeral as every side, replacing a per-side map', () => {
    expect(paddingOps(P, uniform, ' 6 ')).toEqual([
      { op: 'setScalar', path: P, keys: ['box', 'padding'], value: 6 },
    ]);
    expect(paddingOps(P, readPadding({ box: { padding: { top: 4 } } }), '2.5')).toEqual([
      { op: 'setScalar', path: P, keys: ['box', 'padding'], value: 2.5 },
    ]);
  });

  it('clears an authored padding on an empty entry, and is no edit when there is none', () => {
    expect(paddingOps(P, uniform, '')).toEqual([
      { op: 'removeKey', path: P, keys: ['box', 'padding'] },
    ]);
    expect(paddingOps(P, none, '  ')).toBeNull();
  });

  it('refuses a sign, a unit, or garbage', () => {
    for (const bad of ['-1', '4mm', 'abc', '1e3', '.5']) {
      expect(paddingOps(P, uniform, bad)).toBeNull();
    }
  });
});

describe('stepPaddingOps', () => {
  it('steps a uniform value by a point', () => {
    expect(stepPaddingOps(P, readPadding({ box: { padding: 8 } }), 1)).toEqual([
      { op: 'setScalar', path: P, keys: ['box', 'padding'], value: 9 },
    ]);
  });

  it('clamps at 0 and dispatches nothing at the floor', () => {
    expect(stepPaddingOps(P, readPadding({ box: { padding: 0.5 } }), -1)).toEqual([
      { op: 'setScalar', path: P, keys: ['box', 'padding'], value: 0 },
    ]);
    expect(stepPaddingOps(P, readPadding({ box: { padding: 0 } }), -1)).toBeNull();
  });

  it('steps an unset padding from the 0 it means, and not below it', () => {
    // Clearing the field lands here, so its own ▲▼ must still work.
    expect(stepPaddingOps(P, readPadding({}), 1)).toEqual([
      { op: 'setScalar', path: P, keys: ['box', 'padding'], value: 1 },
    ]);
    expect(stepPaddingOps(P, readPadding({}), -1)).toBeNull();
  });

  it('does not step what the field does not show, nor a value past the plateau', () => {
    expect(stepPaddingOps(P, readPadding({ box: { padding: { top: 4 } } }), 1)).toBeNull();
    // 1e21 prints as `1e+21`; one point does not move it.
    expect(stepPaddingOps(P, readPadding({ box: { padding: 1e21 } }), 1)).toBeNull();
  });
});
