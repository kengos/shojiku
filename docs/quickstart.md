# Quickstart

From zero to a rendered PDF, then an AI agent driving the engine.
There are two starting points; pick the one that matches how you got
here.

## A. From a published release — *not available yet*

Shojiku is pre-1.0 and **not yet published anywhere**: no crates.io
release, no prebuilt binaries, no public Docker image. This section
fills in with the first public release; until then, start from source
(section B).

## B. From source (`git clone`)

### 1. Get the CLI

With a Rust toolchain (any recent stable):

```bash
git clone https://github.com/kengos/shojiku.git
cd shojiku/engine
cargo build --release --locked -p shojiku-cli -p shojiku-mcp
# binaries: engine/target/release/shojiku  and  engine/target/release/shojiku-mcp
```

(The repo's own contributor gates run through Docker `make` targets,
but that is a CI-mirroring policy — building the binaries with your
local cargo is fine for *using* Shojiku.)

Without Rust, build the Docker image instead (needs Docker + `make`):

```bash
git clone https://github.com/kengos/shojiku.git
cd shojiku
make docker-build          # builds the local image tag `shojiku-ci:local`
```

`make docker-render` renders the bundled example through that image and
asserts the result is a PDF — the one-command check that the image works.

### 2. Render a bundled example

From the repo root — `cd ..` first if you followed the cargo build above,
which leaves you in `shojiku/engine` (the CLI finds the bundled `packs/`
for fonts and locale data relative to the current directory):

```bash
engine/target/release/shojiku render \
  --templates examples/business/receipt-ja/templates.yml \
  --params examples/business/receipt-ja/params.json \
  --definitions examples/business/receipt-ja/definitions.yml \
  --output receipt.pdf
```

Or with the Docker image — its default command renders exactly this
example to stdout:

```bash
docker run --rm shojiku-ci:local > receipt.pdf
```

For your own files, mount them and pass normal CLI arguments (fonts
and locale packs are baked into the image):

```bash
docker run --rm -v "$PWD:/work" shojiku-ci:local render \
  --templates /work/templates.yml --params /work/params.json \
  --definitions /work/definitions.yml \
  --output /work/out.pdf
```

**Do not drop `--definitions`.** It is optional to the CLI, and leaving it
out still exits 0 with no diagnostic — but the field TYPES live there, so
a currency field renders as a bare `8,360` instead of `¥8,360`, and a
quantity loses its counter. The degradation is silent and visible only in
the output. ([engine/definitions.md](engine/definitions.md) is the
reference for the file.)

### 3. Write your own template

The template reference is [engine/](engine/README.md) — one page per
feature (items, box model, styles, tables, repeats, …), plus the
`validate` / `preview` / `inspect` commands that make the
write→check→look loop fast. Or skip hand-writing entirely and use an
agent (next section).

## With an AI coding agent (MCP)

`shojiku-mcp` is a stdio MCP server exposing `validate` /
`render_preview` / `inspect_layout` / `capabilities`. Register the
binary you built in step B1 — for Claude Code:

```bash
claude mcp add shojiku -- \
  /path/to/shojiku/engine/target/release/shojiku-mcp \
  --font-dir /path/to/shojiku/packs/fonts \
  --locale-dir /path/to/shojiku/packs/locale
```

or the equivalent `.mcp.json`:

```json
{
  "mcpServers": {
    "shojiku": {
      "command": "/path/to/shojiku/engine/target/release/shojiku-mcp",
      "args": [
        "--font-dir", "/path/to/shojiku/packs/fonts",
        "--locale-dir", "/path/to/shojiku/packs/locale"
      ]
    }
  }
}
```

(The `--font-dir` / `--locale-dir` flags point at the cloned repo's
bundled packs; they can be omitted when the agent's working directory
is the repo root, where `./packs/` resolves by default.)

Then ask for the document you need:

> Make an A4 receipt with our logo, a tax-breakdown table, and a QR code
> linking to the receipt page.

The agent writes `templates.yml` / `definitions.yml`, renders a
preview, inspects the layout tree, and iterates on the diagnostics
until the output matches. The agent playbooks (AI-only instructions)
are:

- [skills/shojiku-template-author/](../skills/shojiku-template-author/SKILL.md)
  — authoring a template from natural-language requirements (its
  **Engine access** section is the canonical MCP-first / CLI-fallback
  command table the other two reference).
- [skills/shojiku-render-debugger/](../skills/shojiku-render-debugger/SKILL.md)
  — diagnosing why an existing template renders wrong.
- [skills/shojiku-thinreports-migrator/](../skills/shojiku-thinreports-migrator/SKILL.md)
  — migrating a legacy Thinreports report by visual regeneration.
  [migration-thinreports.md](migration-thinreports.md) walks one such migration
  end to end (legacy `.tlf` + Ruby host → the re-authored bundled example), if
  you want to see the method before pointing an agent at your own report.
