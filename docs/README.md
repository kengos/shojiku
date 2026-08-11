# Shojiku Documentation

Shojiku is a **Document Lifecycle Engine** for PDF forms (receipts,
invoices, estimates, delivery notes, application forms, worksheets):
pain-free, AI- and Git-friendly business-document generation — plain
YAML layouts humans and AI agents author, a Rust engine that renders
them deterministically anywhere. It grew out of Thinreports' pains but
declares no compatibility with it.

This `docs/` directory is the source of truth for architecture decisions,
the template-language reference, and the working agreements every
contributor — human or AI agent — must follow.

The roadmap is deliberately not here. What is DECIDED lives in
[agents/](agents/) (per-area policy) and what is BUILT in
[engine/features.md](engine/features.md); anything in neither is
unsettled rather than rejected, so it is worth proposing.

> **Reading these docs outside the repository** (a docs-only
> distribution, e.g. what an MCP consumer sees): links that leave
> `docs/` — `skills/…` (the AI agent playbooks), `examples/…`,
> `CLAUDE.md`, `gui/…` — resolve in the **repository source** only.
> The feature-page snippets in [engine/](engine/README.md) are the
> self-contained fallback.

## Start here — pick your entrance

- **Writing or fixing templates?** Start at [engine/](engine/README.md) —
  the template reference: one MDN-style page per feature (items, box
  model, styles, tables, repeats, …) with syntax, defaults, diagnostics,
  and the render commands. **To read rather than to edit, use
  <https://shojiku.pages.dev/reference/>**: the same files, rendered with
  a key-level sidebar and a live demo per page that renders in your
  browser. These files stay the source — the site restates nothing. The
  reference is the "what can I write?" surface, and the source material
  for MCP tool responses. Two facts up front:
  **the GUI Designer is live at
  <https://shojiku.pages.dev/designer/>** (templates are plain YAML
  files the Designer round-trips; the root README's "Running the GUI
  locally" section shows how to serve your own copy), and the
  practical authoring path for non-engineers is to have an AI agent
  write the template — the agent playbook is
  [skills/shojiku-template-author/](../skills/shojiku-template-author/SKILL.md)
  (AI-only: instructions *for* the agent, not a human how-to).
- **Evaluating or embedding the engine?** Start at the
  [quickstart](quickstart.md) — `docker pull` → render → MCP
  registration, with nothing to install but Docker
  ([from-source.md](from-source.md) if you want the binaries instead). Today's integration surfaces
  are the **CLI (and its Docker image)** — `shojiku render` as a
  subprocess; see the render commands in [engine/](engine/README.md) —
  plus the **stdio MCP server** (`shojiku-mcp`: validate /
  render_preview / inspect_layout / capabilities, and list_examples /
  get_example over the bundled examples, for AI-agent
  authoring; [agents/mcp.md](agents/mcp.md)) and the **browser WASM
  bindings** (`engine/wasm`, the Designer's preview transport — a JS
  host injects fonts/assets and renders client-side).
  Of the language SDKs, **all seven are built** (`sdk/ruby`, `sdk/python`,
  `sdk/dotnet`, `sdk/java`, `sdk/js`, `sdk/php` and `sdk/go`; each
  installs from its own registry) — ruby is
  the reference the other six mirror. [agents/sdk.md](agents/sdk.md) is the
  policy, and it also carries the frozen contract, the transport
  decision per language and the recorded deferrals. For scope and
  boundaries read [architecture.md](architecture.md).
