// The font source: fetches a pack's manifest + face bytes from the static asset
// tree, reassembling any face the assembly split into `<name>.partNN` chunks
// (the 45 MB rare-kanji fallback exceeds Cloudflare Pages' 25 MiB/file cap).
// Pure over an injected `fetch` + a constant base URL, so it is unit-coverable
// without a network. sha256 verification is NOT done here — it stays engine-
// side at injection; this module only assembles bytes.

import type { FontFile, FontIndex, FontPack } from '../assets/manifest';

/** Fetches a single URL's bytes. Injected so tests supply a fake and the
 * browser passes `window.fetch`. */
export type FetchBytes = (url: string) => Promise<Uint8Array>;
/** Fetches a single URL's text (the pack manifest). */
export type FetchText = (url: string) => Promise<string>;

/** A hard ceiling on any single reassembled face, checked BEFORE concatenation
 * so a tampered index can't drive an unbounded allocation. The heaviest bundled
 * face (ipamj-mincho) is ~45 MB; 64 MiB leaves headroom without inviting abuse. */
export const MAX_FACE_BYTES = 64 * 1024 * 1024;

// The `FontSource` interface itself lives with the hook registry (an
// `init:fonts` contribution implements the same shape); re-exported so the
// app's engine modules keep one import home for it.
import type { FontSource } from '@shojiku/designer';

export type { FontSource } from '@shojiku/designer';

/** Pack ids by tier. `primary` is fetched eagerly (first paint); `lazy` is
 * fetched only when a `missing_glyph` fires. Ordered for determinism. */
export function packIdsByTier(index: FontIndex, tier: FontPack['tier']): readonly string[] {
  return Object.keys(index.packs)
    .filter((id) => index.packs[id].tier === tier)
    .sort();
}

/** Look up a face's chunk plan in the index; `undefined` when the pack or face
 * is not indexed (a build inconsistency the caller surfaces). */
function faceEntry(index: FontIndex, packId: string, file: string): FontFile | undefined {
  const pack = index.packs[packId];
  if (pack === undefined || !Object.hasOwn(pack.files, file)) {
    return undefined;
  }
  return pack.files[file];
}

/** Reassemble a face from its parts (or fetch it whole), size-capped. Exposed
 * for the unit tests; `makeFontSource` wraps it with the base-URL joining. */
export async function fetchFace(
  fetchBytes: FetchBytes,
  base: string,
  packId: string,
  entry: FontFile,
): Promise<Uint8Array> {
  if (entry.size > MAX_FACE_BYTES) {
    throw new Error(`font face ${packId}/${entry.name} exceeds the size cap`);
  }
  const names = entry.parts ?? [entry.name];
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (const name of names) {
    const bytes = await fetchBytes(`${base}fonts/${packId}/${name}`);
    total += bytes.length;
    if (total > MAX_FACE_BYTES) {
      throw new Error(`font face ${packId}/${entry.name} exceeds the size cap`);
    }
    chunks.push(bytes);
  }
  if (chunks.length === 1) {
    return chunks[0];
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** Build a `FontSource` bound to the asset base URL and the font index. */
export function makeFontSource(deps: {
  readonly fetchText: FetchText;
  readonly fetchBytes: FetchBytes;
  readonly base: string;
  readonly index: FontIndex;
}): FontSource {
  const { fetchText, fetchBytes, base, index } = deps;
  return {
    manifest: (packId) => fetchText(`${base}fonts/${packId}/manifest.yml`),
    face: (packId, file) => {
      const entry = faceEntry(index, packId, file);
      if (entry === undefined) {
        return Promise.reject(new Error(`font face ${packId}/${file} is not in the index`));
      }
      return fetchFace(fetchBytes, base, packId, entry);
    },
  };
}
