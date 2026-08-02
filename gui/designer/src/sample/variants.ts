// The pure sample-variant model: a set of named sample-data documents the
// preview can switch between (filled sample / blank / long data …) so "does the page break
// change with this much data?" is one click. Mirrors the sample model's posture
// — pure TS, no React, array-based (never an object keyed by variant id, so a
// hostile `__proto__`/`constructor` id stays inert data), every mutation a pure
// `set -> set` transform with a typed refusal (unchanged set) rather than a
// throw.
//
// A variant's DISPLAY identity depends on its origin: a preset variant carries a
// localized `labels` map (from the catalog, resolved down the i18n chain like a
// preset name); the DEFAULT variant (the preset's `params.json`) carries none
// and renders the chrome key `sample.variant.default`; a user-added variant
// carries a verbatim `name`. A draft-restored preset id the catalog no longer
// knows is an ORPHAN and displays its clipped id; the stored shape and the
// restore that produces such an orphan live in `variantsStore.ts`.

import { resolveChain } from '../i18n/resolve';

/** The most variants one set may hold (default + preset + user). A sanity bound
 * on a user-facing count; realistic presets declare one or two. */
export const MAX_VARIANTS = 12;
/** Display clip for a variant name / orphan id (long enough for a descriptive
 * label, matching the tree-label posture). */
export const MAX_VARIANT_NAME_CHARS = 60;
/** The id of the variant seeded from the preset's `params.json`. */
export const DEFAULT_VARIANT_ID = 'default';

/** A localized display-name map (`{ ja: 空欄, en: Blank }`), same shape as a
 * preset's `name`. */
export type VariantLabels = Readonly<Record<string, string>>;

/** One sample-data document in the set. `text` is the params JSON (opaque here
 * — the engine parses it). `origin` drives display + which mutations are
 * allowed (only user variants are removable). */
export type SampleVariant =
  | {
      readonly id: string;
      readonly text: string;
      readonly origin: 'preset';
      /** Localized labels; absent = the default variant (chrome key) or an
       * orphan (clipped id). */
      readonly labels?: VariantLabels;
    }
  | {
      readonly id: string;
      readonly text: string;
      readonly origin: 'user';
      /** Verbatim user-typed name. */
      readonly name: string;
    };

/** The full set: the active variant's id plus the ordered variants (the default
 * is always first). */
export interface SampleSet {
  readonly active: string;
  readonly variants: readonly SampleVariant[];
}

/** A preset variant as the catalog declares it (localized name map + its params
 * text), the input to {@link buildSampleSet}. */
export interface PresetVariant {
  readonly id: string;
  readonly name: VariantLabels;
  readonly text: string;
}

/** Clip a display string; the full text still drives the preview. */
function clip(value: string): string {
  return value.length > MAX_VARIANT_NAME_CHARS
    ? `${value.slice(0, MAX_VARIANT_NAME_CHARS)}…`
    : value;
}

/** Build a set from the preset's default params + its declared variants. The
 * default (id `default`) is always first and active; declared variants follow,
 * capped at {@link MAX_VARIANTS} total. */
export function buildSampleSet(
  params: string,
  presetVariants: readonly PresetVariant[],
): SampleSet {
  const variants: SampleVariant[] = [{ id: DEFAULT_VARIANT_ID, text: params, origin: 'preset' }];
  for (const v of presetVariants) {
    if (variants.length >= MAX_VARIANTS) {
      break;
    }
    variants.push({ id: v.id, text: v.text, origin: 'preset', labels: v.name });
  }
  return { active: DEFAULT_VARIANT_ID, variants };
}

/** The active variant, or the first (a set always holds at least one). */
function activeVariant(set: SampleSet): SampleVariant | undefined {
  return set.variants.find((v) => v.id === set.active) ?? set.variants[0];
}

/** The active variant's params text (empty only for an empty set, which the
 * builders never produce). */
export function activeText(set: SampleSet): string {
  return activeVariant(set)?.text ?? '';
}

/** Switch the active variant. An unknown id is a no-op (returns the same set). */
export function switchVariant(set: SampleSet, id: string): SampleSet {
  if (id === set.active || !set.variants.some((v) => v.id === id)) {
    return set;
  }
  return { ...set, active: id };
}

/** Replace the active variant's text. A no-op when unchanged (the changed-guard
 * — a mere blur never re-fires the set-change callback). */
export function updateActive(set: SampleSet, text: string): SampleSet {
  const current = activeVariant(set);
  if (current === undefined || current.text === text) {
    return set;
  }
  return {
    ...set,
    variants: set.variants.map((v) => (v.id === current.id ? { ...v, text } : v)),
  };
}

/** Allocate the first free `user-<n>` id (n ≥ 1) not already present. */
function nextUserId(set: SampleSet): string {
  for (let n = 1; ; n += 1) {
    const id = `user-${n}`;
    if (!set.variants.some((v) => v.id === id)) {
      return id;
    }
  }
}

/** Refusal reasons a variant mutation can return (mapped to localized notices
 * by the panel). */
export type VariantRefusal = 'empty_name' | 'too_many' | 'not_removable' | 'last_variant';

/** The result of a refusable mutation: the new set, or a typed refusal. */
export type VariantResult =
  | { readonly ok: true; readonly set: SampleSet }
  | { readonly ok: false; readonly reason: VariantRefusal };

/** Add a user variant that duplicates the ACTIVE variant's text, and make it
 * active (edits then target the copy). Refuses an empty/whitespace name or a
 * set already at the cap. */
export function addVariant(set: SampleSet, name: string): VariantResult {
  if (name.trim() === '') {
    return { ok: false, reason: 'empty_name' };
  }
  if (set.variants.length >= MAX_VARIANTS) {
    return { ok: false, reason: 'too_many' };
  }
  const id = nextUserId(set);
  const variant: SampleVariant = { id, text: activeText(set), origin: 'user', name };
  return { ok: true, set: { active: id, variants: [...set.variants, variant] } };
}

/** Remove a variant by id. Refuses a non-user variant (`not_removable`) and the
 * last remaining variant (`last_variant`). Removing the active variant moves
 * the active id to the first remaining variant (the default, normally first).
 * An unknown id is a silent no-op (returns the same set unchanged). */
export function removeVariant(set: SampleSet, id: string): VariantResult {
  const target = set.variants.find((v) => v.id === id);
  if (target === undefined) {
    return { ok: true, set };
  }
  if (target.origin !== 'user') {
    return { ok: false, reason: 'not_removable' };
  }
  if (set.variants.length <= 1) {
    return { ok: false, reason: 'last_variant' };
  }
  const variants = set.variants.filter((v) => v.id !== id);
  const active = set.active === id ? variants[0].id : set.active;
  return { ok: true, set: { active, variants } };
}

/** A variant's display name for a locale: a user variant's verbatim (clipped)
 * name; a preset variant's localized label resolved down the i18n chain; the
 * default variant's chrome key; an orphan preset id clipped. `t` renders the
 * default's chrome key. */
export function variantDisplayName(
  variant: SampleVariant,
  locale: string,
  t: (key: string) => string,
): string {
  if (variant.origin === 'user') {
    return clip(variant.name);
  }
  if (variant.labels !== undefined) {
    for (const lang of resolveChain(locale)) {
      if (Object.hasOwn(variant.labels, lang)) {
        return variant.labels[lang];
      }
    }
    return clip(variant.id);
  }
  return variant.id === DEFAULT_VARIANT_ID ? t('sample.variant.default') : clip(variant.id);
}
