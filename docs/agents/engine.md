# Engine Policy (`engine/`)

Rust workspace. Owns the parts of the lifecycle that must be correct,
fast, and shared by every SDK, the GUI preview, and the CLI:

```text
engine/
  core/           shared types: definitions, params, templates model
  layout/         layout algorithm (absolute/flow/grid/table/group, page break)
  layout-box/     pure box-model math under layout/
  render-pdf/     PDF backend
  render-png/     PNG preview backend
  image/          png/jpg/webp/svg/qrcode/barcode/placement
  formatter/      type -> locale-aware display string/image
  diagnostics/    structured validation/inspection output
  authoring/      shared validate/prepare/preview/inspect/capabilities layer
  signing/        incremental-update writer + signer (see signing.md)
  verify/         signature verifier (see signing.md)
  mcp/            MCP tool server (see mcp.md)
  cli/            `shojiku` command surface (thin wrapper over authoring/)
  wasm/           browser WASM host over authoring/
  capi/           C ABI cdylib host the FFI SDKs load
  napi/           N-API addon (npm) — reaches the engine through capi/
  fetch/          host-only font fetch (never linked into render paths)
  fuzz/           out-of-workspace libFuzzer targets
```

(All of these exist and ship today except one: a `bundle/` crate — the
compile + multi-template registry stage — remains a reserved future
crate. The code map (`docs/code-map/`, indexed from CLAUDE.md) records
the file-by-file detail. `authoring/` is the bytes-first lib layer the
CLI, the WASM bindings, and `mcp/` all wrap, so no surface grows a
second grammar; its capability list is the single source every surface
advertises.)

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

## The key catalog (built: the artifact, its prose layer, and both gates)

The per-key facts of the authorable wire — key name, type, allowed
values, default, the tagged union of item types — are held ONCE as
machine-readable data, and every surface that describes a key renders
that one source: the MCP answer an agent asks for, a reader-facing
reference on the site, the Designer's property help, and the key tables
inside the template reference ([../engine/](../engine/) — the doc pages,
not this crate tree). The scale is a few hundred nodes, not thousands,
which is what makes one artifact practical.

**What "renders that one source" means for the doc tables, precisely — and
what it does NOT.** The tables in [../engine/](../engine/) are assembled from
a committed description of each table (`reference/tables.yml`) and CHECKED
against the catalog and the code registry. Measured on the committed spec:
**81 of the 995 rendered cells (8.1%) take their value from the engine, and
all 81 are the `Severity` column on 4 of the 35 tables. On the 28 key tables
the figure is 0 of 648.** So the key tables' CELLS are authored, not derived;
what the engine supplies there is the row SET, the column-count invariant, and
the refusal when the two disagree.

Say it that way rather than "generated from the catalog", which is the claim
the `Generated` badge exists to prevent being made about hand-written prose.

The prose being authored is a measured decision rather than an unfinished
migration. Of the 129 description cells a catalog node can be resolved for,
**none is identical** to the catalog's prose and 46 carry a cross-page link it
has no equivalent for. The type cells are the same story; the exact count moves
with the comparison method, so the durable statement is the REASON rather than
a figure: a derived type cell cannot carry `length ≥ 0` or `count ≥ 1`, because
a hand-written `Deserialize` enforces those at parse time and the schema never
records them.
Two kinds of thing account for it. Page CONTEXT — `box.md` says `y` is ignored
in a flow because the cursor owns it, which is true of that page and not of the
key. And CONSTRAINTS the schema has no room for: `length ≥ 0` and `integer ≥ 1`
are enforced by a hand-written `Deserialize` at parse time, so they are not in
the artifact to derive, and a derived cell would silently drop them. The
FACTS / NARRATIVE line the annotation layer already draws is the same line.

The reason it must be data rather than four prose copies is already
visible: the Designer carries hand-copied style keys and hand-copied
engine defaults, and nothing asserts either set against the parser. A
catalog the agent trusts is worse than none once it lies.

