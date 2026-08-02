// The real browser loader for the `engine/wasm` build artifact. Coverage-
// excluded: it dynamic-imports the gitignored `pkg/` (a non-literal specifier so
// `tsc` never binds the app to the artifact) and touches browser-only globals,
// so it is exercised by the browser (main.tsx) and the node integration test,
// not by unit tests. Everything with logic lives in the injected-dependency
// modules (boot / fontSource / lazyFonts) that DO take the 100% coverage gate.

import type { WasmEngine } from '@shojiku/designer';

/** The full `engine/wasm` Engine surface the app drives — the transport's
 * `WasmEngine` subset (`validate`/`renderRaw`) plus the locale + font-injection
 * ops the boot/lazy-fetch flow needs. Typed structurally so the gitignored pkg
 * is never a static import. */
export interface WasmFullEngine extends WasmEngine {
  setLocale(id: string, overlay?: string | null): void;
  fontPacksNeeded(): string;
  fontFilesNeeded(packId: string): string;
  /** JSON `[{ file, url? }]` — the face list plus each face's pinned fetch
   * hint, for a pack that travels as a reference (`wasm.fonts.faces`). */
  fontFacesNeeded(packId: string): string;
  addFontPack(id: string, manifest: string): void;
  addFontFile(packId: string, file: string, bytes: Uint8Array): void;
  /** Injects one bundled asset's bytes under its template-referenced relative
   * path (`assets/<name>`); the session retains it across renders. */
  addAssetFile(rel: string, bytes: Uint8Array): void;
  loadFontsSubset(): string;
  /** Present only on an engine advertising `wasm.render.pdf` — the transport
   * gates on it, so an older module simply offers no PDF action. */
  renderPdf?(template: string, params: string, definitions: string | null | undefined): unknown;
}

/** A loaded wasm module: the Engine constructor + the engine's capability keys
 * (read once from the static `capabilities()` so the boot flow stays a pure
 * function of an already-parsed list). */
export interface WasmModule {
  readonly Engine: new () => WasmFullEngine;
  readonly capabilities: readonly string[];
}

interface RawModule {
  default: (input?: unknown) => Promise<unknown>;
  Engine: { new (): WasmFullEngine; capabilities(): string };
}

/** Instantiate the wasm module (browser). `pkgBase` is the served dir holding
 * the assembled `pkg/` output (trailing slash). A non-literal specifier keeps
 * tsc from resolving the gitignored artifact at build time.
 *
 * `input` is an already-started fetch of the `.wasm` byte file — how the app
 * hands the init a progress-observing response (`browser/moduleFetch.ts`) while
 * keeping streaming compilation. Omitted, the generated init resolves and fetches
 * the file itself, which is what the node integration tests and any lean host
 * rely on. */
export async function loadWasmModule(
  pkgBase: string,
  input?: Promise<Response>,
): Promise<WasmModule> {
  const pkgUrl = new URL('shojiku_wasm.js', pkgBase).href;
  const mod = (await import(/* @vite-ignore */ pkgUrl)) as RawModule;
  // The OBJECT form is the generated init's supported calling convention: a
  // bare positional argument that is not a plain object (our Promise) takes its
  // deprecation branch and logs "using deprecated parameters…" on every boot.
  await mod.default(input === undefined ? undefined : { module_or_path: input });
  const info = JSON.parse(mod.Engine.capabilities()) as { capabilities: readonly string[] };
  return { Engine: mod.Engine, capabilities: info.capabilities };
}
