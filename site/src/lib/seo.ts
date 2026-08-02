// Per-page head tags: the canonical URL, the en↔ja hreflang set, and the
// social card. VitePress already emits <title> and <meta name="description">
// from frontmatter; everything a crawler or a link unfurler needs BEYOND
// those is derived here from the page's path, so a new page gets the whole
// set by existing rather than by remembering to copy tags.

export interface SeoPage {
  /** VitePress `pageData.relativePath` — "tutorials.md", "ja/index.md". */
  relativePath: string;
  title: string;
  description: string;
}

export interface SeoSite {
  /** Origin the site is served from, no trailing slash. */
  hostname: string;
  name: string;
  /** Social-card image, site-root-relative. */
  image: string;
}

export type HeadTag = [string, Record<string, string>];

const JA = "ja/";

/** The served path under `cleanUrls`: "/tutorials", "/" and "/ja/" — the same
 * spelling the generated sitemap uses, so the two never disagree. */
export function pagePath(relativePath: string): string {
  const slug = relativePath.replace(/\.md$/, "").replace(/(^|\/)index$/, "$1");
  return `/${slug}`;
}

export function isJapanese(relativePath: string): boolean {
  return relativePath.startsWith(JA);
}

/** Both language twins of one page, whichever twin you start from. */
export function twinPaths(relativePath: string): { en: string; ja: string } {
  const en = isJapanese(relativePath) ? relativePath.slice(JA.length) : relativePath;
  return { en: pagePath(en), ja: pagePath(`${JA}${en}`) };
}

export function headTags(page: SeoPage, site: SeoSite): HeadTag[] {
  const url = site.hostname + pagePath(page.relativePath);
  const twin = twinPaths(page.relativePath);
  const ja = isJapanese(page.relativePath);
  const image = site.hostname + site.image;
  return [
    ["link", { rel: "canonical", href: url }],
    ["link", { rel: "alternate", hreflang: "en", href: site.hostname + twin.en }],
    ["link", { rel: "alternate", hreflang: "ja", href: site.hostname + twin.ja }],
    // A crawler that matches neither language lands on the English page.
    ["link", { rel: "alternate", hreflang: "x-default", href: site.hostname + twin.en }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:site_name", content: site.name }],
    ["meta", { property: "og:title", content: page.title }],
    ["meta", { property: "og:description", content: page.description }],
    ["meta", { property: "og:url", content: url }],
    ["meta", { property: "og:image", content: image }],
    ["meta", { property: "og:locale", content: ja ? "ja_JP" : "en_US" }],
    ["meta", { property: "og:locale:alternate", content: ja ? "en_US" : "ja_JP" }],
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
    ["meta", { name: "twitter:title", content: page.title }],
    ["meta", { name: "twitter:description", content: page.description }],
    ["meta", { name: "twitter:image", content: image }],
  ];
}
