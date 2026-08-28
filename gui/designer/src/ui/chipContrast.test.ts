import { describe, expect, it } from 'vitest';
import { chipPaint, chipRing, isHexColor, relativeLuminance } from './chipContrast';

const DARK_RING = 'inset 0 0 0 1px rgba(0, 0, 0, 0.45)';
const LIGHT_RING = 'inset 0 0 0 1px rgba(255, 255, 255, 0.55)';

describe('isHexColor', () => {
  it('accepts a 6-digit hex in either case', () => {
    expect(isHexColor('#1a2b3c')).toBe(true);
    expect(isHexColor('#ABCDEF')).toBe(true);
  });

  it('rejects everything else, including the shapes a hostile document carries', () => {
    for (const bad of [
      '',
      '#abc',
      '#1234567',
      'red',
      'url(javascript:alert(1))',
      'expression(1)',
      '#ffffff;background:url(x)',
    ]) {
      expect(isHexColor(bad)).toBe(false);
    }
  });
});

describe('relativeLuminance', () => {
  it('spans black to white', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 10);
  });

  it('linearizes the low channels through the WCAG kink, not by squaring', () => {
    // `#050505` sits under the 0.03928 breakpoint, where the linear branch
    // applies — a straight power curve would give a different value.
    expect(relativeLuminance('#050505')).toBeCloseTo(0.0015, 4);
  });
});

describe('chipRing', () => {
  it('gives a light colour the dark ring, so white reads on the light chrome', () => {
    // `#ededed` is the table header default and was the colour that vanished
    // into the panel's white swatch trigger.
    for (const light of ['#ffffff', '#ededed', '#f6f8fa', '#9ca3af']) {
      expect(chipRing(light)).toBe(DARK_RING);
    }
  });

  it('gives a dark colour the light ring, so black reads on the dark chrome', () => {
    for (const dark of ['#000000', '#374151', '#6b7280', '#b91c1c']) {
      expect(chipRing(dark)).toBe(LIGHT_RING);
    }
  });

  it('switches sides across the threshold, not somewhere near it', () => {
    // Either side of 0.35 relative luminance: the rule is a real boundary, so a
    // future tweak to the constant fails here rather than drifting silently.
    expect(relativeLuminance('#9f9f9f')).toBeLessThan(0.35);
    expect(chipRing('#9f9f9f')).toBe(LIGHT_RING);
    expect(relativeLuminance('#a1a1a1')).toBeGreaterThan(0.35);
    expect(chipRing('#a1a1a1')).toBe(DARK_RING);
  });

  it('gives no ring to anything that is not a colour', () => {
    // Such a value has no luminance to derive a ring from — `chipPaint` gives it
    // the unset treatment instead. A hostile string must reach no inline colour.
    for (const bad of ['', 'red', 'url(javascript:alert(1))', '#abc']) {
      expect(chipRing(bad)).toBeUndefined();
    }
  });
});

/** WCAG 2.x contrast between two validated `#rrggbb` values. Written here rather
 * than imported because it exists to CHECK the module's constants, not to share
 * their arithmetic — a bug copied into both would cancel out. */
