import { describe, expect, it } from 'vitest';
import { DEFAULT_CATALOG } from '../i18n/catalog';
import { relativeLuminance } from './chipContrast';
import { swatchName } from './swatchNames';
import { BASE_STEP, HUE_COLUMNS, NEUTRALS, paletteSwatches, SHADE_STEPS } from './swatchPalette';

/** The identity translator: most cases are about WHICH key is chosen, not about the
 * catalog's wording. Interpolation args are appended so a case can still see that
 * the step reached the catalog rather than being pasted into the key. */
const key = (k: string, args?: Record<string, string | number | boolean>) =>
  args === undefined
    ? k
    : `${k}(${Object.entries(args)
        .map(([n, v]) => `${n}=${v}`)
        .join(',')})`;

describe('swatchName', () => {
  it('names a neutral outright, with no darkness step', () => {
    // "Black" is what a reader calls it; "gray, shade 1 of 5" would be a worse
    // name, not a cheaper one.
    expect(swatchName('#000000', key)).toBe('color.black');
    expect(swatchName('#ffffff', key)).toBe('color.white');
    expect(swatchName('#6b7280', key)).toBe('color.gray');
  });

  it('names a hue by its column AND its darkness step', () => {
    // The step is what distinguishes the five swatches in a column; without it
    // every red in the grid would announce the same name.
    expect(swatchName('#fecaca', key)).toBe('color.shade(color=color.red,step=1,of=5)');
    expect(swatchName('#b91c1c', key)).toBe('color.shade(color=color.red,step=4,of=5)');
    expect(swatchName('#7f1d1d', key)).toBe('color.shade(color=color.red,step=5,of=5)');
    expect(swatchName('#1e3a8a', key)).toBe('color.shade(color=color.blue,step=5,of=5)');
  });

  it('passes the step as an ARG, so a locale orders the words itself', () => {
    // Pasting the step onto the key would make the word order English's.
    expect(swatchName('#4ade80', key)).toContain('step=2');
    expect(swatchName('#4ade80', key)).toContain('color=color.green');
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
  it('gives every swatch in the palette a name that is not its own hex', () => {
    // The rule replaced a hand-written per-hex map, so the guard is no longer
    // "the map lists the palette" — it is that the RULE reaches every swatch. A
    // colour the rule misses falls through to its raw hex, which is the exact
    // defect this module exists to close.
    const swatches = paletteSwatches();
    expect(swatches.length).toBe(NEUTRALS.length + HUE_COLUMNS.length * SHADE_STEPS);
    for (const hex of swatches) {
      expect(swatchName(hex, key), hex).not.toBe(hex);
    }
  });

  it('carries no duplicate swatch, which would make one position unreachable', () => {
    const swatches = paletteSwatches();
    expect(new Set(swatches).size).toBe(swatches.length);
  });

  it('every hue column carries the same number of steps', () => {
    // The grid renders one row per step across all columns; a short column would
    // silently shift every swatch below it into the wrong row.
    for (const column of HUE_COLUMNS) {
      expect(column.shades.length, column.nameKey).toBe(SHADE_STEPS);
    }
  });

  it('orders every hue column lightest to darkest, which is what the row labels claim', () => {
    // "A row is a darkness step" is the load-bearing accessibility claim — it is
    // how a reader who cannot see the colours navigates. It is also the one
    // property of this table a future edit could break in silence: nothing else
    // here reads luminance, so a swapped pair would keep every count intact.
    for (const column of HUE_COLUMNS) {
      const luminances = column.shades.map(relativeLuminance);
      for (let i = 1; i < luminances.length; i++) {
        expect(luminances[i], `${column.nameKey} step ${i + 1} vs ${i}`).toBeLessThan(
          luminances[i - 1],
        );
      }
    }
  });

  it('contains the flat palette it replaced, so no authored colour disappeared', () => {
    // The six neutrals are the neutral row and the six hues are the BASE_STEP row.
    // A template that authored one of these keeps finding it in the picker.
    const previous = [
      '#000000',
      '#374151',
      '#6b7280',
      '#9ca3af',
      '#d1d5db',
      '#ffffff',
      '#b91c1c',
      '#c2410c',
      '#b45309',
      '#15803d',
      '#1d4ed8',
      '#6d28d9',
    ];
    const current = new Set(paletteSwatches());
    for (const hex of previous) {
      expect(current.has(hex), hex).toBe(true);
    }
    for (const [index, column] of HUE_COLUMNS.entries()) {
      expect(column.shades[BASE_STEP - 1], column.nameKey).toBe(previous[NEUTRALS.length + index]);
    }
  });

  it('resolves every name key it can emit in EVERY language', () => {
    // A derived name is only cheap because the hue keys already existed; a missing
    // one would fall back through the chain to English and read as a bug in one
    // locale only.
    const keys = [...NEUTRALS, ...HUE_COLUMNS]
      .map((column) => column.nameKey)
      .concat('color.shade');
    for (const [language, catalog] of Object.entries(DEFAULT_CATALOG)) {
      for (const k of keys) {
        expect(Object.hasOwn(catalog.chrome, k), `${language}: ${k}`).toBe(true);
      }
    }
  });
});
