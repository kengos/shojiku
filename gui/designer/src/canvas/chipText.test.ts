// The shared chip measure, and the cut it makes for the one chip whose text is
// not ours to shorten.

import { describe, expect, it } from 'vitest';
import { chipSafeText, chipWidth, fitChipText } from './chipText';

const FONT = 11;
const PAD = 8;

describe('chipWidth', () => {
  it('measures a CJK glyph at a full em and everything else at 0.55', () => {
    // 0.55 × 11 = 6.05, so four ASCII chars round UP to 25 — the ceil is what
    // keeps a chip from clipping the tail of its own text.
    expect(chipWidth('abcd', FONT, 0)).toBe(25);
    expect(chipWidth('日本語', FONT, 0)).toBe(33);
  });

  it('adds the padding on BOTH sides', () => {
    expect(chipWidth('abcd', FONT, PAD)).toBe(25 + PAD * 2);
  });

  it('is the padding alone for an empty label', () => {
    expect(chipWidth('', FONT, PAD)).toBe(PAD * 2);
  });
});

describe('chipSafeText', () => {
  it('drops the override that could make a URL read as another host', () => {
    // U+202E reorders what follows it, so `…/\u202Emoc.live` paints as
    // `evil.com/…`. The engine refuses control characters in a link and the
    // panel mirrors that; neither set covers `\p{Cf}`, so such a URL is
    // stamped `linked` and reaches this chip.
    expect(chipSafeText('https://good.test/\u202Emoc.live')).toBe('https://good.test/moc.live');
    expect(chipSafeText('https://good.test/\u200Bzero')).toBe('https://good.test/zero');
  });

  it('leaves an ordinary destination alone', () => {
    expect(chipSafeText('https://example.com/a?b=1#c')).toBe('https://example.com/a?b=1#c');
    expect(chipSafeText('https://例え.テスト/商品')).toBe('https://例え.テスト/商品');
  });
});

describe('fitChipText', () => {
  it('returns the text untouched when the chip already fits', () => {
    const text = 'https://example.com';
    expect(fitChipText(text, FONT, PAD, 1000)).toBe(text);
  });

  it('cuts to an ellipsis, and what it returns actually fits', () => {
    const cut = fitChipText('https://example.com/a/very/long/path', FONT, PAD, 120);
    expect(cut.endsWith('…')).toBe(true);
    expect(cut.length).toBeLessThan('https://example.com/a/very/long/path'.length);
    // The load-bearing half: the point of the cut is the width, not the shape.
    expect(chipWidth(cut, FONT, PAD)).toBeLessThanOrEqual(120);
  });

  it('never splits an astral character into replacement glyphs', () => {
    // `[...text]` walks code POINTS; a `slice` over UTF-16 units would cut a
    // surrogate pair in half and paint the halves as tofu.
    const cut = fitChipText('https://x.test/🧭🧭🧭🧭🧭🧭🧭🧭🧭🧭', FONT, PAD, 90);
    expect(cut).not.toMatch(/[\uD800-\uDFFF]/u);
  });

  it('degrades to the ellipsis alone rather than to nothing', () => {
    // A maxWidth too small for even one character is a degenerate page; a mark
    // the reader can see is truncated beats an empty chip.
    expect(fitChipText('https://example.com', FONT, PAD, 1)).toBe('…');
  });
});
