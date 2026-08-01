# Shojiku

> AI-only: token-dense repo map for coding agents; humans start at [docs/README.md](docs/README.md).

PDF document engine (invoices/slips): template YAML + params JSON → layout → PDF.
Pipeline: `Template/Definitions → Bundle → Layout → Render → Preview → Sign → Verify → Archive`.

## Code map — read the touched area's map BEFORE searching

The file-by-file repo map is split per component under `docs/code-map/`
(AI-only, token-dense; entry granularity + maintenance rules:
[docs/code-map/README.md](docs/code-map/README.md)). Read the map file
for every directory you are about to search or edit — it is cheaper
than searching cold. Seam work (the wasm boundary, the GUI↔engine wire)
reads BOTH sides' maps.

Rust workspace lives in `engine/` (crates named `shojiku-<dir>`). Every `.rs`
file opens with a `//!` role header, so `head -1` identifies a file without
opening it; unit tests live in `#[cfg(test)]`-only sibling files
(`<mod>/tests.rs`, further split under `<mod>/tests/`), near-e2e suites in the
crate's `tests/` directory.

| You touch | Read first | It carries |
| --- | --- | --- |
| `engine/core`, `engine/diagnostics` | [docs/code-map/core.md](docs/code-map/core.md) | template/definitions/params wire model, two-pass parse, validation walks, the diagnostics code registry |
| `engine/layout`, `engine/layout-box` | [docs/code-map/layout.md](docs/code-map/layout.md) | positioning/pagination, text·wrap·fonts, the layout tree (the ONLY layout↔renderer contract), the box index, the e2e suite map |
| `engine/formatter`, `engine/image` | [docs/code-map/formatter-image.md](docs/code-map/formatter-image.md) | display strings, locale packs (CLDR builtins, 和暦), the font-pack wire; asset policy/SVG/raster |
| `engine/render-pdf`, `engine/render-png` | [docs/code-map/render.md](docs/code-map/render.md) | the two draw backends (krilla / tiny-skia) over the layout tree |
| `engine/signing` | [docs/code-map/signing.md](docs/code-map/signing.md) | the PDF incremental-update writer (tail/xref/object reading under the hostile-input posture, revision append, the signature placeholder + byte ranges) AND the signer: PKCS#8 key loading, CMS `SignedData`, the `prepare_sign`/`complete_sign` split; the shared PDF model + OID table `engine/verify` reads through |
| `engine/verify`, `engine/fuzz` | [docs/code-map/verify.md](docs/code-map/verify.md) | the verifier: the structural walk to a signature, the byte-range COVERAGE rule (a valid signature over an incomplete range is a forgery), CMS/certificate checking, and the report that states what it did NOT check (seam work reads signing.md too); plus the out-of-workspace libFuzzer crate and its corpus-replay contract |
| `engine/authoring`, `engine/cli`, `engine/mcp`, `engine/wasm`, `engine/capi`, `engine/napi`, `engine/fetch` | [docs/code-map/hosts.md](docs/code-map/hosts.md) | the ONE bytes-first authoring surface + its five thin hosts (CLI / MCP stdio / browser WASM / C ABI cdylib the FFI SDKs load / the N-API addon the npm package loads, which reaches the engine THROUGH the cdylib host rather than beside it) + the host-only font fetch crate, capability keys |
| `gui/designer-core` | [docs/code-map/gui-core.md](docs/code-map/gui-core.md) | headless document model (parse/serialize, patch ops, editor session) + the workspace/toolchain preamble |
| `gui/designer` | [docs/code-map/gui-designer.md](docs/code-map/gui-designer.md) — **split by area, read the one you touch**: [canvas](docs/code-map/gui-designer-canvas.md) (engine transport, preview loop, paint/overlay/zoom, drag·resize·snap) · [panel](docs/code-map/gui-designer-panel.md) (property panel, placement, borders, page setup, styles, columns, diagnostics) · [insert](docs/code-map/gui-designer-insert.md) (insert menu/dialogs, scaffolds, image·paste import, field palette, sample data, data-item editor) · [chrome](docs/code-map/gui-designer-chrome.md) (menubar, toolbar, help, i18n, `ui/` primitives, theme/CSS, chip text editor) · [tutorial](docs/code-map/gui-designer-tutorial.md) (step data, coach mark, launcher, practice-document swap) | the embeddable React component; the index file itself carries the assembled Designer, layer tree, sidebar, editor session, the ShojikuGui hook registry and test substrate |
| `gui/designer-app` | [docs/code-map/gui-app.md](docs/code-map/gui-app.md) | the standalone app host: services seam, presets/fonts/persistence, build/assemble, integration suites (Designer work spanning packages reads the neighbor's map too) |
| `sdk/` | [docs/code-map/sdk.md](docs/code-map/sdk.md) | the seven language wrappers, all built — the ruby gem (the REFERENCE the other six mirror: result/trace shape, template-root hardening, the fiddle ownership rules), the python package mirroring it over ctypes, the .NET package over function pointers and the JVM one over JNA, the npm package over the N-API addon, and the two SUBPROCESS ones (php, go) that script the CLI instead, plus their gate containers |
| `packs/`, `examples/`, `docker/`, `docs/`, `site/`, `skills/`, `scripts/` | [docs/code-map/repo.md](docs/code-map/repo.md) | font/locale packs, bundled examples (+ the output-refresh rule), runtime image, doc set, homepage pitch pages, product-facing AI skills (`npx skills add` layout), repo gate scripts |

## Rules that bite

- No local cargo: run gates via `make` (Docker wrapper). `make verify` = full CI mirror (line budget, fmt, clippy -D warnings, test, coverage **100% lines blocking**, cargo-deny, examples output-hash check (`make examples-check`; refresh via `make examples`), docker build/render/trivy).
- **Checking a result ≠ reading output.** To check, use the `<verb>:<scope>` grid — `make verify:engine` / `verify:gui` / `verify:docker`, and the faster slices `budget:` / `lint:` / `test:` over `engine`/`gui` (`make quiet T=<any target>` for the rest; `make help` lists them). Each prints ONE PASS/FAIL line, exits with the gate's REAL code, and keeps the full log in `.make-logs/`. **A failure always lands at the fixed path `.make-logs/last-error.log`** (headed with the target, exit code and the last `== step ==` reached, cleared when that target next passes) — `cat` it instead of re-running to find where it broke. **Never pipe a gate to `tail`** — a pipeline reports the last command's status, so `make gui | tail -40` exits 0 over a FAILED gate and discards the steps needed to diagnose it. Bare targets (`gui`, `rust`, `docker`…) stay verbose for debugging.
- **CI runs the same `make` targets you do** (`.github/workflows/ci.yml`), in the same pinned containers, as ~21 parallel jobs — engine, gui, wasm, docker, and every SDK across its supported language versions. There is no second definition of a gate to keep in sync.
- **Until the first release, `main` is ONE amended commit that is force-pushed.** That replaces the branch with an unrelated root commit, which GitHub cannot diff, so the push does NOT start a run — trigger it with `gh workflow run ci.yml --ref main`.
- **GNU Make 4 or newer.** make is the only tool that does not run in a container, so it is the one place local and CI can disagree; macOS ships 3.81, which parses recipe quoting differently. The Makefile warns and names the fix.
- **Line budget**: every `.rs` under `engine/` is ≤300 lines hard (≤160 recommended) and must start with a `//!` role header — `make budget` (`scripts/check-line-budget.sh`) gates it in CI; exceeding 300 needs an in-file `line-budget-exempt: <reason>` waiver. `clippy::too_many_lines` (threshold 150, `engine/clippy.toml`) gates function length. The gui side has the same shape: every non-test `.ts`/`.tsx` under `gui/` is ≤150 **executable** lines (blank lines and comments excluded, so documenting a file costs no budget) via `make gui-budget` (`scripts/check-gui-line-budget.sh`, the first step of `make gui`), same `line-budget-exempt: <reason>` waiver token; Biome's `noExcessiveLinesPerFunction` (150, `gui/biome.json`) gates function length there with no waiver list.
- **Test placement**: focused unit tests go in `#[cfg(test)] mod tests;` sibling files (`<mod>/tests.rs`); near-e2e suites go in the crate's `tests/` as one binary (`tests/<name>/main.rs` + modules). The coverage bar is the **workspace** run (`make coverage`, 100% lines blocking); per-crate `cargo llvm-cov -p <crate>` is a diagnostic, not a gate.
- `engine/Cargo.lock` is committed but globally gitignored — stage with `git add -f engine/Cargo.lock`.
- deny.toml has **zero advisory ignores**; don't add deps that break that (e.g. anything pulling ttf-parser or lopdf).
- Renderers never re-measure/re-format; layout never draws. Locale data → `packs/locale/`, fonts → `packs/fonts/`, business rules → future `plugins/`, never into engine crates.
- Coverage counts each crate twice (its own unit-test binary + the copy linked into dependents' test binaries); a line only covered in one copy can still fail the 100% gate — cover new code in the crate's own unit tests first.
- The roadmap is not in this repository. `docs/agents/<area>.md` states what is DECIDED and `docs/engine/features.md` what is BUILT; anything absent from both is unsettled, so propose it rather than assuming it was rejected. When something ships, its substance goes to `docs/engine/features.md` + the `docs/engine/` reference (the implemented-capability list + decision log).
- Architecture/policy docs: `docs/architecture.md`, `docs/engine/features.md` (what's built), `docs/engine/` (authorable-syntax reference, one page per feature), `docs/agents/<area>.md`, `docs/guidelines.md`.
- The code map (`docs/code-map/`, routed by the table above) is the token-saving entry point: read the touched component's file BEFORE searching, and update it in the same PR whenever crates/modules/boundaries change.
