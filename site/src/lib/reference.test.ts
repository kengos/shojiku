import { describe, expect, it } from "vitest";
import {
  block,
  demoAnchor,
  guardMustaches,
  landingIndex,
  NON_FEATURE,
  parseMeta,
  projectPage,
  projectedBody,
  readPage,
  REFERENCE_DIR,
  REFERENCE_LOCALES,
  restoreIndexLinks,
  restoreOutlinks,
  rewriteIndexLinks,
  rewriteOutlinks,
  SOURCE_DIR,
  splitFrontMatter,
  stripInjected,
  unguardMustaches,
  type ReferencePage,
} from "./reference.ts";

const FM = `---
reference:
  group: item
  order: 3
  keys: [text]
  shapes: [Span]
  summary: "A page about text."
---
`;

describe("splitFrontMatter", () => {
  it("splits the block from the body", () => {
    const { frontMatter, body } = splitFrontMatter(`${FM}\n# Title\n`);
    expect(frontMatter).toContain("group: item");
    expect(body).toBe("\n# Title\n");
  });

  it("returns the whole file as body when there is no block", () => {
    expect(splitFrontMatter("# Title\n")).toEqual({ frontMatter: "", body: "# Title\n" });
  });
});

describe("parseMeta", () => {
  it("reads every declared field", () => {
    const m = parseMeta(splitFrontMatter(FM).frontMatter, "text");
    expect(m).toEqual({ group: "item", order: 3, keys: ["text"], shapes: ["Span"], summary: "A page about text." });
  });

  it("defaults the optional fields", () => {
    const m = parseMeta('reference:\n  group: concept\n  summary: "s"\n', "x");
    expect(m.order).toBeUndefined();
    expect(m.keys).toEqual([]);
    expect(m.shapes).toEqual([]);
  });

  it("drops non-string list entries rather than carrying them into the tree", () => {
    const m = parseMeta('reference:\n  group: concept\n  summary: "s"\n  keys: [a, 2]\n  shapes: 7\n', "x");
    expect(m.keys).toEqual(["a"]);
    expect(m.shapes).toEqual([]);
  });

  // A page that declares nothing would vanish from the sidebar, which reads
  // to a visitor as "this feature does not exist". It must fail the build.
  it("refuses a page with no front-matter at all", () => {
    expect(() => parseMeta("", "text")).toThrow(/no `reference:` front-matter/);
  });

  it("refuses a front-matter block that carries no reference key", () => {
    expect(() => parseMeta("title: x\n", "text")).toThrow(/no `reference:` front-matter/);
  });

  it("refuses an unknown group", () => {
    expect(() => parseMeta('reference:\n  group: nope\n  summary: "s"\n', "text")).toThrow(/is not one of/);
    expect(() => parseMeta('reference:\n  summary: "s"\n', "text")).toThrow(/is not one of/);
  });

  it("refuses a missing or empty summary", () => {
    expect(() => parseMeta("reference:\n  group: item\n", "text")).toThrow(/no `summary`/);
    expect(() => parseMeta('reference:\n  group: item\n  summary: ""\n', "text")).toThrow(/no `summary`/);
  });
});

describe("readPage", () => {
  it("takes the H1 verbatim, backticks and all — it is wire spelling", () => {
    const p = readPage("text", `${FM}\n# \`type: text\`\n\nbody\n`);
    expect(p.title).toBe("`type: text`");
    expect(p.stem).toBe("text");
  });

  it("refuses a page with no H1", () => {
    expect(() => readPage("text", `${FM}\nno heading\n`)).toThrow(/no H1/);
  });
});

describe("outlink rewriting round-trips", () => {
  it("sends ../x to docs/x and ../../x to the repo root", () => {
    expect(rewriteOutlinks("[a](../quickstart.md)")).toContain("/blob/main/docs/quickstart.md");
    expect(rewriteOutlinks("[a](../../CLAUDE.md)")).toContain("/blob/main/CLAUDE.md");
  });

  it("serves an extensionless path as a tree, not a blob", () => {
    expect(rewriteOutlinks("[a](../../examples/business/invoice-ja)")).toContain("/tree/main/examples/business/invoice-ja");
    expect(rewriteOutlinks("[a](../code-map/)")).toContain("/tree/main/docs/code-map/");
  });

  it("leaves sibling links alone — the projected pages are siblings too", () => {
    expect(rewriteOutlinks("[box](box.md) and [a](data-binding.md#scopes)")).toBe("[box](box.md) and [a](data-binding.md#scopes)");
  });

  it("restores exactly what it rewrote", () => {
    const src = "[a](../quickstart.md) [b](../../examples/x) [c](box.md) [d](../code-map/)";
    expect(restoreOutlinks(rewriteOutlinks(src))).toBe(src);
  });
});

describe("injected blocks", () => {
  it("strips what it inserts", () => {
    const text = `head${block("<Thing />")}tail`;
    expect(text).toContain("<Thing />");
    expect(stripInjected(text)).toBe("headtail");
  });
});

