// Locale detection for the standalone shell: a stored user override wins, else
// the first `navigator.languages` entry that maps to a known locale, else the
// default. Pure over its inputs (the browser globals are read in main.tsx), so
// it is unit-coverable. The result is a canonical `LOCALES` tag where one is
// matched, keeping the picker and page-setup defaults consistent.

import { LOCALES } from '@shojiku/designer';

export const DEFAULT_LOCALE = 'en-US';

function primarySubtag(tag: string): string {
  return tag.toLowerCase().split('-')[0];
}

/** Map one requested tag to a known `LOCALES` tag: an exact (case-insensitive)
 * match first, then the first locale sharing the primary language subtag. */
function matchLocale(tag: string): string | undefined {
  const lower = tag.toLowerCase();
  const exact = LOCALES.find((l) => l.tag.toLowerCase() === lower);
  if (exact !== undefined) {
    return exact.tag;
  }
  const primary = primarySubtag(tag);
  return LOCALES.find((l) => primarySubtag(l.tag) === primary)?.tag;
}

export interface DetectInput {
  /** A persisted user choice (from localStorage); `null` when unset. */
  readonly override: string | null;
  /** `navigator.languages`, most-preferred first (may be empty). */
  readonly navigatorLanguages: readonly string[];
}

/** Resolve the app locale. An override is honored verbatim (the user chose it);
 * otherwise the first navigator language matching a known locale wins, falling
 * back to the default when none match. */
export function detectLocale(input: DetectInput): string {
  if (input.override !== null && input.override.length > 0) {
    return input.override;
  }
  for (const lang of input.navigatorLanguages) {
    const matched = matchLocale(lang);
    if (matched !== undefined) {
      return matched;
    }
  }
  return DEFAULT_LOCALE;
}
