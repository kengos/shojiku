// Browser-only engine boot for the site's live blocks: ONE wasm module and
// ONE Engine session shared by every component on the page, with the JP tier
// as an explicit upgrade. This is the thin glue over src/lib/engineClient —
// kept out of the coverage set like designer-app's browser/ group; the logic
// it composes is the tested lib + the real-wasm integration suite.
import { withBase } from "vitepress";
import { TIERS } from "../../src/lib/fonts.ts";
import {
  engineVersion,
  injectAssets,
  injectTier,
  loadLocale,
  renderPreview,
  type RenderOutcome,
  type TierSource,
  type WasmEngine,
} from "../../src/lib/engineClient.ts";

interface WasmModule {
  default(input?: { module_or_path: string | URL }): Promise<unknown>;
  Engine: (new () => WasmEngine) & { capabilities(): string };
}

function tierSource(tier: "immediate" | "lazy-ja", pack: string): TierSource {
  const base = withBase(`/data/fonts/${tier}/${pack}/`);
  return {
    pack,
    manifest: async () => (await fetch(`${base}manifest.yml`)).text(),
    face: async (f) => new Uint8Array(await (await fetch(`${base}${f}`)).arrayBuffer()),
  };
}

let boot: Promise<WasmEngine> | undefined;
let jaLoaded: Promise<void> | undefined;
let capabilities = "";

/**
 * The version the loaded engine reports for ITSELF. site/.data/wasm holds a
 * RELEASED build, so this is also the version a visitor installs — asking the
 * binary rather than carrying a string beside it is what keeps the two from
 * disagreeing.
 */
export async function reportedVersion(): Promise<string> {
  await engine();
  return engineVersion(capabilities);
}

/** The shared session, booted en-US on the immediate tier. */
export function engine(): Promise<WasmEngine> {
  boot ??= (async () => {
    const mod = (await import(/* @vite-ignore */ withBase("/data/wasm/shojiku_wasm.js"))) as WasmModule;
    await mod.default({ module_or_path: withBase("/data/wasm/shojiku_wasm_bg.wasm") });
    capabilities = mod.Engine.capabilities();
    const e = new mod.Engine();
    await injectTier(e, tierSource("immediate", "noto-sans"));
    loadLocale(e, "en-US");
    return e;
  })();
  return boot;
}

/** The explicit JP upgrade: inject BIZ UD, switch the session to ja-JP. */
export function loadJapanese(): Promise<void> {
  jaLoaded ??= (async () => {
    const e = await engine();
    for (const t of TIERS.filter((t) => t.tier === "lazy-ja")) {
      await injectTier(e, tierSource("lazy-ja", t.pack));
    }
    loadLocale(e, "ja-JP");
  })();
  return jaLoaded;
}

export function japaneseLoaded(): boolean {
  return jaLoaded !== undefined;
}

export interface LiveDoc {
  template: string;
  params: string;
  definitions?: string;
}

/** Fetch one staged live example (+ inject its bundled assets). */
export async function fetchLiveDoc(name: "live-flex" | "receipt-ja"): Promise<LiveDoc> {
  const base = withBase(`/data/live/${name}/`);
  const text = async (f: string): Promise<string> => (await fetch(`${base}${f}`)).text();
  const [template, params, definitions, indexText] = await Promise.all([
    text("templates.yml"),
    text("params.json"),
    text("definitions.yml"),
    text("index.json"),
  ]);
  const e = await engine();
  const { assets } = JSON.parse(indexText) as { assets: string[] };
  injectAssets(
    e,
    await Promise.all(
      assets.map(async (f) => ({
        rel: `assets/${f}`,
        bytes: new Uint8Array(await (await fetch(`${base}assets/${f}`)).arrayBuffer()),
      })),
    ),
  );
  return { template, params, definitions };
}

export async function render(doc: LiveDoc, scale = 2): Promise<RenderOutcome> {
  return renderPreview(await engine(), doc, scale);
}

/** PNG page bytes → an object URL the <img> can show (caller revokes). */
export function pageUrl(page: Uint8Array): string {
  const buf = new Uint8Array(page); // detach-safe copy out of wasm memory
  return URL.createObjectURL(new Blob([buf], { type: "image/png" }));
}

export async function renderPdfUrl(doc: LiveDoc): Promise<{ url: string; diagnostics: RenderOutcome["diagnostics"] } | null> {
  const e = await engine();
  // The PDF path takes the same size cap as the preview path.
  const { MAX_SOURCE_BYTES, parseDiagnostics } = await import("../../src/lib/engineClient.ts");
  if (new TextEncoder().encode(doc.template).length > MAX_SOURCE_BYTES) {
    return { url: "", diagnostics: [{ severity: "error", code: "source_too_large", message: `template exceeds ${MAX_SOURCE_BYTES} bytes` }] };
  }
  const r = e.renderPdf(doc.template, doc.params, doc.definitions ?? null);
  if (!r.ok) return { url: "", diagnostics: parseDiagnostics(r.diagnostics) };
  return { url: URL.createObjectURL(new Blob([new Uint8Array(r.pdf)], { type: "application/pdf" })), diagnostics: [] };
}
