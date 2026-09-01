---
title: Agents
description: "Templates are YAML and JSON, errors come back as stable diagnostic codes, and the layout reads back as a tree. Register the MCP server, then let an agent write and check its own work."
---

# Making templates with an AI agent

Shojiku templates are designed to be read and written by AI agents. A
document is YAML and JSON text, errors come back as stable diagnostic
codes, and the layout result can be read back as a tree. With these, an
agent can iterate on its own: write, then check.

## Register the MCP server

`shojiku-mcp` is a stdio server with `validate` / `render_preview` /
`inspect_layout` / `capabilities` / `format_catalog`, plus `list_examples`
/ `get_example` for reading the bundled documents and `list_reference` /
`get_reference` for reading the syntax reference itself, shipped in the
same Docker image as the CLI. In Claude Code, one command registers it:

```bash
claude mcp add shojiku -- \
  docker run --rm -i --entrypoint shojiku-mcp \
  -v "$PWD:/work" -w /work ghcr.io/kengos/shojiku:edge
```

Other clients take the same command as JSON; only the config file's
location and format differ. See the
[quickstart's MCP section](https://github.com/kengos/shojiku/blob/main/docs/quickstart.md)
for the details.

## Install the skills

Four skills ship in the repository: template authoring, definitions from
your schema, render debugging, and Thinreports migration.

```bash
npx skills add kengos/shojiku
```

The central one is `shojiku-template-author`. It writes a template from
requirements, validates, actually looks at the preview images, and
iterates until the diagnostics are clean; it carries the whole procedure
plus a list of pitfalls the reference does not cover.
`shojiku-definitions-author` handles the step before that: give it your
database schema, ORM models or an API response and it produces
`definitions.yml` plus the code that builds params from real data,
checking the mapping against the engine's `params_*` diagnostics.

## The loop an agent runs

1. `list_examples` — find the bundled document closest to the job, and
   `get_example` to read its source
2. Declare the data items in `definitions.yml`
3. Write `templates.yml` — `list_reference` finds the page for the
   construct you need and `get_reference` reads it; `format_catalog`
   lists the display variants a date or money field can take, and what
   each one renders
4. `validate` — mistakes come back as diagnostic codes
5. `render_preview` — look at the page PNGs
6. `inspect_layout` — read the resolved layout back
7. Return to 3 until the diagnostics are clean

The [hero banner](/) on this site was made through this loop.

## Feed the pages to an AI

Every page on this site has a plain `.md` version. [/llms.txt](/llms.txt)
is the table of contents, and [/llms-full.txt](/llms-full.txt) carries the
whole template reference — every feature page, not just the index and the
diagnostic codes — so an agent asking about `flex` has it without a second
fetch. To teach an agent Shojiku, handing it that URL is enough.
