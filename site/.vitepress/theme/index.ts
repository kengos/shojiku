// Default theme + the Shojiku brand tokens + the live components (the wasm
// engine in the reader's tab — LiveRenderer on the index, PropertyPlayground
// on /playground).
import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme";
import LiveRenderer from "./components/LiveRenderer.vue";
import PropertyPlayground from "./components/PropertyPlayground.vue";
import "./custom.css";

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component("LiveRenderer", LiveRenderer);
    app.component("PropertyPlayground", PropertyPlayground);
  },
} satisfies Theme;
