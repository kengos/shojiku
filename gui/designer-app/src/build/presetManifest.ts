// What a bundled preset DECLARES, validated: the `preset.yml` manifest (locales,
// engine locale, display names, thumbnail, sample variants), the bundled asset
// file names, and the unique `<bucket>/<id>` resolution behind them. Every bad
// field THROWS with a located message — the assembly fails the build rather than
// shipping an unsafe or malformed manifest. What the deployed FILES look like
// (chunk plans, pack tiers, the indexes) is `assemble.ts`.

import type { Catalog, CatalogPreset, CatalogVariant } from '../assets/manifest';
// `.ts` extension: scripts/assemble-site.ts imports this module under node's
// type stripping, whose runtime resolution needs the explicit extension.
import { isSafeAssetName } from '../assets/paths.ts';

/** The most sample-variants a preset may declare (a sanity bound; realistic
 * presets ship one or two). One LESS than the Designer's MAX_VARIANTS (12):
 * the default `params.json` joins the declared ones as its own variant, and a
 * declared variant past the runtime cap would be silently dropped, not shown. */
export const MAX_PRESET_VARIANTS = 11;
/** A variant id's charset: lowercase so the derived `params-<id>.json` matches
 * the file the runtime fetches (the same lowercase-or-reject posture the locale
 * index uses). */
const VARIANT_ID = /^[a-z0-9-]+$/;

const TAG = /^[a-zA-Z0-9-]+$/;

function isTag(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && TAG.test(value);
}

/** Resolve the discovered `<bucket>/<id>` preset dirs to a unique id -> bucket
 * map. `examples/` groups samples by document kind, but the catalog id stays
 * the LEAF dir name (published `presets/<id>/` URLs must not move and
 * `isSafeAssetName` forbids slashes) — so two buckets claiming one id would
 * collide into a single output dir, silently shipping whichever copied last.
 * Insertion order is preserved so the assembly walk stays deterministic. */
export function resolvePresetBuckets(
  entries: readonly { id: string; bucket: string }[],
): Map<string, string> {
  const byId = new Map<string, string>();
  for (const { id, bucket } of entries) {
    const previous = byId.get(id);
    if (previous !== undefined) {
      throw new Error(`preset ${id}: duplicate id in ${previous} and ${bucket}`);
    }
    byId.set(id, bucket);
  }
  return byId;
}

/** Validate a parsed `preset.yml` for a preset dir named `id`, returning the
 * catalog entry. Throws with a located message on any bad field — the assembly
 * fails the build rather than shipping an unsafe or malformed manifest. */
export function validatePreset(id: string, raw: unknown): CatalogPreset {
  const where = `preset ${id}`;
  if (!isSafeAssetName(id)) {
    throw new Error(`${where}: unsafe preset directory name`);
  }
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`${where}: manifest is not a map`);
  }
  const m = raw as Record<string, unknown>;

  if (!Array.isArray(m.locales) || m.locales.length === 0 || !m.locales.every(isTag)) {
    throw new Error(`${where}: 'locales' must be a non-empty list of locale tags`);
  }
  if (!isTag(m.engineLocale)) {
    throw new Error(`${where}: 'engineLocale' must be a locale tag`);
  }
  if (typeof m.name !== 'object' || m.name === null || Array.isArray(m.name)) {
    throw new Error(`${where}: 'name' must be a map of language → display name`);
  }
  const nameEntries = Object.entries(m.name as Record<string, unknown>);
  if (nameEntries.length === 0 || !nameEntries.every(([, v]) => typeof v === 'string')) {
    throw new Error(`${where}: 'name' must map each language to a string`);
  }
  if (typeof m.thumbnail !== 'string' || !isSafeAssetName(m.thumbnail)) {
    throw new Error(`${where}: 'thumbnail' must be a safe file name`);
  }

  const preset: CatalogPreset = {
    id,
    locales: m.locales.map((tag) => tag.toLowerCase()),
    engineLocale: m.engineLocale,
    name: Object.fromEntries(nameEntries) as Record<string, string>,
    thumbnail: m.thumbnail,
  };
  const variants = validateVariants(where, m.variants);
  return variants === null ? preset : { ...preset, variants };
}