function contrast(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `rgba(grey, alpha)` composited over an opaque backdrop, as `#rrggbb`. The unset
 * ring is drawn at 0.9 alpha, so measuring the opaque grey would score a colour no
 * pixel ever shows — and would score it ~0.4 too high on the dark surface. */
function over(grey: number, alpha: number, backdrop: string): string {
  const mix = (at: number) =>
    Math.round(alpha * grey + (1 - alpha) * Number.parseInt(backdrop.slice(at, at + 2), 16));
  return `#${[1, 3, 5].map((at) => mix(at).toString(16).padStart(2, '0')).join('')}`;
}

describe('chipPaint', () => {
  // The two surfaces a chip is actually painted on, from `theme/tokens.ts`.
  const DARK_SURFACE = '#2e2b27';
  const LIGHT_SURFACE = '#ffffff';

  it('paints a colour as itself, with the ring that keeps it visible', () => {
    expect(chipPaint('#b91c1c')).toEqual({
      backgroundColor: '#b91c1c',
      boxShadow: LIGHT_RING,
    });
    expect(chipPaint('#ffffff')).toEqual({
      backgroundColor: '#ffffff',
      boxShadow: DARK_RING,
    });
  });

  it('never lets a colour be painted without an outline', () => {
    // The hazard the single call replaces: a site that narrowed the fill with one
    // guard and looked the ring up with another could paint a chip and leave it
    // un-outlined if the two ever disagreed.
    for (const colour of ['#000000', '#ffffff', '#374151', '#d1d5db', '#6d28d9']) {
      const paint = chipPaint(colour);
      expect(paint.backgroundColor).toBe(colour);
      expect(paint.boxShadow).not.toBeUndefined();
    }
  });

  it('gives a value that is not a colour the unset treatment, never an inline colour', () => {
    // '' is the unset field — the state every colour field starts in, and what a
    // scalar-or-map wire value reads as. The rest are what a hostile template
    // carries; none may reach `backgroundColor`.
    for (const bad of ['', 'red', 'url(javascript:alert(1))', 'expression(1)', '#abc']) {
      const paint = chipPaint(bad);
      expect(paint.backgroundColor).toBeUndefined();
      expect(paint.backgroundImage).toContain('linear-gradient');
      expect(paint.backgroundPosition).toBe('0 0, 3px 3px');
      expect(paint.boxShadow).toBe('inset 0 0 0 1px rgba(128, 128, 128, 0.9)');
    }
  });

  it('draws the unset fill as an offset PAIR of tiles, or it is not a checkerboard', () => {
    // One gradient alone is diagonal stripes. The offset second copy is what makes
    // the squares read as "no colour here" rather than as a pattern fill.
    const { backgroundImage, backgroundSize, backgroundPosition } = chipPaint('');
    const tiles = backgroundImage?.split('), linear-gradient(') ?? [];
    expect(tiles.length).toBe(2);
    expect(backgroundSize).toBe('6px 6px');
    // Second tile offset by half the tile, on both axes.
    expect(backgroundPosition).toBe('0 0, 3px 3px');
  });

  it('outlines the unset chip against BOTH surfaces, which the token border did not', () => {
    // The defect this replaces: on the dark surface the old fill (`bg-bg`) and the
    // old token border were both ~1.18, i.e. invisible.
    expect(contrast('#201e1b', DARK_SURFACE)).toBeLessThan(1.2);
    expect(contrast('#3b372f', DARK_SURFACE)).toBeLessThan(1.2);

    // The unset ring AS COMPOSITED — the value a pixel actually shows — clears the
    // 3:1 WCAG non-text bar on both surfaces, which is why it needs no theme
    // branch. Measured at the shipped alpha, so raising it is not free: the dark
    // side is the tighter of the two and has ~0.19 of margin, not the ~0.57 the
    // opaque grey would suggest.
    const ringOnDark = over(128, 0.9, DARK_SURFACE);
    const ringOnLight = over(128, 0.9, LIGHT_SURFACE);
    expect(contrast(ringOnDark, DARK_SURFACE)).toBeGreaterThan(3);
    expect(contrast(ringOnLight, LIGHT_SURFACE)).toBeGreaterThan(3);

    // The chequerboard squares are a SHAPE cue, not a contrast one — they do not
    // clear the bar on their own, and stating that here stops a later reader from
    // treating them as the thing that carries the fix.
    expect(contrast(over(128, 0.5, DARK_SURFACE), DARK_SURFACE)).toBeLessThan(3);
  });

  it('states the ring alpha the contrast case is measured at, so the two cannot drift', () => {
    // The case above composites 0.9 by hand. If the constant's alpha changes, this
    // fails and sends the next reader to the arithmetic rather than leaving it
    // silently measuring a colour that is no longer shipped.
    expect(chipPaint('').boxShadow).toContain('rgba(128, 128, 128, 0.9)');
  });
});
