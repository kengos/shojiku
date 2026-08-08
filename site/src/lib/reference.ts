// The reference projection: docs/engine/*.md rendered as /reference/* on the
// site. The site RESTATES nothing — a projected page's prose is the repo file
// byte for byte, and the only edits this module makes to a body are the four
// declared, REVERSIBLE ones below, which is what the drift gate proves by
// undoing all four and comparing against the source.
//
//   1. links that leave docs/engine/ become absolute repository URLs (the
//      site has no route for ../architecture.md, so VitePress would fail its
//      dead-link check on them). Sibling `box.md` links need nothing —
//      the projected pages are siblings too, so VitePress resolves them.
//   2. sibling `README.md` links point at the landing, which is projected as
//      `index` — VitePress has no `/reference/README` route and would report
//      a dead link.
//   3. inline code containing `{{` is wrapped in `v-pre` — Vue reads a double
//      brace in markdown as an interpolation, and `{{` is the wire's own
//      escape for a literal `{`, so data-binding.md and text.md document a
//      spelling that would otherwise crash the build.
//   4. the page anatomy's generated blocks (provenance strip, live demo) are
//      inserted between HTML-comment markers.
import { parse } from "yaml";

const REPO = "https://github.com/kengos/shojiku";

/** Repo-relative, so the build step and the gates name the same two places. */
export const SOURCE_DIR = "docs/engine/";
/** Generated, gitignored: VitePress routes it, nobody edits it. */
export const REFERENCE_DIR = "site/reference/";

/** Both locales are routed from day one. The Japanese twin carries the
 * English body under a notice — a reader who follows a `/ja/` link to `flex`
 * should reach the page about `flex`, not a 404 that says the reference is
 * English-only. */
export const REFERENCE_LOCALES = [
  { dir: REFERENCE_DIR, base: "/reference/", notice: undefined as string | undefined },
  {
    dir: "site/ja/reference/",
    base: "/ja/reference/",
    notice: "このページはまだ日本語になっていません。本文は英語のままですが、内容は同じものです。",
  },
] as const;

/** The stems that are NOT feature pages: the landing and the capability
 * record. Both are still routed — a reader following a repo link to either
 * must land somewhere. */
export const NON_FEATURE = ["README", "features"] as const;

/** What llms-full.txt does NOT inline. `features.md` is the
 * implemented-capability inventory and the decision log — docs/engine/README.md
 * says so itself: it records "*that* a feature exists and why it is shaped that
 * way; the pages here carry only *how to author it*". It is also a THIRD of
 * the payload (146,877 of 442,505 bytes), which an agent asking how to write
 * `flex` pays for and never reads. The landing stays: it is the index, and
 * `NON_FEATURE` would drop it too, which is why this list is its own.
 *
 * It stays fully reachable — routed at /reference/features, served raw at
 * /data/reference/features.md, and linked from the reference index. */
const LLMS_FULL_OMIT = ["features"] as const;

export function llmsFullPages(pages: readonly ReferencePage[]): ReferencePage[] {
  return pages.filter((p) => !(LLMS_FULL_OMIT as readonly string[]).includes(p.stem));
}

/** Where a page sits in the sidebar. `index` and `appendix` are routed but
 * are not tree entries (the landing, and the shipped-capability record). */
export type Group = "index" | "appendix" | "root" | "item" | "item-keys" | "layout" | "definitions" | "concept";

const GROUPS = new Set<Group>(["index", "appendix", "root", "item", "item-keys", "layout", "definitions", "concept"]);

export interface ReferenceMeta {
  group: Group;
  /** Position within the group. Absent for `item`, whose order is DERIVED
   * from the catalog's own item list rather than restated here. */
  order?: number;
  /** The wire keys this page owns as sidebar entries. */
  keys: string[];
  /** The catalog `$defs` this page documents. */
  shapes: string[];
  summary: string;
}

