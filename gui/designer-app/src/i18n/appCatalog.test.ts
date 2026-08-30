import { DEFAULT_CATALOG } from '@shojiku/designer';
import { describe, expect, it } from 'vitest';
import { APP_CATALOG } from './appCatalog';

describe('APP_CATALOG', () => {
  it('adds app shell chrome to en (the terminal fallback)', () => {
    expect(APP_CATALOG.en.chrome['catalog.title']).toBe('Choose a template');
    expect(APP_CATALOG.en.chrome['app.export']).toBe('Export');
  });

  it('adds localized app chrome to ja', () => {
    expect(APP_CATALOG.ja.chrome['catalog.title']).toBe('テンプレートを選ぶ');
  });

  it('preserves the designer chrome + diagnostics it extends', () => {
    expect(APP_CATALOG.en.chrome['app.save']).toBe(DEFAULT_CATALOG.en.chrome['app.save']);
    expect(APP_CATALOG.en.diagnostics).toBe(DEFAULT_CATALOG.en.diagnostics);
    expect(APP_CATALOG.ja.chrome['panel.title']).toBe(DEFAULT_CATALOG.ja.chrome['panel.title']);
  });

  it('leaves other languages as the designer catalog provides them', () => {
    expect(APP_CATALOG['zh-tw']).toBe(DEFAULT_CATALOG['zh-tw']);
    expect(APP_CATALOG.fil).toBe(DEFAULT_CATALOG.fil);
  });
});

// The HIG pair (gui/STYLE.md § Actions) for the two openers the DESIGNER
// renders whose view the APP titles: `gui/designer`'s own gate
// (`i18n/ellipsis.test.ts`) lists both as exempt-and-gated-here, because it
// cannot see `APP_CATALOG`. Only `en` and `ja` carry app keys, so those two are
// the whole surface on which the pair CAN hold: in the other four locales the
// opener is translated and the title falls back to English per key, so a zh-tw
// user meets 新增字型… and a dialog headed "Add font". That is the app
// catalog's documented shape, not something this gate can assert away — it is
// written down here so the green is not read as covering six languages.
const LANGS = ['en', 'ja'] as const;

const CROSS_PACKAGE_PAIRS: Readonly<Record<string, string>> = {
  'menu.addFont': 'fontPicker.title',
  'menu.snapshots': 'snapshot.title',
};

/** Every app-catalog label that ends in an ellipsis, with why it opens no
 * titled view of its own. The complement of the pairs above: a new one must be
 * classified rather than silently ignored. */
const APP_EXEMPT: Readonly<Record<string, string>> = {
  'app.open': 'host file picker',
  'app.fontLoading': 'progress string',
  'app.saving': 'progress string',
  'mounted.loading': 'progress string',
  'fontPicker.installing': 'progress string',
};

/** The pair walk over ONE language's chrome — named so the control below can
 * run it against a deliberately broken catalog rather than assert around it.
 *
 * Deliberately a second copy of the designer's `withoutEllipsis` rather than a
 * shared helper: exporting a test-only predicate across the package boundary
 * costs a public API for one line. Keep the two in step. */
function unpairedIn(chrome: Record<string, string>, lang: string): string[] {
  return Object.entries(CROSS_PACKAGE_PAIRS)
    .filter(([opener, titleKey]) => {
      const label = (chrome[opener] ?? '').trimEnd().replace(/…$/, '').trimEnd();
      return label !== chrome[titleKey];
    })
    .map(([opener, titleKey]) => `${lang}:${opener} → ${titleKey}`);
}

describe('a dialog title matches the label that opened it', () => {
  it('titles the app’s views with the designer label that opened them', () => {
    expect(LANGS.flatMap((lang) => unpairedIn(APP_CATALOG[lang].chrome, lang))).toEqual([]);
  });

  it('would catch one (the positive control for an expected-empty sweep)', () => {
    const broken = { ...APP_CATALOG.en.chrome, 'fontPicker.title': 'Something else' };
    expect(unpairedIn(broken, 'en')).toEqual(['en:menu.addFont → fontPicker.title']);
    // A key that goes MISSING is caught too, not swallowed by the `?? ''`.
    const gone = { ...APP_CATALOG.en.chrome };
    delete gone['snapshot.title'];
    expect(unpairedIn(gone, 'en')).toEqual(['en:menu.snapshots → snapshot.title']);
  });

  it('classifies every app-only ellipsis label, with a reason', () => {
    // Scoped to the keys the APP adds: the designer's own gate already
    // classifies everything `DEFAULT_CATALOG` carries.
    for (const lang of LANGS) {
      const own = Object.entries(APP_CATALOG[lang].chrome)
        .filter(
          ([key, value]) => value.trimEnd().endsWith('…') && !(key in DEFAULT_CATALOG[lang].chrome),
        )
        .map(([key]) => key);
      expect(own.length, `${lang} app-only ellipsis labels`).toBeGreaterThanOrEqual(4);
      expect(own.filter((key) => !(key in APP_EXEMPT)).sort(), `${lang} unclassified`).toEqual([]);
    }
    expect(Object.entries(APP_EXEMPT).filter(([, reason]) => reason.trim() === '')).toEqual([]);
  });
});
