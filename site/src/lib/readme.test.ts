// README gallery rendering + marker splice — including the refusal shapes
// (odd featured count, missing/out-of-order markers) that keep the generator
// from no-oping or corrupting the README.
import { describe, expect, it } from "vitest";
import type { GalleryEntry } from "./gallery.ts";
import { END, renderReadmeGallery, spliceReadme, START } from "./readme.ts";

function entry(over: Partial<GalleryEntry>): GalleryEntry {
  return {
    dir: "business/receipt-ja",
    featured: false,
    preview: "preview-1.png",
    preview2: undefined,
    titleEn: "Receipt",
    titleJa: "領収書",
    blurbEn: "A receipt.",
    blurbJa: "領収書。",
    ...over,
  };
}

describe("renderReadmeGallery", () => {
  it("pairs featured entries into table rows and lists the rest", () => {
    const out = renderReadmeGallery([
      entry({ featured: true, titleEn: "A" }),
      entry({ featured: true, dir: "forms/rirekisho-ja", titleEn: "B", preview2: "preview-blank-1.png" }),
      entry({ dir: "typography/novel-ja", titleEn: "C", blurbEn: "Vertical." }),
    ]);
    expect(out).toContain('width="420" alt="A"');
    // the pair renders two half-width images
    expect(out.match(/width="206"/g)?.length).toBe(2);
    expect(out).toContain("1 more live in [examples/](examples/):");
    expect(out).toContain("[C](examples/typography/novel-ja/) (Vertical).");
  });

  it("refuses an odd featured count", () => {
    expect(() => renderReadmeGallery([entry({ featured: true })])).toThrow(/pair up/);
  });

  it("refuses zero featured entries", () => {
    expect(() => renderReadmeGallery([entry({})])).toThrow(/pair up/);
  });
});

describe("spliceReadme", () => {
  const readme = `intro\n${START}\nold\n${END}\ntail\n`;

  it("replaces only the marked block", () => {
    const out = spliceReadme(readme, "NEW");
    expect(out).toBe(`intro\n${START}\nNEW\n${END}\ntail\n`);
  });

  it("throws when a marker is missing", () => {
    expect(() => spliceReadme("no markers here", "x")).toThrow(/markers not found/);
  });

  it("throws when the markers are out of order", () => {
    expect(() => spliceReadme(`${END}\n${START}`, "x")).toThrow(/out of order/);
  });
});
