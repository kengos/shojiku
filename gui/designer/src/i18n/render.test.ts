import { describe, expect, it } from 'vitest';
import type { Diagnostic } from '../engine/types';
import type { Catalog } from './catalog';
import { DEFAULT_CATALOG } from './catalog';
import { renderDiagnostic, translate, variantKey } from './render';

function diag(partial: Partial<Diagnostic> & Pick<Diagnostic, 'code'>): Diagnostic {
  return {
    severity: 'warning',
    category: 'layout',
    message: 'engine english fallback',
    args: {},
    ...partial,
  };
}

describe('translate (chrome)', () => {
  it('renders a known chrome key from the first language in the chain', () => {
    expect(translate(DEFAULT_CATALOG, ['ja', 'en'], 'app.save', 'ja')).toBe('保存…');
    expect(translate(DEFAULT_CATALOG, ['zh-tw', 'en'], 'app.save', 'zh-TW')).toBe('儲存…');
    expect(translate(DEFAULT_CATALOG, ['en'], 'app.save', 'en')).toBe('Save…');
  });

  it('falls through per key to English for a language missing that key', () => {
    // A partial (chrome-defining) language with a sparse chrome table: the one
    // key it defines wins, everything else falls to en.
    const catalog: Catalog = {
      ...DEFAULT_CATALOG,
      xx: { diagnostics: {}, chrome: { 'app.save': 'Sauver' } },
    };
    expect(translate(catalog, ['xx', 'en'], 'app.save', 'fr')).toBe('Sauver');
    expect(translate(catalog, ['xx', 'en'], 'app.undo', 'fr')).toBe('Undo');
  });

  it('skips a chain language that is absent from the catalog', () => {
    // de-DE resolves to ['de-de', 'de', 'en']; neither de entry exists.
    expect(translate(DEFAULT_CATALOG, ['de-de', 'de', 'en'], 'app.save', 'de-DE')).toBe('Save…');
  });

  it('renders an unknown key as the key itself', () => {
    expect(translate(DEFAULT_CATALOG, ['en'], 'no.such.key', 'en')).toBe('no.such.key');
  });

  it('falls back to the English wording when a referenced chrome arg is missing', () => {
    const catalog: Catalog = {
      en: { diagnostics: {}, chrome: { greeting: 'Hi {name}' } },
      ja: { diagnostics: {}, chrome: { greeting: 'やあ {name}' } },
    };
    expect(translate(catalog, ['ja', 'en'], 'greeting', 'ja', {})).toBe('Hi {name}');
  });

  it('falls back to the matched template when English lacks the key too', () => {
    const catalog: Catalog = { xx: { diagnostics: {}, chrome: { greeting: 'Hola {name}' } } };
    expect(translate(catalog, ['xx'], 'greeting', 'xx', {})).toBe('Hola {name}');
  });
});

describe('renderDiagnostic', () => {
  it('renders a known code with args in Japanese', () => {
    const text = renderDiagnostic(
      diag({ code: 'undefined_style_name', args: { name: 'heading' } }),
      DEFAULT_CATALOG,
      ['ja', 'en'],
      'ja',
    );
    expect(text).toBe('styleName `heading` は `styles` レジストリに定義されていません');
  });

  it('renders a known code with args in Traditional Chinese', () => {
    const text = renderDiagnostic(
      diag({ code: 'undefined_style_name', args: { name: 'heading' } }),
      DEFAULT_CATALOG,
      ['zh-tw', 'en'],
      'zh-TW',
    );
    expect(text).toBe('styleName `heading` 未定義於 `styles` 登錄中');
  });

  it('falls through to English diagnostics for a chrome-only language', () => {
    // hi carries no diagnostics; the code falls per key to en.
    const text = renderDiagnostic(
      diag({ code: 'undefined_style_name', args: { name: 'heading' } }),
      DEFAULT_CATALOG,
      ['hi', 'en'],
      'hi-IN',
    );
    expect(text).toBe('styleName `heading` is not defined in the `styles` registry');
  });

  it('falls back to the engine message for an unknown (newer) code', () => {
    const text = renderDiagnostic(
      diag({ code: 'a_future_code_not_in_catalog', message: 'brand new thing' }),
      DEFAULT_CATALOG,
      ['ja', 'en'],
      'ja',
    );
    expect(text).toBe('brand new thing');
  });

  it('falls back to the engine message when a referenced arg is absent', () => {
    const text = renderDiagnostic(
      diag({ code: 'undefined_style_name', args: {}, message: 'styleName `x` is not defined' }),
      DEFAULT_CATALOG,
      ['ja', 'en'],
      'ja',
    );
    expect(text).toBe('styleName `x` is not defined');
    expect(text).not.toContain('{name}');
  });

  it('never surfaces the engine origin field', () => {
    const text = renderDiagnostic(
      diag({ code: 'rect_missing_size', origin: 'layout/src/foo.rs:12' }),
      DEFAULT_CATALOG,
      ['ja', 'en'],
      'ja',
    );
    expect(text).not.toContain('foo.rs');
  });

  it('formats a numeric arg under the requested (regional) locale', () => {
    // The requested tag drives {n, number} grouping independently of which
    // language's string won: en-IN groups lakhs (1,00,000).
    const catalog: Catalog = {
      en: { diagnostics: { big: 'up to {n, number} pages' }, chrome: {} },
    };
    const text = renderDiagnostic(
      diag({ code: 'big', args: { n: 100000 } }),
      catalog,
      ['en'],
      'en-IN',
    );
    expect(text).toBe('up to 1,00,000 pages');
  });
});

