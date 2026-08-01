# Code map — packs/, examples/, docker/, docs/, site/, skills/, scripts/

> AI-only, token-dense. Index + repo-wide conventions: [CLAUDE.md](../../CLAUDE.md).
> Read this BEFORE searching or editing the covered dirs; update it in the
> same PR whenever files/modules/boundaries here change.

## packs/

- `packs/fonts/<pack>/` — fonts-only packs (`manifest.yml` + files):
  `biz-ud` (OFL), `ipamj-mincho` (IPA — the lazy-tier rare-kanji
  fallback), `noto-sans` (OFL), `noto-sans-mono` (OFL code face),
  `noto-sans-tc`/`noto-sans-sc` (OFL CJK OTF/CFF — the only non-TTF
  faces; under the 25 MiB lazy threshold ON PURPOSE: a locale's DEFAULT
  face must paint the first preview), `noto-sans-devanagari` (OFL).
- `packs/locale/<id>.yml` — shipped locale packs (`zh-tw`/`zh-cn`/
  `hi-in`/`fil-ph`), @generated from `PACK_CONFIG` in
  `scripts/gen-locale-builtins.py`. A locale with NO builtin ships the
  WHOLE pack; an id with a builtin (ja-JP/en-US) would be a per-key
  overlay. **A new locale is a pack, never engine code.**

## examples/ — bundled gallery + Designer presets

Grouped by DOCUMENT KIND, never by locale (`examples/<bucket>/<name>/`,
bucket ∈ `business`/`forms`/`typography`/`presets`/`dev`); locale is a
name SUFFIX so ja↔en twins and the receipt locale-comparison set stay
adjacent. **The preset id is the LEAF dir name, not the path**
(`isSafeAssetName` forbids slashes; the site assembly walks two levels
and rejects duplicate leaf names across buckets). The business samples
share one fictional 正直堂 world (indigo `#1a3c6e`,
`*.shojikudo.example`).

What each example PROVES (one line each):

- `business/invoice-ja` — the multi-page hero: table
  `repeatHeader`+`autoPageBreak`, per-tax-rate totals PRE-COMPUTED in params
  (engine does no math), bands + `page_number`, QR + link; `short`
  variant = single page.
- `business/estimate-ja` — invoice's sibling (estimate → invoice): single-rate
  one-pager, estimate-terms box, negative discount row.
- `business/delivery-note-ja` — the trade-doc third: `headerGroups`
  spanning band, data-driven `row.conditionalStyles`
  (`equals: partial`), a receipt-stamp field; `complete` variant proves both
  conditional states.
- `business/pickup-slip-ja` — **the Thinreports migration worked
  example**: `legacy/` holds a synthetic `.tlf` + Ruby host (excluded
  from every render/preset/roundtrip glob); the body is the flow+table
  regeneration; walkthrough in docs/migration-thinreports.md.
- `forms/application-form-ja` — absolute body, hand-ruled grid,
  text-`mark` circled options, multi-select `checkbox`, a 〒 `char_grid`, wareki
  `placeholder` blank ↔ filled-sample pair.
- `business/event-tickets-ja` — 2×4 `repeat` tickets, per-element QR,
  `placeholder`, `textOverflow: shrink`.
- `business/catalog-ja` — `repeat_flow` variable-height cards, dynamic
  `image` from params + `fit: cover`.
- `business/shipping-labels-ja` — 2×3 `repeat`, 〒 `char_grid`,
  contents `list` + `overflowText`.
- `forms/certificate-ja` — absolute landscape: `borderStyle: double`
  frame, `letterSpacing`, SVG + image `opacity`, negative-coordinate
  full bleed. `forms/certificate-en` — its en-US twin (real
  italic/bold, en-US date pattern).
- `typography/kokugo-print-ja` — horizontal + vertical `char_grid`
  with aozora ruby + practice cells.
- `typography/novel-ja` — a B5 vertical-writing booklet (Dazai, Aozora Bunko PD): the
  vertical-vocabulary showcase — ruby-aware column pagination,
  `lineBreak: strict` + `hangingPunctuation` + `textSpacingTrim`,
  tate-chu-yoko, vertical `page_number` band.
- `typography/genkoyoshi-ja` / `genkoyoshi-yoko-ja` — vertical 200-char /
  horizontal 400-char genkoyoshi (`char_grid` + aozora ruby).
- `business/restaurant-menu-us` — English-primary menu where
  `writingMode: vertical_rl` is the Japanese ACCENT; ja-JP locale (for
  the packs) + `defaults.currency: USD`.
- `business/invoice-en` — invoice-ja's en-US twin (Letter, USD cents,
  plural-aware `quantity`, 2 pages).
- `business/receipt-ja` (containers + `%`), `receipt-us` (custom-size
  80mm thermal), `receipt-zh-tw`/`receipt-zh-cn` (one geometry, two
  locales — the locale-pack render proof), `receipt-hi-in` (Devanagari
  conjuncts + lakh-scale grouping ON PURPOSE — smaller amounts would
  prove nothing) / `receipt-fil-ph` (Latin face + PHP).
