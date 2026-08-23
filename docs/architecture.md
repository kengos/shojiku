# Architecture

> **Audience: engineers** — contributors and anyone evaluating the
> engine's shape. Template authors can stay in
> [the template reference](engine/README.md).

## Vision

Shojiku is not "a PDF renderer" — it is a **Document Lifecycle Engine**:

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

**This is the target shape, not an inventory.** Bundle and Archive have
no crate yet, and preview output is PDF and PNG — SVG is an image format
the engine *reads*, not one it writes.
[engine/features.md](engine/features.md) is what exists.

Every component in the repo exists to serve one stage (or a couple of
adjacent stages) of this lifecycle. When adding a feature, first place it on
this pipeline before deciding which crate/package it belongs to.

## Goals

- Be the default choice for receipt / invoice / estimate / delivery-note /
  application-form PDF generation.
- **Be pain-free** — the positioning thesis. Shojiku's origin is the
  accumulated pain of the legacy Thinreports workflow (implicit binding
  keys, per-field format sprawl, a layout format neither humans nor AI
  could safely hand-edit); the product promise is that generating a
  business PDF never hurts like that again. Shojiku declares **no
  Thinreports compatibility** — no `.tlf` file or API compatibility at
  any phase; migration is AI-assisted visual regeneration (a guide +
  tooling, never a `.tlf` importer).
- **Run anywhere, local-first**: embed as a library/SDK, subprocess the
  CLI/Docker image, render in-browser via WASM — no required service,
  no upload. Non-developers rendering locally (a PM producing a
  customer estimate, a teacher printing worksheets) are in scope; a
  shojiku-hosted SaaS is off the table (user decision) — the hosted
  form is the integrator's own: the Designer mounts under a host
  system's reverse proxy behind the host's auth (shipped —
  [designer-mount.md](designer-mount.md)).
- **Lead with AI agents**: even with the Designer publicly hosted, the
  agent-authoring workflow (MCP/CLI + the template-author playbook)
  stays the front door of the product story.
- Represent PDF forms as JSON/YAML that is easy to code-review, diff, and
  generate/repair with AI. **YAML is the canonical authored form**;
  JSON is accepted everywhere as an equivalent (typically
  machine-generated) input — docs, the Designer round-trip, and the
  bundled examples are YAML-first.
- Provide a GUI layout editor, a stable CLI, and native SDKs for Ruby,
  Python, Node.js, .NET, Java, PHP, and Go.
- Support interactive PDF form fields (AcroForm) as a later-phase
  feature, designed together with sign/verify — the interaction between
  a fillable field and a signature over the same document is the open
  question, not the field syntax.
- Treat images (PNG/JPEG/WebP/SVG), QR codes, and barcodes as first-class
  engine features, not plugins.
- Allow templates/definitions to be precompiled and distributed as a
  `Bundle` (including WASM/native artifacts) so that rendering only needs
  `bundle + params`.
- Be AI-friendly: templates/definitions should be structured so an AI can
  read, validate, and safely patch them.
- Support internationalization: RTL scripts, CJK, currency, date, unit,
  and address formatting.
- Support electronic signature, timestamping, verification, and long-term
  archival as a first-class (if later-phase) output path.

## Non-goals (for now)

- Not aiming to fully replace Word / Excel / HTML from day one.
- Not building a full DTP feature set from day one.
- Not bundling every locale/region format from day one.
- Not supporting `.tlf` import or any Thinreports file/API
  compatibility — at any phase, not just the MVP (see Goals: migration
  is AI-assisted visual regeneration).
- Not supporting every signature standard/CA/long-term-signature scheme from
  day one.
- Not monetizing pre-1.0: no commercial promises (paid support, hosted
  offering, sponsored roadmap items) until real adoption evidence
  exists — the project stays focused on the OSS core.
  Donation-level support (GitHub Sponsors / Buy Me a Coffee-class
  links) is welcome and planned; it funds nothing specific and promises
  nothing in return.
