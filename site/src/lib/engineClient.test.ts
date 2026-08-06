// engineClient's pure halves over a scripted fake engine (the REAL-wasm
// proof lives in src/integration/liveRenderer.test.ts).
import { describe, expect, it } from "vitest";
import {
  engineVersion,
  injectAssets,
  injectTier,
  loadLocale,
  MAX_SOURCE_BYTES,
  parseDiagnostics,
  renderPreview,
  type WasmEngine,
} from "./engineClient.ts";

function fakeEngine(over: Partial<WasmEngine> = {}): WasmEngine & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    addAssetFile: (rel) => calls.push(`asset:${rel}`),
    addFontPack: (id) => calls.push(`pack:${id}`),
    addFontFile: (p, f) => calls.push(`face:${p}/${f}`),
    fontFilesNeeded: () => JSON.stringify(["A.ttf", "B.ttf"]),
    setLocale: (id) => calls.push(`locale:${id}`),
    loadFontsSubset: () => JSON.stringify(["ipamj-mincho"]),
    validate: () => JSON.stringify({ items: [] }),
    renderPng: () => ({ ok: true, pages: [new Uint8Array([1])], diagnostics: '{"items":[]}' }),
    renderPdf: () => ({ ok: true, pdf: new Uint8Array([1]), diagnostics: '{"items":[]}' }),
    ...over,
  };
}

describe("parseDiagnostics", () => {
  it("types well-formed items and defaults malformed fields", () => {
    const out = parseDiagnostics(
      JSON.stringify({ items: [{ severity: "warning", code: "text_overflow", message: "m" }, { odd: 1 }] }),
    );
    expect(out[0]).toEqual({ severity: "warning", code: "text_overflow", message: "m" });
    expect(out[1]).toMatchObject({ severity: "error", code: "unknown" });
  });

  it("shapes a non-object item into the synthetic error form", () => {
    const out = parseDiagnostics(JSON.stringify({ items: [5, null] }));
    expect(out).toHaveLength(2);
    for (const d of out) expect(d).toMatchObject({ severity: "error", code: "unknown" });
  });

  it("degrades non-JSON to one synthetic error and no items to empty", () => {
    expect(parseDiagnostics("not json")[0]?.code).toBe("bad_diagnostics_json");
    expect(parseDiagnostics(JSON.stringify({ items: "x" }))).toEqual([]);
  });
});

describe("engineVersion", () => {
  it("reads the version the engine reports for itself", () => {
    expect(engineVersion(JSON.stringify({ version: "0.1.0", capabilities: [] }))).toBe("0.1.0");
  });

  it("yields an empty label rather than throwing on a surprising report", () => {
    expect(engineVersion(JSON.stringify({ capabilities: [] }))).toBe("");
    expect(engineVersion("not json")).toBe("");
  });
});

describe("injectTier", () => {
  it("declares the pack then injects every listed face", async () => {
    const e = fakeEngine();
    const n = await injectTier(e, {
      pack: "noto-sans",
      manifest: () => Promise.resolve("m"),
      face: () => Promise.resolve(new Uint8Array(1)),
    });
    expect(n).toBe(2);
    expect(e.calls).toEqual(["pack:noto-sans", "face:noto-sans/A.ttf", "face:noto-sans/B.ttf"]);
  });

  it("refuses a pack listing no faces", async () => {
    const e = fakeEngine({ fontFilesNeeded: () => "[]" });
    await expect(
      injectTier(e, { pack: "p", manifest: () => Promise.resolve("m"), face: () => Promise.resolve(new Uint8Array(1)) }),
    ).rejects.toThrow(/no faces/);
  });
});

describe("injectAssets", () => {
  it("injects every asset under its template-relative path", () => {
    const e = fakeEngine();
    injectAssets(e, [{ rel: "assets/logo.svg", bytes: new Uint8Array(1) }]);
    expect(e.calls).toEqual(["asset:assets/logo.svg"]);
  });
});

describe("loadLocale", () => {
  it("sets the locale and returns the absent pack ids", () => {
    const e = fakeEngine();
    expect(loadLocale(e, "ja-JP")).toEqual(["ipamj-mincho"]);
    expect(e.calls).toContain("locale:ja-JP");
  });
});

describe("renderPreview", () => {
  it("returns pages + typed diagnostics on ok", () => {
    const out = renderPreview(fakeEngine(), { template: "t", params: "{}" }, 2);
    expect(out.ok).toBe(true);
    expect(out.pages.length).toBe(1);
    expect(out.diagnostics).toEqual([]);
  });

  it("refuses oversized input before it reaches the engine", () => {
    const e = fakeEngine({
      renderPng: () => {
        throw new Error("must not be called");
      },
    });
    const out = renderPreview(e, { template: "x".repeat(MAX_SOURCE_BYTES + 1), params: "{}" }, 2);
    expect(out.ok).toBe(false);
    expect(out.diagnostics[0]?.code).toBe("source_too_large");
  });

  it("caps the optional definitions the same way", () => {
    const out = renderPreview(
      fakeEngine(),
      { template: "t", params: "{}", definitions: "y".repeat(MAX_SOURCE_BYTES + 1) },
      2,
    );
    expect(out.diagnostics[0]?.message).toContain("definitions");
  });
});
