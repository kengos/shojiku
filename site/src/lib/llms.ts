// /llms.txt and /llms-full.txt renderers. Everything here is either the ONE
// shared preamble (src/llms-preamble.md, the single hand-written blob this
// site allows) or generated from repo truth (the docs files themselves)
// — never per-page hand-written summaries.
import type { GalleryEntry } from "./gallery.ts";

const REPO = "https://github.com/kengos/shojiku";
const RAW = `${REPO}/blob/main`;

export interface SitePage {
  /** The `site/<stem>.md` file. `build-pages.sh` stages every one of those
   * into dist beside the HTML, so `/<stem>.md` is a real endpoint. */
  stem: string;
  title: string;
}

/** The site's own pages, in NAV order (not alphabetical — hence a written
 * list rather than a directory read), each with the sentence an agent gets.
 *
 * A `site/<stem>.md` file is the only thing that may appear here. The
 * generated reference is deliberately absent: `site/reference/*.md` is
 * gitignored build output carrying VitePress front-matter and Vue component
 * tags, `build-pages.sh` does not stage it, and `/reference/.md` was
 * therefore a 404 in every llms.txt this site has published. The reference's
 * own clean bodies are served per page under `/data/reference/`, and the
 * "Repository truth" section below is where an agent is pointed at it. */
export const SITE_PAGES: readonly SitePage[] = [
  { stem: "index", title: "Shojiku" },
  { stem: "concept", title: "Concept" },
  { stem: "features", title: "Features" },
  { stem: "gallery", title: "Gallery" },
  { stem: "tutorials", title: "Production tutorials" },
  { stem: "playground", title: "Playground" },
  { stem: "compare", title: "Compared to other engines" },
  { stem: "agents", title: "For AI agents" },
  { stem: "languages", title: "Printing in a language the engine does not build in" },
  { stem: "tips", title: "Tips: uses outside business documents" },
  { stem: "tech", title: "Technology, licensing & security model" },
];

/** Fail the BUILD when `SITE_PAGES` and `site/*.md` drift apart, rather than
 * shipping an llms.txt that quietly omits a page or links a 404. Both
 * directions have already happened once: `languages.md` shipped and was never
 * listed, while `/reference/` was listed and had no file. */
export function checkSitePages(stems: readonly string[]): void {
  const listed = new Set(SITE_PAGES.map((p) => p.stem));
  const onDisk = new Set(stems);
  const missing = stems.filter((s) => !listed.has(s));
  const extra = SITE_PAGES.filter((p) => !onDisk.has(p.stem)).map((p) => p.stem);
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `SITE_PAGES is out of step with site/*.md — every page needs a line, and every line needs a page. Unlisted: [${missing.join(", ")}]; listed with no file: [${extra.join(", ")}]`,
    );
  }
}

export function renderLlmsTxt(pages: readonly SitePage[]): string {
  const lines = [
    "# Shojiku",
    "",
    "> A deterministic PDF document engine: two YAML files (template + field",
    "> catalog) plus JSON data render to byte-identical PDFs on every host.",
    "> Built for AI agents — validate/preview/inspect via an MCP server.",
    "",
    "## Site",
    ...pages.map((p) => `- [${p.title}](/${p.stem}.md)`),
    "",
    "## Repository truth",
    `- [Template reference](${RAW}/docs/engine/README.md)`,
    `- [Diagnostics registry](${RAW}/docs/engine/diagnostics.md)`,
    "  (both are rendered on this site under /reference/, one route per page,",
    "  each page's own markdown at /data/reference/<page>.md, and llms-full.txt",
    "  below inlines every one of them)",
    `- [Capability record](${RAW}/docs/engine/features.md)`,
    "  (what shipped and why it is shaped that way, as opposed to how to author",
    "  it. Repository-only: it is not rendered on this site and is not inlined",
    "  below, so fetch it directly. The reader-facing tour is /features.md)",
    `- [Quickstart](${RAW}/docs/quickstart.md)`,
    `- [Architecture](${RAW}/docs/architecture.md)`,
    `- [Thinreports migration](${RAW}/docs/migration-thinreports.md)`,
    "",
  ];
  return lines.join("\n");
}

export interface FullDoc {
  label: string;
  text: string;
}

/** llms-full.txt: the shared preamble, the gallery index (generated from
 * gallery.yml), then the repo docs the caller passes — concatenated verbatim,
 * separated by labeled rules so an agent can navigate. `assemble-data.ts`
 * passes the reference's AUTHORING pages (every page the site routes, which
 * excludes the repo-only capability record, bodies only) plus the quickstart,
 * so an agent that needs
 * `flex` has it here rather than having to fetch a second file. This renderer
 * still takes whatever list it is given. */
export function renderLlmsFull(
  preamble: string,
  entries: GalleryEntry[],
  docs: readonly FullDoc[],
): string {
  const gallery = entries
    .map((e) => `- examples/${e.dir}/ — ${e.titleEn}: ${e.blurbEn}`)
    .join("\n");
  const parts = [
    preamble.trim(),
    `## Bundled examples (${entries.length})\n\n${gallery}`,
    ...docs.map((d) => `---\n\n## ${d.label}\n\n${d.text.trim()}`),
  ];
  return parts.join("\n\n") + "\n";
}
