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
  face must paint the first preview), `noto-sans-devanagari` (OFL),
  `noto-sans-thai` (OFL).
- `packs/locale/<id>.yml` — shipped locale packs (`zh-tw`/`zh-cn`/
  `hi-in`/`fil-ph`/`th-th`), @generated from `PACK_CONFIG` in
  `scripts/gen-locale-builtins.py`. A locale with NO builtin ships the
  WHOLE pack; an id with a builtin (ja-JP/en-US) would be a per-key
  overlay. **A new locale is a pack, never engine code.**

## examples/ — bundled gallery + Designer presets

Grouped by DOCUMENT KIND, never by locale (`examples/<bucket>/<name>/`,
bucket ∈ `business`/`forms`/`typography`/`lifestyle`/`presets`/`dev`); locale is a
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
  prove nothing) / `receipt-fil-ph` (Latin face + PHP) /
  `receipt-th-th` (Thai word-boundary wrapping + Buddhist-era dates; no
  `preset.yml`, because the Designer's preset catalog is keyed to its
  CHROME locales and there is no Thai chrome).
- `forms/rirekisho-ja` — an A3 two-page-spread JIS-style rirekisho (the zero-context
  authoring gap-driver): custom size + absolute body, `char_grid` 〒,
  text-`mark`, bounded tables, `spans`; ships the blank↔filled params
  pair proving `binding.placeholder`.
- `lifestyle/recipe-booklet-en` — the counter-side booklet the
  `shojiku-recipe-booklet` skill ships: photo-led hero row (flex `row`,
  `fit: cover`), a shopping `table` whose first column is a `cell:`
  checkbox and whose third carries substitutes, `page_break`, then
  `repeat_flow` step cards; `footer` band = source URL + `qr_code` +
  page number on every page. Its `definitions.yml`/`templates.yml` are
  the SOURCE for `skills/shojiku-recipe-booklet/template/` — the copies
  are byte-gated by `scripts/check-skill-template-sync.sh`. Assets are
  shape-only SVG placeholders (no fetched photos; SVG text is not
  rendered anyway).
- `presets/blank-*` — the per-locale blank preset family (each catalog
  locale opens a blank page at ITS standard size; engine locale = a builtin or
  a shipped pack; no definitions.yml; not gallery material).
- `dev/layout-showcase` — the visual index: EVERY new authorable
  feature adds a labeled section here (cycle Phase C).
