// llms.txt / llms-full.txt rendering.
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { GalleryEntry } from "./gallery.ts";
import { checkSitePages, renderLlmsFull, renderLlmsTxt, SITE_PAGES } from "./llms.ts";

const SITE = fileURLToPath(new URL("../../", import.meta.url));
const siteStems = readdirSync(SITE).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3)).sort();

const e: GalleryEntry = {
  dir: "business/receipt-ja",
  featured: true,
  preview: "preview-1.png",
  preview2: undefined,
  titleEn: "Receipt",
  titleJa: "領収書",
  blurbEn: "A receipt.",
  blurbJa: "領収書。",
};

describe("renderLlmsTxt", () => {
  it("lists every page as a .md endpoint plus the repo docs", () => {
    const out = renderLlmsTxt([{ stem: "why", title: "Why" }]);
    expect(out).toContain("- [Why](/why.md)");
    expect(out).toContain("docs/engine/README.md");
    expect(out).toContain("docs/engine/diagnostics.md");
  });

  // `/reference/` used to sit in the list and rendered as `/reference/.md` —
  // a 404, because the projected reference is gitignored build output that
  // build-pages.sh never stages. A bare `/.md` anywhere is that shape again.
  it("emits no empty-stem endpoint", () => {
    expect(SITE_PAGES.length).toBeGreaterThan(0);
    expect(renderLlmsTxt(SITE_PAGES)).not.toContain("/.md");
  });
});

describe("SITE_PAGES matches the pages that actually exist", () => {
  // Both directions, over the real directory: `languages.md` shipped and was
  // never listed (an agent handed llms.txt could not find it), while
  // `/reference/` was listed with no file behind it.
  it("lists exactly the site/*.md files", () => {
    expect(siteStems.length).toBe(10);
    expect([...SITE_PAGES].map((p) => p.stem).sort()).toEqual(siteStems);
    expect(() => checkSitePages(siteStems)).not.toThrow();
  });

  it("throws naming a page that has no line", () => {
    expect(() => checkSitePages([...siteStems, "brand-new"])).toThrow(/Unlisted: \[brand-new\]/);
  });

  it("throws naming a line that has no page", () => {
    expect(() => checkSitePages(siteStems.filter((s) => s !== "languages"))).toThrow(
      /listed with no file: \[languages\]/,
    );
  });
});

describe("renderLlmsFull", () => {
  it("concatenates preamble, gallery index and labeled docs", () => {
    const out = renderLlmsFull("PREAMBLE\n", [e], [{ label: "L1", text: "DOC1\n" }]);
    expect(out.startsWith("PREAMBLE")).toBe(true);
    expect(out).toContain("## Bundled examples (1)");
    expect(out).toContain("- examples/business/receipt-ja/ — Receipt: A receipt.");
    expect(out).toContain("## L1");
    expect(out).toContain("DOC1");
    expect(out.endsWith("\n")).toBe(true);
  });
});
