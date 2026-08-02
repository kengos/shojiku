# MCP / AI Tooling Policy (`engine/mcp`)

Status: the core server is **shipped** — `shojiku-mcp`, a stdio
JSON-RPC server wrapping `engine/authoring`, with the `validate` /
`render_preview` / `inspect_layout` / `capabilities` tools (see
[engine/features.md](../engine/features.md) § MCP server). Each source
is passed either by path or inline as text (never both for one source),
with a per-call asset policy mirroring the CLI's;
every template tool response carries its diagnostics, and
the layout tree/boxes are retrievable via `inspect_layout` with the
same inputs. The remaining tool surface below is future work.

## Principle

An AI working with Shojiku templates must never be handed just a preview
image. Every MCP tool that concerns a template/render must return (or make
retrievable) all three of:

```text
Preview PNG
Layout Tree
Diagnostics
```

An image alone doesn't tell the AI *why* something looks wrong or *what
key* is missing; the layout tree and diagnostics do. Tools that only return
an image are not acceptable MCP tool designs here.

## Tool surface (core)

Shipped (each source as `<name>Path` or inline `<name>`, diagnostics
always riding along; `assets?` = the `assetsDir` / `assetMode` /
`allowDynamicImage` / `denyDynamicImage` knobs):

- `validate(definitions?, template, params?) -> diagnostics`
- `render_preview(definitions?, template, params, lang?, scale?, page?,
  assets?) -> per-page images + diagnostics`
- `inspect_layout(definitions?, template, params, lang?, assets?)
  -> inspect envelope (engine info / layout tree / boxes / margins)
  + diagnostics`
- `capabilities() -> engine version + capability keys + builtin locales`

Future:

- `render_pdf(definitions, templates, params) -> pdf`
- `compare_preview(before, after) -> visual diff`
- `suggest_layout_fixes(...) -> diagnostics + patch suggestion`
- `infer_definitions(sample_params) -> definitions`
- `generate_sample_params(source) -> params`
- `generate_template_from_description(definitions, description) -> templates`

## Tool surface (Rails/app integration adapters)

Separate, optional adapters to lower onboarding cost by generating
`definitions`/sample `params` from an existing app's models/schema:

- `list_models`
- `inspect_model_fields`
- `inspect_associations`
- `inspect_i18n_labels`
- `inspect_serializer`
- `generate_sample_params`
- `generate_definitions`

These adapters are framework-specific (Rails first) and must not become a
required dependency of the core MCP server — an app without Rails should
still get the full core tool surface.

## Boundary

- MCP tools operate only on template/definitions/params data the caller
  provides (paths or inline content) — no implicit filesystem scanning
  beyond what's passed in, and no arbitrary code execution on behalf of a
  tool call.
- `mcp/` calls into `engine/layout`, `engine/render-*`, and
  `engine/diagnostics` — it does not reimplement layout or diagnostics
  logic itself. If a tool needs new information, add it to
  `engine/diagnostics`'s output shape, then surface it via MCP.
- Validate all input paths/content before passing to render/layout code;
  never shell out to render a path string without validation.

## Mandatory lint/test gates

Implemented as a Rust crate, so it inherits the gates from
[engine.md](engine.md) (`cargo fmt`, `cargo clippy -D
warnings`, `cargo test`, 100% coverage via `cargo-llvm-cov` — see
[../guidelines.md](../guidelines.md)), plus:

- Fixture-based golden tests: for a set of sample
  `definitions`/`templates`/`params` combinations (including intentionally
  broken ones — missing key, unsupported format, overflow), assert the
  exact `diagnostics` output.
- Protocol-level conformance tests against the MCP tool schema (tool
  names, argument shapes, response shapes) so a client integration doesn't
  silently break when a tool's shape changes.
- A test asserting every template-related tool response includes all three
  of preview/layout-tree/diagnostics where applicable (guards the
  principle above from regressing).
