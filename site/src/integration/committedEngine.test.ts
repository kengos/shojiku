// @vitest-environment node
//
// The COMMITTED engine — `site/.data/wasm`, the bytes Cloudflare Pages
// actually serves — against its provenance record. The sibling
// liveRenderer suite drives `engine/wasm/pkg`, a fresh build of HEAD, so
// until this suite existed nothing tested the artifact visitors run.
//
// Two claims, and the first is why the record can be trusted: the binary
// SELF-REPORTS its version through `Engine.capabilities()`, so the recorded
// version is checked against the bytes rather than maintained beside them.
// The second is that a RELEASED engine still serves the site's own glue —
// the way this pin can rot is the site drifting ahead of the release.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { engineVersion, injectTier, loadLocale, renderPreview, type TierSource, type WasmEngine } from "../lib/engineClient.ts";
import { subsetManifest, TIERS } from "../lib/fonts.ts";
import { FLEX_KNOB_DEFAULTS, flexDemoTemplate, TEXT_KNOB_DEFAULTS, textDemoTemplate } from "../lib/playground.ts";
import { parseWasmSource } from "../lib/wasmSource.ts";

const REPO = new URL("../../../", import.meta.url);
const DATA = new URL("site/.data/", REPO);
const PKG_JS = new URL("wasm/shojiku_wasm.js", DATA);
const PKG_WASM = new URL("wasm/shojiku_wasm_bg.wasm", DATA);

interface WasmModule {
  initSync(input: { module: BufferSource }): unknown;
  Engine: (new () => WasmEngine) & { capabilities(): string };
}

let mod: WasmModule;

const source = parseWasmSource(readFileSync(fileURLToPath(new URL("wasm-source.json", DATA)), "utf8"));

beforeAll(async () => {
  mod = (await import(/* @vite-ignore */ PKG_JS.href)) as unknown as WasmModule;
  mod.initSync({ module: readFileSync(fileURLToPath(PKG_WASM)) });
});

function immediateTier(engine: WasmEngine): Promise<number>[] {
  return TIERS.filter((t) => t.tier === "immediate").map((t) => {
    const dir = new URL(`packs/fonts/${t.pack}/`, REPO);
    const manifest = subsetManifest(readFileSync(fileURLToPath(new URL("manifest.yml", dir)), "utf8"), t.faces).manifestText;
    const src: TierSource = {
      pack: t.pack,
      manifest: () => Promise.resolve(manifest),
      face: (f) => Promise.resolve(new Uint8Array(readFileSync(fileURLToPath(new URL(f, dir))))),
    };
    return injectTier(engine, src);
  });
}

async function booted(): Promise<WasmEngine> {
  const e = new mod.Engine();
  await Promise.all(immediateTier(e));
  loadLocale(e, "en-US");
  return e;
}

describe("the committed engine matches its record", () => {
  it("reports the version site/.data/wasm-source.json pins it to", () => {
    expect(engineVersion(mod.Engine.capabilities())).toBe(source.version);
  });
});

describe("the released engine still serves the site's glue", () => {
  it("renders the flex playground demo warning-free", async () => {
    const out = renderPreview(await booted(), { template: flexDemoTemplate(FLEX_KNOB_DEFAULTS), params: "{}" }, 2);
    expect(out.diagnostics).toEqual([]);
    expect(out.ok).toBe(true);
  });

  it("renders the text playground demo warning-free", async () => {
    const out = renderPreview(await booted(), { template: textDemoTemplate(TEXT_KNOB_DEFAULTS), params: "{}" }, 2);
    expect(out.diagnostics).toEqual([]);
    expect(out.ok).toBe(true);
  });
});