- **Not shipping a hidden-text channel.** No invisible text layer (PDF
  text rendering mode 3 or equivalent) whose purpose is to carry content
  a human reader cannot see. A document that silently instructs the
  machine reading it is the prompt-injection primitive, and this engine
  also *signs and verifies* documents — a signature over invisible
  instructions would attest to something no reader can check, which is
  the opposite of what signing is for. Machine-facing description
  belongs in document metadata (`/Info` + XMP), where every reader and
  every extraction tool can surface it — which is what the template's
  `document:` block writes ([engine/document.md](engine/document.md)).

Most of these are deliberately deferred, not rejected: absence from
[engine/features.md](engine/features.md) means unbuilt, not unwanted.
The two exceptions are standing refusals — Thinreports file/API
compatibility and the hidden-text channel — which say so in their own
entries.

## Core concepts

| File | Role |
| --- | --- |
| `definitions.json/yml` | Data Dictionary for the Designer (GUI/AI/validation). Not required at render time. |
| `params.json/yml` | Runtime data (and preview fixtures). |
| `templates.json/yml` | Page/section/item layout, style, and data bindings. |
| `bundle` | Precompiled, distributable artifact (templates + definitions metadata + fonts + assets + settings). |

**YAML is the canonical form** of every authored file above; JSON is
accepted as an equivalent input everywhere (typically machine-generated
— params handed over by an application are commonly JSON), never a
second dialect to document separately.

### definitions are for the Designer, not for rendering

```text
Designer:
  definitions + templates + sample params
    -> field palette
    -> format selector
    -> preview
    -> diagnostics

Renderer:
  bundle/templates + params
    -> PDF
```

`definitions` is a **field catalog** the GUI/AI use to know what data exists,
its type, and its recommended formats/styles — it is not a JSON Schema and is
not required to render a PDF. At `compile` time, `definitions` is used to
validate that every binding key in `templates` exists and that declared
formats are valid for the field's type.

### Layout model

Everything in a PDF form is a first-class layout object:

```text
Page
  Section
    Absolute
    Flow / Stack
    Grid
    Table
    Group
```

