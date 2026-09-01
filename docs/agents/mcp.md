# MCP / AI Tooling Policy (`engine/mcp`)

Status: the core server is **shipped** — `shojiku-mcp`, a stdio
JSON-RPC server wrapping `engine/authoring`, with the `validate` /
`render_preview` / `inspect_layout` / `capabilities` tools (see
[engine/features.md](../engine/features.md) § MCP server). Each source
is passed either by path or inline as text (never both for one source),
with a per-call asset policy mirroring the CLI's;
every template tool response carries its diagnostics, and
the layout tree/boxes are retrievable via `inspect_layout` with the
same inputs. The **read surface** is shipped too — `instructions` at
initialize, the bundled examples over `list_examples` / `get_example` /
`resources`, and the authoring reference over `list_reference` /
`get_reference` / `resources` (below). The remaining tool surface below
is future work.

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
- `format_catalog(template?, lang?, probes?) -> the pickable display
  variants per field type with an engine-rendered sample of each, plus one
  result per probed pattern + diagnostics`. Every argument is optional —
  a catalog is a function of (locale pack, template registry), and an
  author who has not written a document yet still needs the vocabulary.
  Its diagnostics are PARSE-only, so an unparseable template says why its
  registry half is empty rather than reporting nothing.
- `list_examples() -> the bundled catalog (URI, title, what it exercises,
  file names, size) + how to fetch one`
- `get_example(uri) -> that entry's source files (or one named file)`
- `list_reference() -> the reference page index (URI, title, group, what
  it covers, the catalog shapes it documents) + how to fetch one`
- `get_reference(uri) -> that page's markdown + its keys as a JSON Schema
  fragment` — or the matching catalog node(s), for a `<page>#<key>` URI

## The read surface (`instructions` + resources)

An agent installed the advertised way (`docker pull` + `claude mcp add`)
has no `docs/` and no `skills/` on disk. Three things close that gap,
and all are part of the core surface rather than optional extras:

- **`instructions` in the `initialize` result** — the three-file model,
  the validate → preview → inspect loop, where the examples and the
  reference are, and the **staleness rule**: whatever the agent recalls about Shojiku syntax is
  absent from its training data or older than the running build, so the
  engine is the authority and `validate` settles disputes. It is a
  signpost, not a copy of the reference; keep it short.
- **The bundled examples, listed then fetched.** The wire shape is a
  deliberate **hybrid** (decided): the LIST is a tool, because several
  MCP clients never pull a resource into model context on their own and a
  catalog nobody reads closes nothing; the FETCH is a `resources/read`
  over `shojiku://example/<bucket>/<name>`, with `get_example` as a
  second entry point on the same body of text so a client without
  resources support is not stranded. The reference half below rides this
  shape rather than re-deciding it, and so does any later one.
- **The authoring reference, listed then fetched**, on exactly that
  shape: `list_reference` as the tool, `resources/read` over
  `shojiku://reference/<page>` as the fetch, `get_reference` as its
  second entry point. It is the surface that answers "which construct do
  I pick", which no example and no `validate` rejection can: an objection
  can correct a wrong key inside a construct the agent already reached,
  never tell it the construct exists.

Rules this surface must keep, in both halves:

- **Never truncated — and each half says what it does instead.** A
  silently truncated template or page is worse than none: the agent
  cannot tell it is reading a fragment. The EXAMPLE half is bound by
  REFUSAL, at read time: an over-cap bundle comes back refused with the
  per-file URIs to use in its place, which is a refusal the client can
  act on. A page has no per-file spelling to be sent to, so refusing one
  would only make it unreachable — the REFERENCE half is bound at BUILD
  time instead, over what a read actually answers (the markdown plus the
  serialized schema half, not the `.md` file), so an oversized page fails
  the suite rather than shipping. Its bound is deliberately the more
  generous of the two, 96 KiB against the bundle's 64 KiB, because a
  bundle must be read WHOLE to be usable while a page is a document read
  once and worked from: today's largest response is
  `reference/template` at ~68 KiB, past the bundle cap and inside its
  own.
- **The catalog is gated against the tree, not hand-trusted.** A catalog
  the agent trusts is worse than none once it lies, so each half is
  asserted equal to the real directory in both directions — `examples/`
  for one, `docs/engine/` for the other — and the example prose composes
  from `examples/gallery.yml` (the one gallery source) rather than
  copying it.
- **Read-only.** Writing files stays the agent's job (decided) — three
  writers on one file is the thing this avoids.

The example half adds:

- **The entry is the unit.** A template read alone cannot be understood —
  `{customer.name}` means nothing without `definitions.yml` — so an entry
  answers its source files together. Not every entry has all three; the
  presets carry no definitions.

The reference half adds:

- **A page answers BOTH halves.** The key catalog
  (`agents/engine.md` § The key catalog) carries the machine facts —
  types, defaults, closed enumerations — and cannot carry a syntax
  example or a `## Limitations` section, which is exactly what an agent
  choosing between constructs reads. So the markdown rides beside the
  schema fragment rather than being replaced by it.
- **The page→shape map is the page's own front matter.** Embedding the
  page embeds the map, so there is no second artifact and nothing to
  drift; the exact partition of the catalog's `$defs` across the pages is
  asserted engine-side, not only in the site's suite.
- **A fragment is an ENUMERATION, not a lookup.** A bare key is genuinely
  ambiguous on five pages, so `#<key>` answers with every match on that
  page, each naming its owning shape, and `#<Shape>` / `#<Shape>.<key>`
  narrow. Picking one owner would be silently wrong; asking the agent to
  disambiguate costs a round trip.
- **The schema fragment's `$ref`s point outward, and it says so.** The
  partition is exact, so a shape one node references belongs to a
  DIFFERENT page and no page can resolve its own pointers. Inlining the
  closure is the wrong answer — it copies one node into a dozen pages and
  multiplies the response — so the rule is stated instead, in the
  document (`$comment`) and in the two places a client meets the surface
  (`howToRead`, the `get_reference` descriptor): `#/$defs/<Name>`
  resolves at `shojiku://reference/<page>#<Name>`, and `shapes` in the
  listing is the owner table.
- **Never a dump.** The corpus is far past any single response's cap, so
  there is no "give me the reference" call — the index is a list, and a
  page is a page.

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
