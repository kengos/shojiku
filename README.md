# Shojiku

[![CI](https://github.com/kengos/shojiku/actions/workflows/ci.yml/badge.svg)](https://github.com/kengos/shojiku/actions/workflows/ci.yml)

**Write YAML. Get PDFs. Built for AI agents.**

Shojiku makes business-document PDF generation **pain-free**: receipts,
invoices, estimates, delivery notes, application forms, worksheets. A
document is two plain YAML files — a template and a field catalog —
that humans and AI agents can read, diff, review, and repair; the Rust
engine renders them with your data into deterministic PDFs.

It runs **anywhere** and needs no service: a CLI and Docker image for
servers and CI, browser WASM for the Designer (rendering stays on the
machine — nothing is uploaded), a stdio MCP server for AI agents, and
native SDKs for seven languages *(all built: Ruby, Python, Node,
.NET, Java, PHP, Go — unpublished until the first release)*.
Local-first by design — a
PM producing a customer estimate or a teacher printing worksheets
renders on their own machine.

Shojiku grew out of years of [Thinreports](https://github.com/thinreports)
pain — implicit binding keys, per-field format sprawl, a layout format
no human or AI could safely hand-edit — and is built so those pains
cannot come back. It declares no Thinreports compatibility: there is no
`.tlf` import; migration is AI-assisted visual regeneration.

## Quickstart

A PDF, from nothing but Docker:

```bash
docker run --rm ghcr.io/kengos/shojiku:edge > receipt.pdf
```

That renders a bundled Japanese receipt with the image's default
command. To render your own files, mount the directory they are in:

```bash
docker run --rm -v "$PWD:/work" ghcr.io/kengos/shojiku:edge render \
  --templates /work/templates.yml --params /work/params.json \
  --definitions /work/definitions.yml \
  --output /work/out.pdf
```

The image is multi-arch (x86-64 and arm64) and carries the CLI, the MCP
server, fonts, locale packs and every bundled example — nothing else to
install. **[docs/quickstart.md](docs/quickstart.md)** takes it from
there: where to get a first template to edit, how to see your changes,
and how to register the stdio MCP server (`shojiku-mcp` — validate /
render_preview / inspect_layout / capabilities) in Claude Code, Claude
Desktop, VS Code or Cursor.

The agent-first loop in one line — register the server and ask:

> Make an A4 receipt with our logo, a tax-breakdown table, and a QR code
> linking to the receipt page.

The agent writes the YAML, renders a preview, inspects the layout
tree, and iterates on the diagnostics until the output matches. The
agent playbook is
[skills/shojiku-template-author/](skills/shojiku-template-author/SKILL.md).

## Lifecycle

Rendering is the core; the full document lifecycle is the scope:

```text
Template / Definitions
  -> Bundle
  -> Layout
  -> Render
  -> PDF / PNG / SVG Preview
  -> Sign
  -> Verify
  -> Archive
```

Form layout expressed as reviewable YAML, a GUI designer *(built, not
yet publicly hosted)*, a stable CLI *(shipped)*, SDKs *(built for all
seven languages, Ruby as the reference implementation)*, and an electronic
signature/trust pipeline *(built: CLI `sign` / `verify`)*. See Status
below for what exists today.

## Gallery

Eight of the runnable [examples/](examples/) — every one is just a
`templates.yml` + `definitions.yml` + `params.json` the CLI renders to
the PDF/PNG shown (click through for the source; images and links here
resolve in the repository source, not in a docs-only copy). Where an example
ships multiple `params-*.json`, every output comes from the **same
template** with different data:

|  |  |
| :---: | :---: |
| [<img src="examples/business/invoice-ja/preview-1.png" width="420" alt="Multi-page invoice (ja)">](examples/business/invoice-ja/)<br>**Invoice (ja)** — 22 line items paginate with a repeating table header, per-tax-rate totals, QR + link; `params-short.json` renders a 3-item single page from the same template | [<img src="examples/typography/novel-ja/preview-2.png" width="420" alt="Vertical-writing paperback">](examples/typography/novel-ja/)<br>**Vertical short story, paperback style (ja)** — Run, Melos! (excerpt): vertical columns paginate **with their ruby**, strict kinsoku + hanging punctuation, tate-chu-yoko in the colophon, vertical page numbers |
| [<img src="examples/business/invoice-en/preview-1.png" width="420" alt="US-style invoice (en)">](examples/business/invoice-en/)<br>**Invoice (en-US)** — Letter-size US invoice: USD with cents, plural-aware quantities (`1 item` / `24 items`), Net-30 terms, payment box + pay-online QR | [<img src="examples/forms/certificate-en/preview-1.png" width="420" alt="Certificate of completion (en)">](examples/forms/certificate-en/)<br>**Certificate (en-US)** — Letter-landscape certificate: double-rule frame, wide letter spacing, real italics, verification QR |
| [<img src="examples/business/receipt-zh-tw/preview-1.png" width="420" alt="Receipt (zh-TW)">](examples/business/receipt-zh-tw/)<br>**Receipt (zh-TW)** — the locale-pack story: the same receipt geometry as [ja](examples/business/receipt-ja/) / [zh-CN](examples/business/receipt-zh-cn/) / [80mm en-US](examples/business/receipt-us/), with currency, dates, tax wording, and font fallback swapped by the pack | [<img src="examples/forms/application-form-ja/preview-1.png" width="206" alt="Application form, filled sample">](examples/forms/application-form-ja/) [<img src="examples/forms/application-form-ja/preview-blank-1.png" width="206" alt="Application form, blank">](examples/forms/application-form-ja/)<br>**Application form, filled ↔ blank (ja)** — ONE template, two params files: form marks, 〒 entry cells, wareki with a blank-form `placeholder`; not a single pt shifts |
| [<img src="examples/business/restaurant-menu-us/preview-1.png" width="420" alt="US Japanese restaurant menu">](examples/business/restaurant-menu-us/)<br>**Restaurant menu (en + vertical writing)** — an American Japanese restaurant's specials: English menu, USD prices, and the vertical 正直亭 brand column + per-dish vertical names carrying the Japanese feel | [<img src="examples/business/event-tickets-ja/preview-1.png" width="420" alt="Event-ticket imposition">](examples/business/event-tickets-ja/)<br>**Event tickets (ja)** — 2×4 n-up imposition with per-ticket QR, trim marks for the cutter, `placeholder` seat fallback; 14 attendees flow onto sheet 2 automatically |

Fifteen more live in [examples/](examples/):
[Estimate](examples/business/estimate-ja/) (the invoice's sibling:
single-rate one-pager, estimate-terms box, discount row),
[Delivery note](examples/business/delivery-note-ja/) (between estimate
and invoice: quantity-bundling `headerGroups`, data-driven row styling
that tints only rows with items remaining, a receipt-stamp field;
partial ↔ complete delivery as two data files),
[Pickup slip](examples/business/pickup-slip-ja/) (the Thinreports
migration artifact — the
[migration walkthrough](docs/migration-thinreports.md)'s result),
[Product catalog](examples/business/catalog-ja/) (variable-height `repeat_flow`
cards), [Shipping labels](examples/business/shipping-labels-ja/) (2×3 n-up),
[Rirekisho](examples/forms/rirekisho-ja/) (A3 spread, blank ↔ filled),
[Certificate (ja)](examples/forms/certificate-ja/),
[Kokugo worksheet](examples/typography/kokugo-print-ja/),
[Genkoyoshi vertical](examples/typography/genkoyoshi-ja/) · [horizontal](examples/typography/genkoyoshi-yoko-ja/),
and the receipts above in [ja](examples/business/receipt-ja/) /
[zh-CN](examples/business/receipt-zh-cn/) / [80mm en-US](examples/business/receipt-us/) /
[hi-IN](examples/business/receipt-hi-in/) (Devanagari + lakh/crore digit
grouping) / [fil-PH](examples/business/receipt-fil-ph/).

**Developer examples** — [`examples/dev/layout-showcase`](examples/dev/layout-showcase/)
is the engine feature index, not a business document: one labeled
section per feature family (rich text, flex/grid, tables, overflow,
QR, form marks, vertical writing, …), each demo followed by the YAML that
produces it. [`examples/presets/blank-a4`](examples/presets/blank-a4/) is one of the
Designer's per-locale blank presets (an empty page at each catalog
locale's standard size — A4 or Letter), not a document sample.

## Status & Roadmap

**Shojiku is pre-1.0, work in progress.** The engine core already
renders real documents end to end (everything in the Gallery above is
produced by it), but the project is at Phase 1 of 3 — production use is
not yet recommended.

> ⚠️ **Interfaces WILL change, breakingly.** The template/definitions
> wire format (`templates.yml` / `definitions.yml`), the CLI surface,
> and every Rust crate API are all pre-1.0 and change **without notice
> or migration path** while the design settles. Templates you write
> today may need rework tomorrow.

| Phase | Scope | State |
| --- | --- | --- |
| **1 — Engine skeleton** | The Rust engine: template parsing/validation, a CSS-like box model (containers, `%`, flex, grid), data-driven tables, imposition/n-up, vertical writing, character grids (genkoyoshi), form marks, QR codes, rich text, hyperlinks, locale/wareki formatting, font packs, PDF + PNG backends, and the CLI (`render` / `validate` / `inspect` / `preview` / `sign` / `verify` / `capabilities`) | **← now.** Functional and CI-gated (100% line coverage), wire format still evolving |
| **2 — GUI designer (+ MCP)** | A browser-based Designer that round-trips the same YAML the engine reads (never its own format), and an MCP authoring surface (validate / preview / inspect) so AI agents author templates first-class | in progress — the MCP server (`shojiku-mcp`, stdio), the browser WASM engine bindings, and the Designer are built: document core, canvas (live preview + box-overlay selection), Google-Docs-style chrome (menubar / title bar / slim toolbar), property panel + diagnostics (six UI languages), page setup, a Google-Fonts picker with pinned-face export kits, Excel/TSV paste import, and the standalone `designer-app` preset-catalog shell (locale-keyed presets, drafts, file open/export). The author→preview→export loop is closed; a guided tutorial and a public deployment are still ahead |
| **3 — SDKs** | Thin wrappers for seven languages (Python / Node / Ruby / .NET / PHP / Java / Go) exposing the same `generate → sign → verify` lifecycle — never a layout reimplementation | **all seven are built** (Ruby is the reference; Python, .NET, Java and Node load the shared C ABI library `engine/capi`, PHP and Go drive the CLI as a subprocess), all unpublished until they release together at v0.1.0 |

The signing/verify pipeline is built (`engine/signing` /
`engine/verify`, CLI `sign` / `verify`); the bundle stage lands
alongside phases 2–3. [docs/engine/features.md](docs/engine/features.md) lists what works
today, and [docs/architecture.md](docs/architecture.md) the target
architecture the phases build toward.

## Documentation

Start with [docs/README.md](docs/README.md) — it routes by what you came
to do:

- **Write or fix a template** → [docs/engine/](docs/engine/README.md),
  the template reference: one MDN-style page per feature (items, box
  model, styles, tables, repeats, …) with syntax, defaults, and
  diagnostics. The Designer app is built but not yet publicly hosted
  (see Running the GUI locally below); non-engineers typically have an AI
  agent author the YAML
  ([skills/shojiku-template-author/](skills/shojiku-template-author/SKILL.md),
  AI-only playbook).
- **Embed or evaluate the engine** → today's integration surfaces are
  the CLI / Docker image (`shojiku render` as a subprocess), the stdio
  MCP server (`shojiku-mcp` — validate / preview / inspect for AI
  agents), and the browser WASM bindings (`engine/wasm`); of the
  language SDKs, all seven are built and unpublished until v0.1.0 —
  Ruby (`sdk/ruby`) is the reference the other six mirror
  ([docs/agents/sdk.md](docs/agents/sdk.md)).
  [docs/engine/features.md](docs/engine/features.md) lists
  what works today.
- **Contribute** → [docs/architecture.md](docs/architecture.md) (system
  overview, boundaries), then [docs/agents/](docs/agents/) (per-area
  policy) and [docs/guidelines.md](docs/guidelines.md) (formatting +
  100%-coverage policy).

### Supported language versions

The rule, which outlives any number below: **every upstream release line
that is not end-of-life, except those whose upstream support ends within
six months.** A floor that dies a month after release helps nobody.

Every push runs each SDK's full gate on **both ends of its range** — the
minimum and the newest published line — so neither is a claim. The middle
releases are not run: breakage lives at the ends, and a middle release
rarely breaks alone.

| SDK | Minimum | Also gated on |
| --- | --- | --- |
| Ruby | 3.3 | 4.0 |
| Python | 3.11 | 3.14 |
| Node | 22 | 26 |
| Java | 21 | 25 |
| PHP | 8.3 | 8.5 |
| Go | 1.25 | 1.26 |
| .NET | 10 | — |

.NET has one line because 10 is currently the only one admitted: 8 LTS
and 9 STS both end in 2026-11.

Java's floor is 21 rather than a newer LTS because the binding is JNA,
chosen for exactly that reason — the foreign-function API is final only
in 22, which would exclude the LTS most enterprise and systems-integrator
deployments actually run.

Outside these ranges, the CLI and the Docker image are the universal
fallback: they take the same templates and params and produce the same
bytes.

### If you are an AI agent

Two different jobs, two different entry points — take the one that
matches yours.

**Using Shojiku to author a document**: register the MCP server
(`shojiku-mcp`, stdio — see [Quickstart](#quickstart)) and follow
[skills/shojiku-template-author/](skills/shojiku-template-author/SKILL.md).
Write YAML, render a preview, inspect the layout, repair, repeat.
[skills/](skills/) also carries a render debugger and a Thinreports
migrator.

**Working on this codebase**: read [CLAUDE.md](CLAUDE.md) first. It is a
deliberately token-dense routing table, not prose — it maps each
directory to the one file that describes it, so you can reach the
relevant design record without searching the tree. From there,
[docs/code-map/](docs/code-map/README.md) tells you what every file
does, and [docs/agents/](docs/agents/) tells you what has already been
decided and why. Reading the map for the area you are about to touch is
cheaper than grepping it cold, and it is how you avoid re-deriving a
decision that was settled deliberately.

## Development

**Everything runs in pinned Docker images through `make` — no host Rust
or Node toolchain is required** (the Makefile mounts the repo and pins
the toolchain/cache volumes; the Rust, WASM, and GUI gates all work this
way). You only need Docker and `make`. Run `make help` for the full
target list, and see [CONTRIBUTING.md](CONTRIBUTING.md) for the
check-your-work workflow; the common ones:

| Command | What it does |
| --- | --- |
| `make verify` | Full local CI mirror — line budget, fmt, clippy, tests, 100% coverage, cargo-deny, example byte-compare, WASM build, GUI gates, Docker build + Trivy. Green == safe to push. |
| `make verify:engine` / `verify:gui` / `verify:docker` | One scope's whole bar. Prints a single PASS/FAIL line and exits with the gate's real code |
| `make lint:gui` / `test:gui` / `budget:gui` | Fast slices of a scope (same for `:engine`) — iterate on these, conclude with `verify:` |
| `cat .make-logs/last-error.log` | Where any failed gate lands, headed with the target, exit code and the step it died at |
| `make test` / `make coverage` | Rust workspace tests / 100%-line coverage gate |
| `make gui` | GUI workspace gates: `tsc` typecheck + Biome lint + Vitest coverage, in a `node:24` container |
| `make wasm` | Build the browser WASM engine bindings (`engine/wasm/pkg`) + size budget |
| `make examples` | Re-render every bundled example's committed PDF/PNG |
| `make docker-build` / `make docker-render` | Build the runtime image (`shojiku-ci:local`) / render the bundled example through it — the published image is [ghcr.io/kengos/shojiku:edge](https://github.com/kengos/shojiku/pkgs/container/shojiku) ([from source](docs/from-source.md)) |

### Running the GUI locally

The Designer ships as a static app (`gui/designer-app`): a locale-keyed
preset catalog opening into the full editor (canvas preview, property
panel, diagnostics, undo/redo, file open/export). It is not publicly
hosted yet; the ways to run it:

- **`make gui-serve`** builds the complete app image (WASM engine + Vite
  build + assembled presets/fonts/locale packs — `gui/designer-app/Dockerfile`)
  and serves it with `docker run` at `http://localhost:8788/` (override
  with `GUI_SERVE_PORT=…`) — the production-shaped way to check the app.
- **`make gui-dev`** runs the Vite dev server (hot reload) in Docker at
  `http://localhost:5173/` for iterating on `gui/` code; it builds the
  WASM engine first if `engine/wasm/pkg` is missing and assembles the
  runtime `data/` tree the dev server serves. A matching
  `.devcontainer/` exists for editor-integrated work (same pnpm store;
  engine artifacts still build on the host via `make wasm`).
- **`make gui-e2e`** builds the same app image and runs the Playwright
  golden path against it (on-demand, not part of `make verify`).
- **`make gui`** runs the GUI gates (typecheck + lint + Vitest, including
  real-engine integration tests that render through the WASM bindings —
  never a mock) in Docker.
- **`make wasm-e2e`** is the engine-only browser golden path: it
  instantiates the WASM engine, injects fonts, and paints rendered pages
  to a `<canvas>` (Playwright in Docker, on-demand — not part of
  `make verify`).
- If you *do* have host Node 24 + pnpm 11, you can run the same suites
  directly in `gui/` (`pnpm install --frozen-lockfile && pnpm -r test`),
  but the Docker path above is the supported, toolchain-free one.

## License

Licensed under any of

- Apache License, Version 2.0 ([LICENSE-APACHE](LICENSE-APACHE))
- MIT license ([LICENSE-MIT](LICENSE-MIT))
- BSD 3-Clause license ([LICENSE-BSD](LICENSE-BSD))

at your option.