`Absolute` positioning alone (Thinreports' main mode) does not solve
variable-height content well. `Flow` sections exist specifically to let
later items move up when earlier ones (e.g. a table) render shorter/taller
than their max size. These semantics are **implemented and specified** —
"auto move up" is inherent to flow, and `autoPageBreak` / `emptyBehavior`
/ `keepTogether` are shipped table behavior; see
[the engine reference](engine/README.md) for the spec and
[engine/features.md](engine/features.md) for the capability list.

**The container box model (shipped).** `Absolute` / `Flow` / `Grid` /
`Group` converge into one nestable **container** with its own origin and
resolved size, holding children whose lengths may be `pt`, physical
units, or `%` of the parent; `Flow` is the "column flex" case, and a
static `grid` box type exists. Crucially this all resolves to absolute
pt at **layout** time, so the layout tree (the renderer contract) and
both backends are unchanged. Spec: [the engine reference](engine/README.md).

## Component map

This map is the **target** shape, not the current tree. Everything
marked *(planned)* below — and the `bundle` crate inside `engine/` — is
a reserved future component (the code map (`docs/code-map/`) records
what actually exists). The signing half of the lifecycle is built:
`engine/signing` writes the incremental update, reserves the signature
placeholder and produces a CMS container from a local PEM key, and
`engine/verify` checks one back — including the byte-range coverage a
signature alone does not prove.

```text
shojiku/
  engine/      Rust workspace — layout, render, formatter, diagnostics,
               the shared authoring layer + its hosts: cli, mcp (stdio
               server), wasm (browser bindings), capi (the C ABI cdylib
               the FFI SDKs load)
               signing (the PDF revision writer + the local PEM signer)
               verify (the verifier + its coverage rule)
               (planned crate: bundle)
  gui/         React Designer pnpm workspace — document core, canvas,
               property panel + diagnostics, and the standalone
               preset-catalog app shell (live at
               shojiku.pages.dev/designer)
  sdk/         Thin language wrappers (python, js, ruby, dotnet, php,
               java, go) — never reimplement the layout engine. All
               seven are built: ruby is the reference the other six
               mirror (php and go script the CLI as subprocesses)
  packs/       Locale packs (packs/locale/<id>.yml — the whole pack for a
               locale with no builtin, which is how every locale beyond
               ja-JP/en-US ships; a per-key overlay deep-merged over the
               builtin CLDR-generated data for one that has it) +
               fonts-only font packs (packs/fonts/<pack>/)
  plugins/     (planned) Business/domain extensions: special formatters,
               signer providers, data sources, external integrations
  templates/   (planned) Official starter templates (invoice, receipt, ...)
               — bundled examples/ are the canonical core set; additions
               may ship via a fetched catalog (see agents/gui.md)
  examples/    Fixtures used for tests/snapshots and documentation
  docs/        This documentation set (architecture, policy, template reference)
               — the SOURCE of every reader-facing page, in English
  site/        The public site (VitePress on Cloudflare Pages): the pitch
               pages and the live playground — and (planned) the RENDERED
               reader-facing half of docs/, per "Where a doc paragraph
               goes" below
```

See each `docs/agents/*.md` for the policy governing work inside a given
top-level directory. The hierarchy is deliberate: **this file carries
the repo-wide principles; `docs/agents/{engine,gui,mcp,…}.md` carry the
component-detailed standards & policies under them** — a component policy may
refine but never contradict this file. The skill set mirrors it
(architect ⇒ component professional ⇒ language professional).

## Cross-cutting principles

These boundaries are what keep the SDKs, GUI, plugins, and AI/MCP tooling
composable. Do not blur them for local convenience.

1. **GUI never renders PDF itself.** It always calls into the engine (local
   CLI, server preview API, WASM preview, or a Cloudflare Worker preview) so
   GUI preview and production render always produce identical output. See
   [agents/gui.md](agents/gui.md).
2. **Signing is a distinct lifecycle stage, not part of the renderer.** The
   pipeline is `render -> unsigned.pdf -> sign -> signed.pdf -> verify`. This
   keeps key handling isolated and lets external signers (Adobe, DocuSign,
   KMS) plug in without touching layout/render code. Two decided
   corollaries: signing and verification are **separate crates** with
   different threat surfaces (one handles keys, one parses hostile
   input), and **neither opens a socket** — anything inherently networked
   (cloud KMS, HSM, a timestamp authority) is reached host-side through
   the `prepare_sign`/`complete_sign` split, the same shape as
   host-level font fetching in principle 8. See
   [agents/signing.md](agents/signing.md).
3. **Templates are locale-independent; locale data (builtin
   CLDR-generated packs + `packs/locale/` packs) supplies locale
   defaults; `plugins/` supplies business-specific formatting.**
   A new locale is data, never engine code. A
   template should render sensibly in any locale via its declared
   `format`, without hardcoding locale strings. See
   [agents/lang.md](agents/lang.md) and
   [agents/plugins.md](agents/plugins.md).
4. **`params` are runtime data owned by the calling application; `params`
   should be close to ISO-normalized values** (ISO datetimes, plain numbers)
   — display formatting is the engine/lang/plugin's job, not the caller's.
5. **AI/MCP tooling always receives a three-part bundle**: Preview PNG +
   Layout Tree + Diagnostics — never just an image. This is what makes
   `suggest_layout_fixes` and similar tools tractable. See
   [agents/mcp.md](agents/mcp.md).
6. **SDKs are wrappers, not reimplementations.** Every language SDK calls the
   same engine core via native binary/shared library, WASM runtime, or CLI
   subprocess fallback — never a from-scratch port of the layout algorithm.
   See [agents/sdk.md](agents/sdk.md).
7. **Extension mechanisms are chosen in order of least dynamism first**:
   crate feature/optional dependency → bundled lang/plugin metadata → WASM
   plugin → subprocess plugin → dynamic library plugin. Don't reach for a
   dynamic plugin system before the simpler option is proven insufficient.
8. **Fonts: packs are the canonical form; the bundle is the determinism
   anchor; distribution is cache-filling.** Font files live in
   versioned, content-addressed **fonts-only packs shared across locales**
   (locale packs reference faces by id; user-supplied commercial fonts are
   just another pack layered on at runtime — never system-font scanning).
   A pack may travel as a **pinned reference** — a manifest whose faces
   carry `sha256` + a `url:` hint but no bytes — which a **host** resolves
   by filling a local cache *before* rendering (`shojiku-fetch`, used by
   the CLI; `--offline` opts out — flags and cache locations in
   [engine/fonts.md § Pinned faces &
   auto-fetch](engine/fonts.md#pinned-faces--auto-fetch-url)). That is cache-filling distribution, not
   render I/O: the layout/render/sign/verify path itself never opens a
   socket, and the pin means fetched bytes either match exactly or fail
   loudly. `FontStore`
   loading is **bytes-first** — manifest + bytes is the core API,
   filesystem reading is a native-only wrapper, and a WASM host injects
   pack bytes it fetched itself (fonts are never compiled into the wasm
   binary). The Bundle stage pins exact bytes by sha256 so
   render/sign/verify never depend on ambient machine state:
   redistributable faces (OFL/IPA) are embedded in the bundle **pruned to
   the faces the template references** (never glyph-subset — params carry
   arbitrary names); `redistributable: false` faces are hash-pinned but
   **never embedded**, so sharing a bundle can never redistribute a font —
   the receiving side needs the same font locally or fails with a clear
   error. Embedding permissions (OS/2 `fsType`) are checked at load;
   restricted faces are rejected unless the pack manifest explicitly
   attests to an embedding license.

### Where a doc paragraph goes

The repo holds each fact and each narrative **once**, and every surface
that shows it renders that one copy. `docs/` is the source; the site
renders the reader-facing half of it — alongside its own pitch pages —
rather than keeping a second edition of it.

This is the rule for where a paragraph is WRITTEN, and it is in force
now. The rendering half is **built** for `docs/engine/**`: `/reference/`
and `/ja/reference/` resolve, and the site's own pages link there rather
than out to the repository. The remaining projected pages are listed
below and still leave for the repository.

- **`docs/` is the source of every documentation page**, in English. No
  documentation page is authored on the site and nothing from `docs/` is
  restated there. The site's own pitch pages (concept, tutorials,
  compare, tips, …) are a different genre: they are written on the site,
  have no `docs/` counterpart, and this rule does not move them.
- **The site is the reader-facing HOME**: the reference is served at
  `/reference/<page>`, generated at build time from
  `docs/engine/<page>.md`, with the nav, search and locale switch a
  markdown blob on a git host cannot offer. The page stem is the same
  identifier the key catalog uses, so `/reference/<page>`,
  `shojiku://reference/<page>` and `docs/engine/<page>.md#<key>` name
  the same thing three ways ([agents/engine.md](agents/engine.md) § The
  key catalog).
- **Which pages are projected.** Projected: `docs/engine/**` (BUILT)
  except `engine/features.md`, `quickstart.md`, `architecture.md`,
  `migration-thinreports.md`,
  `from-source.md`, `designer-mount.md`, `designer-hooks.md` (those six
  are decided but not yet routed — links to them still leave for the
  repository). Never
  projected: `docs/agents/**`, `docs/code-map/**`, `guidelines.md`,
  `make_issues.md` — contributor and AI material — and `README.md`,
  which is this set's own entrance in the repository and points AT the
  site rather than being copied onto it. Together those two lists are
  every `docs/*.md`; a new top-level page joins one of them in the same
  change that adds it.
- **`engine/features.md` is the one repo-only page inside a projected
  directory.** It records *that* a capability shipped and why it is
  shaped that way, which is development history rather than authorable
  syntax, and at its size it dominated both the reference's page set and
  the llms-full payload while answering none of the questions a reader
  of that reference is asking. The site's reader-facing counterpart is
  the `/features` pitch page, which is written on the site and has no
  `docs/` source, like the other pitch pages. The exclusion lives in one
  place, `site/src/lib/reference.ts` § `REPO_ONLY`, which every reader of
  the directory goes through (the build, the VitePress config, the
  gates). A `docs/engine/` page that links to it writes
  `](../engine/features.md)`, the spelling the outlink rewrite turns
  into a repository URL; a bare sibling link would ask for a route that
  does not exist.
- **`docs/` is not deleted, and its paths do not move.** Three things
  depend on them resolving: every one of the seven SDK READMEs links
  `blob/main/docs/engine/README.md`, and all seven are already
  published to registries, where a release is immutable — the link is
  frozen into versions that are shipped and cannot be revised; the
  docs-only distribution an MCP consumer reads has no site to fall back
  to; and the engine's own doc comments plus `skills/` cite these paths
  from inside the repository. A GitHub blob URL cannot be redirected, so
  a move is a break, not a migration.
- **A second locale is the site's**, never `docs/`'s — the repo is
  English-only apart from locale data. An untranslated page serves the
  English body under a notice rather than 404ing.

## What 1.0 freezes

Nothing here declares 1.0. This section says what the number will mean
when it is declared, so the promise is written down before it is made
rather than reconstructed afterwards. Until then the pre-1.0 posture in
the [README](../README.md) stands for the three surfaces it names — the
authored wire, the CLI and the Rust crate APIs — and everything below is
posture rather than promise. Some of it is already stated without a
pre-1.0 caveat (the diagnostics registry and the C ABI both say so on
their own pages); 1.0 is what makes the whole list binding at once.

At 1.0 the surfaces below stop moving. About half already carry the rule
in question somewhere in this repository, and 1.0 turns that posture into
a promise; where a page is cited it is the normative home and the line
here is a summary of it, so if the two seem to disagree the cited page is
the one that is right. Where nothing is cited — capability keys and the
MCP tool surface — this section is the home, and saying so is the point:
a citation to a page that carries no such rule would send a reader
somewhere the tie-break above then decides in favour of.

1. **The authored wire** — templates, params and definitions. Every
   document that parses at 1.0 keeps parsing, with the same meaning,
   through every 1.x. Change is additive: new keys, new enum variants,
   new item types. The enumeration of record for templates and
   definitions is not prose here but the key catalog, which
   `make reference:check` holds against the real parser
   ([agents/engine.md](agents/engine.md) § The key catalog) — so the
   promise cannot drift away from what the parser actually accepts, which
   is the failure a freeze written as a key list would invite. Params
   have no such artifact and need none: their shape is whatever a
   document's own `definitions` declares, so freezing definitions freezes
   them.
2. **The diagnostics registry** — codes and their per-code arg keys,
   append-only, a retired code staying listed rather than deleted
   ([engine/diagnostics.md](engine/diagnostics.md)).
3. **Capability keys** — append-only, which this section is the first
   page to say outright. A key that has shipped answers the same question
   forever; a different answer needs a different key. That is what lets a
   consumer feature-detect against an engine older than itself, which is
   the whole point of shipping the list at all.
4. **The C ABI** — the signatures in `engine/capi/include/shojiku.h`, the
   numeric status constants (`SHOJIKU_OK` … `SHOJIKU_ERR_PANIC`), and the
   request/result envelope they carry. The constants are named
   deliberately: the FFI SDKs branch on the NUMBERS, so a renumbered
   `#define` leaves every signature identical and mistranslates a failure
   class in several languages at once. New operations and new request keys
   are appended without moving `shojiku_abi_version()`, which is the rule
   the header itself states; mapping a bump of it onto 2.0 is this
   section's addition.
5. **The CLI contract the SDKs script** — the verbs, the flags, the
   `--report` envelope and the EXIT STATUS the subprocess SDKs consume
   ([agents/sdk.md](agents/sdk.md) § Subprocess transport mechanics
   documents the envelope and the failure classes). Flags may be added; a
   verb's output shape is not rearranged under a caller that is parsing
   it. This is the one frozen surface with no machine-readable
   enumeration of record — the cited section describes the envelope, not
   the verb and flag set — which makes it the first place a freeze would
   drift, and a gate over it is worth having before 1.0 is declared.
6. **The SDK lifecycle contract** — the result and trace shape, the
   template-root hardening, and the ownership rules that the Ruby
   reference settled and the other six mirror ([agents/sdk.md](agents/sdk.md)
   § The decisions the reference froze).
7. **The MCP tool surface** — tool names and their `inputSchema`,
   append-only. Like capability keys, this section is the home for that
   rule: [agents/mcp.md](agents/mcp.md) documents the tool surface but
   states no stability posture for it. Tracking the Model Context
   Protocol's own revisions is exempt: when the specification moves, the
   server follows it.
8. **The WASM boundary** — the exported function names the browser host
   calls, the request/result envelope they carry, and the
   `WasmError::code()` registry, which is already append-only
   ([engine/features.md](engine/features.md) — a host branches on the
   code, never on the message, so a code that changed meaning would break
   a recovery path silently). This is the embedding surface a reader can
   use with no toolchain at all, and the Designer's own preview transport
   rides it.

### What 1.0 does not promise

A freeze that lists only what it covers gets read as covering
everything, so the exclusions carry the same weight as the list above.

- **Rendered bytes are not identical across versions.** Determinism
  means same version, same inputs, same bytes — a reproducibility
  property, not a compatibility one. A 1.x may change what a page looks
  like: a layout fix, a shaping or kerning correction, a corrected
  locale pattern. `make examples:check` compares the committed example
  outputs against a fresh render, so a change like that reddens a gate
  and has to be re-rendered deliberately rather than shipping quietly.
- **The Rust crate APIs are not frozen.** The ways to reach the engine
  are the ones frozen above — the seven SDKs, the C ABI, the CLI (which
  is also what the Docker image runs), the WASM boundary and the MCP
  server. The crates published to crates.io are how those are built
  rather than another surface beside them, and freezing them would turn
  every internal refactor into a major version.
- **The Designer is outside it.** 1.0 is the engine's number; `gui/*` is
  unpublished and versions on its own.
- **Locale pack data may be corrected.** A wrong CLDR pattern or era
  boundary is a bug, and fixing it changes output for the locale that
  had it wrong. That is intended, and it is why pack data is data rather
  than contract.

### What the version numbers then mean

Inside 1.x: **major** is a break of any surface above and is therefore
what 2.0 is for; **minor** is additive — a new key, a new capability, a
new operation; **patch** is a fix that leaves every frozen surface where
it was. The SDKs keep moving in lockstep with the engine's workspace
version, which is what makes the engine's 1.0 a number a caller can read
from any of the seven languages.

Writing this section down is not the whole condition for declaring 1.0.
The hardening behind it has to be done as well, because a freeze is as
much a claim about what hostile input cannot do as about which keys
parse.

## Sequencing

The roadmap is not published. What has shipped is
[engine/features.md](engine/features.md), which doubles as the decision
log: each capability is recorded with the reasoning that shaped it, so
the history of a design is readable without the queue that produced it.
(An earlier internal planning document is not in this repository and has
been superseded by the docs above.)
