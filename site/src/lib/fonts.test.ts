// Font tiering — the TIERS spec is cross-checked against the REAL pack
// manifests (a renamed face upstream must fail here, not at runtime), and
// subsetManifest's refusal path is pinned.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { MAX_FILE_BYTES, subsetManifest, TIERS } from "./fonts.ts";

const PACKS = join(import.meta.dirname, "..", "..", "..", "packs", "fonts");

describe("TIERS", () => {
  it("every tier's faces and license exist in the real pack", () => {
    expect(TIERS.length).toBe(3);
    for (const t of TIERS) {
      const dir = join(PACKS, t.pack);
      const { files } = subsetManifest(readFileSync(join(dir, "manifest.yml"), "utf8"), t.faces);
      expect(files.length).toBe(t.faces.length);
      for (const f of [...files, t.license]) {
        expect(existsSync(join(dir, f)), `${t.pack}/${f} missing`).toBe(true);
      }
    }
  });

  it("the lazy-ja tier carries ja-JP's default family (the P pair)", () => {
    const ja = TIERS.find((t) => t.tier === "lazy-ja");
    expect(ja?.faces).toContain("biz-udp-gothic");
  });
});

describe("subsetManifest", () => {
  const manifest = readFileSync(join(PACKS, "noto-sans", "manifest.yml"), "utf8");

  it("keeps license fields and only the named faces", () => {
    const { manifestText, files } = subsetManifest(manifest, ["noto-sans"]);
    const doc = parse(manifestText) as { license: string; redistributable: boolean; faces: { id: string }[] };
    expect(doc.license).toBe("OFL-1.1");
    expect(doc.redistributable).toBe(true);
    expect(doc.faces.map((f) => f.id)).toEqual(["noto-sans"]);
    expect(files).toEqual(["NotoSans-Regular.ttf"]);
  });

  it("throws on an unknown face id", () => {
    expect(() => subsetManifest(manifest, ["no-such-face"])).toThrow(/no-such-face/);
  });

  it("throws on a manifest without faces", () => {
    expect(() => subsetManifest("version: 1\n", ["x"])).toThrow(/faces/);
  });
});

it("the Pages cap constant is 25 MiB", () => {
  expect(MAX_FILE_BYTES).toBe(26214400);
});
