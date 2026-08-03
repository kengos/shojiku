// Generation of a font pack from a catalog family: the engine ids, the sha256
// digests, and the `manifest.yml` text.
//
// The manifest is the artifact that must survive leaving the browser — the CLI
// reads the exported one and auto-fetches each face from its `url:` pin,
// checking the bytes against the `sha256:` recorded here. So the digest is
// computed over the EXACT bytes that get injected (one buffer, no second
// fetch), and the file is built with a YAML serializer, never string
// concatenation: the family name is upstream data, and a name containing `:`,
// a newline, or a `#` would otherwise rewrite the document's structure.

import { Document } from 'yaml';
import type { CatalogFace, CatalogFamily } from './catalog';
import { packIdForFamilyId } from './packId';

/** The pack id (and `packs/fonts/<id>/` directory name) for a family. The
 * minting — and the engine rule it must satisfy — lives in `./packId`. */
export function packIdFor(family: CatalogFamily): string {
  return packIdForFamilyId(family.id);
}

/** The `fontFamily` value an author writes to use this family. Every face of
 * the family shares it; the engine variant-selects within it by weight/style. */
export function familyIdFor(family: CatalogFamily): string {
  return packIdFor(family);
}

/** One face's id: the family id, suffixed per variant so ids stay unique
 * within the flat namespace (`gf-lato`, `gf-lato-bold`, …). */
export function faceIdFor(family: CatalogFamily, face: CatalogFace): string {
  const suffix = `${face.weight === 'bold' ? '-bold' : ''}${face.style === 'italic' ? '-italic' : ''}`;
  return `${familyIdFor(family)}${suffix}`;
}

/** A face paired with the bytes fetched for it and their digest. */
export interface HashedFace {
  readonly face: CatalogFace;
  readonly sha256: string;
  readonly bytes: Uint8Array;
}

/** Lowercase-hex sha256 of the exact bytes, via SubtleCrypto (injected so the
 * node test environment supplies its own). This is the pin the CLI re-checks on
 * a fresh machine, so it must never be computed from a re-fetch. */
export async function sha256Hex(subtle: SubtleCrypto, bytes: Uint8Array): Promise<string> {
  // Copy into a fresh ArrayBuffer: a Uint8Array view over a larger pooled
  // buffer would otherwise hash the whole backing store.
  const digest = await subtle.digest('SHA-256', bytes.slice().buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Build the pack's `manifest.yml` text.
 *
 * `redistributable: true` is correct for both licences the snapshot carries
 * (OFL-1.1 and Apache-2.0 both permit redistribution); the license text travels
 * beside the manifest in the export kit, which is what the terms require. */
export function buildManifest(family: CatalogFamily, hashed: readonly HashedFace[]): string {
  const doc = new Document({
    version: 1,
    license: family.license,
    redistributable: true,
    faces: hashed.map(({ face, sha256 }) => {
      const entry: Record<string, string> = {
        id: faceIdFor(family, face),
        file: face.file,
        sha256,
        url: face.url,
        family: familyIdFor(family),
      };
      if (face.weight !== undefined) {
        entry.weight = face.weight;
      }
      if (face.style !== undefined) {
        entry.style = face.style;
      }
      return entry;
    }),
  });
  return doc.toString({ lineWidth: 0 });
}
