import { defineConfig } from "vitepress";

// The homepage pitch site (docs/TODO.md § HP1): seven pages, English canonical
// with a /ja twin per page. Reference documentation stays in docs/ — this site
// links to it and restates nothing (the anti-duplication rules live in the
// HP1 item and docs/code-map/repo.md).
export default defineConfig({
  title: "Shojiku",
  description:
    "Write YAML. Get PDFs. A deterministic PDF document engine for invoices, receipts and forms — built for AI agents.",
  head: [["link", { rel: "icon", type: "image/png", href: "/brand/icon.png" }]],
  cleanUrls: true,
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
