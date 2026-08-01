// The locale source: fetches a shipped locale pack's YAML from the static asset
// tree so the app can hand it to `setLocale(tag, overlay)`. Pure over an
// injected `fetch` + a constant base URL, so it is unit-coverable without a
// network. The engine parses and validates the pack — this module only decides
// WHETHER a tag has a shipped pack and fetches its text.
//
// The engine holds builtins for ja-JP / en-US and needs no file for them; every
// other locale (zh-TW, zh-CN, hi-IN, fil-PH) is a whole pack shipped from
// packs/locale/. So a tag absent from the index is NOT an error here: it means
// "no pack to send", and `setLocale` either resolves a builtin or throws its own
// typed locale-not-found error, which the app surfaces as a diagnostic.

import type { LocaleIndex } from '../assets/manifest';
import { isSafeAssetName } from '../assets/paths';
import type { FetchText } from './fontSource';

/** A hard ceiling on a locale pack's YAML. The shipped packs are ~6 KB; 256 KiB
 * leaves room for a far richer pack without letting a tampered asset drive an
 * unbounded read into the engine's parser. */
export const MAX_LOCALE_BYTES = 256 * 1024;

/** Resolves a locale tag to the pack text to inject, or `null` for "no pack". */
export interface LocaleSource {
  overlayFor(tag: string): Promise<string | null>;
}

/** Build a `LocaleSource` bound to the asset base URL and the locale index. */
export function makeLocaleSource(deps: {
  readonly fetchText: FetchText;
  readonly base: string;
  readonly index: LocaleIndex;
}): LocaleSource {
  const { fetchText, base, index } = deps;
  const shipped = new Set(index.locales);
  return {
    async overlayFor(tag) {
      const id = tag.toLowerCase();
      // Charset guard before membership: a hostile tag never reaches a URL.
      if (!isSafeAssetName(id) || !shipped.has(id)) {
        return null;
      }
      const text = await fetchText(`${base}locale/${id}.yml`);
      if (text.length > MAX_LOCALE_BYTES) {
        throw new Error(`locale pack ${id} exceeds the size cap`);
      }
      return text;
    },
  };
}
