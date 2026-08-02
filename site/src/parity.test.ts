// T8: the /ja twin set stays in lockstep with the English canon — same page
// set, same interactive components, same section skeleton (the copy is
// rewritten per language, so the CONTENT differs on purpose; the structure
// must not).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SITE = join(import.meta.dirname, "..");

function pages(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort();
}

function componentTags(text: string): string[] {
  return [...text.matchAll(/<(LiveRenderer|PropertyPlayground|GalleryGrid)[\s/>]/g)]
    .map((m) => m[1]!)
    .sort();
}

function h2Count(text: string): number {
  return [...text.matchAll(/^## /gm)].length;
}

describe("en ↔ ja parity", () => {
  const en = pages(SITE);
  const ja = pages(join(SITE, "ja"));

  it("the /ja page set equals the English page set", () => {
    expect(ja).toEqual(en);
  });

  it.each(pages(SITE))("%s and its twin share components and section count", (page) => {
    const enText = readFileSync(join(SITE, page), "utf8");
    const jaText = readFileSync(join(SITE, "ja", page), "utf8");
    expect(componentTags(jaText)).toEqual(componentTags(enText));
    expect(h2Count(jaText)).toBe(h2Count(enText));
  });
});
