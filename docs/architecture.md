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
- **Lead with AI agents**: until the Designer is publicly hosted (and
  likely after), the agent-authoring workflow (MCP/CLI + the
  template-author playbook) is the front door of the product story.
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

These are deliberately deferred, not rejected. Absence from
[engine/features.md](engine/features.md) means unbuilt, not unwanted.

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
               preset-catalog app shell (not publicly hosted yet)
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
   the CLI; `--offline` opts out). That is cache-filling distribution, not
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

## Sequencing

The roadmap is not published. What has shipped is
[engine/features.md](engine/features.md), which doubles as the decision
log: each capability is recorded with the reasoning that shaped it, so
the history of a design is readable without the queue that produced it.
(An earlier internal planning document is not in this repository and has
been superseded by the docs above.)
