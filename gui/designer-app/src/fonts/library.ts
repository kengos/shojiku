// The installed-font library: what the session holds for every picked family,
// and how those packs reach the engine's existing font seams.
//
// The engine CONSUMES injected packs on each load, so anything that reloads the
// store must re-inject every pack — including the picked ones. Rather than
// special-case them at each call site, an installed pack is served through the
// SAME `FontSource` interface as the bundled ones (`composeFontSource`), so the
// boot loop and the lazy `missing_glyph` upgrade keep working unchanged and
// cannot silently drop a picked font.

import type { FontSource, InstalledFont } from '@shojiku/designer';

// The picked-family shape (survives a reload; deliberately holds no font
// bytes — the manifest's `url:` pins re-fetch them) now lives with the hook
// registry's seam types; re-exported so this module stays its app-side home.
export type { InstalledFont } from '@shojiku/designer';

/** Holds the session's picked families plus whatever face bytes have been
 * fetched for them. Mutable and long-lived: the composed `FontSource` closes
 * over it, so an install is visible to every later reload without rewiring. */
export class FontLibrary {
  private readonly fonts = new Map<string, InstalledFont>();
  private readonly bytes = new Map<string, Map<string, Uint8Array>>();

  /** Record a picked family (replacing any earlier pick of the same pack). */
  add(font: InstalledFont): void {
    this.fonts.set(font.packId, font);
    if (!this.bytes.has(font.packId)) {
      this.bytes.set(font.packId, new Map());
    }
  }

  /** Cache a face's bytes so later reloads need no fetch. */
  remember(packId: string, file: string, bytes: Uint8Array): void {
    this.bytes.get(packId)?.set(file, bytes);
  }

  has(packId: string): boolean {
    return this.fonts.has(packId);
  }

  /** The picked families, in pick order. */
  list(): readonly InstalledFont[] {
    return [...this.fonts.values()];
  }

  /** The picked packs' ids — appended to the locale's `uses`. */
  packIds(): readonly string[] {
    return [...this.fonts.keys()];
  }

  /** The `fontFamily` values the property panel offers. */
  familyIds(): readonly string[] {
    return this.list().map((font) => font.familyId);
  }

  manifest(packId: string): string | undefined {
    return this.fonts.get(packId)?.manifest;
  }

  face(packId: string, file: string): Uint8Array | undefined {
    return this.bytes.get(packId)?.get(file);
  }

  /** Restore picked families to EXACTLY the given set — REPLACING whatever is
   * held (draft restore into a fresh library is unchanged; a mid-session restore
   * point drops any font picked after the point was taken). Bytes are absent
   * until the reload fetches them from the manifests' pins. */
  restore(fonts: readonly InstalledFont[]): void {
    this.fonts.clear();
    this.bytes.clear();
    for (const font of fonts) {
      this.add(font);
    }
  }
}

/** A `FontSource` that serves the library's packs and delegates the rest to the
 * static asset tree — so `bootEngine` and the lazy-font loop treat a picked
 * pack exactly like a bundled one. A library pack whose bytes have not been
 * fetched yet rejects rather than falling through to the asset tree, where it
 * would 404 into a confusing error. */
export function composeFontSource(base: FontSource, library: FontLibrary): FontSource {
  return {
    manifest: (packId) => {
      const manifest = library.manifest(packId);
      return manifest === undefined ? base.manifest(packId) : Promise.resolve(manifest);
    },
    face: (packId, file) => {
      if (!library.has(packId)) {
        return base.face(packId, file);
      }
      const bytes = library.face(packId, file);
      return bytes === undefined
        ? Promise.reject(new Error(`font face ${packId}/${file} is not loaded`))
        : Promise.resolve(bytes);
    },
  };
}
