import { describe, expect, it } from 'vitest';
import { clip, pathLabel } from './opTypes';

// The GUI half of the engine's bounded-echo rule. Op errors quote the path
// or key the caller supplied, and that text comes from a document — so this
// side has to strip and clip exactly as `shojiku_diagnostics::sanitize` does.

describe('clip', () => {
  it('leaves an ordinary path untouched and unmarked', () => {
    expect(clip('sections.body.items[3]')).toBe('sections.body.items[3]');
  });

  it('clips past 200 characters and marks the cut', () => {
    const out = clip('k'.repeat(300));
    expect(Array.from(out)).toHaveLength(201);
    expect(out.endsWith('…')).toBe(true);
  });

  it('leaves a value of exactly the cap unmarked', () => {
    const atCap = 'y'.repeat(200);
    expect(clip(atCap)).toBe(atCap);
  });

  it('strips control characters so an echo cannot repaint a terminal', () => {
    expect(clip('bad[2Jvalue')).toBe('bad[2Jvalue');
    expect(clip('one\ntwo')).toBe('onetwo');
  });

  it('strips bidirectional overrides, which reorder the display', () => {
    // The "Trojan Source" family: not control characters, so a plain
    // control-strip misses them, yet they change what the reader SEES.
    for (const bad of ['‮', '‭', '‪', '⁦', '⁩', '‎', '‏', '؜']) {
      expect(clip(`safe${bad}evil`)).toBe('safeevil');
    }
  });

  it('keeps the zero-width joiners, which carry meaning in real text', () => {
    const real = 'क‍ष‌x';
    expect(clip(real)).toBe(real);
  });

  it('counts code points, so an astral run is never cut mid-pair', () => {
    // 300 emoji are 600 UTF-16 units. A `slice(0, 200)` would keep 200
    // units — 100 emoji — and could split the 200th pair into a lone
    // surrogate. Counting code points keeps 200 whole characters.
    const out = clip('😀'.repeat(300));
    const points = Array.from(out);
    expect(points).toHaveLength(201);
    expect(points.slice(0, 200).every((c) => c === '😀')).toBe(true);
    expect(out).not.toContain('�');
  });
});

describe('pathLabel', () => {
  it('names the document root when the op omitted a path', () => {
    expect(pathLabel(undefined)).toBe('document root');
  });

  it('clips a hostile path like any other echo', () => {
    const label = pathLabel(`‮${'p'.repeat(300)}`);
    expect(label).not.toContain('‮');
    expect(Array.from(label)).toHaveLength(201);
  });
});