- `dev/live-flex` — the sample the homepage live block OPENS with, and
  the only example whose job is to be edited by a stranger: A5, one
  flex row, one padded card, and exactly three knobs the prose names
  (`page.margin`, `defaults.style.fontSize`, the card's `box.padding`).
  Keep it small — it has to fit a textarea — and keep those three keys
  spelled as the prose spells them.
- `dev/site-hero` / `dev/site-icon` — the homepage's brand renders
  (the hero banner + the lattice icon), engine outputs like everything
  else so the site's "this banner is a Shojiku render" claim stays
  hash-gated; the site assembly copies their previews to
  `/brand/*.png`.

`examples/gallery.yml` — the ONE gallery source (dir + title/blurb
en/ja + preview names, `featured:` marks the README-table set): the
README "Gallery" section (generated between `gallery:generated`
markers by `make site-data`), `/gallery` and `/ja/gallery` all render
from it — never edit those surfaces by hand.

`examples/deploy/<lang>/` — the production-packaging recipes the site's
tutorial pages TRANSCLUDE (python/ruby/node/dotnet/java: Dockerfile +
render program; python pulls params from SQLite built at image build).
Excluded from every render/preset glob (no preset.yml, not in
render-examples.sh); proven by `make proof-deploy`
(`scripts/install-proof/deploy-*.sh` — stages the receipt-ja example +
packs/ as the vendored app, builds against the PUBLIC registries;
network-dependent, on demand, never in `make verify`).

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
- `site/` — the public site (Cloudflare Pages): a STANDALONE pnpm project
  (not a gui/ workspace member), VitePress, ten nav pages + the index
  ×2 locales (en canonical, `/ja` twin; copy is written JAPANESE-FIRST per
  `shojiku-copywriter`'s vendored prose standard, EN derived), PLUS the
  projected reference. It is the reader-facing home for the reference —
  sourced in `docs/engine/`, rendered here rather than restated. The rule
  and the list of which docs pages are projected live in
  [../architecture.md](../architecture.md) § Where a doc paragraph goes.
  **The reference (`/reference/**`, `/ja/reference/**`)**: every
  `docs/engine/*.md` becomes one route, generated into `site/reference/`
  and `site/ja/reference/` (both GITIGNORED — nobody edits them) by
  `assemble-data.ts`. `README.md` is the landing (`index`, full width);
  each page gains a provenance strip and a live demo. Each source page
  declares `reference:` FRONT-MATTER — `group` / `order` / `keys` /
  `shapes` / `summary` — which is what the sidebar tree is built from,
  crossed with the parser's key catalog
  (`engine/authoring/reference/catalog.schema.json`): the `item` group's
  ORDER comes from the catalog's own item list, so nobody maintains a
  second taxonomy. Four groups under `templates.yml` (root · item · item
  keys · layout modes), `definitions.yml`, and five Concepts — exactly the
  31 feature pages. A page missing its front-matter FAILS the build.
  The projection makes exactly FOUR reversible edits to a body (links
  leaving `docs/engine/` → absolute repo URLs; `README.md` → the landing;
  inline code holding `{{` → `v-pre`, since Vue reads a double brace as an
  interpolation; the generated blocks between `<!-- rf:begin/end -->`
  markers) and `src/reference.test.ts` undoes all four and demands the
  source body BYTE FOR BYTE — so a fifth edit is a red gate. It also holds
  the route total (33, not `> 0`), the catalog↔front-matter bijection (81
  shapes claimed exactly once), tree coverage, the internalised-outlink
  negative sweep, and the Limitations claims (every code named on a
  `## Limitations` section must exist in `docs/engine/diagnostics.md`).
  **The demos** (`src/demos/<page>/`, one per feature page:
  `templates.yml` + optional `params.json`/`definitions.yml`/`expect.json`)
  are staged to `public/data/reference/` and rendered in the reader's tab.
  `expect.json` declares the diagnostics a demo is SUPPOSED to emit (so
  `diagnostics.md`'s demo can honestly warn) and the engine CAPABILITY
  KEYS its wire needs. That last part matters because `.data/wasm` is a
  RELEASED build while `docs/engine/` documents HEAD: a demo whose keys
  the served engine lacks degrades to a static listing plus a notice, and
  `src/integration/referenceDemos.test.ts` renders it against
  `engine/wasm/pkg` instead — so it is still proven, and a re-pin lights
  it up with no edit. Version strings cannot detect that gap (both builds
  report the same one); capability keys can.
  Structure: `src/lib/` = the tested pure modules (gallery.yml
  parse/validate, font-tier subset manifests, README-gallery
  render/splice, llms renderers, `engineClient` — the site's OWN thin
  glue over the raw `engine/wasm` pkg (deliberately NOT
  `@shojiku/designer`'s transport; keeps the package standalone),
  playground knob→template generation, `seo.ts` = `pagePath`/`twinPaths`/
  `headTags` deriving canonical + en↔ja hreflang + the OG/twitter card
  from a page's `relativePath`, `wasmSource.ts` = the SITE ENGINE PIN —
  parse/render of `.data/wasm-source.json`, the drift check, the
  CHANGELOG released-version read, and `repinRefusal`, the guard that
  refuses new bytes under an already-pinned version), 100%×4 vitest +
  `src/integration/liveRenderer.test.ts` (REAL wasm from
  `engine/wasm/pkg` — a fresh build of HEAD: tier gate, receipt renders,
  both playground demos) + `src/integration/committedEngine.test.ts`
  (the REAL bytes Pages SERVES — `.data/wasm` self-reports the version
  the record pins it to, and the released engine still renders the
  site's own demos) + `src/headers.test.ts`
  (pins BOTH `_headers` CSP scopes; `/designer/*` must equal the
  designer's canonical file) + `src/parity.test.ts` (en↔ja page set /
  components / section counts). `.vitepress/theme/` = brand tokens +
  the live components (LiveRenderer — renders on a 400 ms debounce after
  typing, no Render button, with Reset back to the committed example;
  HeroBanner — the `home-hero-before` slot both index pages rely on,
  which is WHY neither declares `hero.image` or `hero.text`;
  PropertyPlayground — its source panel is a COLLAPSED `<details>`; it has
  always held the whole runnable file, and collapsing it lets the rendered
  page lead; GalleryGrid,
  ReferenceProvenance / ReferenceDemo / ReferenceSidebarBadge (the
  reference page's strip, its capability-gated live block, and the
  `Generated` badge — scoped to the SIDEBAR, the one derived thing on the
  page, via the `sidebar-nav-before` slot),
  EngineVersion — the label stating which engine a live block runs, read
  from the binary's OWN `capabilities()` report rather than a string kept
  beside it; browser glue, coverage-excluded). `scripts/assemble-data.ts` =
  build-time pure-Node assembly (public/data wasm+tiered fonts+live
  examples, gallery previews, brand renders, llms.txt/llms-full.txt —
  which now inlines the WHOLE reference, bodies only, so an agent asking
  about `flex` has it; the reference projection + demo staging;
  25 MiB Pages cap asserted). It is what `pnpm dev` runs first, too —
  without it a dev server has no reference routes; `scripts/refresh-data.ts` = the COMMITTED
  halves, in three modes: default (`make site-data`) regenerates ONLY the
  README gallery section between the `gallery:generated` markers;
  `--check` (`make site-check`) compares both halves; `--release-wasm`
  (`make site-wasm-release`) is the RELEASE-TIME re-pin.
  **`site/.data/wasm` holds a RELEASED engine build, not HEAD's** — it is
  what Pages serves, so a visitor's playground can never be ahead of the
  package they install. The check pins it by the sha256 digests in
  `site/.data/wasm-source.json` and by that record's version being one
  `CHANGELOG.md` lists as released; it does NOT rebuild, which is what
  makes it say the same thing on every host architecture (the `.wasm`
  binary is not byte-reproducible between arm64 and CI's x86_64); `scripts/build-pages.sh` = the Cloudflare
  build (stages .data/wasm into engine/wasm/pkg, builds+assembles the
  Designer, merges it under `/designer/`, strips its own _headers —
  root `public/_headers` carries both CSP scopes; and
  `inject-csp-hashes.ts` swaps the `__INLINE_SCRIPT_HASHES__` token for
  the sha256 of the inline scripts VitePress actually emitted, keeping
  the site scope's no-'unsafe-inline' stance — the token appears ONCE,
  and its survival is a build failure). `.vitepress/config.mts` holds the
  ONE `HOSTNAME` constant every absolute URL is built from (sitemap
  `<loc>`s, canonicals, card URLs) — a custom domain moves it in one
  place; `transformPageData` applies `seo.ts` to every page, and each page
  carries its own `description` frontmatter (the `ja` locale sets its own
  default, so a Japanese page never inherits the English sentence).
  `public/robots.txt` replaces Cloudflare's managed file: its Content
  Signals preamble VERBATIM (no signal expressed — that is a policy
  decision) plus the crawl grant and the `Sitemap:` line. Gates: `make site` /
  `site-check` / `site-build` (+ `verify:site` grid entry, CI job
  `site`); `make site-wasm-release` is release-only and in no gate. Font tiers: immediate = noto-sans Regular+Bold (~1.2 MB),
  lazy-ja = BIZ UDP pair (~8.9 MB — ja-JP's default family);
  ipamj-anything stays static-PNG only (45 MB > the 25 MiB cap).
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
  others reference — never restated), `shojiku-render-debugger`
  (validate→preview→inspect loop), `shojiku-thinreports-migrator`
  (legacy `.tlf` → visual regeneration, no parser),
  `shojiku-definitions-author` (derive definitions.yml + the
  params-building code from an existing schema/DB/API source; proves
  the mapping via the `params_*` validation diagnostics; references
  the deploy recipes' SQLite shape),
  `shojiku-recipe-booklet` (a Japanese recipe video → a printable
  booklet in the READER's language, Japanese nowhere in the output:
  schema.org `Recipe` JSON-LD extraction, implicit Japanese cooking
  technique spelled out, local sourcing/substitutes, step stills from
  the page or — kurashiru has none — from `video.contentUrl` via
  ffmpeg. The ONLY skill that BUNDLES a template
  (`template/*.yml`, so a standalone `npx skills add` install still
  works); that copy is byte-gated against
  `examples/lifestyle/recipe-booklet-en/`).
- `scripts/` — repo gates (`check-line-budget.sh`,
  `check-gui-line-budget.sh`, `check-skill-template-sync.sh` — the
  first step of `make examples-check`: a skill's bundled
  `template/*.yml` must be byte-identical to the example it came from,
  so the rendered+hash-checked example is the proof for the copy that
  ships standalone; the example is the source, the skill the copy;
  `check-example-text-indent.sh` — the step beside it: no block scalar
  under `examples/` or `skills/` may be indented with ordinary spaces or
  tabs, because WRAPPED text collapses line-head whitespace the way CSS
  does (tabs join the same space run) and such a code sample renders
  FLUSH LEFT while every gate stays green. Hard indentation is U+00A0.
  `char_grid` is the exception — it takes the same `text:` key but never
  reaches the wrapper, so a leading space there is a real occupied cell
  (1字下げ); waive per block with a `text-indent-exempt: <reason>`
  comment on the opener line, same shape as `line-budget-exempt`. It
  self-tests against a known-bad fixture before scanning, so a detector
  that stopped detecting fails instead of reporting OK)
  `check-php-licenses.sh` — first step of `make sdk-php`: `sdk/php` keeps
  its OWN copy of the root `LICENSE-*` set, because the php package is
  published from a subtree-split repository whose root is `sdk/php` and a
  split cannot inject files. Derives the file list from the ROOT, so a
  fourth licence is a failure rather than a silent omission, and refuses a
  run that matched no files at all.
  + `generate-sbom.sh` (`make sbom` —
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
  `split-php.sh` is the same boundary applied to php, whose publish is a
  REPOSITORY rather than an archive: it runs `git subtree split --prefix=
  sdk/php` over HEAD and over every `v*` tag, asserts each produced
  commit's root tree IS `sdk/php`'s tree at that ref (an object-id
  identity, not a file diff) and that every tag split is an ancestor of
  main, and writes `dist/release/php-split.txt` for the workflow to push.
  It never pushes or tags a remote. Because the tag set is derived from
  tags that already exist here, the derived repo cannot serve a version
  this one has not released.
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
  `published-*.sh` (`make proof-published[-<lang>]`) asks the same question
  of the REGISTRY copy and takes no local artifact at all; go needs none,
  since its publish IS a repo tag. `published-php.sh` is the one drawing on
  two publish channels — the composer package from Packagist and the CLI
  from the GitHub Release, archive chosen by `uname -m` — because that
  package drives a binary rather than carrying one.
- (The throwaway `spike/wasm-preview/` is removed — the production
  bindings shipped as `engine/wasm`; its baseline numbers live in
  docs/engine/features.md § Decision log.)
