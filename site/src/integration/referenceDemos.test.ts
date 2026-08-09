// @vitest-environment node
//
// Every reference-page demo, rendered through the engine that will actually
// run it. A reference page shows its demo live, so a demo that warns would
// put the engine's own complaint under a page documenting the feature as
// correct.
//
// TWO engines, because the site serves a RELEASED build by policy while
// docs/engine/ documents HEAD. A demo declares the capability KEYS its wire
// needs (expect.json `requires`); the served engine runs the ones it can, and
// the page falls back to a static listing for the rest. This suite renders
// each demo on whichever engine claims the keys — so a demo is proven correct
// either way, and the day a release re-pins site/.data/wasm the gated ones
// light up with no edit here or on the page.
//
// The assertion is EQUALITY against the demo's declared diagnostics, not
// "empty": diagnostics.md's demo is supposed to warn (that page documents the
// warnings), so its expect.json names `text_overflow` and this suite pins it.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { injectTier, loadLocale, renderPreview, type TierSource, type WasmEngine } from "../lib/engineClient.ts";
import { capabilityKeys, DEMO_DIR, expectedDiagnostics, isJapaneseDemo, requiredCapabilities, runnableHere, type Demo } from "../lib/demos.ts";
import { subsetManifest, TIERS } from "../lib/fonts.ts";

const REPO = new URL("../../../", import.meta.url);

interface WasmModule {
  initSync(input: { module: BufferSource }): unknown;
  Engine: (new () => WasmEngine) & { capabilities(): string };
}

/** The two builds: what Pages serves today, and what HEAD would ship. */
const BUILDS = {
  served: new URL("site/.data/wasm/", REPO),
  head: new URL("engine/wasm/pkg/", REPO),
} as const;

const mods: Record<keyof typeof BUILDS, WasmModule> = {} as never;
const keys: Record<keyof typeof BUILDS, string[]> = {} as never;

beforeAll(async () => {
  for (const [which, base] of Object.entries(BUILDS) as [keyof typeof BUILDS, URL][]) {
    const wasm = new URL("shojiku_wasm_bg.wasm", base);
    if (!existsSync(fileURLToPath(wasm))) {
      throw new Error(`${fileURLToPath(base)} is missing — run \`make wasm\` before the site tests`);
    }
    const m = (await import(/* @vite-ignore */ new URL("shojiku_wasm.js", base).href)) as unknown as WasmModule;
    m.initSync({ module: readFileSync(fileURLToPath(wasm)) });
    mods[which] = m;
    keys[which] = capabilityKeys(m.Engine.capabilities());
  }
});

function tier(t: (typeof TIERS)[number]): TierSource {
  const dir = new URL(`packs/fonts/${t.pack}/`, REPO);
  const manifest = subsetManifest(readFileSync(fileURLToPath(new URL("manifest.yml", dir)), "utf8"), t.faces).manifestText;
  return {
    pack: t.pack,
    manifest: () => Promise.resolve(manifest),
    face: (f) => Promise.resolve(new Uint8Array(readFileSync(fileURLToPath(new URL(f, dir))))),
  };
}

/** A session on the tiers the page itself would have loaded: en-US demos get
 * the immediate tier only, ja-JP ones the JP upgrade the reader clicks. */
async function booted(which: keyof typeof BUILDS, ja: boolean): Promise<WasmEngine> {
  const e = new mods[which].Engine();
  await Promise.all(TIERS.filter((t) => t.tier === "immediate" || ja).map((t) => injectTier(e, tier(t))));
  loadLocale(e, ja ? "ja-JP" : "en-US");
  return e;
}

const dir = fileURLToPath(new URL(DEMO_DIR, REPO));
const names = readdirSync(dir).sort();

function load(name: string): Demo {
  const at = (f: string): string | undefined => {
    const p = `${dir}/${name}/${f}`;
    return existsSync(p) ? readFileSync(p, "utf8") : undefined;
  };
  const template = at("templates.yml");
  if (template === undefined) throw new Error(`demo ${name} has no templates.yml`);
  return { name, template, params: at("params.json") ?? "{}", definitions: at("definitions.yml"), expect: at("expect.json") };
}