**Format: JSON Schema, derived from the parser.** Not a bespoke
`availables` shape. An agent reads an OpenAPI document correctly because
it is imitating a format it has seen constantly, and the properties
that make that work are the ones being copied — node-local `description`,
closed enumeration (so absence is information), constraints in machine
form, an example per shape, named `$ref` shapes, and `oneOf` with a
discriminator for a tagged union, which is exactly what the item `type:`
is. The product has made this choice twice already: MCP `inputSchema` is
JSON Schema, and `definitions.yml` is the OpenAPI-shaped schema for the
data half.

**Derivation: a Cargo feature, per the extension order below.** The
schema derive sits on the `engine/core` wire types behind a non-default
`schema` feature, and `reference-gen` — a `required-features` binary in
`engine/authoring` — emits the committed artifact; a default build links
none of it, so no shipped binary carries the derive or its dependency.
The parser is then the only source of the structure, which is what makes
drift structurally impossible rather than merely tested.

The dependency question is **settled**: `schemars` (MIT) with
`default-features = false` adds six crates, all MIT or MIT/Apache-2.0,
and clears `cargo-deny`. The fallback — a hand-authored skeleton with a
test asserting set equality against the parser — was not needed. What
answering it turned up matters more than the answer: **`cargo deny` does
not traverse an optional dependency that no enabled feature turns on**,
so the gate could not see the derive at all until the recipe gained
`--all-features`. Proven by negative control — a crate whose licence the
allowlist rejects passes as an optional dep and fails the moment it is
made non-optional — and it had been leaving the Node addon's own
dependencies unchecked for as long as they existed.

The embedded bytes were the other thing to measure rather than assume.
Measured: **zero**, and re-measured when the annotation layer took the pair
to ~248 KB of static data. `CATALOG` and `ANNOTATIONS` are `const`s nothing
in the WASM build references, so the linker strips them, and the evidence is
better than a size comparison, which can only ever say the number did not
move: the built `shojiku_wasm_bg.wasm` carries none of their distinctive
strings — `Tate-chu-yoko` (annotation prose), `additionalProperties` and
`Shojiku authorable wire` (JSON Schema, not wire).

**Two ways to run that probe wrong, both paid for here.** Use
`grep -a` (or `strings`): a plain `grep -c` over a `.wasm` classifies it as
binary and reports 0 for a string that IS there, which quietly confirms
whatever you hoped. And pick a string the CATALOG owns — `flexBasis` is a
serde field name the wire derive embeds for parsing, so it is present in
every build and proves nothing either way.

It will cost its bytes at the stage that SERVES it, which is where the number
is worth taking again.

**Derived is not the same as accurate, and the difference is one-sided.**
Fifteen wire types parse through a hand-written `Deserialize`, and for
those the derive describes the RUST shape while the parser accepts
something else. It fails toward being too WIDE — `flexBasis` derives as
"any number or any string" and accepts `content` or `0` — which is the
one direction that actively misleads, because it tells an agent to emit
input the engine rejects. Those fifteen carry hand-written schemas in
`engine/core/src/schema/`, each pinned by a test that feeds every form
the schema declares through the real parser AND one form it excludes.
Only the second clause can catch a too-wide schema, and it is the clause
a plan omits.

**Prose: authored beside the schema, merged into it.** The per-key
narrative — what the key means, the CSS property it mirrors, what it
does to the resolved box, which diagnostics it can emit — is authored in
per-locale annotation files and merged into the artifact as node-local
`description` at generation time, so the served document keeps prose on
the key it constrains. Rust doc comments stay what they are: engine
developer material, in a different register, and unable to carry a
second locale. The engine serves English only, per its non-translating
rule; a localized reference is the site's to render.

**Home: `engine/authoring`.** The data files live under it and are
embedded with `include_str!`, so the surface needs no root path and a URI
can never become a filesystem path. Not a new crate: `engine/authoring`
is the single authoring substrate and CLI / MCP / WASM are its host
surfaces — the capability list is the same class of thing one level
coarser (a machine-readable inventory this crate owns and every host
reads), so a second crate beside it would put a parallel substrate where
the boundary says there is one. The artifact is committed at
`engine/authoring/reference/catalog.schema.json` and embedded as
`shojiku_authoring::reference::CATALOG`. The VitePress build reads
the data files directly, the way it already reads the one gallery source:
the site's reference sidebar takes the ITEM ORDER from the catalog's own
item union, so the order a reader sees is the parser's rather than a list
kept beside it.

