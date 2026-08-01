// Pure catalog derivation: given the boot-collected preset contributions and an
// app locale, produce the presets that locale surfaces (strictly per-locale)
// with a display name resolved through the locale's language chain. No React,
// no fetch.

import { type PresetContribution, resolveChain } from '@shojiku/designer';

/** A preset ready to render in the catalog view: the contribution plus its
 * display name resolved for the active locale. */
export interface CatalogEntry {
  readonly preset: PresetContribution;
  readonly displayName: string;
}

/** The locale's OWN language tags — the resolution chain, but the universal
 * `en` terminal counts only for an English locale. This keeps the catalog
 * strictly per-locale: a `ja` preset never surfaces for en-US, and an `en`
 * preset never surfaces for ja-JP (whose chain merely ends at the `en`
 * fallback), while en-US still sees its `en` presets. */
function ownTags(locale: string): readonly string[] {
  const chain = resolveChain(locale);
  const primary = chain[0].split('-')[0];
  return primary === 'en' ? chain : chain.filter((tag) => tag !== 'en');
}

/** Resolve a preset's display name for the locale: walk the language chain
 * (which always ends at `en`) and take the first key the name map carries,
 * falling back to the preset id when it carries none. */
function resolveName(preset: PresetContribution, chain: readonly string[]): string {
  for (const lang of chain) {
    if (Object.hasOwn(preset.name, lang)) {
      return preset.name[lang];
    }
  }
  return preset.id;
}

/** A preset's display name for the locale (the title-bar name) — the same
 * resolution the catalog view uses, exposed for the editor screen. */
export function presetDisplayName(preset: PresetContribution, locale: string): string {
  return resolveName(preset, resolveChain(locale));
}

/** The presets a locale surfaces, display-name-resolved, in collection order
 * (the app's assembled catalog first, contributions after). A preset matches
 * when any of its declared locale tags is one of the locale's own tags
 * (case-insensitive). */
export function catalogFor(
  presets: readonly PresetContribution[],
  locale: string,
): readonly CatalogEntry[] {
  const own = new Set(ownTags(locale));
  const chain = resolveChain(locale);
  const entries: CatalogEntry[] = [];
  for (const preset of presets) {
    const surfaces = preset.locales.some((tag) => own.has(tag.toLowerCase()));
    if (surfaces) {
      entries.push({ preset, displayName: resolveName(preset, chain) });
    }
  }
  return entries;
}
