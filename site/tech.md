---
title: Tech
description: "The security policy, the licensing, and how the Rust engine and the Designer are built — the technical ground a team checks before adopting."
---

# Technology, licensing & the security model

## Security policy

Everything is designed and implemented on the assumption that no input
can be trusted. The engine is zero-network: it has no networking
capability at all.

Templates, params, fonts, images and PDFs under verification are all
parsed as untrusted input.

- Fonts are **sha256-verified per file at load**, and the OS/2
  embedding-rights bits (fsType) are checked. A font with restricted
  embedding is refused unless its `manifest.yml` explicitly attests
  permission
- Image assets that resolve outside the root are refused
  (`asset_traversal`), and **remote URLs are refused**. The rendering
  path contains no network I/O code at all
- A template resolving outside the template root is refused
  (`template_escapes_root`). Params-bound dynamic images pass only when
  the host's policy (allow/deny lists) explicitly permits them
- The parsers are fuzzed with libFuzzer (`make fuzz`). Inputs that ever
  crashed are kept, and replayed on every run to prevent regressions

**The verification report also states what it did not check.** It
reports the byte range the signature actually covers, and a signature
covering only part of the file is treated as a forgery. Trust anchors
are named explicitly on every call; the machine's certificate store is
never consulted.

The supply chain is checked too.

- [cargo-deny](https://github.com/kengos/shojiku/blob/main/engine/deny.toml)
  checks advisories and licenses, with **zero advisory ignores**. A
  dependency that needs an ignore to pass is not adopted
- **A CycloneDX SBOM is committed to the repository**
  ([sbom/](https://github.com/kengos/shojiku/tree/main/sbom)): currently
  235 components for the engine, 258 for the gui, 127 for sdk-js,
  regenerated whenever a lockfile changes
- On the npm side, pnpm's `minimumReleaseAge` is set to **7 days**. A
  package published less than 7 days ago fails to install at all, so a
  compromised release cannot slip in before it gets pulled. postinstall
  scripts run only from an explicit allowlist

**This site is built the same way.** Rendering happens in WASM inside
your browser and nothing is uploaded. The CSP forbids inline scripts
(at build time, only the sha256 of the actually emitted scripts is
allowed), and the analytics are cookieless.

**Reporting**: [SECURITY.md](https://github.com/kengos/shojiku/blob/main/SECURITY.md)
— kengo+shojiku@kengos.jp

## Licensing

The code is **triple-licensed Apache-2.0 / MIT / BSD 3-Clause**, at
your option. For the bundled fonts, the BIZ UD and Noto families are
SIL OFL 1.1 and IPAmj Mincho is the IPA Font License. Every pack ships
its full license text, and whether a font may be redistributed is
stated in its `manifest.yml`.

## The engine (Rust)

### Stack

The engine is a **17-crate** Rust workspace: template parsing, a
CSS-like box model, the layout tree, signing and verification. PDF
generation uses [krilla](https://crates.io/crates/krilla); PNG
rendering uses [tiny-skia](https://crates.io/crates/tiny-skia).

Five entry points call the same engine: the CLI, the MCP server,
browser WASM, a C ABI, and N-API. Layout and rendering are separate
crates, and the renderer only draws the layout tree. Because of this
structure, the same input produces the same bytes no matter where you
call from.

The engine itself is locale-agnostic. Dates, currency, units and
Japanese-era formatting come from locale data: ja-JP and en-US are
built in, and the rest are packs under `packs/locale/`. Fonts come from
packs under `packs/fonts/`.

### Quality rules

- **100% line coverage** across the whole workspace; anything less
  fails CI
- `clippy -D warnings` and rustfmt
- A **300-line cap** per file
- Every bundled example is rendered and **byte-compared** against its
  committed output
- CI runs the same `make` targets a developer runs locally; there is no
  CI-only definition

## The Designer

### Stack

TypeScript + React, styled with Tailwind CSS and Headless UI, built
with Vite. It talks to the engine through WASM.

### Quality rules

- Lint and formatting by
  [Biome](https://github.com/kengos/shojiku/blob/main/gui/biome.json),
  with zero warnings allowed
- TypeScript typecheck
- **100% coverage** in all four packages
- An effective **150-line cap** per file (blank lines and comments are
  not counted)
