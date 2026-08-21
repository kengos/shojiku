import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { devDataPlugin } from './scripts/dev-data-plugin.ts';

// The standalone app build. `public/` (CSP `_headers`) and the assembled
// `dist-assets/` (wasm pkg + font packs + presets + catalog.json, produced by
// scripts/assemble-site.ts) are copied verbatim into the static output; the app
// fetches them at runtime, so nothing engine-shaped is bundled into JS. In dev
// (`make gui:dev`) devDataPlugin serves the assembled dist/data/ tree at /data.
export default defineConfig({
  plugins: [react(), tailwindcss(), devDataPlugin()],
  // Relative asset URLs so the SAME build serves at the domain root
  // (standalone) or under a host's reverse-proxy sub-path (mounted).
  base: './',
  publicDir: 'public',
  server: {
    watch: {
      // The dev server watches the whole repo, so a `make gui:verify` coverage run
      // mid-session rewrites thousands of files under `gui/*/coverage/` and
      // the resulting HMR reload storm wedges the app mount — a blank screen
      // with no console error, cleared only by restarting the container.
      // Coverage output is never an input to the running app.
      ignored: ['**/coverage/**'],
    },
  },
  build: {
    target: 'es2022',
    // The wasm module is fetched at runtime from dist-assets/, never chunked in.
    assetsInlineLimit: 0,
  },
});