/** The catalog entry for a preset once the assembly has LOOKED at its
 * directory: the manifest-declared fields plus the two facts only the
 * filesystem knows — which asset files it bundles, and whether it carries a
 * `definitions.yml`. Both are omitted when false/empty so the emitted catalog
 * stays as small as it was.
 *
 * Pure, and separate from the copying loop that calls it, because the
 * assembly script itself runs in NO gate (`make gui:verify` never invokes it),
 * so a decision left inline there is a decision nothing checks. */
export function presetWithFiles(
  preset: CatalogPreset,
  assets: readonly string[],
  hasDefinitions: boolean,
): CatalogPreset {
  const withAssets = assets.length > 0 ? { ...preset, assets } : preset;
  return hasDefinitions ? { ...withAssets, definitions: true } : withAssets;
}

/** Validate a preset's optional `variants` list. Absent → `null` (no variants).
 * Each entry needs a lowercase-safe id (the runtime fetches `params-<id>.json`,
 * so a name the fetch couldn't reproduce must fail the build) and a non-empty
 * localized name map; ids must be unique and the count bounded. */
function validateVariants(where: string, raw: unknown): readonly CatalogVariant[] | null {
  if (raw === undefined) {
    return null;
  }
  if (!Array.isArray(raw)) {
    throw new Error(`${where}: 'variants' must be a list`);
  }
  if (raw.length > MAX_PRESET_VARIANTS) {
    throw new Error(`${where}: too many variants (max ${MAX_PRESET_VARIANTS})`);
  }
  const seen = new Set<string>();
  const variants: CatalogVariant[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error(`${where}: each variant must be a map`);
    }
    const v = entry as Record<string, unknown>;
    if (typeof v.id !== 'string' || !VARIANT_ID.test(v.id)) {
      throw new Error(`${where}: a variant 'id' must match ${VARIANT_ID} (lowercase)`);
    }
    if (v.id === 'default') {
      throw new Error(`${where}: variant id 'default' is reserved for the base params.json`);
    }
    if (seen.has(v.id)) {
      throw new Error(`${where}: duplicate variant id ${JSON.stringify(v.id)}`);
    }
    seen.add(v.id);
    if (typeof v.name !== 'object' || v.name === null || Array.isArray(v.name)) {
      throw new Error(`${where}: variant ${JSON.stringify(v.id)} 'name' must be a map`);
    }
    const nameEntries = Object.entries(v.name as Record<string, unknown>);
    if (nameEntries.length === 0 || !nameEntries.every(([, val]) => typeof val === 'string')) {
      throw new Error(
        `${where}: variant ${JSON.stringify(v.id)} 'name' must map languages to strings`,
      );
    }
    variants.push({ id: v.id, name: Object.fromEntries(nameEntries) as Record<string, string> });
  }
  return variants;
}

/** Validate a preset's bundled asset file names (the `assets/` dir listing),
 * returning them sorted + deduped. An unsafe name FAILS the build — the
 * runtime fetches `presets/<id>/assets/<name>` and injects `assets/<name>`,
 * so a name the guard would reject at runtime must never deploy (rename the
 * file, don't ship it). */
export function validateAssetNames(id: string, names: readonly string[]): readonly string[] {
  for (const name of names) {
    if (!isSafeAssetName(name)) {
      throw new Error(`preset ${id}: unsafe asset file name ${JSON.stringify(name)}`);
    }
  }
  return [...new Set(names)].sort();
}

/** Build the catalog payload from validated presets, in deterministic id order. */
export function buildCatalog(presets: readonly CatalogPreset[]): Catalog {
  return { presets: [...presets].sort((a, b) => a.id.localeCompare(b.id)) };
}
