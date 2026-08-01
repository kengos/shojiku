import { describe, expect, it } from 'vitest';
import { resolveChain } from './resolve';

describe('resolveChain', () => {
  it('resolves an exact regional tag most-specific first, ending at en', () => {
    expect(resolveChain('zh-TW')).toEqual(['zh-tw', 'zh', 'en']);
  });

  it('lowercases so casing does not matter', () => {
    expect(resolveChain('ZH-Tw')).toEqual(['zh-tw', 'zh', 'en']);
  });

  it('falls a region tag back to its language subtag', () => {
    expect(resolveChain('en-AU')).toEqual(['en-au', 'en']);
  });

  it('expands a script alias in place (zh-Hant → zh-tw)', () => {
    expect(resolveChain('zh-Hant-TW')).toEqual(['zh-hant-tw', 'zh-hant', 'zh-tw', 'zh', 'en']);
  });

  it('expands a bare script alias (zh-Hans → zh-cn)', () => {
    expect(resolveChain('zh-Hans')).toEqual(['zh-hans', 'zh-cn', 'zh', 'en']);
  });

  it('degrades an unknown tag to a chain that still ends at en', () => {
    expect(resolveChain('de-DE')).toEqual(['de-de', 'de', 'en']);
  });

  it('returns just en for an empty tag', () => {
    expect(resolveChain('')).toEqual(['en']);
    expect(resolveChain('   ')).toEqual(['en']);
  });

  it('returns just en for an overlong tag (length cap)', () => {
    expect(resolveChain('a'.repeat(65))).toEqual(['en']);
  });

  it('deduplicates when a subtag repeats the language', () => {
    expect(resolveChain('en')).toEqual(['en']);
  });

  it('skips empty candidates from a leading separator', () => {
    expect(resolveChain('-en')).toEqual(['-en', 'en']);
  });

  it('does not prototype-walk on a dangerous tag', () => {
    // `__proto__`/`constructor` must appear literally and resolve to en, never
    // hit the aliases map through the prototype chain.
    expect(resolveChain('__proto__')).toEqual(['__proto__', 'en']);
    expect(resolveChain('constructor')).toEqual(['constructor', 'en']);
  });
});
