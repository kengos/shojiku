// What the assembled site's FILES look like: a font face's chunk plan, a pack's
// tier, and the font + locale indexes the app fetches. The filesystem IO (glob /
// read / write / copy) lives in the thin scripts/assemble-site.ts wrapper over
// these; keeping the decisions here makes them unit-testable (tier boundary,
// chunk splitting, the lowercase locale-name rule). What a preset DECLARES is
// validated in `presetManifest.ts`, re-exported here so the assembly script and
// the catalog tests keep one import surface.

import type { FontFile, FontIndex, FontPack, LocaleIndex } from '../assets/manifest';
// `.ts` extension: scripts/assemble-site.ts imports this module under node's
// type stripping, whose runtime resolution needs the explicit extension.
import { isSafeAssetName } from '../assets/paths.ts';

export {
  buildCatalog,
  MAX_PRESET_VARIANTS,
  resolvePresetBuckets,
  validateAssetNames,
  validatePreset,
} from './presetManifest.ts';

/** Faces larger than this are split so no deployed file exceeds a static host's
 * per-file cap (Cloudflare Pages: 25 MiB). */
export const CHUNK_THRESHOLD = 20 * 1024 * 1024;
/** Each emitted chunk is at most this — comfortably under the 25 MiB cap. */
export const CHUNK_SIZE = 16 * 1024 * 1024;
/** A pack whose faces total more than this loads lazily (only on a
 * `missing_glyph`), so the primary lineup paints the first preview. */
export const LAZY_THRESHOLD = 25 * 1024 * 1024;

/** The ordered chunk file names for a face split into `CHUNK_SIZE` pieces. */
export function partNames(name: string, size: number): readonly string[] {
  const count = Math.ceil(size / CHUNK_SIZE);
  return Array.from({ length: count }, (_, i) => `${name}.part${String(i).padStart(2, '0')}`);
}

/** The font-index entry for one face: chunked (with part names) when it exceeds
 * the per-file cap, whole otherwise. */
export function planFace(name: string, size: number): FontFile {
  if (size > CHUNK_THRESHOLD) {
    return { name, size, parts: partNames(name, size) };
  }
  return { name, size };
}

/** A pack's tier from its total face bytes. */
export function packTier(totalBytes: number): FontPack['tier'] {
  return totalBytes > LAZY_THRESHOLD ? 'lazy' : 'primary';
}

/** Assemble a pack's index entry from its face files (name + byte size). */
export function buildFontPack(faces: readonly { name: string; size: number }[]): FontPack {
  const total = faces.reduce((sum, f) => sum + f.size, 0);
  const files: Record<string, FontFile> = {};
  for (const face of faces) {
    files[face.name] = planFace(face.name, face.size);
  }
  return { tier: packTier(total), files };
}

/** Build the locale index from `packs/locale/` file names (`zh-tw.yml`), in
 * deterministic id order. An unsafe OR non-lowercase name fails the build:
 * the runtime fetches `locale/<lowercased-tag>.yml` and the CLI's
 * `find_locale_file` lowercases the id the same way, so a `pt-BR.yml` would
 * index as `pt-br` yet deploy under its original name — a guaranteed 404 (and
 * a pack the CLI can never find either). Rename the file, don't ship it. */
export function buildLocaleIndex(fileNames: readonly string[]): LocaleIndex {
  const locales = fileNames
    .filter((name) => name.endsWith('.yml'))
    .map((name) => {
      if (!isSafeAssetName(name)) {
        throw new Error(`locale pack: unsafe file name ${JSON.stringify(name)}`);
      }
      if (name !== name.toLowerCase()) {
        throw new Error(
          `locale pack: file name ${JSON.stringify(name)} must be lowercase (the runtime and the CLI both resolve <lowercased-id>.yml)`,
        );
      }
      return name.slice(0, -'.yml'.length);
    })
    .sort();
  return { locales };
}

/** Build the font index from packs, in deterministic pack-id order. */
export function buildFontIndex(
  packs: readonly { id: string; faces: readonly { name: string; size: number }[] }[],
): FontIndex {
  const entries: Record<string, FontPack> = {};
  for (const pack of [...packs].sort((a, b) => a.id.localeCompare(b.id))) {
    entries[pack.id] = buildFontPack(pack.faces);
  }
  return { packs: entries };
}
