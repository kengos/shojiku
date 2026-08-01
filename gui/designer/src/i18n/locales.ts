// The endonym-labeled locale registry: the source of truth for the locale
// picker and the page-setup UI (which consumes `pageSizes`; the label is each
// language's own endonym). Separate from the message catalog on purpose — a
// locale names the catalog language it renders through (`messages`) but also
// carries region-specific data (paper preferences) that the catalog does not.
// The preset catalog's Accept-Language auto-select keys on this registry.

/** One selectable locale. `pageSizes` lists engine named sizes (the exact wire
 * spellings from `engine/core/src/geometry.rs`) in region-preferred order. */
export interface LocaleInfo {
  /** BCP 47 locale tag, e.g. `ja-JP`, `en-US`. */
  readonly tag: string;
  /** The language's own endonym (region-qualified where the language repeats). */
  readonly label: string;
  /** The catalog language key this locale renders diagnostics/chrome through. */
  readonly messages: string;
  /** The engine-RESOLVABLE locale tag this locale's documents format through:
   * a formatter builtin (`ja-JP` / `en-US`) or a shipped `packs/locale/<id>.yml`
   * pack (`fil-PH` / `hi-IN` / `zh-CN` / `zh-TW`). Regional English tags
   * (`en-GB`, `en-AU`, …) have no builtin and no pack, so they map to `en-US`
   * — the value `setLocale` and a blank preset's `defaults.locale` carry. */
  readonly engineLocale: string;
  /** Region-preferred paper sizes, engine named-size spellings. */
  readonly pageSizes: readonly string[];
}

export const LOCALES: readonly LocaleInfo[] = [
  {
    tag: 'ja-JP',
    label: '日本語',
    messages: 'ja',
    engineLocale: 'ja-JP',
    pageSizes: ['A4', 'B5', 'A3', 'Letter'],
  },
  {
    tag: 'en-US',
    label: 'English (US)',
    messages: 'en',
    engineLocale: 'en-US',
    pageSizes: ['Letter', 'Legal', 'Tabloid', 'A4'],
  },
  {
    tag: 'en-GB',
    label: 'English (UK)',
    messages: 'en',
    engineLocale: 'en-US',
    pageSizes: ['A4', 'A5', 'A3', 'Letter'],
  },
  {
    tag: 'en-AU',
    label: 'English (Australia)',
    messages: 'en',
    engineLocale: 'en-US',
    pageSizes: ['A4', 'A3', 'A5'],
  },
  {
    tag: 'en-CA',
    label: 'English (Canada)',
    messages: 'en',
    engineLocale: 'en-US',
    pageSizes: ['Letter', 'Legal', 'A4', 'Tabloid'],
  },
  {
    tag: 'en-IN',
    label: 'English (India)',
    messages: 'en',
    engineLocale: 'en-US',
    pageSizes: ['A4', 'Legal', 'Letter'],
  },
  {
    tag: 'en-PH',
    label: 'English (Philippines)',
    messages: 'en',
    engineLocale: 'en-US',
    pageSizes: ['Letter', 'Legal', 'A4'],
  },
  {
    tag: 'zh-TW',
    label: '繁體中文',
    messages: 'zh-tw',
    engineLocale: 'zh-TW',
    pageSizes: ['A4', 'B5', 'B4', 'Letter'],
  },
  {
    tag: 'zh-CN',
    label: '简体中文',
    messages: 'zh-cn',
    engineLocale: 'zh-CN',
    pageSizes: ['A4', 'A5', 'B5'],
  },
  {
    tag: 'hi-IN',
    label: 'हिन्दी',
    messages: 'hi',
    engineLocale: 'hi-IN',
    pageSizes: ['A4', 'Legal', 'Letter'],
  },
  {
    tag: 'fil-PH',
    label: 'Filipino',
    messages: 'fil',
    engineLocale: 'fil-PH',
    pageSizes: ['Letter', 'Legal', 'A4'],
  },
];

/** Script-subtag aliases. Accept-Language sends `zh-Hant`/`zh-Hans` (script, no
 * region); without these they would fall past every Chinese catalog to English.
 * Keyed lowercase to match `resolveChain`'s normalization. */
export const ALIASES: Readonly<Record<string, string>> = {
  'zh-hant': 'zh-tw',
  'zh-hans': 'zh-cn',
};

/** The registry entry for a BCP 47 tag, or `undefined` when the tag names no
 * shipped locale. Matches the exact tag case-insensitively first, then a script
 * alias (`zh-Hant` → the zh-TW entry). A miss is a degradation path — the
 * page-setup surface simply omits the locale-preferred size group — so no
 * regional paper knowledge is ever invented for an unknown region. */
export function localeInfo(tag: string): LocaleInfo | undefined {
  const lower = tag.toLowerCase();
  const direct = LOCALES.find((locale) => locale.tag.toLowerCase() === lower);
  if (direct !== undefined) {
    return direct;
  }
  const aliased = ALIASES[lower];
  return aliased === undefined ? undefined : LOCALES.find((locale) => locale.messages === aliased);
}
