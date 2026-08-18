import { describe, expect, it } from 'vitest';
import { chipRing, isHexColor, relativeLuminance } from './chipContrast';

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
    // The unset chip is painted in a token and already follows the theme; a
    // hostile string must reach no inline style at all.
    for (const bad of ['', 'red', 'url(javascript:alert(1))', '#abc']) {
      expect(chipRing(bad)).toBeUndefined();
    }
  });
});
