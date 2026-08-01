// The preset sample-variant source: fetches a preset's declared sample-data
// variants (`params-<id>.json`, the files the assembly copied beside
// `params.json`) so the Designer can switch the preview between them. Pure over
// an injected `fetch` + a constant base URL, so it is unit-coverable without a
// network — mirroring `loadPresetAssets`. The catalog is fetched data, so every
// id is re-checked against the safe charset before it reaches a URL (a TS type
// is compile-time only), and each file's real length is capped.

import { MAX_PARAMS_BYTES, type PresetVariant } from '@shojiku/designer';
import type { CatalogVariant } from '../assets/manifest';
import { isSafeAssetName } from '../assets/paths';
import type { FetchText } from './fontSource';

/** A hard ceiling per fetched variant file — the Designer's own sample-data
 * byte cap, so a file the panel would refuse to parse is never buffered. */
export const MAX_VARIANT_BYTES = MAX_PARAMS_BYTES;

export interface VariantSourceParams {
  readonly fetchText: FetchText;
  /** Constant base URL of the assembled data tree (trailing slash). */
  readonly base: string;
}

/** Fetch a preset's declared sample variants by id, in the catalog order. Each
 * id is re-guarded at runtime and its `params-<id>.json` fetched in parallel; a
 * missing/oversized file rejects (the preset open then fails, the same posture
 * as a missing `params.json`). The returned `text` is the raw params JSON. */
export async function loadPresetVariants(
  params: VariantSourceParams,
  presetId: string,
  variants: readonly CatalogVariant[],
): Promise<readonly PresetVariant[]> {
  const { fetchText, base } = params;
  if (!isSafeAssetName(presetId)) {
    throw new Error('unsafe preset id');
  }
  return Promise.all(
    variants.map(async (variant) => {
      if (!isSafeAssetName(variant.id)) {
        throw new Error(`preset ${presetId}: unsafe variant id`);
      }
      const text = await fetchText(`${base}presets/${presetId}/params-${variant.id}.json`);
      if (text.length > MAX_VARIANT_BYTES) {
        throw new Error(`preset ${presetId}: variant ${variant.id} exceeds the size cap`);
      }
      return { id: variant.id, name: variant.name, text };
    }),
  );
}