- **Contributing to the engine?** Start at
  [CONTRIBUTING.md](../CONTRIBUTING.md) for the practical loop — what to
  install (Docker and `make`, nothing else), the `<verb>:<scope>`
  commands that check your work, where a failed gate lands, and the PR
  bar. Then read [architecture.md](architecture.md) — system overview,
  core concepts, repo layout, cross-cutting principles — and the
  [agents/](#agent-policies) policy for the area you touch plus
  [guidelines.md](guidelines.md).

Reference shelf (all audiences):

- [engine/features.md](engine/features.md) — the implemented-capability
  inventory and the decision log (the *why* behind the reference).
  Repository-only: it is the one `docs/engine/` page the site does not
  render, because it records development history rather than authorable
  syntax. The reader-facing counterpart is the site's Features page.
- [migration-thinreports.md](migration-thinreports.md) — migrating a legacy
  Thinreports report by visual regeneration, worked end to end over a bundled
  before/after pair (evaluator- and contributor-facing).
- [designer-mount.md](designer-mount.md) — mounting the Designer under
  your own reverse proxy + the persistence JSON contract
  (integrator-facing).
- [designer-hooks.md](designer-hooks.md) — the `ShojikuGui.hook(…)`
  registry: the append-only event table, the notification/provider
  kinds, contribution guards, deprecation policy (integrator-facing).
- [guidelines.md](guidelines.md) — formatting and test-coverage rules
  every component follows (contributor-facing).
- [make_issues.md](make_issues.md) — **forward-looking, gate output**:
  cases where a `make` gate went red without naming the file, line or
  cause. Filed by whoever hit one (pre-authorised, no scoring needed),
  drained by `shojiku-release-engineer`. IDs are `make_issue_*` so the
  set is one grep away.
- [code-map/](code-map/) — **AI-only** per-component file-by-file repo
  maps (token-dense; indexed from [CLAUDE.md](../CLAUDE.md), which routes
  "you touch X → read code-map/Y"; entry-granularity rules in
  [code-map/README.md](code-map/README.md)). Human readers never need
  these.

## Agent policies

Each file under `agents/` is the policy a contributor (human or AI) must
follow while working in that part of the repository. They cover scope,
boundaries with neighboring components, and the mandatory lint/test gates
for that component's language(s). **Audience: contributors only** —
template authors and integrators never need these. Components marked
*(not built yet)* have a policy but no code; the policy is the contract
for when they land.

| Doc | Scope |
| --- | --- |
| [agents/engine.md](agents/engine.md) | `engine/` — Rust core, layout, render, formatter, diagnostics, CLI |
| [agents/gui.md](agents/gui.md) | `gui/` — React/TypeScript Designer *(built: document core, canvas incl. flow/flex drag reorder + zoom + inline text edit, layer tree/breadcrumb, property panel + format toolbar + defaults/styles registry, diagnostics, field palette, preset-catalog app shell, mounted-host persistence seam)* |
| [agents/sdk.md](agents/sdk.md) | `sdk/` — Python, Node, Ruby, .NET, PHP, Java, Go wrappers *(all seven built: Ruby is the reference implementation and the other six mirror it)* |
| [agents/lang.md](agents/lang.md) | locale data — builtin CLDR packs in `engine/formatter` (ja-JP/en-US) + the shipped `packs/locale/` packs every other locale uses, `packs/fonts/` |
| [agents/plugins.md](agents/plugins.md) | `plugins/` — formatters, signers, data sources *(not built yet)* |
| [agents/mcp.md](agents/mcp.md) | `engine/mcp` — AI/MCP tool surface (core server shipped) |
| [agents/signing.md](agents/signing.md) | `engine/signing`, `engine/verify` — electronic signature & trust *(built: sign, verify, and the hardening pass — bounded errors, fuzz targets)* |
| [agents/verification.md](agents/verification.md) | **how correctness is established at all** — a claim comes from a `make` target, never a hand-built equivalent; where inspection ends and checking begins; what to do when the command you need does not exist. Read before claiming anything works |
| [agents/gotchas/](agents/gotchas/README.md) | **AI-only** incident-derived trap catalogs (toolchain, testing, smokes, verification) — consulted before building / when stuck; the rest of `agents/` keeps the standards, these keep the stumbles |

## Ground rules that apply everywhere

1. **Lint and tests are mandatory, not optional.** Every component must ship
   with the standard lint/format/test tooling for its language, configured
   to fail CI on violation. See the relevant `agents/*.md` for the exact
   toolchain. "It works on my machine" is not a merge criterion.
2. **Follow each language's ecosystem best practice**, not a bespoke house
   style. When in doubt, prefer the tool the language community has
   standardized on (e.g. `clippy`/`rustfmt` for Rust, `ruff`/`mypy` for
   Python) over a custom linter config. Formatting/style disputes are
   settled by the linter's config file, not by discussion — see
   [guidelines.md](guidelines.md).
3. **Test coverage is 100% in CI wherever a coverage tool exists for the
   language.** See [guidelines.md](guidelines.md) for the per-language
   tool and CI gate.
4. **Don't decide the undecided.** When a design question is not settled
   in [agents/](agents/) or [engine/features.md](engine/features.md),
   don't silently pick an answer while implementing — surface it, or make
   the smallest reversible choice and note it in the PR.
5. **Respect component boundaries** described in architecture.md (e.g. GUI
   never renders PDF itself, signing is not part of the renderer, lang packs
   are data not business logic). These boundaries are what make the SDKs,
   plugins, and AI workflow composable.

## Where a statement belongs

- **How to author it** (syntax, keys, defaults, diagnostics) →
  [engine/](engine/README.md), one page per feature.
- **That it exists + why it is shaped that way** →
  [engine/features.md](engine/features.md).
- **How contributors work** → [guidelines.md](guidelines.md) +
  `agents/*.md`.
- **What exists, file-by-file** (AI agents) → [code-map/](code-map/),
  one map per component, indexed from [CLAUDE.md](../CLAUDE.md).

When a feature ships, its substance moves along this list; the
`shojiku-document-curator` skill audits the set against the code.

## Curation marker

*(Internal maintenance note — for contributors and AI agents; readers of
the docs can ignore this section.)*

Last full doc audit (`shojiku-document-curator`): commit `fa8ee99d`.
It covered the commits merged since `b243c9ac` (dependency bumps, the
make/CI gate changes, the gotchas write-backs) plus a reconciliation of
the changelog's Unreleased section against the whole `v0.1.0..HEAD`
diff, run as release pre-flight.

The previous full pass (`b243c9ac`) mechanically checked, and found
already true: every one of the 150 codes in the `DiagnosticCode`
registry appears in
[engine/diagnostics.md](engine/diagnostics.md), and the one retired code
is marked retired rather than deleted (the registry is append-only);
all 143 wire field spellings in `engine/core` appear in the reference;
all 686 relative links across 79 markdown files resolve; every engine
crate appears in a [code map](code-map/); and every top-level doc is
indexed below. Neither pass ran the zero-context reader pass — that
one is worth its own sitting, and neither reorganized anything.
Machine-read: the architect checks
`git log --oneline <hash>..HEAD` against this marker during
`/shojiku-cycle` Phase 0 and recommends a new curation pass when the
drift is large; the curator updates this line at the end of every pass.
Keep the format `commit \`<short-hash>\`` on one line — no date (dates
are noise here; release history lives in git tags).

## Source

This documentation set was originally distilled from an internal planning
document (`pdf_layout_engine_plan.md`, **not in this repository**). These
docs are the durable source of truth now; do not go looking for the
planning doc — implemented behavior lives in
[engine/features.md](engine/features.md).
