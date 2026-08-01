// BCP 47 → catalog-language resolution. `resolveChain` turns a requested locale
// tag into an ordered list of catalog language keys, most specific first and
// always ending at `en` (the terminal language). Rendering walks this chain PER
// KEY, so a regional overlay only needs the keys where it differs.
//
// Hostile-input posture: a length cap, a single linear scan (no regex), and
// every map lookup goes through `Object.hasOwn` — a tag like `__proto__` or
// `constructor` must resolve to `en`, never prototype-walk or match. Any
// unknown, empty, or oversized tag degrades to `['en']`; nothing throws.

import { ALIASES } from './locales';

const MAX_TAG_LENGTH = 64;

/** Resolve a BCP 47 tag to the ordered catalog-language chain, e.g.
 * `zh-Hant-TW` → `['zh-hant-tw', 'zh-hant', 'zh-tw', 'zh', 'en']`. The result
 * always ends with `en`; garbage/empty/overlong input returns `['en']`. */
export function resolveChain(tag: string): readonly string[] {
  const normalized = tag.trim().toLowerCase();
  if (normalized.length === 0 || normalized.length > MAX_TAG_LENGTH) {
    return ['en'];
  }
  const chain: string[] = [];
  const push = (candidate: string): void => {
    if (candidate.length > 0 && !chain.includes(candidate)) {
      chain.push(candidate);
    }
  };
  // Most specific → least: the full tag, then each shorter subtag prefix. A
  // prefix that has a script alias inserts the alias right after it.
  const parts = normalized.split('-');
  for (let n = parts.length; n >= 1; n -= 1) {
    const candidate = parts.slice(0, n).join('-');
    push(candidate);
    if (Object.hasOwn(ALIASES, candidate)) {
      push(ALIASES[candidate]);
    }
  }
  push('en');
  return chain;
}