export interface ReferencePage {
  stem: string;
  /** The H1 text, verbatim (backticks and all — it is wire spelling). */
  title: string;
  meta: ReferenceMeta;
  /** Everything after the front-matter, unmodified. */
  body: string;
}

const FM = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;

export function splitFrontMatter(md: string): { frontMatter: string; body: string } {
  const m = FM.exec(md);
  if (m === null) return { frontMatter: "", body: md };
  return { frontMatter: m[1]!, body: md.slice(m[0].length) };
}

function fail(stem: string, why: string): never {
  throw new Error(`docs/engine/${stem}.md: ${why} — every reference page must declare its \`reference:\` front-matter`);
}

/** Parse the `reference:` block. A page that declares none, or declares it
 * wrongly, FAILS the build: the alternative is a page silently missing from
 * the sidebar, which reads as "this feature does not exist". */
export function parseMeta(frontMatter: string, stem: string): ReferenceMeta {
  const doc = (frontMatter === "" ? undefined : (parse(frontMatter) as { reference?: unknown })?.reference) as
    | Record<string, unknown>
    | undefined;
  if (doc === undefined || doc === null) fail(stem, "no `reference:` front-matter");
  const group = doc.group;
  if (typeof group !== "string" || !GROUPS.has(group as Group)) fail(stem, `group ${JSON.stringify(group)} is not one of ${[...GROUPS].join(", ")}`);
  const summary = doc.summary;
  if (typeof summary !== "string" || summary === "") fail(stem, "no `summary`");
  const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const order = typeof doc.order === "number" ? doc.order : undefined;
  return { group: group as Group, order, keys: list(doc.keys), shapes: list(doc.shapes), summary };
}

export function readPage(stem: string, md: string): ReferencePage {
  const { frontMatter, body } = splitFrontMatter(md);
  const meta = parseMeta(frontMatter, stem);
  const h1 = /^#\s+(.+)$/m.exec(body);
  if (h1 === null) fail(stem, "no H1");
  return { stem, title: h1[1]!.trim(), meta, body };
}

// --- the four reversible body edits -----------------------------------------

const OUT = /\]\((\.\.\/(?:\.\.\/)?)([^)]+)\)/g;

/** `../x` → docs/x, `../../x` → x, as absolute repository URLs. A path with
 * no file extension is a directory, which GitHub serves under `tree`. */
export function rewriteOutlinks(body: string): string {
  return body.replace(OUT, (_m, up: string, rest: string) => {
    const path = up === "../" ? `docs/${rest}` : rest;
    const kind = /\.[a-z0-9]+$/i.test(path) ? "blob" : "tree";
    return `](${REPO}/${kind}/main/${path})`;
  });
}

const BACK = new RegExp(`\\]\\(${REPO.replace(/[.*+?^$()|[\]\\]/g, "\\$&")}/(?:blob|tree)/main/([^)]+)\\)`, "g");

/** The inverse. docs/engine/ carries no absolute links of its own (verified),
 * so the pair round-trips and the drift gate can compare byte for byte. */
export function restoreOutlinks(text: string): string {
  return text.replace(BACK, (_m, path: string) =>
    path.startsWith("docs/") ? `](../${path.slice("docs/".length)})` : `](../../${path})`,
  );
}

