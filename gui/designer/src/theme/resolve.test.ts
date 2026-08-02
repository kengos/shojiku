// Theme resolution: scheme picks the built-in set, an override merges over it
// through the value guard (hostile values fall back, forged keys never reach
// the output), and cssVars emits the tokens under their public property names.

import { describe, expect, it } from 'vitest';
import { cssVars, resolveTheme, safeTokenValue } from './resolve';
import { DARK_THEME, LIGHT_THEME, type ThemeOverride, TOKEN_NAMES } from './tokens';

describe('resolveTheme', () => {
  it('selects the built-in set per scheme', () => {
    expect(resolveTheme('light')).toEqual(LIGHT_THEME);
    expect(resolveTheme('dark')).toEqual(DARK_THEME);
  });

  it('returns a fresh object, never the built-in one', () => {
    expect(resolveTheme('light')).not.toBe(LIGHT_THEME);
  });

  it('merges a valid override over the base', () => {
    const tokens = resolveTheme('light', { accent: '#123456', radius: '6px' });
    expect(tokens.accent).toBe('#123456');
    expect(tokens.radius).toBe('6px');
    expect(tokens.text).toBe(LIGHT_THEME.text);
  });

  it('drops unsafe override values back to the built-in value', () => {
    const hostile: ThemeOverride = {
      bg: 'url(https://evil.example/x)',
      text: '#000; } body { background: red',
      accent: 'a'.repeat(300),
      border: '',
    };
    expect(resolveTheme('light', hostile)).toEqual(LIGHT_THEME);
  });

  it('ignores a forged key that is not a token name', () => {
    const forged = { zzz: 'red' } as unknown as ThemeOverride;
    expect(resolveTheme('dark', forged)).toEqual(DARK_THEME);
  });
});

describe('safeTokenValue', () => {
  it('accepts colors, lengths, functions, and font stacks', () => {
    for (const value of [
      '#c2402a',
      'rgba(43, 39, 36, 0.25)',
      '12px',
      '0.08em',
      "'Hiragino Sans', system-ui, sans-serif",
      '"Noto Sans JP"',
    ]) {
      expect(safeTokenValue(value), value).toBe(true);
    }
  });

  it('rejects URL smuggling regardless of case', () => {
    expect(safeTokenValue('url(https://evil.example)')).toBe(false);
    expect(safeTokenValue('URL("x")')).toBe(false);
  });

  it('rejects declaration breakouts and disallowed characters', () => {
    for (const value of ['red;', 'x } .y {', '<style>', 'a\\b', 'https://x', 'a\nb']) {
      expect(safeTokenValue(value), value).toBe(false);
    }
  });

  it('rejects empty and over-long values', () => {
    expect(safeTokenValue('')).toBe(false);
    expect(safeTokenValue('a'.repeat(257))).toBe(false);
    expect(safeTokenValue('a'.repeat(256))).toBe(true);
  });
});

describe('cssVars', () => {
  it('emits every token under its public property name', () => {
    const vars = cssVars(LIGHT_THEME);
    expect(Object.keys(vars)).toHaveLength(TOKEN_NAMES.length);
    expect(vars['--sj-bg']).toBe(LIGHT_THEME.bg);
    expect(vars['--sj-on-accent']).toBe(LIGHT_THEME.onAccent);
    expect(vars['--sj-font-family']).toBe(LIGHT_THEME.fontFamily);
  });
});
