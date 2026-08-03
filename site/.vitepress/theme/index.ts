// Default theme + the Shojiku brand tokens + the live components (the wasm
// engine in the reader's tab — LiveRenderer on the index, PropertyPlayground
// on /playground, EngineVersion labelling both with the released engine's
// own reported version).
import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme";
import EngineVersion from "./components/EngineVersion.vue";
import GalleryGrid from "./components/GalleryGrid.vue";
import LiveRenderer from "./components/LiveRenderer.vue";
import PropertyPlayground from "./components/PropertyPlayground.vue";
import "./custom.css";

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component("EngineVersion", EngineVersion);
    app.component("GalleryGrid", GalleryGrid);
    app.component("LiveRenderer", LiveRenderer);
    app.component("PropertyPlayground", PropertyPlayground);
  },
} satisfies Theme;
