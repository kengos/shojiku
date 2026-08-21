// Renders the README "Gallery" section from the parsed gallery entries and
// splices it between the generated-section markers. The README is the one
// gallery surface that lives OUTSIDE site/, so the generator is what keeps
// the no-transcription rule true there.
import type { GalleryEntry } from "./gallery.ts";

export const START = "<!-- gallery:generated:start (edit examples/gallery.yml, then `make site:data`) -->";
export const END = "<!-- gallery:generated:end -->";

function cell(e: GalleryEntry): string {
  const link = `examples/${e.dir}/`;
  const img = (p: string, width: number) =>
    `[<img src="examples/${e.dir}/${p}" width="${width}" alt="${e.titleEn}">](${link})`;
  const imgs = e.preview2 === undefined
    ? img(e.preview, 420)
    : `${img(e.preview, 206)} ${img(e.preview2, 206)}`;
  return `${imgs}<br>**${e.titleEn}** — ${e.blurbEn}`;
}

/** The featured two-column table + the "more" link list. */
export function renderReadmeGallery(entries: GalleryEntry[]): string {
  const featured = entries.filter((e) => e.featured);
  const rest = entries.filter((e) => !e.featured);
  if (featured.length === 0 || featured.length % 2 !== 0) {
    throw new Error(`featured entries must pair up into table rows (got ${featured.length})`);
  }
  const rows: string[] = [];
  for (let i = 0; i < featured.length; i += 2) {
    rows.push(`| ${cell(featured[i]!)} | ${cell(featured[i + 1]!)} |`);
  }
  const more = rest
    .map((e) => `[${e.titleEn}](examples/${e.dir}/) (${e.blurbEn.replace(/\.$/, "")})`)
    .join(",\n");
  return [
    "|  |  |",
    "| :---: | :---: |",
    ...rows,
    "",
    `${rest.length} more live in [examples/](examples/):`,
    `${more}.`,
  ].join("\n");
}

/** Splice the generated block between the markers. Requires both markers,
 * in order — a README without them fails loudly instead of no-oping. */
export function spliceReadme(readme: string, generated: string): string {
  const s = readme.indexOf(START);
  const e = readme.indexOf(END);
  if (s === -1 || e === -1) throw new Error("README gallery markers not found");
  if (s >= e) throw new Error("README gallery markers out of order");
  return readme.slice(0, s + START.length) + "\n" + generated + "\n" + readme.slice(e);
}
