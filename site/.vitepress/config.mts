import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "vitepress";
import { headTags, isJapanese } from "../src/lib/seo.ts";
import { readPage, REFERENCE_LOCALES, referenceStems, SOURCE_DIR } from "../src/lib/reference.ts";
import { buildSidebar } from "../src/lib/referenceNav.ts";

// The public site: eleven nav pages plus the index, English canonical with a /ja
// twin per page. Reference documentation is SOURCED in docs/engine/ and this
// site restates nothing: `scripts/assemble-data.ts` PROJECTS those files into
// site/reference/ (gitignored) and the sidebar below is derived from the same
// files' front-matter crossed with the parser's key catalog, so neither is a
// second copy anyone maintains (docs/architecture.md § Where a doc paragraph
// goes is the rule; docs/code-map/repo.md § site/ carries the rest).

const ROOT = join(import.meta.dirname, "..", "..");
const CATALOG = JSON.parse(readFileSync(join(ROOT, "engine/authoring/reference/catalog.schema.json"), "utf8")) as unknown;
const REFERENCE_PAGES = referenceStems(readdirSync(join(ROOT, SOURCE_DIR))).map((s) =>
  readPage(s, readFileSync(join(ROOT, SOURCE_DIR, `${s}.md`), "utf8")),
);

// One sidebar per locale, keyed by the route prefix VitePress matches on.
const REFERENCE_SIDEBAR = Object.fromEntries(
  REFERENCE_LOCALES.map((l) => [l.base, buildSidebar(REFERENCE_PAGES, CATALOG, l.base)]),
);

// The origin the site is served from. It is baked into the sitemap's <loc>s,
// every canonical and every social-card URL, so moving the site is this one
// line — nothing else here depends on it. The Pages subdomain it replaced
// stays alive behind a redirect rather than being retired: a published
// package's metadata cannot be rewritten, so every release up to this one
// still points its homepage field at the old host.
const HOSTNAME = "https://shojiku.kengos.jp";

// Per-locale fallback for a page that declares no description of its own.
// Without the ja one, a Japanese page inherits the English sentence.
const DESCRIPTION =
  "Write YAML, get the same PDF anywhere. A Rust PDF engine for invoices, receipts and forms — callable from seven languages, built for AI agents, and shaped for multi-tenant SaaS.";
const DESCRIPTION_JA =
  "YAMLのテンプレートとJSONのデータから請求書・領収書・申込書のPDFを出すRust製の帳票エンジン。Python、Go、Rubyなど7言語から呼べます。マルチテナントのSaaSでは、テナントごとのテンプレートを差し替えるだけで体裁を変えられます。";

export default defineConfig({
  title: "Shojiku",
  description: DESCRIPTION,
  head: [
    ["link", { rel: "icon", type: "image/png", href: "/brand/icon.png" }],
    // Search Console's ownership proof for the URL-prefix property. It must stay
    // on a served page for the property to remain verified — Google re-checks it,
    // so removing this tag later un-verifies the site. The HTML-file method is not
    // an option here: Cloudflare Pages 308s /<name>.html to the extensionless path.
    [
      "meta",
      {
        name: "google-site-verification",
        content: "Qnnp8t3auuCZPt5uRPOEBRpkVL-R6NawlyJ8pom3_rI",
      },
    ],
  ],
  cleanUrls: true,
  // Emitted as /sitemap.xml at build time — the URL list Search Console and
  // Bing consume, hreflang pairs included.
  sitemap: { hostname: HOSTNAME },

  // Canonical + hreflang + the social card, derived per page (src/lib/seo.ts)
  // so a new page carries them without anyone copying tags into frontmatter.
  transformPageData(pageData) {
    const ja = isJapanese(pageData.relativePath);
    const tags = headTags(
      {
        relativePath: pageData.relativePath,
        title: pageData.frontmatter.title ?? pageData.title,
        description: pageData.frontmatter.description ?? (ja ? DESCRIPTION_JA : DESCRIPTION),
      },
      { hostname: HOSTNAME, name: "Shojiku", image: "/brand/hero.png" },
    );
    pageData.frontmatter.head = [...(pageData.frontmatter.head ?? []), ...tags];
  },
  // src/ holds lib code + the llms preamble — never site pages. public/ is
  // static assets: it carries each reference page's own markdown (the strip's
  // same-origin "Copy for AI" source), and VitePress would otherwise try to
  // ROUTE those .md files and compile them as Vue.
  srcExclude: ["src/**", "public/**"],
  lastUpdated: false,
  // /designer/ is not a VitePress page — the Designer app is merged into the
  // deployed output beside the site (one Pages project, path-mounted). This
  // silences the BUILD-time dead-link check only; at runtime VitePress's
  // router would still intercept the click and render its own 404, so every
  // link to /designer/ must also carry target="_self" (or `target: _self` on a
  // hero action) to force a real page load. src/designer-link.test.ts pins it.
  ignoreDeadLinks: [/^\/designer\//],

  locales: {
    root: {
      label: "English",
      lang: "en",
      themeConfig: {
        nav: [
          { text: "Concept", link: "/concept", activeMatch: "^/concept" },
          { text: "Features", link: "/features", activeMatch: "^/features" },
          { text: "Gallery", link: "/gallery", activeMatch: "^/gallery" },
          { text: "Tutorials", link: "/tutorials", activeMatch: "^/tutorials" },
          { text: "Playground", link: "/playground", activeMatch: "^/playground" },
          { text: "Reference", link: "/reference/", activeMatch: "^/reference" },
          { text: "Compare", link: "/compare", activeMatch: "^/compare" },
          { text: "Agents", link: "/agents", activeMatch: "^/agents" },
          { text: "Languages", link: "/languages", activeMatch: "^/languages" },
          { text: "Tips", link: "/tips", activeMatch: "^/tips" },
          { text: "Tech", link: "/tech", activeMatch: "^/tech" },
        ],
      },
    },
    ja: {
      label: "日本語",
      lang: "ja",
      description: DESCRIPTION_JA,
      themeConfig: {
        nav: [
          { text: "コンセプト", link: "/ja/concept", activeMatch: "^/ja/concept" },
          { text: "機能", link: "/ja/features", activeMatch: "^/ja/features" },
          { text: "ギャラリー", link: "/ja/gallery", activeMatch: "^/ja/gallery" },
          { text: "チュートリアル", link: "/ja/tutorials", activeMatch: "^/ja/tutorials" },
          { text: "プレイグラウンド", link: "/ja/playground", activeMatch: "^/ja/playground" },
          { text: "リファレンス", link: "/ja/reference/", activeMatch: "^/ja/reference" },
          { text: "比較", link: "/ja/compare", activeMatch: "^/ja/compare" },
          { text: "エージェント", link: "/ja/agents", activeMatch: "^/ja/agents" },
          { text: "多言語", link: "/ja/languages", activeMatch: "^/ja/languages" },
          { text: "Tips", link: "/ja/tips", activeMatch: "^/ja/tips" },
          { text: "技術", link: "/ja/tech", activeMatch: "^/ja/tech" },
        ],
      },
    },
  },

  themeConfig: {
    // Scoped to /reference/** by the route prefixes: every other page keeps
    // the full-width pitch layout it had.
    sidebar: REFERENCE_SIDEBAR,
    logo: "/brand/icon.png",
    socialLinks: [{ icon: "github", link: "https://github.com/kengos/shojiku" }],
    search: { provider: "local" },
  },
});
