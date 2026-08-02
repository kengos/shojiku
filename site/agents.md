---
title: Agents
---

# Hand the whole loop to an AI agent

Shojiku templates are designed to be read, written and checked by agents.
An agent works by reading and editing text — so a document is two YAML
files, errors are stable diagnostic codes, and the layout can be read back
as a tree.

## Register the MCP server

`shojiku-mcp` is a stdio server exposing `validate` / `render_preview` /
`inspect_layout` / `capabilities`, shipped in the same Docker image as the
CLI. For Claude Code:

```bash
claude mcp add shojiku -- \
  docker run --rm -i --entrypoint shojiku-mcp \
  -v "$PWD:/work" -w /work ghcr.io/kengos/shojiku:edge
```

Other clients take the same command as JSON; only the config file's
location and the mount spelling differ. Details in the
[quickstart's MCP section](https://github.com/kengos/shojiku/blob/main/docs/quickstart.md).

## Install the skills

Four product skills ship in the repository: template authoring,
definitions-from-your-schema, render debugging, and Thinreports
migration.

```bash
npx skills add kengos/shojiku
```

`shojiku-template-author` is the core one: it carries the full authoring
procedure — write from requirements, validate, actually look at the preview
images, iterate until the diagnostics are clean — plus the trap list the
reference can't fit. `shojiku-definitions-author` starts one step
earlier: point it at your database schema, ORM models or an API payload
and it derives `definitions.yml` plus the code that builds params from
the real rows, then proves the mapping against the engine's `params_*`
diagnostics.

## The loop an agent runs

1. Declare the data items in `definitions.yml`
2. Write `templates.yml`
3. `validate` — fail machine-readably, with codes
4. `render_preview` — look at the page PNGs
5. `inspect_layout` — read the resolved geometry back
6. Return to 2 until clean

The [hero banner](/) on this site was authored through exactly this loop.

## Feed the pages to an AI

Every page here has a raw `.md` twin; [/llms.txt](/llms.txt) is the map and
[/llms-full.txt](/llms-full.txt) the full blob, including the reference
index and the complete diagnostic-code registry. To teach an agent Shojiku,
one URL is enough.