const INDEX_LINK = /\]\(README\.md(#[^)]*)?\)/g;
const INDEX_BACK = /\]\(\.\/(#[^)]*)?\)/g;

/** `README.md` is projected as the landing (`index`), so a sibling link to it
 * has no `/reference/README` route — VitePress reports a dead link and fails
 * the build. docs/engine/ uses no `./` links of its own, so the pair
 * round-trips. */
export function rewriteIndexLinks(body: string): string {
  return body.replace(INDEX_LINK, (_m, hash: string | undefined) => `](./${hash ?? ""})`);
}

export function restoreIndexLinks(text: string): string {
  return text.replace(INDEX_BACK, (_m, hash: string | undefined) => `](README.md${hash ?? ""})`);
}

const MUSTACHE = /(`[^`\n]*\{\{[^`\n]*`)/g;
const UNMUSTACHE = /<span v-pre>(`[^`\n]*`)<\/span>/g;

/** Vue compiles `{{ … }}` in markdown as an interpolation, and the template
 * wire spells a literal `{` as `{{` — so the two pages that document that
 * escape would fail the build with a JS parse error pointing at prose. The
 * occurrences are all inline code; `v-pre` around the span is the documented
 * VitePress escape, and it belongs to the PROJECTION rather than to the repo
 * file, which is also read on GitHub. */
export function guardMustaches(body: string): string {
  return body.replace(MUSTACHE, "<span v-pre>$1</span>");
}

export function unguardMustaches(text: string): string {
  return text.replace(UNMUSTACHE, "$1");
}

const OPEN = "<!-- rf:begin -->";
const CLOSE = "<!-- rf:end -->";
const BLOCK = new RegExp(`\\n\\n${OPEN}\\n\\n[\\s\\S]*?\\n\\n${CLOSE}\\n\\n`, "g");

/** Every generated block is BLANK-LINE delimited. Without that, markdown reads
 * the component tag as a lazy continuation of whatever preceded it — the /ja/
 * notice blockquote swallowed the provenance tag and Vue failed the build with
 * "Element is missing end tag" pointing at post-markdown coordinates nowhere
 * near the cause. */
export function block(inner: string): string {
  return `\n\n${OPEN}\n\n${inner}\n\n${CLOSE}\n\n`;
}

/** Remove every generated block, leaving the projected prose alone. */
export function stripInjected(text: string): string {
  return text.replace(BLOCK, "");
}

const FENCE = /^(```+|~~~+)/;

/** The page's h2 lines, with their offsets — SKIPPING fenced code, where a
 * line starting `## ` is a shell prompt or a YAML comment, not a section.
 * A plain `/^## /gm` sweep cannot tell the two apart, and getting it wrong is
 * invisible to every gate: the drift gate strips the generated blocks before
 * comparing, so it passes, the Limitations gate passes, and only the rendered
 * page is broken — a provenance strip or a live demo spliced INSIDE a code
 * fence. No page carries such a line today (verified across all 33); this
 * exists so that the day one does, the block still lands outside it.
 *
 * A fence closes only on its OWN delimiter, at least as long as the opener,
 * with nothing after it but whitespace, per CommonMark — a `~~~` line inside
 * a ``` block is content, and so is a ```yaml line (an info string belongs to
 * an OPENER; a closer carries none). Accepting either as a close would reopen
 * the hole this function exists to close: the block would end early, the
 * `## ` after it would read as a section, and the splice would land in the
 * code after all.
 *
 * A line walk rather than a regex over the whole body: it stays linear in the
 * page length, with nothing to backtrack. Both the fences and the headings
 * are matched at column 0 only — the same discipline every other gate over
 * these files uses (`/^## /` in the Limitations and drift gates). */
function headings(body: string): { text: string; index: number }[] {
  const found: { text: string; index: number }[] = [];
  let open: string | undefined;
  let at = 0;
  for (const line of body.split("\n")) {
    const fence = FENCE.exec(line)?.[1];
    const closes = fence !== undefined && open !== undefined && fence.startsWith(open) && line.slice(fence.length).trim() === "";
    if (fence !== undefined && open === undefined) open = fence;
    else if (closes) open = undefined;
    else if (open === undefined && line.startsWith("## ")) found.push({ text: line.trim(), index: at });
    at += line.length + 1;
  }
  return found;
}

/** Where the demo goes: after the `## Syntax` section when the page has one
 * (the anatomy's title → provenance → Syntax → playground order), otherwise
 * straight after the opening prose. Pages differ — `defaults.md` opens with
 * `## \`defaults:\``, `length.md` with `## Accepted forms` — so the anchor is
 * computed, not assumed. */
export function demoAnchor(body: string): number {
  const heads = headings(body);
  const syntax = heads.findIndex((h) => h.text === "## Syntax");
  const next = syntax === -1 ? heads[0] : heads[syntax + 1];
  return next?.index ?? body.length;
}

export interface ProjectOptions {
  /** The repo-relative source path, for the provenance strip. */
  source: string;
  /** Rendered by the theme; omitted when the page has no demo. */
  demo?: string;
  /** Generated markdown appended at the end (the landing's page index). */
  extra?: string;
  /** The landing runs full-width: it IS the tree, so a sidebar beside it
   * would be the same list twice. */
  landing?: boolean;
  /** Shown above the prose. The /ja/ twin carries the English body under a
   * notice rather than not existing: a Japanese reader following a link to
   * `flex` should reach the page that documents `flex`, in whatever language
   * it currently exists, not a 404. */
  notice?: string;
}

/** The projected page: VitePress front-matter, then the body with the
 * anatomy's generated blocks inserted. */
export function projectPage(page: ReferencePage, opts: ProjectOptions): string {
  const body = guardMustaches(rewriteIndexLinks(rewriteOutlinks(page.body)));
  const at = demoAnchor(body);
  // Name only what this page really generates. The landing has no sidebar
  // (it IS the tree) and no demo, so the generic sentence was false there.
  const parts = [
    ...(opts.landing === true ? [] : ["the sidebar"]),
    ...(opts.demo === undefined ? [] : ["the demo below"]),
    ...(opts.extra === undefined ? [] : ["the page index below"]),
  ];
  const generated = parts.length === 0 ? "nothing — this page is the file, as it is." : `${parts.join(" and ")}.`;
  const strip = block(
    [
      ...(opts.notice === undefined ? [] : [`> ${opts.notice}`]),
      `<ReferenceProvenance source=${JSON.stringify(opts.source)} parts=${JSON.stringify(generated)} />`,
    ].join("\n\n"),
  );
  const demo = opts.demo === undefined ? "" : block(`<ClientOnly><ReferenceDemo page=${JSON.stringify(opts.demo)} /></ClientOnly>`);
  const tail = opts.extra === undefined ? "" : block(opts.extra);
  const head = [
    "---",
    `title: ${JSON.stringify(page.title)}`,
    `description: ${JSON.stringify(page.meta.summary)}`,
    ...(opts.landing === true ? ["sidebar: false", "aside: false"] : []),
    "---",
    "",
  ].join("\n");
  // The strip goes under the H1. A body with no H1 is not something readPage
  // will produce, but projectPage takes a plain struct — so it lands at the
  // top rather than in the middle of the first sentence.
  const h1 = /^#\s+.+$/m.exec(body);
  const afterH1 = h1 === null ? 0 : h1.index + h1[0].length;
  return head + body.slice(0, afterH1) + strip + body.slice(afterH1, at) + demo + body.slice(at) + tail;
}

/** The drift gate's question: does the projection still say exactly what the
 * repo file says? Both declared edits are undone, and what is left must be
 * the source body byte for byte — so any OTHER edit fails. */
export function projectedBody(projected: string): string {
  return restoreOutlinks(restoreIndexLinks(unguardMustaches(stripInjected(splitFrontMatter(projected).body))));
}

/** The landing's generated index: every feature page with its own declared
 * one-liner. The hand-written tables on the index page cover the item types
 * and the box/style keys; this covers the SET — a page absent here is a page
 * absent from the reference. */
export function landingIndex(pages: readonly ReferencePage[], base: string): string {
  const rows = pages
    .filter((p) => !(NON_FEATURE as readonly string[]).includes(p.stem))
    .map((p) => `| [${p.title}](${base}${p.stem}) | ${p.meta.summary} |`)
    .join("\n");
  return [`## Every page`, "", `| Page | Covers |`, `| --- | --- |`, rows, ""].join("\n");
}
