// llms.txt / llms-full.txt rendering.
import { describe, expect, it } from "vitest";
import type { GalleryEntry } from "./gallery.ts";
import { renderLlmsFull, renderLlmsTxt } from "./llms.ts";

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
    const out = renderLlmsTxt([{ path: "/why", title: "Why" }]);
    expect(out).toContain("- [Why](/why.md)");
    expect(out).toContain("docs/engine/README.md");
    expect(out).toContain("docs/engine/diagnostics.md");
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
