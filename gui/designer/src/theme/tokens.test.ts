// The token sets are the default theme's data contract: both schemes carry the
// same keys, the var-name list is the public CSS contract, and every
// foreground/background pairing meets WCAG AA contrast (so a future value
// tweak that quietly breaks legibility reds this suite, not a user's eyes).

import { describe, expect, it } from 'vitest';
import { safeTokenValue } from './resolve';
import { DARK_THEME, LIGHT_THEME, type ThemeTokens, TOKEN_NAMES, TOKEN_VARS } from './tokens';

// WCAG relative luminance + contrast ratio (test-side helper — production code
// never computes contrast; the tokens are data).
function channel(hex: string, at: number): number {
  const c = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(color: string): number {
  expect(color).toMatch(/^#[0-9a-f]{6}$/);
  return 0.2126 * channel(color, 1) + 0.7152 * channel(color, 3) + 0.0722 * channel(color, 5);
}

function contrast(fg: string, bg: string): number {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// The pairings the chrome actually renders: text on each ground it sits on.
const AA_PAIRS: readonly (readonly [keyof ThemeTokens, keyof ThemeTokens])[] = [
  ['text', 'bg'],
  ['text', 'chrome'],
  ['text', 'surface'],
  ['muted', 'bg'],
  ['muted', 'chrome'],
  ['muted', 'surface'],
  ['accent', 'bg'],
  ['onAccent', 'accent'],
  ['warnText', 'warnBg'],
  ['errorText', 'errorBg'],
  // The diff review's added/removed rows, and the summary counts painted on the
  // surface ground.
  ['diffAddText', 'diffAddBg'],
  ['diffDelText', 'diffDelBg'],
  ['diffAddText', 'surface'],
  ['diffDelText', 'surface'],
];

describe('theme token sets', () => {
  it('light and dark carry the identical key set', () => {
    expect(Object.keys(DARK_THEME).sort()).toEqual(Object.keys(LIGHT_THEME).sort());
  });

  it('TOKEN_VARS covers every token exactly once', () => {
    expect([...TOKEN_NAMES].sort()).toEqual(Object.keys(LIGHT_THEME).sort());
    const vars = Object.values(TOKEN_VARS);
    expect(new Set(vars).size).toBe(vars.length);
  });

  it('pins the public CSS custom-property contract', () => {
    expect(Object.values(TOKEN_VARS).sort()).toEqual(
      [
        '--sj-bg',
        '--sj-chrome',
        '--sj-surface',
        '--sj-border',
        '--sj-text',
        '--sj-muted',
        '--sj-accent',
        '--sj-on-accent',
        '--sj-focus',
        '--sj-canvas',
        '--sj-paper-shadow',
        '--sj-warn-bg',
        '--sj-warn-text',
        '--sj-error-bg',
        '--sj-error-text',
        '--sj-diff-add-bg',
        '--sj-diff-add-text',
        '--sj-diff-del-bg',
        '--sj-diff-del-text',
        '--sj-font-family',
        '--sj-font-size',
        '--sj-space-1',
        '--sj-space-2',
        '--sj-space-3',
        '--sj-space-4',
        '--sj-space-5',
        '--sj-radius',
      ].sort(),
    );
  });

  it.each([
    ['light', LIGHT_THEME],
    ['dark', DARK_THEME],
  ] as const)('%s scheme meets WCAG AA on every rendered pairing', (_scheme, theme) => {
    for (const [fg, bg] of AA_PAIRS) {
      expect(contrast(theme[fg], theme[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each([
    ['light', LIGHT_THEME],
    ['dark', DARK_THEME],
  ] as const)('every %s built-in value passes the override value guard', (_scheme, theme) => {
    for (const name of TOKEN_NAMES) {
      expect(safeTokenValue(theme[name]), name).toBe(true);
    }
  });
});
