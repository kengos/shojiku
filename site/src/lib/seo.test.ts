// Canonical / hreflang / social-card derivation.
import { describe, expect, it } from "vitest";
import { headTags, isJapanese, pagePath, twinPaths } from "./seo.ts";

const SITE = { hostname: "https://example.test", name: "Shojiku", image: "/brand/hero.png" };

function tag(tags: readonly [string, Record<string, string>][], key: string, value: string) {
  return tags.find(([, attrs]) => attrs[key] === value)?.[1];
}

describe("pagePath", () => {
  it("drops the extension and keeps the trailing slash on a locale home", () => {
    expect(pagePath("tutorials.md")).toBe("/tutorials");
    expect(pagePath("ja/tutorials.md")).toBe("/ja/tutorials");
    expect(pagePath("index.md")).toBe("/");
    expect(pagePath("ja/index.md")).toBe("/ja/");
  });
});

describe("isJapanese", () => {
  it("reads the locale off the path prefix", () => {
    expect(isJapanese("ja/tech.md")).toBe(true);
    expect(isJapanese("tech.md")).toBe(false);
  });
});

describe("twinPaths", () => {
  it("resolves the same pair from either twin", () => {
    expect(twinPaths("tech.md")).toEqual({ en: "/tech", ja: "/ja/tech" });
    expect(twinPaths("ja/tech.md")).toEqual({ en: "/tech", ja: "/ja/tech" });
    expect(twinPaths("ja/index.md")).toEqual({ en: "/", ja: "/ja/" });
  });
});

describe("headTags", () => {
  const en = headTags({ relativePath: "tech.md", title: "Tech", description: "d" }, SITE);
  const ja = headTags({ relativePath: "ja/tech.md", title: "技術", description: "説明" }, SITE);

  it("points the canonical at the page's own URL", () => {
    expect(tag(en, "rel", "canonical")).toEqual({
      rel: "canonical",
      href: "https://example.test/tech",
    });
    expect(tag(ja, "rel", "canonical")?.href).toBe("https://example.test/ja/tech");
  });

  it("declares both twins plus an English x-default on either side", () => {
    for (const tags of [en, ja]) {
      expect(tag(tags, "hreflang", "en")?.href).toBe("https://example.test/tech");
      expect(tag(tags, "hreflang", "ja")?.href).toBe("https://example.test/ja/tech");
      expect(tag(tags, "hreflang", "x-default")?.href).toBe("https://example.test/tech");
    }
  });

  it("carries the page's own title and description into the card", () => {
    expect(tag(en, "property", "og:title")?.content).toBe("Tech");
    expect(tag(ja, "property", "og:description")?.content).toBe("説明");
    expect(tag(ja, "name", "twitter:title")?.content).toBe("技術");
    expect(tag(en, "name", "twitter:description")?.content).toBe("d");
  });

  it("flips the locale pair with the page's language", () => {
    expect(tag(en, "property", "og:locale")?.content).toBe("en_US");
    expect(tag(en, "property", "og:locale:alternate")?.content).toBe("ja_JP");
    expect(tag(ja, "property", "og:locale")?.content).toBe("ja_JP");
    expect(tag(ja, "property", "og:locale:alternate")?.content).toBe("en_US");
  });

  it("serves an absolute image to both card vocabularies", () => {
    const image = "https://example.test/brand/hero.png";
    expect(tag(en, "property", "og:image")?.content).toBe(image);
    expect(tag(en, "name", "twitter:image")?.content).toBe(image);
    expect(tag(en, "name", "twitter:card")?.content).toBe("summary_large_image");
    expect(tag(en, "property", "og:site_name")?.content).toBe("Shojiku");
    expect(tag(en, "property", "og:type")?.content).toBe("website");
    expect(tag(en, "property", "og:url")?.content).toBe("https://example.test/tech");
  });
});
