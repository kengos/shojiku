# @shojiku/designer-app

The standalone Shojiku Designer — the first shipping form of the Designer, a
static site that opens into a locale-keyed **preset catalog** and edits a chosen
template in the embedded [`@shojiku/designer`](../designer) component, previewing
client-side through the browser WASM engine.

It is deliberately just **one host** of the Designer component: every browser
concern (asset fetch, engine transport, persistence, file open/download, locale)
is an injected service wired in [`src/main.tsx`](src/main.tsx); the app logic
lives in dependency-injected modules that carry the 100%×4 coverage gate.

## Build (static deploy)

The deploy artifact is `dist/`, produced in two steps from the repository root:

```sh
make wasm                                   # build engine/wasm/pkg (once)
pnpm --filter @shojiku/designer-app build   # vite build -> dist/ (app JS + _headers)
pnpm --filter @shojiku/designer-app assemble  # -> dist/data/ (catalog, fonts, presets, pkg)
```

`dist/` is then servable as-is on Cloudflare Pages (or any static host). The
[`public/_headers`](public/_headers) file sets the Pages CSP: fully same-origin,
`wasm-unsafe-eval` the only script relaxation.

- **Presets** are the bundled [`examples/`](../../examples) that carry a
  `preset.yml` manifest (locale tags + engine locale + localized names +
  thumbnail); the assembly globs those manifests into `catalog.json`.
- **Fonts** are copied per pack into `dist/data/fonts/`; a face larger than the
  25 MiB static-host file cap (the ipamj-mincho rare-kanji fallback) is split
  into `<face>.partNN` chunks the app reassembles. Heavy packs load lazily on a
  `missing_glyph` so the primary lineup paints the first preview.

## Test

`make gui` runs the workspace gates (typecheck + Biome + Vitest 100%×4),
including this package's real-engine integration test (the lazy font-fetch loop
against `engine/wasm/pkg`). The browser golden path is on-demand:

```sh
make gui-e2e   # Playwright in Docker: open preset -> preview -> export
```
