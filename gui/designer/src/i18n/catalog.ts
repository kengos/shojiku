// The message catalog: the Designer's OWN localized strings, split one module
// per language under `catalog/`. A `Catalog` is a map from language key → that
// language's `LanguageCatalog` (flat `key → string` for diagnostics + chrome).
//
// `en` is always present and terminal: every BCP 47 resolution chain ends there
// (see `resolve.ts`), and rendering (`render.ts`) walks the chain PER KEY, so a
// regional or partial language only needs to carry the keys where it differs —
// the rest fall through to a less-specific language and ultimately to English.
// Diagnostics are keyed by the engine's append-only `DiagnosticCode` registry
// (English entries are the engine templates verbatim); an uncatalogued newer
// code degrades to the engine's own `message`, so a partial catalog is safe.
//
// The catalog is a host-injection point: a host spreads-extends DEFAULT_CATALOG
// with its own languages (display-only strings; lookups stay `hasOwn`-guarded).

import { en } from './catalog/en';
import { fil } from './catalog/fil';
import { hi } from './catalog/hi';
import { ja } from './catalog/ja';
import type { LanguageCatalog } from './catalog/types';
import { zhCn } from './catalog/zh-cn';
import { zhTw } from './catalog/zh-tw';

export type { LanguageCatalog } from './catalog/types';

/** A catalog is a map from language key → that language's strings. Keys are
 * lowercase language/script tags matching what `resolveChain` produces
 * (`en`, `ja`, `zh-tw`, `zh-cn`, …); `en` must always be present (terminal). */
export type Catalog = Readonly<Record<string, LanguageCatalog>>;

/** The Designer's built-in multi-language catalog: en + ja + 繁體/简体中文 full,
 * हिन्दी + Filipino chrome-only (diagnostics fall back to English per key). */
export const DEFAULT_CATALOG: Catalog = {
  en,
  ja,
  'zh-tw': zhTw,
  'zh-cn': zhCn,
  hi,
  fil,
};
