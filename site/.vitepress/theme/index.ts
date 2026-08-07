// Default theme + the Shojiku brand tokens + the live components (the wasm
// engine in the reader's tab — LiveRenderer on the index, PropertyPlayground
// on /playground, EngineVersion labelling both with the released engine's
// own reported version).
import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme";
import { h } from "vue";
import EngineVersion from "./components/EngineVersion.vue";
import GalleryGrid from "./components/GalleryGrid.vue";
import HeroBanner from "./components/HeroBanner.vue";
import LiveRenderer from "./components/LiveRenderer.vue";
import PropertyPlayground from "./components/PropertyPlayground.vue";
import "./custom.css";

export default {
  extends: DefaultTheme,
  // The banner moves ABOVE the hero (the slot only renders on layout: home),
  // so the headline gets the full container width instead of half of it.
  // Both index pages therefore declare no `hero.image`.
  Layout: () => h(DefaultTheme.Layout, null, { "home-hero-before": () => h(HeroBanner) }),
  enhanceApp({ app }) {
    app.component("EngineVersion", EngineVersion);
    app.component("GalleryGrid", GalleryGrid);
    app.component("LiveRenderer", LiveRenderer);
    app.component("PropertyPlayground", PropertyPlayground);
  },
} satisfies Theme;
