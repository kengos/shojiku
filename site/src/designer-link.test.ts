// /designer/ is a separate app merged into the deployed output, not a
// VitePress page. VitePress's client router intercepts every same-origin <a>
// that has no `target`/`download` attribute (dist/client/app/router.js), so a
// plain markdown link to /designer/ navigates client-side, finds no page data
// and renders VitePress's own 404 — the URL is right, the site is up, and the
// link is still broken. `ignoreDeadLinks` in config.mts only silences the
// build check; it does nothing here. The fix is a `target` attribute, and this
// test is what keeps the next /designer/ link from shipping without one.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SITE = join(import.meta.dirname, "..");

function pages(): string[] {
  const pick = (dir: string, ext: string[]): string[] =>
    readdirSync(join(SITE, dir))
      .filter((f) => ext.some((e) => f.endsWith(e)))
      .map((f) => join(dir, f));
  return [
    ...pick(".", [".md"]),
    ...pick("ja", [".md"]),
    // A theme component can hand-write the anchor too.
    ...pick(join(".vitepress", "theme", "components"), [".vue"]),
  ];
}

// A markdown link — [text](/designer/…) — can never carry a target attribute,
// so its mere presence is the failure.
const MARKDOWN_LINK = /\[[^\]]*\]\(\/designer\//g;
// An HTML anchor is fine only when the tag also sets target.
const HTML_ANCHOR = /<a\s[^>]*href="\/designer\/[^"]*"[^>]*>/g;
// A hero action is a YAML block: `link: /designer/` needs a sibling `target:`.
const HERO_ACTION = /^(\s*)link:\s*\/designer\/\s*$/gm;

describe("links to /designer/", () => {
  const files = pages();

  it("sees the page set (positive control)", () => {
    expect(files.length).toBeGreaterThan(10);
    const withLink = files.filter((f) => readFileSync(join(SITE, f), "utf8").includes("/designer/"));
    expect(withLink.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const text = readFileSync(join(SITE, file), "utf8");
    if (!text.includes("/designer/")) continue;

    it(`${file}: uses no client-routed markdown link`, () => {
      expect(text.match(MARKDOWN_LINK) ?? []).toEqual([]);
    });

    it(`${file}: every anchor sets target`, () => {
      for (const tag of text.match(HTML_ANCHOR) ?? []) {
        expect(tag, tag).toMatch(/\starget="/);
      }
    });

    it(`${file}: every hero action sets target`, () => {
      for (const m of text.matchAll(HERO_ACTION)) {
        const rest = text.slice(m.index + m[0].length);
        // The action's remaining keys, up to the next list item or block end.
        const block = rest.split(/^\s*-\s|^---\s*$/m)[0] ?? "";
        expect(block, `${file}: hero action ${m[0].trim()}`).toMatch(/^\s*target:\s*\S+/m);
      }
    });
  }
});
