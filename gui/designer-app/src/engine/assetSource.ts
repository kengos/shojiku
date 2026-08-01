// The preset-asset source: fetches a preset's bundled asset files (the
// `examples/<id>/assets/` dir the assembly copied to
// `presets/<id>/assets/<name>`) so the app can inject them into the engine at
// preset-open (`addAssetFile('assets/<name>', bytes)` — templates reference
// them by that relative path). Pure over an injected `fetch` + a constant base
// URL, so it is unit-coverable without a network. The engine confines and caps
// injected assets exactly like the filesystem path; this module only assembles
// bytes, with its own defense-in-depth guards over the runtime-fetched catalog.

import { isSafeAssetName } from '../assets/paths';
import type { FetchBytes } from './fontSource';

/** A hard ceiling per fetched asset, mirroring the engine's `AssetPolicy`
 * default (`max_asset_bytes` 8 MiB) — bytes the engine would reject anyway are
 * never buffered app-side. */
export const MAX_PRESET_ASSET_BYTES = 8 * 1024 * 1024;

// The asset shape lives with the hook registry's preset-contribution types;
// re-exported so this module stays its app-side home.
import type { PresetAsset } from '@shojiku/designer';

export type { PresetAsset } from '@shojiku/designer';

export interface AssetSourceParams {
  readonly fetchBytes: FetchBytes;
  /** Constant base URL of the assembled data tree (trailing slash). */
  readonly base: string;
}

/** Fetch a preset's asset files by name. Every name is re-checked against the
 * safe charset at runtime (the catalog is fetched data — a TS type is
 * compile-time only; same posture as `thumbnailUrl`), and each file's real
 * byte length is capped. Order follows the given (assembly-sorted) list. */
export async function loadPresetAssets(
  params: AssetSourceParams,
  presetId: string,
  names: readonly string[],
): Promise<readonly PresetAsset[]> {
  const { fetchBytes, base } = params;
  if (!isSafeAssetName(presetId)) {
    throw new Error('unsafe preset id');
  }
  const assets: PresetAsset[] = [];
  for (const name of names) {
    if (!isSafeAssetName(name)) {
      throw new Error(`preset ${presetId}: unsafe asset name`);
    }
    const bytes = await fetchBytes(`${base}presets/${presetId}/assets/${name}`);
    if (bytes.length > MAX_PRESET_ASSET_BYTES) {
      throw new Error(`preset ${presetId}: asset ${name} exceeds the size cap`);
    }
    assets.push({ name, bytes });
  }
  return assets;
}
