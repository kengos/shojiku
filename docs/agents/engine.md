# Engine Policy (`engine/`)

Rust workspace. Owns the parts of the lifecycle that must be correct,
fast, and shared by every SDK, the GUI preview, and the CLI:

```text
engine/
  core/           shared types: definitions, params, templates model
  layout/         layout algorithm (absolute/flow/grid/table/group, page break)
  render-pdf/     PDF backend
  render-png/     PNG preview backend
  image/          png/jpg/webp/svg/qrcode/barcode/placement
  bundle/         compile + bundle format (single template & multi-template registry)
  formatter/      type -> locale-aware display string/image
  diagnostics/    structured validation/inspection output
  authoring/      shared validate/prepare/preview/inspect/capabilities layer
  signing/        sign/verify (see agents/signing.md for the trust-specific rules)
  verify/
  mcp/            MCP tool server (see agents/mcp.md)
  cli/            `shojiku` command surface (thin wrapper over authoring/)
```

(Target shape — `bundle/`, `signing/`, `verify/`, and `mcp/` are reserved
future crates; the code map (`docs/code-map/`, indexed from CLAUDE.md) records what exists today. There is
also `layout-box/`, the pure box-model math crate under `layout/`.
`authoring/` is the bytes-first lib layer the CLI — and the future WASM
bindings and `mcp/` — all wrap, so no surface grows a second grammar; its
capability list is the single source every surface advertises.)

## Responsibilities

- Layout is engine-owned: absolute, flow/stack, grid, table, group,
  auto page break, keep-together, widow/orphan control, repeat, page
  header/footer, text measurement/shaping, font fallback.
- Rendering only requires `bundle/templates + params`. `definitions` is
  used at **compile/validate** time, not at render time — don't add a
  render-time dependency on `definitions`.
- Text shaping, font fallback, and RTL support are core responsibilities,
  not plugins — see architecture.md's international principles.
- `formatter` exposes one interface for all types and locales:
  `format(value, type, locale, options) -> string | image | structured`.
  Locale-specific defaults live in `lang/`; business-specific formats live
  in `plugins/` (see agents/lang.md, agents/plugins.md) — `formatter`
  itself should stay generic.

## Boundaries — do not cross these

- Engine does not know about GUI concerns (drag-and-drop state, canvas
  selection, undo/redo). GUI calls engine through the preview/render API,
  never the reverse.
- Engine does not embed business/locale-specific formatting rules
  (Japanese era, accounting notation, JP address format) — those are
  `plugins/` or `lang/`. If you're tempted to special-case a business rule
  inside `engine/`, stop and reconsider whether it belongs in a plugin.
- `signing`/`verify` must not be invoked implicitly by `render-pdf`. Signing
  is a separate pipeline stage the caller invokes explicitly.

## Extension mechanism order

When something in `engine/` needs to be pluggable, prefer, in this order:
1. Cargo feature / optional dependency
2. Lang pack / plugin metadata bundled at compile time
3. WASM plugin
4. Subprocess plugin
5. Dynamic library plugin

Don't jump to (3)–(5) until (1)–(2) are proven insufficient.

## Mandatory lint/test gates (Rust)

Formatting/style and coverage follow the general rules in
[../guidelines.md](../guidelines.md) (`rustfmt` + `clippy` own style;
`cargo-llvm-cov` enforces 100% line coverage in CI). What follows is what's
specific to `engine/`:

CI must fail if any of the following fail. These are non-negotiable for
every crate in `engine/`:

- `cargo fmt --all -- --check`
- `cargo clippy --workspace --all-targets --all-features -- -D warnings`
- `cargo test --workspace`
- `cargo llvm-cov --workspace --fail-under-lines 100` (see
  [../guidelines.md](../guidelines.md) for the exclusion policy — no
  wholesale exclusions to hit the number)
- `cargo deny` (licenses + advisories, **zero ignores** in deny.toml)
- The line budget / `//!` role-header check
  (`scripts/check-line-budget.sh`) and the docker build/render/scan job

Run them via `make` (`make verify` = the full CI mirror) — there is no
local cargo toolchain (see the shojiku-rust-professional skill).

Not yet wired in CI (aspirational, do not assume they gate):
`cargo doc --workspace --no-deps` with no broken links, and
`#![warn(missing_docs)]` per crate.

**Unsafe code.** The workspace is safe Rust apart from one crate:
`engine/capi`, where a C ABI makes raw pointers unavoidable. The
standard it set applies to any crate that grows `unsafe` later:

- Declare it at the crate root — `#![deny(unsafe_op_in_unsafe_fn)]` so an
  `unsafe fn` gets no implicit unsafe body, and
  `#![deny(clippy::undocumented_unsafe_blocks)]` so every block states
  why it is sound. Both are denials, not warnings.
- **Confine it.** Raw pointers are dereferenced in the marshalling
  modules only; the code that decides anything is safe Rust over
  ordinary references. A reviewer then reads a handful of files rather
  than the crate.
- **A panic must not cross an FFI boundary** — `catch_unwind` at every
  entry point, and no profile building such a crate may set
  `panic = "abort"`, which would turn the shield into an abort.
- The caller's obligations that no code can check (a length that matches
  its buffer, a handle that has not been freed) are stated in the
  artifact the caller reads — the C header — not only in Rust doc
  comments they will never see.

Layout/render testing practice: **behavior tests asserting numbers on the
layout tree** (positions, pagination, page counts) plus structural
PDF/PNG assertions — not golden/snapshot files; there is no `insta` in
the workspace. See the shojiku-test-professional skill for the idioms.

Errors: use `thiserror` for library error types everywhere, including the
CLI (`CliError`); `anyhow` is not used in the workspace. Don't leak
ad-hoc error types through public library APIs.
