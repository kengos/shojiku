// The reference's repo-fact gates. These are about the REPOSITORY, not about
// a function: they fail when docs/engine/ and the projection drift apart,
// which is the whole risk of rendering someone else's files as your own site.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  landingIndex,
  llmsFullPages,
  NON_FEATURE,
  projectPage,
  projectedBody,
  readPage,
  REFERENCE_LOCALES,
  SOURCE_DIR,
  type ReferencePage,
} from "./lib/reference.ts";
import { buildSidebar, catalogItemTypes, treeStems } from "./lib/referenceNav.ts";
import { DEMO_DIR } from "./lib/demos.ts";

const REPO = new URL("../../", import.meta.url);
const at = (p: string): string => fileURLToPath(new URL(p, REPO));

const stems = readdirSync(at(SOURCE_DIR)).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3)).sort();
const pages: ReferencePage[] = stems.map((s) => readPage(s, readFileSync(at(`${SOURCE_DIR}${s}.md`), "utf8")));
const catalog = JSON.parse(readFileSync(at("engine/authoring/reference/catalog.schema.json"), "utf8")) as {
  $defs: Record<string, unknown>;
};
const features = stems.filter((s) => !(NON_FEATURE as readonly string[]).includes(s));

describe("every reference page has a route", () => {
  // The real total, not `> 0`: a projection that silently drops a page is
  // exactly what a greater-than-zero assertion cannot see.
  it("routes all 34 source files, in both locales", () => {
    expect(stems).toHaveLength(34);
    expect(features).toHaveLength(32);
    expect(REFERENCE_LOCALES).toHaveLength(2);
    const routes = pages.map((p) => (p.stem === "README" ? "index" : p.stem));
    expect(new Set(routes).size).toBe(34);
    expect(routes).toContain("index");
  });

  it("gives every feature page a demo, and no demo an orphan page", () => {
    expect(readdirSync(at(DEMO_DIR)).sort()).toEqual(features);
  });
});

describe("what llms-full.txt inlines", () => {
  // features.md is the decision log — a third of the payload (146,877 of
  // 442,505 bytes) that an agent asking how to write `flex` never reads.
  // README.md is the index and MUST stay, which is why LLMS_FULL_OMIT is its
  // own list rather than a reuse of NON_FEATURE.
  it("carries all 34 pages but features.md", () => {
    const inlined = llmsFullPages(pages).map((p) => p.stem);
    expect(inlined).toHaveLength(33);
    expect(inlined).not.toContain("features");
    expect(inlined).toContain("README");
    expect(features.every((s) => inlined.includes(s))).toBe(true);
  });
});

