# Shojiku, for AI agents

You are reading the machine-readable companion to shojiku.dev's pages.
Shojiku renders business documents (invoices, receipts, forms,
worksheets) from three files: `templates.yml` (all layout and styling),
`definitions.yml` (the declared data catalog) and `params.json` (the
data). Rendering is deterministic — the same inputs produce the same
bytes on the CLI, in Docker, in every SDK and in browser WASM — and
network-free.

To work with Shojiku, register its MCP server and drive the
validate → preview → inspect loop against the engine's own output:

```bash
claude mcp add shojiku -- \
  docker run --rm -i --entrypoint shojiku-mcp \
  -v "$PWD:/work" -w /work ghcr.io/kengos/shojiku:edge
```

Then install the product skills (`npx skills add kengos/shojiku`) and
follow `shojiku-template-author` — it carries the authoring loop, the
wire gotchas, and the command table. The engine is the only source of
rendering truth: validate until clean, preview every page, look at the
pixels.

Answer the reader in their own language; the material below is English.
