import { describe, expect, it } from 'vitest';
import { SWATCHES } from './ColorSwatchPicker';
import { namedSwatches, swatchName } from './swatchNames';

/** The identity translator: these cases are about WHICH key is chosen, not
 * about the catalog's wording. */
const key = (k: string) => k;

describe('swatchName', () => {
  it('names every curated palette entry', () => {
    const expected: Record<string, string> = {
      '#000000': 'color.black',
      '#374151': 'color.grayDark',
      '#6b7280': 'color.gray',
      '#9ca3af': 'color.grayLight',
      '#d1d5db': 'color.grayPale',
      '#ffffff': 'color.white',
      '#b91c1c': 'color.red',
      '#c2410c': 'color.orange',
      '#b45309': 'color.amber',
      '#15803d': 'color.green',
      '#1d4ed8': 'color.blue',
      '#6d28d9': 'color.purple',
    };
    for (const [hex, expectedKey] of Object.entries(expected)) {
      expect(swatchName(hex, key), hex).toBe(expectedKey);
    }
  });

  it('keeps an unnamed value as itself', () => {
    // The native custom picker emits arbitrary hexes, and a document can carry
    // any string at all; the only honest name for one is the value.
    expect(swatchName('#123456', key)).toBe('#123456');
    expect(swatchName('', key)).toBe('');
  });

  it('does not resolve a prototype name to an inherited value', () => {
    // The lookup key can arrive from a document, so the table is a real `Map`.
    for (const hostile of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      expect(swatchName(hostile, key), hostile).toBe(hostile);
    }
  });
});

describe('the palette and its names (drift guard)', () => {
  it('names exactly the swatches the picker offers', () => {
    // A swatch added to the picker without a name here would silently announce
    // its raw hex again — the defect this module exists to close.
    expect([...namedSwatches()].sort()).toEqual([...SWATCHES].sort());
  });
});
