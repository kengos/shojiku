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
          { text: "Why", link: "/why" },
          { text: "Gallery", link: "/gallery" },
          { text: "Tutorials", link: "/tutorials" },
          { text: "Playground", link: "/playground" },
          { text: "Compare", link: "/compare" },
          { text: "Agents", link: "/agents" },
        ],
      },
    },
    ja: {
      label: "日本語",
      lang: "ja",
      themeConfig: {
        nav: [
          { text: "なぜ", link: "/ja/why" },
          { text: "ギャラリー", link: "/ja/gallery" },
          { text: "チュートリアル", link: "/ja/tutorials" },
          { text: "プレイグラウンド", link: "/ja/playground" },
          { text: "比較", link: "/ja/compare" },
          { text: "エージェント", link: "/ja/agents" },
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
