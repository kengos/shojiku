// /llms.txt and /llms-full.txt renderers. Everything here is either the ONE
// shared preamble (src/llms-preamble.md, the single hand-written blob this
// site allows) or generated from repo truth (the docs files themselves)
// — never per-page hand-written summaries.
import type { GalleryEntry } from "./gallery.ts";

const REPO = "https://github.com/kengos/shojiku";
const RAW = `${REPO}/blob/main`;

export function renderLlmsTxt(pages: readonly { path: string; title: string }[]): string {
  const lines = [
    "# Shojiku",
    "",
    "> A deterministic PDF document engine: two YAML files (template + field",
    "> catalog) plus JSON data render to byte-identical PDFs on every host.",
    "> Built for AI agents — validate/preview/inspect via an MCP server.",
    "",
    "## Site",
    ...pages.map((p) => `- [${p.title}](${p.path}.md)`),
    "",
    "## Repository truth",
    `- [Template reference](${RAW}/docs/engine/README.md)`,
    `- [Diagnostics registry](${RAW}/docs/engine/diagnostics.md)`,
    "  (both are rendered on this site under /reference/, and llms-full.txt inlines every page)",
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
 * separated by labeled rules so an agent can navigate. `assemble-data.ts` now
 * passes the WHOLE reference (every docs/engine/ page, bodies only) plus the
 * quickstart, so an agent that needs `flex` has it here rather than having to
 * fetch a second file. This renderer still takes whatever list it is given. */
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
