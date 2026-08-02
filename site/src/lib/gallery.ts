// What `examples/gallery.yml` MEANS: the parsed, validated entry list every
// gallery surface (README table, /gallery, /ja/gallery) is generated from.
// Pure over the file's text — the fs read stays in the callers.
import { parse } from "yaml";

export interface GalleryEntry {
  dir: string;
  featured: boolean;
  preview: string;
  preview2?: string;
  titleEn: string;
  titleJa: string;
  blurbEn: string;
  blurbJa: string;
}

const DIR_RE = /^(business|forms|typography)\/[a-z0-9-]+$/;
const PREVIEW_RE = /^preview[a-z0-9-]*\.png$/;

function req(v: unknown, what: string): string {
  if (typeof v !== "string" || v.trim() === "") {
    throw new Error(`gallery.yml: ${what} must be a non-empty string`);
  }
  return v.trim();
}

/** Parse + validate gallery.yml text. Throws on any malformed entry — the
 * gallery is repo-authored, so a bad entry fails the build, never renders. */
export function parseGallery(text: string): GalleryEntry[] {
  const doc: unknown = parse(text);
  if (typeof doc !== "object" || doc === null || !("entries" in doc)) {
    throw new Error("gallery.yml: top level must be { entries: [...] }");
  }
  const raw = (doc as { entries: unknown }).entries;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("gallery.yml: entries must be a non-empty list");
  }
  const seen = new Set<string>();
  return raw.map((e, i) => {
    if (typeof e !== "object" || e === null) {
      throw new Error(`gallery.yml: entry ${i} is not a map`);
    }
    const m = e as Record<string, unknown>;
    const dir = req(m.dir, `entry ${i} dir`);
    if (!DIR_RE.test(dir)) {
      throw new Error(`gallery.yml: entry ${i} dir ${dir} is not a bucketed example path`);
    }
    if (seen.has(dir)) throw new Error(`gallery.yml: duplicate dir ${dir}`);
    seen.add(dir);
    const preview = req(m.preview, `${dir} preview`);
    const preview2 = m.preview2 === undefined ? undefined : req(m.preview2, `${dir} preview2`);
    for (const p of preview2 === undefined ? [preview] : [preview, preview2]) {
      if (!PREVIEW_RE.test(p)) {
        throw new Error(`gallery.yml: ${dir} preview name ${p} is not a committed render name`);
      }
    }
    return {
      dir,
      featured: m.featured === true,
      preview,
      preview2,
      titleEn: req(m.title_en, `${dir} title_en`),
      titleJa: req(m.title_ja, `${dir} title_ja`),
      blurbEn: req(m.blurb_en, `${dir} blurb_en`),
      blurbJa: req(m.blurb_ja, `${dir} blurb_ja`),
    };
  });
}