describe("the projection restates nothing", () => {
  // The drift gate. The projection makes exactly four edits to a body —
  // absolute-ising the links that leave docs/engine/, pointing README.md at
  // the landing, v-pre-guarding the inline code that documents the `{{`
  // escape, and inserting the generated blocks between markers — and all
  // four are undone here. Whatever is left must be the repo file, byte for
  // byte, so ANY fifth edit fails.
  it.each(pages.map((p) => [p.stem, p] as const))("%s survives the round trip", (_stem, page) => {
    for (const locale of REFERENCE_LOCALES) {
      const out = projectPage(page, {
        source: `${SOURCE_DIR}${page.stem}.md`,
        demo: page.stem,
        extra: page.stem === "README" ? landingIndex(pages, locale.base) : undefined,
        landing: page.stem === "README",
        notice: locale.notice,
      });
      expect(projectedBody(out)).toBe(page.body);
    }
  });

  it("leaves no link pointing outside the reference unresolved", () => {
    // A relative link that escapes docs/engine/ has no site route; VitePress
    // would fail its dead-link check, so the projection must have rewritten
    // every one of them.
    for (const page of pages) {
      const out = projectPage(page, { source: `${SOURCE_DIR}${page.stem}.md` });
      expect(out, page.stem).not.toMatch(/\]\(\.\.\//);
    }
  });
});

describe("the front-matter and the catalog agree", () => {
  const claimed = pages.flatMap((p) => p.meta.shapes);

  it("claims every catalog shape exactly once", () => {
    const defs = Object.keys(catalog.$defs).sort();
    expect(defs).toHaveLength(82);
    expect([...claimed].sort()).toEqual(defs);
  });

  it("declares no shape the catalog does not define", () => {
    expect(claimed.filter((s) => !(s in catalog.$defs))).toEqual([]);
  });

  it("gives every page a summary and a group", () => {
    for (const p of pages) {
      expect(p.meta.summary.length, p.stem).toBeGreaterThan(20);
      expect(p.meta.group, p.stem).toBeTruthy();
    }
  });

  it("lists exactly the catalog's item types under the item group, in its order", () => {
    // The one place the tree could become a second hand-maintained taxonomy.
    // The item keys are not sorted here — they are compared against the
    // parser's own order, so a wire change reorders the sidebar by itself.
    const declared = pages.filter((p) => p.meta.group === "item").flatMap((p) => p.meta.keys);
    const types = catalogItemTypes(catalog);
    expect(types).toHaveLength(15);
    expect([...declared].sort()).toEqual([...types].sort());
  });
});

describe("the sidebar reaches every page", () => {
  it("shows all 32 feature pages and nothing else", () => {
    const sidebar = buildSidebar(pages, catalog, "/reference/");
    expect(treeStems(sidebar).sort()).toEqual(features);
  });

  it("localises every link", () => {
    const ja = buildSidebar(pages, catalog, "/ja/reference/");
    const flat = JSON.stringify(ja);
    expect(flat).not.toContain('"/reference/');
    expect(flat).toContain('"/ja/reference/');
  });

  it("orders the item group by the catalog, not alphabetically", () => {
    const sidebar = buildSidebar(pages, catalog, "/reference/");
    const items = sidebar[0]?.items.find((i) => "items" in i && i.text === "item");
    const texts = items !== undefined && "items" in items ? items.items.map((l) => l.text) : [];
    expect(texts).toEqual(catalogItemTypes(catalog));
  });
});

describe("the site links to the reference, not to the repository", () => {
  // The negative sweep the link rewrite owes: after internalising them, no
  // pitch page may still send a reader to a GitHub blob for a page this site
  // now serves itself.
  it("has no site page linking to docs/engine/ on GitHub", () => {
    const dirs = ["site", "site/ja"];
    const offenders: string[] = [];
    for (const d of dirs) {
      for (const f of readdirSync(at(d)).filter((f) => f.endsWith(".md"))) {
        const text = readFileSync(at(`${d}/${f}`), "utf8");
        if (text.includes("docs/engine/")) offenders.push(`${d}/${f}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("nothing in the projection reaches the Vue compiler as a mustache", () => {
  // Vue reads `{{ … }}` in markdown as an interpolation and fails the BUILD
  // with a JavaScript parse error pointing at prose. The wire spells a
  // literal `{` as `{{`, so this is documented syntax, not a typo.
  it("leaves no unguarded double brace on any page", () => {
    for (const page of pages) {
      const out = projectPage(page, { source: `${SOURCE_DIR}${page.stem}.md`, demo: page.stem });
      const bare = out.replace(/<span v-pre>[^<]*<\/span>/g, "");
      expect(bare, page.stem).not.toContain("{{");
    }
  });
});

describe("every Limitations claim names a real diagnostic code", () => {
  // Deliverable of the Limitations pass: a limitation is only useful if a
  // reader can check it. Each entry names the code that REPORTS it, and this
  // gate holds those names to the registry — a typo, or a code retired later,
  // fails here rather than sitting in prose nobody re-reads.
  const registry = new Set<string>();
  for (const line of readFileSync(at("docs/engine/diagnostics.md"), "utf8").split("\n")) {
    if (!line.startsWith("| `")) continue;
    for (const m of (line.split("|")[1] ?? "").matchAll(/`([a-z][a-z0-9_]+)`/g)) registry.add(m[1]!);
  }

  /** Codes are always named inside parentheses; a backticked token with a dot,
   * colon or space is wire syntax (`box.w`, `overflow: hidden`), not a code. */
  function codesIn(section: string): string[] {
    const out: string[] = [];
    for (const group of section.matchAll(/\(([^()]*)\)/g)) {
      for (const m of (group[1] ?? "").matchAll(/`([^`]+)`/g)) {
        if (/^[a-z][a-z0-9_]{3,}$/.test(m[1]!)) out.push(m[1]!);
      }
    }
    return out;
  }

  const sections = new Map<string, string>();
  for (const page of pages) {
    const m = /^## Limitations$([\s\S]*?)(?=^## |$(?![\s\S]))/m.exec(page.body);
    if (m !== null) sections.set(page.stem, m[1]!);
  }

  it("gives all 32 feature pages a Limitations section", () => {
    expect([...sections.keys()].sort()).toEqual(features);
  });

  it("leaves no registry code outside the position the gate inspects", () => {
    // The convention is that a code is named inside parentheses; `codesIn`
    // only looks there. A code written bare therefore escapes the check
    // silently — style.md's fallback list held eight that way. This is the
    // guard on the convention itself, and it needs no allowlist: a token is
    // only a finding when the REGISTRY says it is a code.
    const escaped: string[] = [];
    for (const [stem, section] of sections) {
      const inside = new Set(codesIn(section));
      for (const m of section.matchAll(/`([a-z][a-z0-9_]+)`/g)) {
        if (registry.has(m[1]!) && !inside.has(m[1]!)) escaped.push(`${stem}: ${m[1]!}`);
      }
    }
    expect(escaped).toEqual([]);
  });

  it("names only codes the registry defines", () => {
    expect(registry.size).toBeGreaterThan(100);
    const bad: string[] = [];
    for (const [stem, section] of sections) {
      for (const code of codesIn(section)) if (!registry.has(code)) bad.push(`${stem}: ${code}`);
    }
    expect(bad).toEqual([]);
  });

  it("actually names codes — a section of prose with none is not a claim", () => {
    const total = [...sections.values()].flatMap(codesIn);
    expect(total.length).toBeGreaterThan(80);
    // Pages whose limits are purely structural still exist, but most pages
    // must ground at least one claim in a code.
    const grounded = [...sections.values()].filter((s) => codesIn(s).length > 0).length;
    expect(grounded).toBeGreaterThanOrEqual(28);
  });

  it("states the cross-cutting list on the index page, with codes from the same registry", () => {
    const readme = pages.find((p) => p.stem === "README")!;
    const m = /^## Not supported yet$([\s\S]*?)(?=^## |$(?![\s\S]))/m.exec(readme.body);
    expect(m, "docs/engine/README.md must carry the cross-cutting list").not.toBeNull();
    // Codes live in the "Reported as" column; the first column names wire
    // spellings (`table`, `repeat`) that are item types, not codes.
    const codes = (m![1] ?? "")
      .split("\n")
      .filter((l) => l.startsWith("| ") && l.includes(" | "))
      .flatMap((l) => [...(l.split("|").at(-2) ?? "").matchAll(/`([a-z][a-z0-9_]{3,})`/g)].map((x) => x[1]!));
    expect(codes.filter((c) => !registry.has(c))).toEqual([]);
    expect(codes.length).toBeGreaterThan(8);
  });
});

describe("the strip's Copy for AI stays inside the CSP", () => {
  // `connect-src 'self'`: a fetch of the GitHub raw URL is blocked, and
  // widening the site scope for github-raw is the hole headers.test.ts
  // refuses. So the raw markdown is staged same-origin and the component
  // must not fetch anything else.
  const vue = readFileSync(at("site/.vitepress/theme/components/ReferenceProvenance.vue"), "utf8");

  it("fetches only a same-origin path", () => {
    const fetches = [...vue.matchAll(/fetch\(([^)]*)\)/g)].map((m) => m[1]!);
    expect(fetches).toHaveLength(1);
    expect(fetches[0]).toContain("raw.value");
    expect(vue).toContain('withBase(`/data/reference/');
  });

  it("keeps the repository URL as an href only", () => {
    // A link is a navigation; no directive in this CSP governs it.
    expect(vue).toContain(':href="blob"');
    expect(vue).not.toMatch(/fetch\(\s*`?\$\{REPO\}/);
  });
});
