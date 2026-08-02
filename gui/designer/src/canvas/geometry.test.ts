import { describe, expect, it } from 'vitest';
import { scaleRect } from './geometry';

describe('scaleRect', () => {
  it('scales every component by the scale factor', () => {
    expect(scaleRect({ x: 1, y: 2, w: 3, h: 4 }, 2)).toEqual({ x: 2, y: 4, w: 6, h: 8 });
  });
});
