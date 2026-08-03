// The site engine's provenance pin. The parse half is deliberately
// fail-closed — the record decides which bytes the homepage may serve, so
// anything it cannot pin on is refused rather than skipped — and the re-pin
// guard covers the one mistake no downstream check can see: new bytes under
// an already-released version.
import { describe, expect, it } from "vitest";
import {
  checkWasmSource,
  parseWasmSource,
  releasedVersions,
  renderWasmSource,
  repinRefusal,
  sha256,
  type WasmSource,
  workspacePackageVersion,
} from "./wasmSource.ts";

const A = "a".repeat(64);
const B = "b".repeat(64);
const RECORD = { version: "0.1.0", files: { "shojiku_wasm.js": A, "shojiku_wasm_bg.wasm": B } };
const source = (over: Partial<WasmSource> = {}): WasmSource => ({ ...RECORD, ...over });

describe("sha256", () => {
  it("is the lowercase hex digest of the bytes", () => {
    expect(sha256(new Uint8Array())).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
});

describe("parseWasmSource", () => {
  it("accepts a well-formed record", () => {
    expect(parseWasmSource(JSON.stringify(RECORD))).toEqual(RECORD);
  });

  it("refuses text that is not JSON", () => {
    expect(() => parseWasmSource("{nope")).toThrow(/not valid JSON/);
  });

  it.each([
    ["an array", "[]"],
    ["a string", '"x"'],
    ["null", "null"],
  ])("refuses %s at the top level", (_name, text) => {
    expect(() => parseWasmSource(text)).toThrow(/expected a JSON object/);
  });

  it.each([
    ["absent", {}],
    ["not a string", { version: 1 }],
    ["not MAJOR.MINOR.PATCH", { version: "0.1" }],
  ])("refuses a version that is %s", (_name, over) => {
    expect(() => parseWasmSource(JSON.stringify({ files: RECORD.files, ...over }))).toThrow(/`version` must be/);
  });

  it.each([
    ["absent", {}],
    ["an array", { files: [] }],
    ["null", { files: null }],
  ])("refuses files that are %s", (_name, over) => {
    expect(() => parseWasmSource(JSON.stringify({ version: "0.1.0", ...over }))).toThrow(/`files` must be/);
  });

  it("refuses a record that pins no file", () => {
    expect(() => parseWasmSource(JSON.stringify({ version: "0.1.0", files: {} }))).toThrow(/records no file/);
  });

  // The keys index into site/.data/wasm, so a name that escapes the directory
  // would make the check read — and report on — a file outside it.
  it.each(["../evil", "sub/dir.js", "..", ".hidden", "a\\b"])("refuses the file name %j", (name) => {
    expect(() => parseWasmSource(JSON.stringify({ version: "0.1.0", files: { [name]: A } }))).toThrow(
      /is not a plain file name/,
    );
  });

  it.each([
    ["not a string", 1],
    ["too short", "abc"],
    ["uppercase", "A".repeat(64)],
    ["not hex", "z".repeat(64)],
  ])("refuses a digest that is %s", (_name, digest) => {
    expect(() => parseWasmSource(JSON.stringify({ version: "0.1.0", files: { "a.js": digest } }))).toThrow(
      /must be a lowercase sha256/,
    );
  });
});

describe("renderWasmSource", () => {
  it("sorts the file keys and round-trips through the parser", () => {
    const text = renderWasmSource(source({ files: { "z.js": A, "a.js": B } }));
    expect(text.indexOf('"a.js"')).toBeLessThan(text.indexOf('"z.js"'));
    expect(text.endsWith("}\n")).toBe(true);
    expect(parseWasmSource(text)).toEqual({ version: "0.1.0", files: { "a.js": B, "z.js": A } });
  });
});

describe("releasedVersions", () => {
  it("takes the version headings and never the Unreleased one", () => {
    const changelog = [
      "# Changelog",
      "## [Unreleased]",
      "### Fixed",
      "- something",
      "## [0.2.0] - 2026-09-01",
      "## [0.1.0] - 2026-08-02",
      "",
      "[0.3.0]: https://example.invalid/compare",
    ].join("\n");
    expect(releasedVersions(changelog)).toEqual(["0.2.0", "0.1.0"]);
  });
});

describe("checkWasmSource", () => {
  const committed = { "shojiku_wasm.js": A, "shojiku_wasm_bg.wasm": B };

  it("reports nothing when the bytes are the recorded release", () => {
    expect(checkWasmSource(source(), committed, ["0.1.0"])).toEqual([]);
  });

  it("reports a recorded file that is not committed", () => {
    const { "shojiku_wasm.js": _gone, ...rest } = committed;
    expect(checkWasmSource(source(), rest, ["0.1.0"])).toEqual([expect.stringMatching(/^missing: .*shojiku_wasm\.js/)]);
  });

  it("reports a committed file the record does not pin", () => {
    expect(checkWasmSource(source(), { ...committed, "extra.js": A }, ["0.1.0"])).toEqual([
      expect.stringMatching(/^unrecorded: .*extra\.js/),
    ]);
  });

  it("reports bytes that no longer hash to the record", () => {
    expect(checkWasmSource(source(), { ...committed, "shojiku_wasm.js": B }, ["0.1.0"])).toEqual([
      expect.stringMatching(/^stale: .*shojiku_wasm\.js/),
    ]);
  });

  it("reports a version the changelog does not list as released", () => {
    expect(checkWasmSource(source({ version: "0.2.0" }), committed, ["0.1.0"])).toEqual([
      expect.stringMatching(/0\.2\.0 is not a released version/),
    ]);
  });
});

describe("repinRefusal", () => {
  const next = source({ version: "0.2.0", files: { "a.js": A } });

  it("allows the first pin", () => {
    expect(repinRefusal(undefined, next, ["0.2.0"])).toBeUndefined();
  });

  it("allows a move to a newer released version", () => {
    expect(repinRefusal(source(), next, ["0.2.0", "0.1.0"])).toBeUndefined();
  });

  it("allows a no-op re-pin of the same version and the same bytes", () => {
    expect(repinRefusal(source(), source(), ["0.1.0"])).toBeUndefined();
  });

  it("refuses a version the changelog has not released yet", () => {
    expect(repinRefusal(source(), next, ["0.1.0"])).toMatch(/CHANGELOG\.md does not list as released/);
  });

  it("refuses new bytes under the already-pinned version", () => {
    const sameVersionNewBytes = source({ files: { ...RECORD.files, "shojiku_wasm_bg.wasm": A } });
    expect(repinRefusal(source(), sameVersionNewBytes, ["0.1.0"])).toMatch(/same version, different build/);
  });

  it("refuses a differently-sized file set under the already-pinned version", () => {
    expect(repinRefusal(source(), source({ files: { "a.js": A } }), ["0.1.0"])).toMatch(/same version, different build/);
  });
});

describe("workspacePackageVersion", () => {
  it("reads the version out of the workspace.package section", () => {
    const toml = ['[workspace]', 'members = ["core"]', "", "[workspace.package]", "edition = \"2021\"", 'version = "0.4.2"'].join("\n");
    expect(workspacePackageVersion(toml)).toBe("0.4.2");
  });

  it("ignores a version declared in another section", () => {
    const toml = ['[package]', 'version = "9.9.9"', "", "[workspace.package]", 'version = "0.4.2"'].join("\n");
    expect(workspacePackageVersion(toml)).toBe("0.4.2");
  });

  it("fails closed when no workspace.package version exists", () => {
    expect(() => workspacePackageVersion('[package]\nversion = "9.9.9"\n')).toThrow(/no \[workspace\.package\] version/);
  });
});
