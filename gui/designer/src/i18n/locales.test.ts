import { describe, expect, it } from 'vitest';
import { PAGE_SIZE_NAMES } from '../panel/pageSizes';
import { DEFAULT_CATALOG } from './catalog';
import { ALIASES, ENGINE_ONLY_LOCALES, engineLocaleFor, LOCALES, localeInfo } from './locales';
import { resolveChain } from './resolve';

// The exact engine named-size spellings (engine/core/src/geometry.rs).
const ENGINE_SIZES = new Set(['A3', 'A4', 'A5', 'B4', 'B5', 'Letter', 'Legal', 'Tabloid']);

describe('locale registry', () => {
  it('has a unique BCP 47 tag per entry', () => {
    const tags = LOCALES.map((locale) => locale.tag);
    expect(new Set(tags).size).toBe(tags.length);
  });

  it('points every entry at a catalog language that exists', () => {
    for (const locale of LOCALES) {
      expect(Object.hasOwn(DEFAULT_CATALOG, locale.messages), locale.tag).toBe(true);
    }
  });

  it('lists only engine named page sizes, at least one per entry', () => {
    for (const locale of LOCALES) {
      expect(locale.pageSizes.length, locale.tag).toBeGreaterThan(0);
      for (const size of locale.pageSizes) {
        expect(ENGINE_SIZES.has(size), `${locale.tag}/${size}`).toBe(true);
      }
    }
  });

  it('references only sizes the page-setup table carries (no data drift)', () => {
    // The page-setup surface renders each locale's `pageSizes` as a select
    // group over the named-size table; a spelling missing from the table would
    // render an option the size lookup cannot resolve.
    const table = new Set(PAGE_SIZE_NAMES);
    for (const locale of LOCALES) {
      for (const size of locale.pageSizes) {
        expect(table.has(size), `${locale.tag}/${size}`).toBe(true);
      }
    }
  });

  it('has a non-empty endonym label per entry', () => {
    for (const locale of LOCALES) {
      expect(locale.label.length, locale.tag).toBeGreaterThan(0);
    }
  });

  it('pins each entry to its engine-resolvable locale (silent edits must be loud)', () => {
    // The value a blank preset's `defaults.locale` and `setLocale` carry: a
    // formatter builtin or a shipped `packs/locale/<id>.yml` pack. Regional
    // English tags have neither, so they map to en-US. A change here is a wire
    // change — pin the exact map so it cannot drift unnoticed.
    const expected: Record<string, string> = {
      'ja-JP': 'ja-JP',
      'en-US': 'en-US',
      'en-GB': 'en-US',
      'en-AU': 'en-US',
      'en-CA': 'en-US',
      'en-IN': 'en-US',
      'en-PH': 'en-US',
      'zh-TW': 'zh-TW',
      'zh-CN': 'zh-CN',
      'hi-IN': 'hi-IN',
      'fil-PH': 'fil-PH',
    };
    const actual = Object.fromEntries(LOCALES.map((locale) => [locale.tag, locale.engineLocale]));
    expect(actual).toEqual(expected);
  });

  it('resolves every entry engine locale to a builtin or a shipped pack', () => {
    // The engine accepts a builtin (ja-JP / en-US) or a standalone
    // `packs/locale/<id>.yml` pack; nothing else resolves at setLocale.
    // A superset of what `LOCALES` can name — `th-TH` ships a pack but no
    // chrome catalog, so no picker entry resolves to it.
    const resolvable = new Set(['ja-JP', 'en-US', 'zh-TW', 'zh-CN', 'hi-IN', 'fil-PH', 'th-TH']);
    for (const locale of LOCALES) {
      expect(resolvable.has(locale.engineLocale), `${locale.tag}/${locale.engineLocale}`).toBe(
        true,
      );
    }
  });

  it('resolves every registry tag to its declared catalog language', () => {
    for (const locale of LOCALES) {
      const primary = resolveChain(locale.tag).find((lang) => Object.hasOwn(DEFAULT_CATALOG, lang));
      expect(primary, locale.tag).toBe(locale.messages);
    }
  });

  it('maps every alias to a catalog language that exists', () => {
    for (const target of Object.values(ALIASES)) {
      expect(Object.hasOwn(DEFAULT_CATALOG, target), target).toBe(true);
    }
  });
});

describe('localeInfo lookup', () => {
  it('resolves an exact tag case-insensitively', () => {
    expect(localeInfo('ja-JP')?.tag).toBe('ja-JP');
    expect(localeInfo('en-us')?.tag).toBe('en-US');
  });

  it('resolves a script alias to the matching regional entry', () => {
    expect(localeInfo('zh-Hant')?.tag).toBe('zh-TW');
    expect(localeInfo('zh-hans')?.tag).toBe('zh-CN');
  });

  it('returns undefined for a tag naming no shipped locale', () => {
    expect(localeInfo('de-DE')).toBeUndefined();
    expect(localeInfo('')).toBeUndefined();
  });
});

describe('engineLocaleFor', () => {
  // The claim moved here from the panel, which used to do this lookup itself.
  it('resolves a regional English to the locale the engine actually has', () => {
    // en-GB ships no pack and has no builtin; the engine formats it as en-US,
    // so an editor asking about the pick must ask about THAT.
    expect(engineLocaleFor('en-GB')).toBe('en-US');
    expect(engineLocaleFor('en-AU')).toBe('en-US');
  });

  it('leaves a locale that IS engine-resolvable alone', () => {
    expect(engineLocaleFor('ja-JP')).toBe('ja-JP');
    expect(engineLocaleFor('zh-TW')).toBe('zh-TW');
  });

  it('maps an unregistered or hostile tag to itself', () => {
    // Mapping to itself is what makes the miss a MISS downstream: whatever
    // asks about it gets nothing, rather than an answer about some other
    // locale. A prototype name must not resolve through the registry either.
    expect(engineLocaleFor('xx-YY')).toBe('xx-YY');
    expect(engineLocaleFor('constructor')).toBe('constructor');
    expect(engineLocaleFor('__proto__')).toBe('__proto__');
    expect(engineLocaleFor('')).toBe('');
  });
});

describe('ENGINE_ONLY_LOCALES', () => {
  it('lists engine locales the Designer has no chrome for, and only those', () => {
    // The two axes the `defaults.locale` picker joins. An entry that IS a
    // chrome language would double the picker's row; a chrome language
    // missing from `LOCALES` would be unreachable in the language menu.
    for (const tag of ENGINE_ONLY_LOCALES) {
      expect(
        LOCALES.some((locale) => locale.tag === tag),
        tag,
      ).toBe(false);
    }
    // th-TH is the case that separates them: a shipped pack (Buddhist era,
    // THB, Thai month names) with no Thai UI.
    expect(ENGINE_ONLY_LOCALES).toContain('th-TH');
  });
});
