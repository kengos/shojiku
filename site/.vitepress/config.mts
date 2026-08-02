import { defineConfig } from "vitepress";
import { headTags, isJapanese } from "../src/lib/seo.ts";

// The homepage pitch site (docs/TODO.md § HP1): seven pages, English canonical
// with a /ja twin per page. Reference documentation stays in docs/ — this site
// links to it and restates nothing (the anti-duplication rules live in the
// HP1 item and docs/code-map/repo.md).

// The origin the site is served from. It is baked into the sitemap's <loc>s,
// every canonical and every social-card URL, so it moves the day a custom
// domain replaces the Pages subdomain — and nothing else here depends on it.
const HOSTNAME = "https://shojiku.pages.dev";

// Per-locale fallback for a page that declares no description of its own.
// Without the ja one, a Japanese page inherits the English sentence.
const DESCRIPTION =
  "Write YAML. Get PDFs. A deterministic PDF document engine for invoices, receipts and forms — built for AI agents.";
const DESCRIPTION_JA =
  "YAMLのテンプレートとJSONのデータから、請求書・領収書・申込書を出す帳票エンジン。同じ入力なら、どのマシンでも同じバイト列のPDFになります。AIエージェントから扱えます。";

export default defineConfig({
  title: "Shojiku",
  description: DESCRIPTION,
  head: [["link", { rel: "icon", type: "image/png", href: "/brand/icon.png" }]],
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
  // src/ holds lib code + the llms preamble — never site pages.
  srcExclude: ["src/**"],
  lastUpdated: false,
  // /designer/ is not a VitePress page — the Designer app is merged into the
  // deployed output beside the site (HP1: one Pages project, path-mounted).
  ignoreDeadLinks: [/^\/designer\//],

  locales: {
    root: {
      label: "English",
      lang: "en",
      themeConfig: {
        nav: [
          { text: "Concept", link: "/concept", activeMatch: "^/concept" },
          { text: "Gallery", link: "/gallery", activeMatch: "^/gallery" },
          { text: "Tutorials", link: "/tutorials", activeMatch: "^/tutorials" },
          { text: "Playground", link: "/playground", activeMatch: "^/playground" },
          { text: "Compare", link: "/compare", activeMatch: "^/compare" },
          { text: "Agents", link: "/agents", activeMatch: "^/agents" },
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
          { text: "ギャラリー", link: "/ja/gallery", activeMatch: "^/ja/gallery" },
          { text: "チュートリアル", link: "/ja/tutorials", activeMatch: "^/ja/tutorials" },
          { text: "プレイグラウンド", link: "/ja/playground", activeMatch: "^/ja/playground" },
          { text: "比較", link: "/ja/compare", activeMatch: "^/ja/compare" },
          { text: "エージェント", link: "/ja/agents", activeMatch: "^/ja/agents" },
          { text: "技術", link: "/ja/tech", activeMatch: "^/ja/tech" },
        ],
      },
    },
  },

  themeConfig: {
    logo: "/brand/icon.png",
    socialLinks: [{ icon: "github", link: "https://github.com/kengos/shojiku" }],
    search: { provider: "local" },
  },
});
