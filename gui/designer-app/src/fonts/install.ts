// Installing a picked family into a live engine.
//
// Two entry points, one shared tail:
//
// - `fetchFamily` turns a catalog entry into an `InstalledFont` — fetch each
//   face ONCE, hash those exact bytes, and record the digest in the manifest.
//   Fetch-then-pin over one buffer: hashing a re-fetch would pin bytes that
//   were never the ones injected.
// - `applyLibrary` re-injects every pack and reloads the store, which is what
//   makes a picked font visible to the preview. It resolves each face's bytes
//   from the library, or — on a draft reload, where the manifest survived but
//   the bytes did not — from the manifest's own `url:` pin, read back out of
//   the engine via `fontFacesNeeded`. That is the seam: the host never parses
//   `manifest.yml` itself, so there is no second grammar to keep in sync.

import type { WasmFullEngine } from '../engine/wasmModule';
import type { CatalogFamily } from './catalog';
import type { FontLibrary, InstalledFont } from './library';
import { buildManifest, familyIdFor, type HashedFace, packIdFor, sha256Hex } from './manifest';
import { FontFetchError, type GoogleFontSource } from './source';

/** One face as the engine reports it back from a declared manifest. */
interface NeededFace {
  readonly file: string;
  readonly url?: string;
}

export interface FetchFamilyDeps {
  readonly source: GoogleFontSource;
  readonly subtle: SubtleCrypto;
}

/** Fetch, hash, and describe a picked family. The returned bytes are the exact
 * ones the digests cover — hand them to the library so nothing re-fetches. */
export async function fetchFamily(
  family: CatalogFamily,
  deps: FetchFamilyDeps,
): Promise<{ font: InstalledFont; bytes: Map<string, Uint8Array> }> {
  const hashed: HashedFace[] = [];
  for (const face of family.faces) {
    const bytes = await deps.source.face(face.url);
    hashed.push({ face, sha256: await sha256Hex(deps.subtle, bytes), bytes });
  }
  const licenseText = await deps.source.license(family.licenseUrl);

  const font: InstalledFont = {
    packId: packIdFor(family),
    familyId: familyIdFor(family),
    displayName: family.family,
    manifest: buildManifest(family, hashed),
    licenseFile: family.licenseFile,
    licenseText,
  };
  const bytes = new Map(hashed.map((h) => [h.face.file, h.bytes]));
  return { font, bytes };
}

export interface ApplyLibraryDeps {
  readonly engine: WasmFullEngine;
  readonly library: FontLibrary;
  readonly source: GoogleFontSource;
  /** Bundled packs' bytes (the static asset tree). */
  readonly base: {
    manifest(packId: string): Promise<string>;
    face(packId: string, file: string): Promise<Uint8Array>;
  };
  readonly localeTag: string;
  /** The locale's own overlay text (a shipped pack), or `null` for a builtin. */
  readonly baseOverlay: string | null;
  /** The locale's FULL declared `uses` list — what the overlay must restate.
   * This is deliberately wider than `injectPackIds`: a lazy pack (the rare-kanji
   * fallback) must stay in `uses` even while its bytes are not loaded, or the
   * subset load would stop reporting it absent and the `missing_glyph` upgrade
   * would never fire again. */
  readonly baseUses: readonly string[];
  /** The bundled packs whose bytes to (re-)inject now — what the store holds
   * today (primary + any lazy pack a previous upgrade already fetched). */
  readonly injectPackIds: readonly string[];
  /** Compose the overlay naming every pack to load. */
  readonly composeOverlay: (existing: string | null, uses: readonly string[]) => string;
}

/** Re-inject every pack and reload the store so the library's fonts render.
 * Returns the pack ids the load skipped (still absent). */
export async function applyLibrary(deps: ApplyLibraryDeps): Promise<readonly string[]> {
  const { engine, library, localeTag, baseOverlay, baseUses, injectPackIds } = deps;

  // The locale must name the picked packs before the load, or the store has no
  // reason to keep them. Sequences REPLACE on merge, so this restates the whole
  // list rather than appending to it.
  engine.setLocale(
    localeTag,
    deps.composeOverlay(baseOverlay, [...baseUses, ...library.packIds()]),
  );

  for (const packId of [...injectPackIds, ...library.packIds()]) {
    await injectPack(packId, deps);
  }
  return JSON.parse(engine.loadFontsSubset()) as string[];
}

async function injectPack(packId: string, deps: ApplyLibraryDeps): Promise<void> {
  const { engine, library, base } = deps;
  const manifest = library.manifest(packId) ?? (await base.manifest(packId));
  engine.addFontPack(packId, manifest);

  // The engine parses the manifest and reports each face + its pin.
  const faces = JSON.parse(engine.fontFacesNeeded(packId)) as NeededFace[];
  for (const { file, url } of faces) {
    const bytes = await resolveFace(packId, file, url, deps);
    engine.addFontFile(packId, file, bytes);
    library.remember(packId, file, bytes);
  }
}

async function resolveFace(
  packId: string,
  file: string,
  url: string | undefined,
  deps: ApplyLibraryDeps,
): Promise<Uint8Array> {
  const cached = deps.library.face(packId, file);
  if (cached !== undefined) {
    return cached;
  }
  if (!deps.library.has(packId)) {
    return deps.base.face(packId, file);
  }
  // A picked pack with no bytes: a restored draft. The pin is the only way
  // back to them — and it is re-checked against the allowlist before any
  // request, since a draft is user-writable storage.
  if (url === undefined) {
    throw new FontFetchError(`font face ${packId}/${file} has no pinned URL`);
  }
  return deps.source.face(url);
}
