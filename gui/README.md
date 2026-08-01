# Shojiku Designer (`gui/`)

The React Designer that authors and previews `templates.yml` — a pnpm
workspace of three packages, dependency direction strictly downward:

```text
designer-app  ->  designer  ->  designer-core
(static shell)    (React UI)     (headless document core, pure TS)
```

Policy: [`docs/agents/gui.md`](../docs/agents/gui.md) (decided requirements —
staged final form, adoption path, MVP cut). CSS/Tailwind conventions:
[`STYLE.md`](STYLE.md). The Designer never renders PDF or
reimplements layout/formatting; preview and diagnostics come from the engine
(browser WASM). Every edit is a named patch operation in `designer-core`, so
the same document AI/MCP flows edit round-trips through the GUI unchanged.

## Packages

- **`designer-core`** — headless, framework-free. The template held as an
  `eemeli/yaml` CST document, named patch operations (set/remove a scalar,
  reorder a flow item, duplicate an item), an undo/redo history, and selection
  state keyed by the engine's box-index `path` grammar. Round-trip is tested,
  not assumed: an op touches only its keys.
- **`designer`** — the embeddable React component: the canvas (engine-transport
  seam, debounced WASM preview, box-overlay path-keyed selection), the property
  panel + page setup, the diagnostics panel (localized, click-to-highlight),
  chrome/diagnostics i18n (en/ja/zh-TW/zh-CN full, hi/fil chrome-only),
  undo/redo, and fail-closed validate-before-save.
- **`designer-app`** — the standalone static shell (Cloudflare Pages), the
  first shipping form: a locale-keyed preset catalog opening into the editor,
  localStorage drafts, file open/export, the lazy font-pack loop, and the
  Google-Fonts picker (pinned-reference installs, ZIP kit export).

## Toolchain

Node 24 LTS, pnpm 11. TypeScript `strict`, [Biome](https://biomejs.dev) for
lint + format (one stack, no ESLint/Prettier), Vitest with 100% coverage
thresholds. All gates run in Docker via `make gui` (no host toolchain), and
`make gui` is part of `make verify`.

```sh
make gui        # typecheck + lint (0 warnings) + test/coverage, in Docker
make gui-serve  # build + docker-run the full app image (http://localhost:8788)
make gui-dev    # Vite dev server with HMR in Docker (http://localhost:5173)
make gui-e2e    # Playwright golden path over the built image (on-demand)
```

A repo-root `.devcontainer/` mirrors the dev loop for editor-integrated
work (same pnpm store volume as the `make gui*` targets).
