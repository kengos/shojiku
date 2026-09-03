// The uniform-border rule shared by a `char_grid`'s ruling and the two form
// marks' outlines. Its whole job is to read the way the ENGINE reads: a
// per-side map collapses to its top side, and the item's own key wins by
// PRESENCE rather than by displaying as something.

import { describe, expect, it } from 'vitest';
import { resolveUniform, topSide } from './uniformBorder';

describe('topSide', () => {
  it('takes a scalar outright', () => {
    expect(topSide(2)).toBe('2');
    expect(topSide('#c00')).toBe('#c00');
  });

  it('takes a map’s TOP side, which is all the engine reads', () => {
    expect(topSide({ top: 3, bottom: 9 })).toBe('3');
  });

  it('reads a map with no top as unset — which is what it draws', () => {
    expect(topSide({ bottom: 9 })).toBe('');
  });

  it('reads anything undisplayable as unset', () => {
    expect(topSide(undefined)).toBe('');
    expect(topSide(null)).toBe('');
    expect(topSide([1])).toBe('');
  });
});

describe('resolveUniform', () => {
  it('takes the item’s own value and names no style', () => {
    expect(resolveUniform({ style: { borderWidth: 2 } }, {}, 'borderWidth')).toEqual({
      value: '2',
      styleName: null,
    });
  });

  it('falls through to the LAST named style that carries the key', () => {
    expect(
      resolveUniform(
        { styleNames: ['a', 'b'] },
        { a: { borderWidth: 1 }, b: { borderWidth: 4 } },
        'borderWidth',
      ),
    ).toEqual({ value: '4', styleName: 'b' });
  });

  it('lets an own key of ANY shape win, even one that displays as nothing', () => {
    // `authored()` ends `pick(&item.style).or(found)`. An own per-side map with
    // no top draws NOTHING; reporting the style's 2 would make the panel
    // contradict the canvas.
    expect(
      resolveUniform(
        { styleNames: ['s'], style: { borderWidth: { bottom: 1 } } },
        { s: { borderWidth: 2 } },
        'borderWidth',
      ),
    ).toEqual({ value: '', styleName: null });
  });

  it('reports unset when nothing authors the key', () => {
    expect(resolveUniform({}, {}, 'borderColor')).toEqual({ value: '', styleName: null });
  });

  it('leaves a hostile registry NAME inert', () => {
    expect(resolveUniform({ styleNames: ['__proto__'] }, {}, 'borderWidth')).toEqual({
      value: '',
      styleName: null,
    });
  });
});
