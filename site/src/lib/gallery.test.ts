// gallery.yml parsing — the REAL file as the positive case (which also
// cross-checks every named dir/preview against the committed examples), and
// the hostile shapes the validator must refuse.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseGallery } from "./gallery.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const REAL = readFileSync(join(ROOT, "examples", "gallery.yml"), "utf8");

const ok = `entries:
  - dir: business/receipt-ja
    featured: true
    preview: preview-1.png
    title_en: A
    title_ja: あ
    blurb_en: B.
    blurb_ja: ぶ。
`;

describe("parseGallery", () => {
  it("parses the real gallery.yml and every named file exists", () => {
    const entries = parseGallery(REAL);
    expect(entries.length).toBe(23);
    expect(entries.filter((e) => e.featured).length).toBe(8);
    for (const e of entries) {
      for (const p of e.preview2 === undefined ? [e.preview] : [e.preview, e.preview2]) {
        const f = join(ROOT, "examples", e.dir, p);
        expect(existsSync(f), `${f} missing`).toBe(true);
      }
    }
  });

  it("parses a minimal valid entry", () => {
    const [e] = parseGallery(ok);
    expect(e).toMatchObject({
      dir: "business/receipt-ja",
      featured: true,
      preview: "preview-1.png",
      preview2: undefined,
      titleEn: "A",
      titleJa: "あ",
    });
  });

  it("accepts a preview pair", () => {
    const [e] = parseGallery(ok.replace("preview: preview-1.png", "preview: preview-1.png\n    preview2: preview-blank-1.png"));
    expect(e?.preview2).toBe("preview-blank-1.png");
  });

  it.each([
    ["not a map top level", "just text"],
    ["missing entries", "other: 1"],
    ["empty entries", "entries: []"],
    ["non-map entry", "entries:\n  - 3"],
    ["dev bucket refused", ok.replace("business/receipt-ja", "dev/site-hero")],
    ["traversal refused", ok.replace("business/receipt-ja", "business/../secret")],
    ["bad preview name", ok.replace("preview-1.png", "../../etc/passwd")],
    ["empty title", ok.replace("title_en: A", 'title_en: "  "')],
    ["missing blurb", ok.replace("    blurb_ja: ぶ。\n", "")],
  ])("refuses %s", (_name, text) => {
    expect(() => parseGallery(text)).toThrow();
  });

  it("refuses a duplicate dir", () => {
    expect(() => parseGallery(ok + ok.slice("entries:\n".length))).toThrow(/duplicate/);
  });
});