describe("demoAnchor", () => {
  it("puts the demo after the Syntax section", () => {
    const body = "# T\n\nintro\n\n## Syntax\n\nyaml\n\n## Keys\n\nk\n";
    expect(body.slice(demoAnchor(body))).toBe("## Keys\n\nk\n");
  });

  it("puts it after the opening prose when the page has no Syntax section", () => {
    // defaults.md opens with `## \`defaults:\``, length.md with
    // `## Accepted forms` — the anchor is computed, never assumed.
    const body = "# T\n\nintro\n\n## Accepted forms\n\nx\n";
    expect(body.slice(demoAnchor(body))).toBe("## Accepted forms\n\nx\n");
  });

  it("falls back to the end when the page has no h2 at all", () => {
    const body = "# T\n\njust prose\n";
    expect(demoAnchor(body)).toBe(body.length);
  });

  it("falls back to the end when Syntax is the last section", () => {
    const body = "# T\n\n## Syntax\n\nyaml\n";
    expect(demoAnchor(body)).toBe(body.length);
  });

  // A `## ` inside a code fence is a shell prompt or a YAML comment, not a
  // section. Splicing the demo there puts a Vue component tag INSIDE the
  // fence — which no gate can see (the drift gate strips the generated
  // blocks before comparing, so it stays green) and only the page is broken.
  it("ignores a `## ` line inside a ``` fence", () => {
    const body = "# T\n\n## Syntax\n\n```sh\n## not a heading\n```\n\n## Keys\n\nk\n";
    expect(body.slice(demoAnchor(body))).toBe("## Keys\n\nk\n");
  });

  it("ignores a `## ` line inside a ~~~ fence", () => {
    const body = "# T\n\nintro\n\n~~~yaml\n## not a heading\n~~~\n\n## Accepted forms\n\nx\n";
    expect(body.slice(demoAnchor(body))).toBe("## Accepted forms\n\nx\n");
  });

  it("falls back to the end when the only `## ` line is fenced", () => {
    const body = "# T\n\n```sh\n## not a heading\n```\n";
    expect(demoAnchor(body)).toBe(body.length);
  });

  // A fence closes on its OWN delimiter only. Toggling on either would end
  // this block at the `~~~`, promote the line after it to a section, and
  // splice the demo into the code — the very failure the fence tracking is
  // here to prevent.
  it("does not let a ~~~ line close a ``` fence", () => {
    const body = "# T\n\nintro\n\n```yaml\n~~~\n## not a heading\n```\n\n## Keys\n\nk\n";
    expect(body.slice(demoAnchor(body))).toBe("## Keys\n\nk\n");
  });

  // Longer closes shorter, never the reverse: a ``` line inside a ````
  // block is content (that is how a fence quotes a fence).
  it("needs a closing fence at least as long as the opener", () => {
    const body = "# T\n\nintro\n\n````\n```\n## not a heading\n````\n\n## Keys\n\nk\n";
    expect(body.slice(demoAnchor(body))).toBe("## Keys\n\nk\n");
  });

  // A closing fence may be followed only by whitespace (CommonMark) — a
  // ```yaml line inside an open ``` block is content, not a close. Treating
  // it as one reopens the same hole from the other side: the block "ends"
  // early and the `## ` still inside it reads as a section.
  it("does not let a fence with an info string close a block", () => {
    const body = "# T\n\nintro\n\n```\n```yaml\n## not a heading\n```\n\n## Keys\n\nk\n";
    expect(body.slice(demoAnchor(body))).toBe("## Keys\n\nk\n");
  });
});

describe("projectPage", () => {
  const page = readPage("text", `${FM}\n# \`type: text\`\n\nintro\n\n## Syntax\n\nyaml\n\n## Keys\n\nk\n`);

  it("carries the title and summary into VitePress front-matter", () => {
    const out = projectPage(page, { source: "docs/engine/text.md" });
    expect(out).toContain('title: "`type: text`"');
    expect(out).toContain('description: "A page about text."');
    expect(out).not.toContain("sidebar: false");
  });

  it("puts the provenance strip under the H1 and the demo after Syntax", () => {
    const out = projectPage(page, { source: "docs/engine/text.md", demo: "text" });
    expect(out.indexOf("ReferenceProvenance")).toBeLessThan(out.indexOf("ReferenceDemo"));
    expect(out.indexOf("## Syntax")).toBeLessThan(out.indexOf("ReferenceDemo"));
    expect(out.indexOf("ReferenceDemo")).toBeLessThan(out.indexOf("## Keys"));
  });

  it("omits the demo block when the page has none", () => {
    expect(projectPage(page, { source: "s" })).not.toContain("ReferenceDemo");
  });

  it("drops the sidebar on the landing — it IS the tree", () => {
    const out = projectPage(page, { source: "s", landing: true, extra: "## Every page\n" });
    expect(out).toContain("sidebar: false");
    expect(out).toContain("aside: false");
    expect(out).toContain("## Every page");
  });

  it("carries the locale notice above the prose", () => {
    const out = projectPage(page, { source: "s", notice: "英語のままです" });
    expect(out).toContain("> 英語のままです");
  });

  it("round-trips to the source body, whatever was injected", () => {
    for (const opts of [{ source: "s" }, { source: "s", demo: "text", notice: "n", extra: "e", landing: true }]) {
      expect(projectedBody(projectPage(page, opts))).toBe(page.body);
    }
  });
});

