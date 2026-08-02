import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, detectLocale } from './detect';

describe('detectLocale', () => {
  it('honors a stored override verbatim', () => {
    expect(detectLocale({ override: 'zh-TW', navigatorLanguages: ['ja-JP'] })).toBe('zh-TW');
  });

  it('ignores an empty override and falls through to navigator', () => {
    expect(detectLocale({ override: '', navigatorLanguages: ['ja-JP'] })).toBe('ja-JP');
  });

  it('matches a navigator tag exactly (case-insensitive) to a known locale', () => {
    expect(detectLocale({ override: null, navigatorLanguages: ['JA-jp'] })).toBe('ja-JP');
  });

  it('matches by primary language when the exact tag is unknown', () => {
    // `ja` (no region) maps to the first ja-* locale.
    expect(detectLocale({ override: null, navigatorLanguages: ['ja'] })).toBe('ja-JP');
  });

  it('skips unknown tags and takes the first that maps', () => {
    expect(detectLocale({ override: null, navigatorLanguages: ['xx', 'en-US'] })).toBe('en-US');
  });

  it('falls back to the default when nothing maps', () => {
    expect(detectLocale({ override: null, navigatorLanguages: ['xx', 'zz'] })).toBe(DEFAULT_LOCALE);
  });

  it('falls back to the default for an empty navigator list', () => {
    expect(detectLocale({ override: null, navigatorLanguages: [] })).toBe(DEFAULT_LOCALE);
  });
});
