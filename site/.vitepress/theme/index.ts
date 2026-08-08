// Default theme + the Shojiku brand tokens + the live components (the wasm
// engine in the reader's tab — LiveRenderer on the index, PropertyPlayground
// on /playground, ReferenceDemo on every /reference/ page, EngineVersion
// labelling them with the released engine's own reported version).
import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme";
import { h } from "vue";
import EngineVersion from "./components/EngineVersion.vue";
import GalleryGrid from "./components/GalleryGrid.vue";
import HeroBanner from "./components/HeroBanner.vue";
import LiveRenderer from "./components/LiveRenderer.vue";
import PropertyPlayground from "./components/PropertyPlayground.vue";
import ReferenceDemo from "./components/ReferenceDemo.vue";
import ReferenceProvenance from "./components/ReferenceProvenance.vue";
import ReferenceSidebarBadge from "./components/ReferenceSidebarBadge.vue";
import "./custom.css";

export default {
  extends: DefaultTheme,
  // The banner moves ABOVE the hero (the slot only renders on layout: home),
  // so the headline gets the full container width instead of half of it.
  // Both index pages therefore declare no `hero.image`.
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      "home-hero-before": () => h(HeroBanner),
      // The `Generated` badge sits above the reference tree and nowhere else.
      "sidebar-nav-before": () => h(ReferenceSidebarBadge),
    }),
  enhanceApp({ app }) {
    app.component("EngineVersion", EngineVersion);
    app.component("GalleryGrid", GalleryGrid);
    app.component("LiveRenderer", LiveRenderer);
    app.component("PropertyPlayground", PropertyPlayground);
    app.component("ReferenceDemo", ReferenceDemo);
    app.component("ReferenceProvenance", ReferenceProvenance);
  },
} satisfies Theme;
