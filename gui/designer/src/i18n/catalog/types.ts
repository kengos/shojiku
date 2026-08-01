// One language's strings, flat `key → string` (no per-entry locale nesting —
// that nesting moved up to the catalog-of-languages in `../catalog.ts`).
// `diagnostics` is keyed by the engine's stable diagnostic `code`; `chrome` by
// the Designer's own UI keys. A partial catalog is safe and visible: a language
// may carry only some keys (or only `chrome`), and the resolution chain fills
// each MISSING key from a less-specific language, ending at English.

export interface LanguageCatalog {
  /** Engine diagnostic templates by `code`; same `{arg}` names as the engine. */
  readonly diagnostics: Readonly<Record<string, string>>;
  /** Designer UI strings by chrome key. */
  readonly chrome: Readonly<Record<string, string>>;
}
