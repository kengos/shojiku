// The per-editor-session font controller: one object the editor screen talks
// to for everything picked-font — pick, draft restore, the export overlay, and
// the family list the property panel offers. It owns the wiring judgment calls
// so the browser entry stays glue:
//
// - The overlay always restates the locale's FULL `uses` (a lazy pack must stay
//   declared while absent, or the `missing_glyph` upgrade never fires again).
// - Injection re-sends only what the store actually holds: the primary packs,
//   plus the lazy ones once the lazy loader has fetched them. Injecting a
//   never-fetched 45 MB fallback on every pick would stall the preview for
//   nothing.

import type { FontSource } from '../engine/fontSource';
import type { WasmFullEngine } from '../engine/wasmModule';
import type { CatalogFamily } from './catalog';
import { applyLibrary, fetchFamily } from './install';
import type { FontLibrary, InstalledFont } from './library';
import { composeOverlay } from './overlay';
import type { GoogleFontSource } from './source';

/** The capability the picker's manifest GENERATION rides (the `url:` pin). */
export const URL_CAPABILITY = 'fonts.face.url';
/** The capability the draft-reload path rides (`fontFacesNeeded`). */
export const FACES_CAPABILITY = 'wasm.fonts.faces';

/** Whether the engine can host the font picker at all — the feature gate
 * (capability keys, never version sniffing). */
export function pickerCapable(capabilities: readonly string[]): boolean {
  return capabilities.includes(URL_CAPABILITY) && capabilities.includes(FACES_CAPABILITY);
}

export interface FontControllerDeps {
  readonly engine: WasmFullEngine;
  readonly library: FontLibrary;
  readonly google: GoogleFontSource;
  /** The bundled packs' bytes (the composed source is fine too — the library
   * half of it simply never gets asked for a bundled pack). */
  readonly base: FontSource;
  readonly subtle: SubtleCrypto;
  readonly localeTag: string;
  readonly baseOverlay: string | null;
  /** The locale's full declared `uses` list (from `fontPacksNeeded` at boot). */
  readonly baseUses: readonly string[];
  /** The packs boot injected (the primary lineup). */
  readonly primaryPackIds: readonly string[];
  /** The packs boot skipped (lazy), joined into injection once loaded. */
  readonly lazyPackIds: readonly string[];
  /** Whether the lazy packs' bytes have been fetched (the loader upgraded). */
  readonly lazyLoaded: () => boolean;
}

/** One editor session's picked-font state over a live engine. */
export class FontController {
  private readonly deps: FontControllerDeps;

  constructor(deps: FontControllerDeps) {
    this.deps = deps;
  }

  /** The `fontFamily` values the property panel offers, in pick order. */
  familyIds(): readonly string[] {
    return this.deps.library.familyIds();
  }

  /** The picked fonts — what a draft persists and the export kit carries. */
  list(): readonly InstalledFont[] {
    return this.deps.library.list();
  }

  /** Fetch, pin, and install one catalog family, reloading the store so the
   * next render can use it. Rejects without partial state: a failed face fetch
   * installs nothing. */
  async pick(family: CatalogFamily): Promise<void> {
    const { library, google, subtle } = this.deps;
    const { font, bytes } = await fetchFamily(family, { source: google, subtle });
    library.add(font);
    for (const [file, faceBytes] of bytes) {
      library.remember(font.packId, file, faceBytes);
    }
    await this.apply();
  }

  /** Restore a draft's picked fonts (manifests only, no bytes) and reload; the
   * bytes come back through each manifest's `url:` pin. */
  async restore(fonts: readonly InstalledFont[]): Promise<void> {
    this.deps.library.restore(fonts);
    await this.apply();
  }

  /** Re-inject + reload so the library's packs are live in the store. */
  async apply(): Promise<readonly string[]> {
    const { engine, library, google, base, localeTag, baseOverlay, baseUses } = this.deps;
    return applyLibrary({
      engine,
      library,
      source: google,
      base,
      localeTag,
      baseOverlay,
      baseUses,
      injectPackIds: this.bundledLoadable(),
      composeOverlay,
    });
  }

  /** The overlay the EXPORT kit ships: the locale's full `uses` plus every
   * picked pack — the CLI needs the whole chain declared, including the lazy
   * fallback the browser may never have fetched. */
  exportOverlay(): string {
    return composeOverlay(this.deps.baseOverlay, [
      ...this.deps.baseUses,
      ...this.deps.library.packIds(),
    ]);
  }

  private bundledLoadable(): readonly string[] {
    const { primaryPackIds, lazyPackIds, lazyLoaded } = this.deps;
    return lazyLoaded() ? [...primaryPackIds, ...lazyPackIds] : primaryPackIds;
  }
}