describe("the reference demos cover the reference", () => {
  it("has one demo per feature page", () => {
    const pages = readdirSync(fileURLToPath(new URL("docs/engine/", REPO)))
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.slice(0, -3))
      .filter((s) => s !== "README" && s !== "features")
      .sort();
    expect(pages).toHaveLength(32);
    expect(names).toEqual(pages);
  });

  it("keeps the served engine live, and no gate outlives its release", () => {
    // The per-demo `which` is computed from the declarations, so asserting
    // it per demo is definitional. Two things are falsifiable. An all-gated
    // set is a stale or broken pin, never new syntax — the served engine
    // must run something. And a `requires` the served engine satisfies is a
    // leftover: right after a re-pin the gated set legitimately empties, and
    // the release that re-pinned is supposed to delete those declarations,
    // or the page degrades to a static listing under a notice that lies.
    const gated = names.filter((n) => !runnableHere(requiredCapabilities(load(n).expect), keys.served));
    expect(names.length - gated.length).toBeGreaterThan(0);
    const overDeclared = names.filter((n) => {
      const need = requiredCapabilities(load(n).expect);
      return need.length > 0 && runnableHere(need, keys.served);
    });
    expect(overDeclared, "these demos declare `requires` the served engine satisfies — a re-pin landed; drop them").toEqual([]);
  });

  it("declares only capability keys HEAD actually publishes", () => {
    // A typo'd key is invisible otherwise: it can never be satisfied, so the
    // page degrades to its static form forever and no other check notices.
    const declared = [...new Set(names.flatMap((n) => requiredCapabilities(load(n).expect)))].sort();
    // The likeliest cause is NOT a typo, so the message says so: `make
    // site-build` stages the RELEASED engine into engine/wasm/pkg, and every
    // gated demo then fails here and below with a parse error that looks like
    // a broken demo rather than a stale build.
    expect(
      declared.filter((k) => !keys.head.includes(k)),
      "engine/wasm/pkg does not publish these keys — if `make site-build` ran since the last `make wasm`, it replaced pkg with the RELEASED engine; re-run `make wasm`",
    ).toEqual([]);
    // No lower bound on declared.length: right after a re-pin no demo
    // declares anything, and that is the healthy state until a page
    // documents syntax newer than the pinned engine again.
  });
});

describe.each(names)("demo %s", (name) => {
  it("renders exactly the diagnostics it declares", async () => {
    const d = load(name);
    const need = requiredCapabilities(d.expect);
    // The served engine when it can parse the wire, HEAD when the page will
    // be showing its static fallback instead.
    const which = runnableHere(need, keys.served) ? "served" : "head";
    const out = renderPreview(await booted(which, isJapaneseDemo(d.template)), d, 2);
    // The message goes in the assertion label: a demo fails by emitting a
    // code, and the code alone never says which line produced it.
    const detail = `[${which}] ` + out.diagnostics.map((x) => `${x.severity}[${x.code}] ${x.message}`).join(" | ");
    expect(out.diagnostics.map((x) => x.code).sort(), detail).toEqual(expectedDiagnostics(d.expect).sort());
    expect(out.ok, detail).toBe(true);
    expect(out.pages.length).toBeGreaterThan(0);
  });

  // A demo that DECLARES keys must actually need them.
  // Nothing else catches an over-declaration — the typo gate only asks
  // whether the key exists — and an unnecessary `requires` degrades the page
  // to a static listing forever, under a notice telling the reader the
  // syntax is newer than this engine. That notice would be a lie.
  it("declares no capability key it does not need", async () => {
    const need = requiredCapabilities(load(name).expect);
    if (need.length === 0 || runnableHere(need, keys.served)) return;
    const d = load(name);
    const out = renderPreview(await booted("served", isJapaneseDemo(d.template)), d, 2);
    expect(
      out.diagnostics.map((x) => x.code).sort(),
      `${name} renders fine on the served engine, so its \`requires\` is over-declared and the page degrades for nothing`,
    ).not.toEqual(expectedDiagnostics(d.expect).sort());
  });
});
