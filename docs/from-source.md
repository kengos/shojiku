# Building from source

The [quickstart](quickstart.md) uses the published container image,
which is the shortest path and needs nothing installed but Docker. This
page is for the cases it does not cover: you want the binaries on your
`PATH` rather than behind `docker run`, you are on a platform the image
does not target, or you want to run a build of your own working tree.

This is about USING Shojiku from source. If you want to change it, the
gates and the working agreements are in
[../CONTRIBUTING.md](../CONTRIBUTING.md).

## With a Rust toolchain

Any recent stable Rust:

```bash
git clone https://github.com/kengos/shojiku.git
cd shojiku/engine
cargo build --release --locked -p shojiku-cli -p shojiku-mcp
```

That produces `engine/target/release/shojiku` and
`engine/target/release/shojiku-mcp`.

The repository's own gates deliberately run through Docker `make`
targets and never use a local toolchain — but that is a policy about
keeping CI and contributors byte-identical, not a restriction on you.
Building with your own cargo is fine for using Shojiku.

**Run from the repository root.** The CLI resolves `./packs/` for fonts
and locale data relative to the working directory, so `cd ..` after the
build above:

```bash
engine/target/release/shojiku render \
  --templates examples/business/receipt-ja/templates.yml \
  --params examples/business/receipt-ja/params.json \
  --definitions examples/business/receipt-ja/definitions.yml \
  --output receipt.pdf
```

From anywhere else, point at the packs explicitly with `--font-dir` and
`--locale-dir`, or set `SHOJIKU_FONT_DIR` / `SHOJIKU_LOCALE_DIR`.

## Building the image yourself

Needs Docker and `make`, and no Rust — the build happens inside the
container:

```bash
git clone https://github.com/kengos/shojiku.git
cd shojiku
make docker-build     # tags the result `shojiku-ci:local`
```

`make docker-render` then renders the bundled example through that image
and asserts the result is a PDF, which is the one-command check that
what you built works. Substitute `shojiku-ci:local` for
`ghcr.io/kengos/shojiku:edge` anywhere in the quickstart.

## Registering the MCP server

With binaries on disk rather than in the image, the server takes the
pack directories explicitly:

```bash
claude mcp add shojiku -- \
  /path/to/shojiku/engine/target/release/shojiku-mcp \
  --font-dir /path/to/shojiku/packs/fonts \
  --locale-dir /path/to/shojiku/packs/locale
```

Both flags can be dropped when the agent's working directory is the
repository root, where `./packs/` resolves on its own. The rest of the
agent workflow is the same as the
[quickstart](quickstart.md#with-an-ai-coding-agent-mcp) describes.
