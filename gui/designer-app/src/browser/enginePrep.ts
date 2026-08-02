// Preparing ONE engine instance for a document: boot it for the locale, wrap it
// in the lazy-font loader, and (when the module advertises the picker
// capabilities) give it a `FontController`. Plus the picker's specimen loader,
// which registers a fetched face under a throwaway CSS name. Part of the
// browser-entry group (`src/browser/`, coverage-excluded with `main.tsx`) — it
// constructs the real wasm Engine and touches `crypto.subtle` / `FontFace`;
// everything it decides FROM is a pure module that carries the 100% gate
// (`engine/boot`, `engine/lazyFonts`, `fonts/controller`).

import { createWasmTransport, type FontSource } from '@shojiku/designer';
import type { AppServices } from '../app/services';
import type { FontIndex } from '../assets/manifest';
import { bootEngine } from '../engine/boot';
import { LazyFontLoader } from '../engine/lazyFonts';
import type { LocaleSource } from '../engine/localeSource';
import type { WasmModule } from '../engine/wasmModule';
import type { CatalogFamily } from '../fonts/catalog';
import { FontController, pickerCapable } from '../fonts/controller';
import { composeFontSource, FontLibrary } from '../fonts/library';
import type { GoogleFontSource } from '../fonts/source';

export interface EnginePrepDeps {
  /** The engine module, possibly STILL IN FLIGHT. Catalog-first boot starts the
   * fetch and renders the catalog without waiting for it, so the await lands
   * here — on the first preset open — instead of in front of the whole app. The
   * picker capability check moves in with it, since the capability list is not
   * known until the module resolves. */
  readonly wasm: Promise<WasmModule>;
  readonly index: FontIndex;
  readonly locales: LocaleSource;
  readonly google: GoogleFontSource;
  /** The registry-collected font source chain (bundled + integrator packs). */
  readonly bootFonts: FontSource;
}

export function makePrepareEngine(deps: EnginePrepDeps): AppServices['prepareEngine'] {
  const { wasm: wasmPromise, index, locales, google, bootFonts } = deps;
  return async (engineLocale, onProgress) => {
    const wasm = await wasmPromise;
    const canPick = pickerCapable(wasm.capabilities);
    const engine = new wasm.Engine();
    // Locales without an engine builtin (zh-TW, zh-CN, …) ship as packs:
    // fetch the pack text so setLocale resolves. `null` = builtin locale.
    const localeOverlay = await locales.overlayFor(engineLocale);
    const library = new FontLibrary();
    const composed = composeFontSource(bootFonts, library);
    const { absentPackIds, packIds, familyIds, defaultFamily } = await bootEngine({
      engine,
      capabilities: wasm.capabilities,
      localeTag: engineLocale,
      localeOverlay,
      index,
      fonts: composed,
      onProgress,
    });

    // The lazy loader's pack list is LIVE: a font picked after boot joins the
    // re-inject set, so a later missing_glyph upgrade cannot drop it. It is
    // always the FULL boot set (primary + lazy — the run is fetching the lazy
    // bytes) plus the picked packs; the controller's narrower loadable set is
    // for picks, not for upgrades.
    const loader = new LazyFontLoader({
      engine,
      fonts: composed,
      packIds: () => [...packIds, ...library.packIds()],
      absentPackIds,
    });
    let controller: FontController | null = null;
    if (canPick) {
      controller = new FontController({
        engine,
        library,
        google,
        base: composed,
        subtle: crypto.subtle,
        localeTag: engineLocale,
        baseOverlay: localeOverlay,
        baseUses: JSON.parse(engine.fontPacksNeeded()) as string[],
        primaryPackIds: packIds.filter((id) => !absentPackIds.includes(id)),
        lazyPackIds: absentPackIds,
        lazyLoaded: () => loader.status === 'upgraded',
      });
    }
    return {
      transport: createWasmTransport(engine),
      loader,
      fonts: controller,
      familyIds,
      defaultFamily,
      capabilities: wasm.capabilities,
      injectAssets: (assets) => {
        for (const asset of assets) {
          engine.addAssetFile(`assets/${asset.name}`, asset.bytes);
        }
      },
    };
  };
}

/** The picker's specimen: fetch the family's regular face (allowlist + cap
 * enforced by the google source) and register it under a throwaway CSS name. */
export function makeSpecimen(
  google: GoogleFontSource,
): (family: CatalogFamily) => Promise<string | null> {
  return async (family) => {
    const bytes = await google.face(family.faces[0].url);
    const name = `gf-specimen-${family.id}`;
    const face = new FontFace(name, bytes.slice().buffer as ArrayBuffer);
    await face.load();
    // lib.dom models FontFaceSet as a plain Set-like without `add` in this TS
    // version; the runtime API is standard.
    (document.fonts as unknown as { add(f: FontFace): void }).add(face);
    return name;
  };
}
