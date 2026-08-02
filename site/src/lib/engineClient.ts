// The site's minimal glue over the raw `engine/wasm` pkg surface (Engine +
// font injection + render). Deliberately NOT @shojiku/designer's transport:
// the site is a standalone package, and the seam it relies on is the wasm
// API itself. Everything here is pure over an injected engine + fetchers so
// the node integration test drives it against the REAL wasm build.

/** The subset of the pkg's Engine class this site uses. */
export interface WasmEngine {
  addAssetFile(rel: string, bytes: Uint8Array): void;
  addFontPack(id: string, manifest: string): void;
  addFontFile(packId: string, file: string, bytes: Uint8Array): void;
  fontFilesNeeded(packId: string): string;
  setLocale(id: string, overlay?: string | null): void;
  loadFontsSubset(): string;
  validate(template: string, params?: string | null, definitions?: string | null): string;
  renderPng(
    template: string,
    params: string,
    definitions: string | null | undefined,
    scale: number,
    pageIndex?: number | null,
  ): { ok: boolean; pages: Uint8Array[]; diagnostics: string };
  renderPdf(
    template: string,
    params: string,
    definitions?: string | null,
  ): { ok: boolean; pdf: Uint8Array; diagnostics: string };
}

export interface Diagnostic {
  severity: string;
  code: string;
  message: string;
}

/** Diagnostics JSON → the typed list (malformed input degrades to a single
 * synthetic error rather than a throw — the caller always gets a list). */
export function parseDiagnostics(json: string): Diagnostic[] {
  try {
    const doc = JSON.parse(json) as { items?: unknown };
    if (!Array.isArray(doc.items)) return [];
    return doc.items.map((it) => {
      const m = (typeof it === "object" && it !== null ? it : {}) as Record<string, unknown>;
      return {
        severity: typeof m.severity === "string" ? m.severity : "error",
        code: typeof m.code === "string" ? m.code : "unknown",
        message: typeof m.message === "string" ? m.message : JSON.stringify(it),
      };
    });
  } catch {
    return [{ severity: "error", code: "bad_diagnostics_json", message: json.slice(0, 200) }];
  }
}

/** One tier's byte source: how the manifest and each face reach the engine.
 * The browser implementation fetches /data/fonts/<tier>/<pack>/…; the node
 * integration test reads packs/fonts + subsetManifest. */
export interface TierSource {
  pack: string;
  manifest(): Promise<string>;
  face(file: string): Promise<Uint8Array>;
}

/** Declare + inject one tier's pack. The face list comes from the engine's
 * own reading of the manifest (fontFilesNeeded), not a second parse here. */
export async function injectTier(engine: WasmEngine, tier: TierSource): Promise<number> {
  engine.addFontPack(tier.pack, await tier.manifest());
  const files = JSON.parse(engine.fontFilesNeeded(tier.pack)) as string[];
  if (files.length === 0) throw new Error(`tier pack ${tier.pack} lists no faces`);
  for (const f of files) engine.addFontFile(tier.pack, f, await tier.face(f));
  return files.length;
}

/** setLocale + subset font load; returns the locale's pack ids still absent
 * (the tier-upgrade signal — non-empty is fine until the JP tier is in). */
export function loadLocale(engine: WasmEngine, locale: string): string[] {
  engine.setLocale(locale);
  return JSON.parse(engine.loadFontsSubset()) as string[];
}

/** Inject a document's bundled assets (session-retained by the engine). */
export function injectAssets(
  engine: WasmEngine,
  assets: readonly { rel: string; bytes: Uint8Array }[],
): void {
  for (const a of assets) engine.addAssetFile(a.rel, a.bytes);
}

export interface RenderOutcome {
  ok: boolean;
  pages: Uint8Array[];
  diagnostics: Diagnostic[];
}

/** Size cap on editor input reaching the engine (S2): generous for hand
 * edits, refusing pasted megabytes before they hit wasm. */
export const MAX_SOURCE_BYTES = 256 * 1024;

export function renderPreview(
  engine: WasmEngine,
  files: { template: string; params: string; definitions?: string },
  scale: number,
): RenderOutcome {
  for (const [name, text] of Object.entries(files)) {
    if (text !== undefined && new TextEncoder().encode(text).length > MAX_SOURCE_BYTES) {
      return {
        ok: false,
        pages: [],
        diagnostics: [
          { severity: "error", code: "source_too_large", message: `${name} exceeds ${MAX_SOURCE_BYTES} bytes` },
        ],
      };
    }
  }
  const r = engine.renderPng(files.template, files.params, files.definitions ?? null, scale);
  return { ok: r.ok, pages: r.pages, diagnostics: parseDiagnostics(r.diagnostics) };
}
