// The PERSISTENCE projection of a sample-variant set: the serializable shape a
// draft/snapshot stores, and the restore that rebuilds a live set from it.
//
// Storage is user-writable, so restore treats every stored id as an attacker
// string (a Map lookup, never an object index) and is total — it always returns
// a usable set. Preset labels are deliberately NOT stored: they re-resolve from
// the catalog by id at open, so a retitled or re-localized preset shows its new
// label on an old draft. The live transforms live in `variants.ts`.

import {
  DEFAULT_VARIANT_ID,
  MAX_VARIANTS,
  type PresetVariant,
  type SampleSet,
  type SampleVariant,
  type VariantLabels,
} from './variants';

/** The serializable shape a draft persists — labels stripped (they re-resolve
 * from the catalog), a user variant's verbatim `name` kept. */
export interface StoredVariant {
  readonly id: string;
  readonly text: string;
  readonly name?: string;
}
export interface StoredSampleSet {
  readonly active: string;
  readonly variants: readonly StoredVariant[];
}

/** The draft-serializable projection of a set (labels dropped). */
export function toStored(set: SampleSet): StoredSampleSet {
  return {
    active: set.active,
    variants: set.variants.map((v) =>
      v.origin === 'user' ? { id: v.id, text: v.text, name: v.name } : { id: v.id, text: v.text },
    ),
  };
}

/** Rebuild a set from a draft's stored shape, re-attaching preset labels from
 * the catalog by id. A stored variant with a `name` is a user variant; one
 * without is a preset variant whose labels come from `presetVariants` (or, when
 * the catalog no longer declares it, an orphan with no labels). A declared
 * preset variant MISSING from the stored set is APPENDED: preset variants
 * cannot be user-removed, so its absence only means the draft predates it (a
 * schema upgrade, or a preset that declared a new variant) — without the merge,
 * every pre-existing draft would permanently hide the variant switcher. */
export function restoreSampleSet(
  stored: StoredSampleSet,
  presetVariants: readonly PresetVariant[],
): SampleSet {
  // A Map (not an object) — a stored id is an attacker string.
  const labelsById = new Map<string, VariantLabels>();
  for (const v of presetVariants) {
    labelsById.set(v.id, v.name);
  }
  const variants: SampleVariant[] = stored.variants.map((v) => {
    if (typeof v.name === 'string') {
      return { id: v.id, text: v.text, origin: 'user', name: v.name };
    }
    const labels = labelsById.get(v.id);
    return labels === undefined
      ? { id: v.id, text: v.text, origin: 'preset' }
      : { id: v.id, text: v.text, origin: 'preset', labels };
  });
  const present = new Set(variants.map((v) => v.id));
  for (const v of presetVariants) {
    if (variants.length >= MAX_VARIANTS) {
      break;
    }
    if (!present.has(v.id)) {
      variants.push({ id: v.id, text: v.text, origin: 'preset', labels: v.name });
    }
  }
  const active = variants.some((v) => v.id === stored.active)
    ? stored.active
    : (variants[0]?.id ?? DEFAULT_VARIANT_ID);
  return { active, variants };
}