- `forms/rirekisho-ja` — an A3 two-page-spread JIS-style rirekisho (the zero-context
  authoring gap-driver): custom size + absolute body, `char_grid` 〒,
  text-`mark`, bounded tables, `spans`; ships the blank↔filled params
  pair proving `binding.placeholder`.
- `presets/blank-*` — the per-locale blank preset family (each catalog
  locale opens a blank page at ITS standard size; engine locale = a builtin or
  a shipped pack; no definitions.yml; not gallery material).
- `dev/layout-showcase` — the visual index: EVERY new authorable
  feature adds a labeled section here (cycle Phase C).

Each example commits its rendered `output.pdf` + `preview-<n>.png`
(`make examples` regenerates; the list lives in
`scripts/render-examples.sh`). `params-<variant>.json` files beside
`params.json` render `output-<variant>.pdf` etc. from the SAME
templates (auto-discovered, byte-checked). An example that is ALSO a
Designer preset carries `preset.yml` (locales + engineLocale +
localized name + thumbnail + optional variants); the site assembly
globs those manifests — a demo without a manifest is simply excluded.

## sdk/ — its own map

`sdk/` has moved to [sdk.md](sdk.md): Ruby is a built gem (the reference
implementation the other six mirror), and Python, .NET, Java, Node, PHP and
Go are all built and mirror it. Read that file before touching anything
under `sdk/`.

The binary the in-process ones load is `engine/capi`
(`docs/code-map/hosts.md`), built for a gate by `make capi-lib` and for
release by `make capi-dist`. The subprocess ones run the `shojiku` CLI
instead — `make cli-bin` for a gate, `make cli-dist` for release.

## docker/, docs/, site/, skills/, scripts/

- `docker/` — the runtime image.
- `site/` — the homepage pitch pages (Cloudflare Pages launch;
  `why.md` first). Persuasive copy, NOT reference docs: writing/editing
  routes through the `shojiku-copywriter` skill, accuracy claims still
  verify against the code.
- `docs/` — the doc set (`docs/engine/` = the per-feature template
  reference; `docs/migration-thinreports.md` = the worked migration
  walkthrough; `docs/mockups/` = per-design-session handoff artifacts,
  deleted once shipped — currently empty; `docs/agents/gotchas/` = the
  incident-derived trap catalogs, routed by their own README).
- **Top-level `skills/`** — the product-facing AI skills, kept OUT of
  `docs/` so `npx skills add <owner>/shojiku` discovers them (flat
  `skills/<name>/SKILL.md`, `name`+`description` frontmatter — these are
  for people USING Shojiku, not for working on it):
  `shojiku-template-author` (author from requirements; owns the
  canonical **Engine access** MCP-first/CLI-fallback command table the
  other two reference — never restated), `shojiku-render-debugger`
  (validate→preview→inspect loop), `shojiku-thinreports-migrator`
  (legacy `.tlf` → visual regeneration, no parser).
- `scripts/` — repo gates (`check-line-budget.sh`,
  `check-gui-line-budget.sh`) + `generate-sbom.sh` (`make sbom` —
  syft-in-Docker CycloneDX inventories committed under `sbom/`;
  regenerate + commit whenever a lockfile changes; no byte-compare
  gate) + codegen (`gen-locale-builtins.py` — authoring-time CLDR
  fetch, ONE emitter for builtins AND packs; `gen-uax50.py` —
  authoring-time pinned Unicode fetch → the UAX#50 table in
  `engine/layout`).
- `scripts/release/` — the release assembly (`normalize.sh` flattens the
  release-artifacts workflow's download into `dist/release/bin/<slug>/`;
  `assemble.sh [component…]` builds the publishable packages into
  `dist/release/packages/` — 5 platform wheels, 5 platform gems, npm
  entry tarball + 5 platform packages with the optionalDependencies
  block injected POST-build (the frozen lockfile predates those names),
  one nupkg carrying all 5 RID assets, the java jar set + 5 classifier
  jars, SHA256SUMS). Assembly only, deliberately: publishing is the
  irreversible half and stays a separate act. The platform spelling
  table (slug ↔ wheel tag / gem platform / npm name / RID) lives at the
  top of assemble.sh and is the single place a new target is added.
- `scripts/install-proof/` — the seven per-language install proofs
  (`make proof-<lang>` / `make proof`; CI job `install-proof`): embed
  the host-arch payload the way a release does, build the REAL package
  (wheel / platform gem / RID nupkg / classifier jar / npm platform
  package / composer / go module), install it into a clean
  floor-version container with NO injected engine, and render a bundled
  example through it. `common.sh` carries the shared mktemp/assert
  plumbing and the doctrine comment (why gates can't prove this — the
  classifier-jar incident). Network-dependent by nature, so
  deliberately NOT part of `make verify`. Proof-side arch mapping
  (RID / platform package / classifier) derives from `uname -m` — an
  arm64 payload filed under linux-x64 is correctly refused by the
  consuming runtime.
- (The throwaway `spike/wasm-preview/` is removed — the production
  bindings shipped as `engine/wasm`; its baseline numbers live in
  docs/engine/features.md § Decision log.)
