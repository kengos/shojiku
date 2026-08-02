// The static-asset shapes `scripts/assemble-site.ts` emits into `dist-assets/`
// and the app fetches at runtime. Type-only (coverage-excluded like the
// designer's wire mirrors): there is NO runtime code here.
//
//   catalog.json      the preset catalog (localized display data + file bases)
//   fonts/index.json  the font index (pack tier + per-face chunk plan)
//   locale/index.json the shipped locale-pack ids (packs/locale/<id>.yml)
//
// The app never trusts declared paths blindly — the assembly validates every
// manifest-derived name against a safe charset, and the runtime joins only
// fixed relative paths to a constant base.

/** One preset the catalog can surface: its bundled-example id, the locale tags
 * it declares (lowercased BCP 47-ish, e.g. `ja`, `en`, `zh-tw`), the exact
 * engine locale its template targets (the tag passed to `setLocale`, e.g.
 * `ja-JP`, so the right font packs are injected), a localized display name per
 * catalog-language key, and its thumbnail file name. */
export interface CatalogPreset {
  readonly id: string;
  readonly locales: readonly string[];
  readonly engineLocale: string;
  readonly name: Readonly<Record<string, string>>;
  readonly thumbnail: string;
  /** File names under the preset's `assets/` dir (the template references
   * them as `assets/<name>`); the app fetches and injects them at
   * preset-open. Omitted when the preset bundles no assets. */
  readonly assets?: readonly string[];
  /** Sample-data variants beyond the default `params.json` (filled sample / blank …).
   * Each is fetched from `params-<id>.json` and shown in the preview's variant
   * switcher under its localized `name`. Omitted when the preset ships only the
   * default sample data. */
  readonly variants?: readonly CatalogVariant[];
}

/** One declared sample-data variant: a lowercase-safe id (the derived file is
 * `params-<id>.json`) and a localized display-name map (same shape as a
 * preset's `name`). */
export interface CatalogVariant {
  readonly id: string;
  readonly name: Readonly<Record<string, string>>;
}

/** The catalog payload (`catalog.json`). */
export interface Catalog {
  readonly presets: readonly CatalogPreset[];
}

/** One face file to fetch. `parts` is present (ordered) when the assembly split
 * an oversized face into `<name>.partNN` pieces the host reassembles; absent
 * means fetch `name` directly. `size` is the reassembled total (the cap check). */
export interface FontFile {
  readonly name: string;
  readonly size: number;
  readonly parts?: readonly string[];
}

/** One font pack. `primary` packs paint the first preview; `lazy` packs (the
 * heavy rare-glyph fallback) are fetched only when a `missing_glyph` fires. */
export interface FontPack {
  readonly tier: 'primary' | 'lazy';
  readonly files: Readonly<Record<string, FontFile>>;
}

/** The font index (`fonts/index.json`): pack id → its tier + face-file plan. */
export interface FontIndex {
  readonly packs: Readonly<Record<string, FontPack>>;
}

/** The locale index (`locale/index.json`): the ids of the locale packs shipped
 * from `packs/locale/`, lowercased (`zh-tw`), in sorted order. A preset whose
 * `engineLocale` is NOT listed here needs no pack — the engine has a builtin
 * for it (ja-JP / en-US). */
export interface LocaleIndex {
  readonly locales: readonly string[];
}
