---
title: Tech
---

# Technology, licensing & the security model

Every claim on this page is checkable against the repository. The
numbers are measured, not written.

## The stack

The engine is a **17-crate Rust workspace**: two-pass template parsing,
a CSS-like box model, the layout tree (the only contract between layout
and drawing), two render backends (PDF and PNG), signing and
verification, and five hosts — CLI, MCP server, browser WASM, a C ABI,
and an N-API addon — wrapping the same single engine. Layout never
draws; renderers never re-measure. That split is enforced at crate
boundaries, which is why every host emits identical bytes.

The Designer is TypeScript + React and reaches the engine only through
WASM. The engine stays locale-agnostic: dates, currency, units and wareki
come from locale data (ja-JP and en-US are builtins; other locales are
`packs/locale/` packs), fonts from `packs/fonts/`.

## Quality gates

CI runs the same `make` targets a developer runs locally — there is no
second definition of a gate to drift.

- **100% line coverage, blocking**, across the whole engine workspace
- `clippy -D warnings`, rustfmt, and a **300-line-per-file cap**
  (150 effective lines on the GUI side)
- Every bundled example renders in CI and is **byte-compared** against
  its committed output — determinism is a gate, not a claim
- The Designer side: typecheck, zero lint warnings, 100%×4 coverage

## Dependencies & SBOM

- [cargo-deny](https://github.com/kengos/shojiku/blob/main/engine/deny.toml)
  gates advisories and licenses with **zero advisory ignores** — a
  dependency that needs one is not adopted
- **CycloneDX SBOMs are committed** to the repository
  ([sbom/](https://github.com/kengos/shojiku/tree/main/sbom)):
  currently engine 235 / gui 258 / sdk-js 127 components, regenerated
  whenever a lockfile moves
- On the npm side, pnpm's `minimumReleaseAge` is set to **7 days**:
  a package published more recently will not install, which closes the
  freshly-compromised-release window. Postinstall scripts run only from
  an explicit allowlist

## Licensing

The code is **triple-licensed — Apache-2.0, MIT, or BSD 3-Clause, at
your option**. Bundled fonts: the BIZ UD and Noto families under SIL
OFL 1.1, IPAmj Mincho under the IPA Font License. Every pack ships its
full license text, and each `manifest.yml` states whether the fonts are
redistributable.

## The security model

**All input is treated as hostile.** Templates, params, fonts, images,
and PDFs under verification are read by parsers written for untrusted
bytes.

- Fonts are **sha256-verified per face at load**, and the OS/2
  embedding-rights bits (fsType) are checked — a restricted font is
  refused unless explicitly attested
- Image assets cannot escape their root (`asset_traversal`), and
  **remote URLs are refused** — there is no network I/O in the render
  path to give them to
- A template resolving outside its root is refused
  (`template_escapes_root`); params-driven dynamic images pass only
  through the host's explicit allow/deny policy
- The parsers are **fuzzed** with libFuzzer (an on-demand `make fuzz`;
  inputs that ever crashed are kept as a corpus and replayed as
  regressions)

**Rendering, signing and verification use no network** — by design, not
configuration: the crates involved contain no socket-opening code.

**Verification reports what it did not check.** It states the byte
range a signature actually covers and treats a valid signature over an
incomplete range as a forgery. Trust anchors are named explicitly per
call; the machine's certificate store is never consulted.

**This site holds the same posture**: rendering happens in the WASM
engine inside your tab, nothing is uploaded, the CSP forbids inline
scripts (build-time sha256 hashes allow exactly the shipped ones), and
the analytics are cookieless.

**Reporting**: [SECURITY.md](https://github.com/kengos/shojiku/blob/main/SECURITY.md)
— kengo+shojiku@kengos.jp
