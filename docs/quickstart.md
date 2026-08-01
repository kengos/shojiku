# Quickstart

From zero to a rendered PDF, then an AI agent driving the engine.
Nothing to install but Docker.

## 1. Get the engine

The image carries the CLI, the MCP server, the font and locale packs,
and every bundled example. It runs on x86-64 and arm64.

```bash
docker pull ghcr.io/kengos/shojiku:edge
```

`edge` tracks `main`. It is the only tag that exists — Shojiku is
pre-1.0, so there is no `latest` and no version tag yet. The same image
is mirrored to Docker Hub as `kengos/shojiku:edge` if you prefer that
registry; ghcr is what the rest of this page uses because it does not
rate-limit anonymous pulls.

Prefer to build it yourself, or want the binaries outside a container?
[from-source.md](from-source.md).

## 2. Render a bundled example

The image's default command renders the bundled Japanese receipt to
stdout, so this needs no arguments and no files of your own:

```bash
docker run --rm ghcr.io/kengos/shojiku:edge > receipt.pdf
```

Every bundled example is inside the image under
`/opt/shojiku/examples`, and any of them renders the same way:

```bash
docker run --rm ghcr.io/kengos/shojiku:edge render \
  --templates /opt/shojiku/examples/business/invoice-en/templates.yml \
  --params /opt/shojiku/examples/business/invoice-en/params.json \
  --definitions /opt/shojiku/examples/business/invoice-en/definitions.yml \
  --output - > invoice.pdf
```

## 3. Start from an example of your own

The fastest way to a document you can edit is to lift a bundled one out
of the image. The image is distroless and has no shell, so this uses
`docker cp` rather than `sh`:

```bash
cid=$(docker create ghcr.io/kengos/shojiku:edge)
docker cp "$cid:/opt/shojiku/examples/business/invoice-en" ./my-doc
docker rm "$cid"
```

**Copy the whole DIRECTORY, not the three files.** A template can
reference siblings — `invoice-en` pulls in `assets/logo.svg` — and taking
only `templates.yml`, `params.json` and `definitions.yml` gets you
`error[invalid_image_asset]` on the first render.

To just LOOK at one file without copying anything, send `docker cp` to
stdout — it writes a tar stream, so pipe it through `tar -xO`:

```bash
cid=$(docker create ghcr.io/kengos/shojiku:edge)
docker cp "$cid:/opt/shojiku/examples/business/receipt-ja/templates.yml" - | tar -xO
docker rm "$cid"
```

`docker run --entrypoint cat …` will NOT work: the image carries the
engine and nothing else, so there is no `cat` and no `sh` in it to run.
That is deliberate — a smaller attack surface than a shell-bearing base
— and `docker cp` is the way around it, because it reads the container
filesystem from the outside rather than executing anything inside.

Now edit `my-doc/templates.yml` (the layout) or `my-doc/params.json`
(the data), and render by mounting the directory. Fonts and locale packs
are already inside the image, so this is the only mount you need:

```bash
docker run --rm -v "$PWD/my-doc:/work" ghcr.io/kengos/shojiku:edge render \
  --templates /work/templates.yml --params /work/params.json \
  --definitions /work/definitions.yml \
  --output /work/out.pdf
```

**To SEE whether your edit landed, render a preview instead of a PDF.**
`preview` writes one PNG per page, which you can open without a PDF
viewer — and unlike grepping the PDF, it actually shows you the result.
(Text inside a Shojiku PDF is stored as subsetted font glyph indices, so
`strings out.pdf | grep "your name"` finds nothing even when the change
is there. That is normal, not a failed render.)

```bash
docker run --rm -v "$PWD/my-doc:/work" ghcr.io/kengos/shojiku:edge preview \
  --templates /work/templates.yml --params /work/params.json \
  --definitions /work/definitions.yml \
  --output '/work/page-{page}.png'
```

The `{page}` placeholder is required whenever the document has more than
one page; without it the command refuses rather than overwriting page 1
with page 2.

Every bundled example under `/opt/shojiku/examples` works as a starting
point — the [gallery](../README.md#gallery) shows what each one is.

**Do not drop `--definitions`.** It is optional to the CLI, and leaving it
out still exits 0 with no diagnostic — but the field TYPES live there, so
a currency field renders as a bare `8,360` instead of `¥8,360`, and a
quantity loses its counter. The degradation is silent and visible only in
the output. ([engine/definitions.md](engine/definitions.md) is the
reference for the file.)

## 4. Write your own template

The template reference is [engine/](engine/README.md) — one page per
feature (items, box model, styles, tables, repeats, …), plus the
`validate` / `preview` / `inspect` commands that make the
write→check→look loop fast. Or skip hand-writing entirely and use an
agent (next section).

## With an AI coding agent (MCP)

`shojiku-mcp` is a stdio MCP server exposing `validate` /
`render_preview` / `inspect_layout` / `capabilities`. It ships in the
same image, and stdio is exactly what `docker run -i` gives you — for
Claude Code:

```bash
claude mcp add shojiku -- \
  docker run --rm -i --entrypoint shojiku-mcp \
  -v "$PWD:/work" -w /work ghcr.io/kengos/shojiku:edge
```

Other clients take the same server as JSON. The command is identical
everywhere; what differs is which file it goes in, the top-level key,
and — the part that actually bites — how you spell the directory to
mount.

```json
{
  "mcpServers": {
    "shojiku": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "--entrypoint", "shojiku-mcp",
        "-v", "/absolute/path/to/your/documents:/work", "-w", "/work",
        "ghcr.io/kengos/shojiku:edge"
      ]
    }
  }
}
```

**The path is written out in full on purpose.** `$PWD` is a SHELL
expansion — it works in the `claude mcp add` command line above, and it
is not something a JSON config loader expands. Each editor has its own
variable syntax instead, and using the wrong one passes the literal
string to `docker -v`, which silently mounts a directory named
`${PWD}`. An absolute path is the one spelling that works everywhere.

| Client | File | Top-level key | Workspace variable |
| --- | --- | --- | --- |
| Claude Code | `.mcp.json` in the project | `mcpServers` | — (use the CLI above) |
| Claude Desktop | macOS `~/Library/Application Support/Claude/claude_desktop_config.json`, Windows `%APPDATA%\Claude\claude_desktop_config.json` | `mcpServers` | none — it has no project, so absolute is the only option |
| VS Code (Copilot) | `.vscode/mcp.json` in the project | **`servers`** | `${workspaceFolder}` |
| Cursor | `.cursor/mcp.json` in the project, or `~/.cursor/mcp.json` | `mcpServers` | check its docs; absolute always works |
| Windsurf, Cline, Zed, … | that client's own MCP config | `mcpServers` | check its docs; absolute always works |

Whatever you mount is the whole of what the agent can reach: it reads
your templates from there and writes PDFs back there, and the container
sees nothing else on your machine.

### Checking the server yourself

Before wiring it into an editor, you can confirm the server runs and
see what it offers. This asks it to introduce itself and list its tools:

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"probe","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | docker run --rm -i --entrypoint shojiku-mcp ghcr.io/kengos/shojiku:edge
```

You should get two JSON lines back: the server naming itself
`shojiku-mcp`, then the four tools with their schemas. If the first line
never arrives, the usual cause is a missing `-i` — without it the server
sees EOF and exits before answering.

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
