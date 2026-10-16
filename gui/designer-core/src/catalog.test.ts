import { describe, expect, it } from 'vitest';
import {
  itemInitialOverrides,
  itemStyleKeys,
  spanStyleKeys,
  styleKeyFacts,
  styleKeys,
} from './catalog';

// Over the REAL committed catalog: these are the engine's facts, so each
// expectation below is one the engine's own tables state.
describe('the key catalog reads', () => {
  it('lists every Style key, with its initial value, inheritance and bounds', () => {
    expect(styleKeys()).toContain('fontSize');
    expect(styleKeys()).toContain('textCombineUpright');
    expect(styleKeyFacts('fontSize')).toEqual({
      initial: 10,
      inherited: true,
      minimum: undefined,
      exclusiveMinimum: 0,
      maximum: 1000,
    });
    expect(styleKeyFacts('backgroundColor')).toEqual({
      initial: undefined,
      inherited: false,
      minimum: undefined,
      exclusiveMinimum: undefined,
      maximum: undefined,
    });
    expect(styleKeyFacts('borderWidth')?.minimum).toBe(0);
    // A key the engine does not take, and one only an object prototype has.
    expect(styleKeyFacts('fillColor')).toBeUndefined();
    expect(styleKeyFacts('toString')).toBeUndefined();
  });

  it('lists the style keys each item type takes', () => {
    expect(itemStyleKeys('ellipse')).toEqual([
      'backgroundColor',
      'borderWidth',
      'borderColor',
      'opacity',
    ]);
    expect(itemStyleKeys('char_grid')).toContain('textAlign');
    // A line strokes with its own shape; an unknown type takes nothing.
    expect(itemStyleKeys('line')).toEqual([]);
    expect(itemStyleKeys('nope')).toEqual([]);
    expect(spanStyleKeys()).toContain('textCombineUpright');
    expect(spanStyleKeys()).not.toContain('lineHeight');
  });

  it('names where an item starts a key elsewhere', () => {
    expect(itemInitialOverrides('table')).toEqual({ borderWidth: 0.5, verticalAlign: 'middle' });
    expect(itemInitialOverrides('char_grid')).toEqual({ borderWidth: 0.5, fontSize: null });
    expect(itemInitialOverrides('text')).toEqual({});
    expect(itemInitialOverrides('nope')).toEqual({});
  });
});
