// @vitest-environment node
//
// The REAL-wasm proof (T4/T5): the site's engine glue drives the actual
// `make wasm` build over the actual tier subsets — receipt-us renders
// warning-free on the immediate tier alone, receipt-ja needs the ja tier
// (the gate) and renders clean once injected, and both playground demos
// render. The pkg is imported dynamically so tsc never binds the gitignored
// path (the designer-app suites' pattern).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { injectAssets, injectTier, loadLocale, renderPreview, type TierSource, type WasmEngine } from "../lib/engineClient.ts";
import { subsetManifest, TIERS } from "../lib/fonts.ts";
import { FLEX_KNOB_DEFAULTS, flexDemoTemplate, flexWidthDemoTemplate, FONT_KNOB_DEFAULTS, fontDemoTemplate, GRID_KNOB_DEFAULTS, gridDemoTemplate, TEXT_KNOB_DEFAULTS, textDemoTemplate } from "../lib/playground.ts";

const REPO = new URL("../../../", import.meta.url);
const PKG_JS = new URL("engine/wasm/pkg/shojiku_wasm.js", REPO);
const PKG_WASM = new URL("engine/wasm/pkg/shojiku_wasm_bg.wasm", REPO);

interface WasmModule {
  initSync(input: { module: BufferSource }): unknown;
  Engine: new () => WasmEngine;
}

let mod: WasmModule;

beforeAll(async () => {
  if (!existsSync(fileURLToPath(PKG_WASM))) {
    throw new Error("engine/wasm/pkg is missing — run `make wasm` before the site tests");
  }
  mod = (await import(/* @vite-ignore */ PKG_JS.href)) as unknown as WasmModule;
  mod.initSync({ module: readFileSync(fileURLToPath(PKG_WASM)) });
});

function tierSources(tierName: (typeof TIERS)[number]["tier"]): TierSource[] {
  return TIERS.filter((x) => x.tier === tierName).map((t) => {
    const dir = new URL(`packs/fonts/${t.pack}/`, REPO);
    const manifest = subsetManifest(
      readFileSync(fileURLToPath(new URL("manifest.yml", dir)), "utf8"),
      t.faces,
    ).manifestText;
    return {
      pack: t.pack,
      manifest: () => Promise.resolve(manifest),
      face: (f) => Promise.resolve(new Uint8Array(readFileSync(fileURLToPath(new URL(f, dir))))),
    };
  });
}

async function injectTierSet(e: WasmEngine, tierName: (typeof TIERS)[number]["tier"]): Promise<void> {
  for (const src of tierSources(tierName)) await injectTier(e, src);
}

function example(dir: string): { template: string; params: string; definitions: string } {
  const base = new URL(`examples/${dir}/`, REPO);
  const read = (f: string): string => readFileSync(fileURLToPath(new URL(f, base)), "utf8");
  return { template: read("templates.yml"), params: read("params.json"), definitions: read("definitions.yml") };
}

/** The example's bundled assets/ files, as the engine wants them injected. */
function exampleAssets(dir: string): { rel: string; bytes: Uint8Array }[] {
  const assetsDir = new URL(`examples/${dir}/assets/`, REPO);
  if (!existsSync(fileURLToPath(assetsDir))) return [];
  return readdirSync(fileURLToPath(assetsDir))
    .sort()
    .map((f) => ({
      rel: `assets/${f}`,
      bytes: new Uint8Array(readFileSync(fileURLToPath(new URL(f, assetsDir)))),
    }));
}

describe("immediate tier (en-US)", () => {
  it("renders receipt-us warning-free on the noto-sans subset alone", async () => {
    const e = new mod.Engine();
    await injectTierSet(e, "immediate");
    loadLocale(e, "en-US");
    const out = renderPreview(e, example("business/receipt-us"), 2);
    expect(out.ok).toBe(true);
    expect(out.pages.length).toBeGreaterThan(0);
    expect(out.diagnostics).toEqual([]);
  });

  it("renders the flex layout demo at every column count", async () => {
    const e = new mod.Engine();
    await injectTierSet(e, "immediate");
    loadLocale(e, "en-US");
    for (const columns of [1, 2, 3, 4]) {
      const out = renderPreview(e, { template: flexDemoTemplate({ ...FLEX_KNOB_DEFAULTS, columns }), params: "{}" }, 2);
      expect(out.diagnostics).toEqual([]);
      expect(out.ok).toBe(true);
    }
  });

  it("renders the fixed-width flex demo across the width range", async () => {
    const e = new mod.Engine();
    await injectTierSet(e, "immediate");
    loadLocale(e, "en-US");
    for (const width of [60, 80, 180]) {
      const out = renderPreview(e, { template: flexWidthDemoTemplate({ width }), params: "{}" }, 2);
      expect(out.diagnostics).toEqual([]);
      expect(out.ok).toBe(true);
    }
  });

  it("renders the text playground demo across every textAlign", async () => {
    const e = new mod.Engine();
    await injectTierSet(e, "immediate");
    loadLocale(e, "en-US");
    for (const textAlign of ["left", "center", "right"] as const) {
      const out = renderPreview(e, { template: textDemoTemplate({ ...TEXT_KNOB_DEFAULTS, textAlign }), params: "{}" }, 2);
      expect(out.diagnostics).toEqual([]);
      expect(out.ok).toBe(true);
    }
  });
});

describe("ja tier gate", () => {
  it("receipt-ja renders clean only after the biz-ud tier is injected", async () => {
    const e = new mod.Engine();
    await injectTierSet(e, "immediate");
    // The primary pack is REQUIRED: switching to ja-JP before the ja tier is
    // injected refuses outright — the tier button injects FIRST, then loads.
    expect(() => loadLocale(e, "ja-JP")).toThrow();

    await injectTierSet(e, "lazy-ja");
    const absentAfter = loadLocale(e, "ja-JP");
    expect(absentAfter).not.toContain("biz-ud");

    const assets = exampleAssets("business/receipt-ja");
    expect(assets.length).toBeGreaterThan(0);
    injectAssets(e, assets);
    const out = renderPreview(e, example("business/receipt-ja"), 2);
    expect(out.diagnostics).toEqual([]);
    expect(out.ok).toBe(true);
  });

  it("renders the font demo across both families and weights", async () => {
    const e = new mod.Engine();
    await injectTierSet(e, "lazy-ja");
    loadLocale(e, "ja-JP");
    for (const family of ["biz-udp-gothic", "noto-sans-mono"] as const) {
      for (const weight of ["normal", "bold"] as const) {
        const out = renderPreview(e, { template: fontDemoTemplate({ ...FONT_KNOB_DEFAULTS, family, weight }), params: "{}" }, 2);
        expect(out.diagnostics).toEqual([]);
        expect(out.ok).toBe(true);
      }
    }
  });

  it("renders the char_grid demo in both writing modes", async () => {
    const e = new mod.Engine();
    await injectTierSet(e, "lazy-ja");
    loadLocale(e, "ja-JP");
    for (const writingMode of ["vertical_rl", "horizontal_tb"] as const) {
      const out = renderPreview(e, { template: gridDemoTemplate({ ...GRID_KNOB_DEFAULTS, writingMode }), params: "{}" }, 2);
      expect(out.diagnostics).toEqual([]);
      expect(out.ok).toBe(true);
    }
  });
});