**One identifier across every surface**, chosen before each surface grows
its own: the [../engine/](../engine/) page stem names a topic and
`<page>#<key>` names a key, so `shojiku://reference/<page>`,
`/reference/<page>` and `<page>.md#<key>` are the same spelling three
ways.

**Three gates, all required**, mirroring the one that keeps the gallery
honest (regenerate, then fail on drift):

- **built** — the artifact regenerates from the parser and matches what
  is committed; a key added without regenerating is a red gate, not a
  silent lie. `make reference:generate` regenerates, `make reference:check`
  fails on drift. That target also runs the schema tests, because the
  drift comparison on its own is an *idempotence* claim: it protects a
  wrong artifact exactly as faithfully as a right one.
- **rendered** — every generated table in [../engine/](../engine/) is
  byte-for-byte what the generator would write; on the 22 nodes a
  `coverage: full` table names, every key is shown or excused with a reason a
  reader can check (203 of the catalog's 336 properties — the rest have no
  table claiming completeness, and the annotation gate above is what guards
  THEM); and every one of the 157 `DiagnosticCode` variants is documented by
  at least one row. At LEAST
  one: `not_an_array` and `container_depth_exceeded` are each raised at
  validate time and again at layout time, and each section says its own
  context-specific thing about them. Before this existed the reference's
  completeness against the registry was diligence, not a gate — and the site
  gate that checks Limitations claims was reading `diagnostics.md` AS the
  registry, so a code the page failed to document was, to that gate, a code
  that did not exist.
- **complete** — every artifact node has an annotation and every
  annotation names a real node, so a key added to the wire arrives
  un-annotated and is named rather than shipping as a silent gap. The
  rule is a pure function (`shojiku_authoring::reference::annotations::audit`)
  over the two committed files, checked in the DEFAULT test suite so the
  workspace coverage run sees every refusal.

Prose is authored beside the schema rather than lifted from it. schemars
fills `description` from Rust doc comments for free, and taking the free
version would have defeated the completeness gate before it was written:
every node would arrive pre-annotated with text nobody wrote for an
author, in a register no second locale can carry, so "every node has an
annotation" would pass vacuously. Generation strips them and merges
`reference/annotations/en.yml` instead — English only, because the engine
does not translate and a localized reference is the site's to render.

**A node is not the same as a named shape, and the difference is where the
value is.** The wire's tagged unions are internally tagged, so schemars
emits them as `oneOf` branches rather than named `$ref` shapes: the 15
item types and the two body kinds — the keys an agent actually asks for —
live only there. So the node grammar is a named shape, one of its
properties, a DISCRIMINATED branch, and one of that branch's properties:
`Style`, `Style.fontSize`, `Item.text`, `Item.text.data`. Two exclusions,
both gate-pinned rather than trusted: a branch with no discriminator has no
name to address it by — it is the alternative FORM of a value shape
(`BorderColor`'s per-side map, `PageSize`'s `{ w, h }`, `PointSpec`'s anchor
arm) — and its keys are described either by the parent shape's own prose or by
the shape each one `$ref`s; and a branch's own `type` key IS the branch. The gate pins how many anonymous branches exist
and how many keys they hold, so a discriminated one added later cannot
slip through the same door.

**A closed value set must have every value named in its prose.** A derived
schema describes the Rust shape, so prose is where the accepted set gets
stated — and prose that errs WIDE is the direction that misleads, because
it teaches an agent to emit input the parser rejects. The gate enumerates
the closed shapes from the artifact (a top-level `enum`, or a `oneOf`
every branch of which is a `const`/`enum`) and fails on a description that
omits one of its values.

What splits which way: key name, type, default, allowed values, the CSS
property mirrored, the effect on the resolved box, the diagnostics
emitted and the capability key are FACTS and live in the catalog;
which construct to reach for, worked examples, how features compose and
the authoring order that avoids rework are NARRATIVE and stay in the
pages. Pushing narrative into JSON produces a reference nobody can read;
leaving the facts in prose produces the drift this exists to end.

Two obligations follow for other components: the Designer's copied key
lists and default values are asserted against the artifact rather than
maintained beside it, and serving the reference on the MCP wire rides
the list-then-fetch hybrid already decided for the bundled examples
rather than re-deciding a transport.

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