describe('catalog integrity', () => {
  const FULL = ['en', 'ja', 'zh-tw', 'zh-cn'] as const;
  const PARTIAL = ['hi', 'fil'] as const;
  const placeholders = (template: string): string[] =>
    [...template.matchAll(/\{\s*([a-z_]+)\s*(?:,[^}]*)?\}/g)].map((m) => m[1]).sort();

  const enDiag = DEFAULT_CATALOG.en.diagnostics;
  const enChrome = DEFAULT_CATALOG.en.chrome;

  it('every full language matches en key-for-key with placeholder parity', () => {
    for (const lang of FULL) {
      const cat = DEFAULT_CATALOG[lang];
      expect(Object.keys(cat.diagnostics).sort(), `${lang} diagnostics keys`).toEqual(
        Object.keys(enDiag).sort(),
      );
      expect(Object.keys(cat.chrome).sort(), `${lang} chrome keys`).toEqual(
        Object.keys(enChrome).sort(),
      );
      for (const [code, template] of Object.entries(cat.diagnostics)) {
        expect(template.length, `${lang}/${code}`).toBeGreaterThan(0);
        expect(placeholders(template), `${lang}/${code}`).toEqual(placeholders(enDiag[code]));
      }
      for (const [key, template] of Object.entries(cat.chrome)) {
        expect(template.length, `${lang}/${key}`).toBeGreaterThan(0);
      }
    }
  });

  it('every partial language has chrome ⊆ en and no diagnostics', () => {
    const enChromeKeys = new Set(Object.keys(enChrome));
    for (const lang of PARTIAL) {
      const cat = DEFAULT_CATALOG[lang];
      expect(Object.keys(cat.diagnostics), `${lang} diagnostics`).toEqual([]);
      for (const [key, template] of Object.entries(cat.chrome)) {
        expect(enChromeKeys.has(key), `${lang} chrome key ${key}`).toBe(true);
        expect(template.length, `${lang}/${key}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('variantKey', () => {
  it('refines unknown_data_key to its empty-key variant', () => {
    expect(variantKey(diag({ code: 'unknown_data_key', args: { key: '' } }))).toBe(
      'unknown_data_key.empty',
    );
  });

  it('does not refine a REAL key, another code, or a non-string arg', () => {
    expect(variantKey(diag({ code: 'unknown_data_key', args: { key: 'total' } }))).toBeNull();
    expect(variantKey(diag({ code: 'missing_data', args: { key: '' } }))).toBeNull();
    expect(variantKey(diag({ code: 'unknown_data_key', args: { key: 0 } }))).toBeNull();
    expect(variantKey(diag({ code: 'unknown_data_key' }))).toBeNull();
  });
});

describe('renderDiagnostic — the empty data key', () => {
  it('says what to DO instead of echoing an empty key back', () => {
    // Clearing a data-binding field deliberately leaves the key present but
    // empty, so the problem stays visible — and the generic wording then read
    // "data key `` is not declared in …", which names nothing and asks for
    // nothing.
    const d = diag({ code: 'unknown_data_key', args: { key: '', source: 'definitions' } });
    expect(renderDiagnostic(d, DEFAULT_CATALOG, ['en'], 'en')).toBe(
      'pick a data field for this item (its data key is empty)',
    );
    expect(renderDiagnostic(d, DEFAULT_CATALOG, ['ja', 'en'], 'ja')).toContain('データキーが空');
  });

  it('keeps the ordinary wording for a real key', () => {
    const d = diag({ code: 'unknown_data_key', args: { key: 'total', source: 'definitions' } });
    expect(renderDiagnostic(d, DEFAULT_CATALOG, ['en'], 'en')).toBe(
      'data key `total` is not declared in definitions',
    );
  });

  it('falls back to the bare code when no language carries the variant', () => {
    const catalog: Catalog = {
      ...DEFAULT_CATALOG,
      en: {
        ...DEFAULT_CATALOG.en,
        diagnostics: { unknown_data_key: 'data key `{key}` is not declared in {source}' },
      },
    };
    const d = diag({ code: 'unknown_data_key', args: { key: '', source: 'definitions' } });
    expect(renderDiagnostic(d, catalog, ['en'], 'en')).toBe(
      'data key `` is not declared in definitions',
    );
  });
});
