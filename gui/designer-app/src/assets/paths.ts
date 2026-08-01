// Runtime guard for manifest-derived asset names. The assembly script is the
// primary control (it rejects unsafe names at build time), but the app joins
// only fixed relative paths to a constant base and re-checks the charset here as
// defense in depth — a name with a path separator or `..` yields no URL rather
// than escaping the asset tree.

import type { CatalogPreset } from './manifest';

const SAFE_NAME = /^[A-Za-z0-9._-]+$/;

/** Whether a single path segment is a safe fixed-charset name (no separators,
 * no traversal). */
export function isSafeAssetName(name: string): boolean {
  return SAFE_NAME.test(name) && name !== '.' && name !== '..';
}

/** The thumbnail URL for a preset, or `null` when the id/thumbnail name fails
 * the charset guard (the card then renders without an image). */
export function thumbnailUrl(base: string, preset: CatalogPreset): string | null {
  if (!isSafeAssetName(preset.id) || !isSafeAssetName(preset.thumbnail)) {
    return null;
  }
  return `${base}presets/${preset.id}/${preset.thumbnail}`;
}