describe("landingIndex", () => {
  const mk = (stem: string, summary: string): ReferencePage => ({
    stem,
    title: stem,
    body: "",
    meta: { group: "item", keys: [], shapes: [], summary },
  });

  it("lists the feature pages under the locale's own base", () => {
    const out = landingIndex([mk("text", "about text"), mk("README", "the index")], "/ja/reference/");
    expect(out).toContain("[text](/ja/reference/text) | about text");
    expect(out).not.toContain("README");
  });

  it("skips both non-feature pages", () => {
    expect(NON_FEATURE).toEqual(["README", "features"]);
    expect(landingIndex([mk("features", "x")], "/reference/")).not.toContain("features");
  });
});

describe("the declared paths", () => {
  it("name the source and the generated directory", () => {
    expect(SOURCE_DIR).toBe("docs/engine/");
    expect(REFERENCE_DIR).toBe("site/reference/");
  });

  it("routes both locales, and only the ja one carries a notice", () => {
    expect(REFERENCE_LOCALES.map((l) => l.base)).toEqual(["/reference/", "/ja/reference/"]);
    expect(REFERENCE_LOCALES[0]?.notice).toBeUndefined();
    expect(REFERENCE_LOCALES[1]?.notice).toContain("日本語");
  });
});

describe("projectPage with no H1", () => {
  it("puts the strip at the top rather than mid-sentence", () => {
    const page: ReferencePage = { stem: "x", title: "x", body: "prose only\n", meta: { group: "concept", keys: [], shapes: [], summary: "s" } };
    const out = projectPage(page, { source: "s" });
    expect(out.indexOf("ReferenceProvenance")).toBeLessThan(out.indexOf("prose only"));
    expect(projectedBody(out)).toBe(page.body);
  });
});

describe("mustache guarding", () => {
  it("wraps inline code that documents the literal-brace escape", () => {
    expect(guardMustaches("write `{{` for a literal brace")).toBe("write <span v-pre>`{{`</span> for a literal brace");
    expect(guardMustaches("(`{{key}}` names the form)")).toBe("(<span v-pre>`{{key}}`</span> names the form)");
  });

  it("leaves inline code without a double brace alone", () => {
    expect(guardMustaches("`{key}` and `{key:format}`")).toBe("`{key}` and `{key:format}`");
  });

  it("undoes exactly what it wrapped", () => {
    const src = "write `{{` and `{key}` and `{{key}}`";
    expect(unguardMustaches(guardMustaches(src))).toBe(src);
  });
});

describe("index links", () => {
  it("sends README.md to the landing, anchor and all", () => {
    expect(rewriteIndexLinks("[i](README.md)")).toBe("[i](./)");
    expect(rewriteIndexLinks("[i](README.md#item-types)")).toBe("[i](./#item-types)");
  });

  it("leaves other sibling links alone", () => {
    expect(rewriteIndexLinks("[b](box.md)")).toBe("[b](box.md)");
  });

  it("undoes exactly what it rewrote", () => {
    const src = "[i](README.md) [a](README.md#item-types) [b](box.md)";
    expect(restoreIndexLinks(rewriteIndexLinks(src))).toBe(src);
  });
});

describe("the provenance strip names what THIS page generates", () => {
  const page = readPage("text", `${FM}\n# T\n\nintro\n\n## Syntax\n\nyaml\n\n## Keys\n\nk\n`);

  it("says sidebar and demo on an ordinary feature page", () => {
    expect(projectPage(page, { source: "s", demo: "text" })).toContain('parts="the sidebar and the demo below."');
  });

  it("says only the sidebar when the page has no demo", () => {
    expect(projectPage(page, { source: "s" })).toContain('parts="the sidebar."');
  });

  it("says so plainly when a page generates nothing at all", () => {
    // Reachable through the API: a landing with no page index. The strip has
    // to say something, and "nothing" is the honest thing to say.
    expect(projectPage(page, { source: "s", landing: true })).toContain(
      'parts="nothing — this page is the file, as it is."',
    );
  });

  it("claims neither on the landing, which has no sidebar and no demo", () => {
    const out = projectPage(page, { source: "s", landing: true, extra: "## Every page\n" });
    expect(out).toContain('parts="the page index below."');
    expect(out).not.toContain("the sidebar");
  });
});
