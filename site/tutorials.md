---
title: Tutorials
---

# Tutorials — from a first PDF to a production release

This page runs in a straight line from rendering one PDF to baking your
template into a Docker image and shipping it. Every command is transcribed
from something CI actually runs.

## 1. One PDF, from nothing but Docker

The image carries the CLI, the MCP server, the font and locale packs, and
every bundled example.

```bash
docker run --rm ghcr.io/kengos/shojiku:edge > receipt.pdf
```

Lifting a template out of the image, editing it and previewing the result
is the [quickstart](https://github.com/kengos/shojiku/blob/main/docs/quickstart.md)'s
job — the edit → validate → preview loop lives there.

## 2. Embed it in your app (the published SDKs)

Packages for five languages are on the public registries. Every SDK has the
same shape: construct a client, pass a template name and params, write out
the returned bytes. Errors come back as a typed `failure`, not an exception.

::: code-group

```bash [Python]
pip install shojiku
```

```bash [Ruby]
gem install shojiku
```

```bash [Node]
npm install shojiku
```

```bash [.NET]
dotnet add package Shojiku
```

```xml [Java]
<!-- the jar + the classifier of the platform you RUN on
     (the Netty/LWJGL convention) -->
<dependency>
  <groupId>jp.kengos</groupId>
  <artifactId>shojiku</artifactId>
  <version>0.1.0</version>
</dependency>
<dependency>
  <groupId>jp.kengos</groupId>
  <artifactId>shojiku</artifactId>
  <version>0.1.0</version>
  <classifier>linux-x64</classifier>
</dependency>
```

:::

Rendering is the same three lines in every language. In Python:

```python
import json, shojiku

client = shojiku.Client(
    templates="templates/", font_dirs=["packs/fonts"], locale_dirs=["packs/locale"]
)
result = client.generate("receipt-ja", json.load(open("params.json")))
if not result.success:
    raise SystemExit(f"{result.failure.kind} | {result.failure.message}")
open("out.pdf", "wb").write(result.artifact.bytes)
```

Vendor the repository's `packs/` next to your templates — trimmed to the
packs your locales actually use.

## 3. Add a logo and your own font

The first two things a real template needs.

**Images** sit next to the template and are referenced by `src`. The root
is the template file's directory (the CLI can move it with
`--assets-dir`); `data:` URIs, inline SVG and params-bound dynamic images
work too. The normative page is
[image.md](https://github.com/kengos/shojiku/blob/main/docs/engine/image.md).

```yaml
- type: image
  box: { w: 120, h: 40 }
  src: assets/logo.svg
```

**Fonts are packs.** Put the font files and a `manifest.yml` (one license
+ a sha256 per face) under `packs/fonts/<id>/`, then add the pack to the
locale's `uses` via an overlay. The sha256 and the face's embedding
rights (fsType) are verified at load. The normative page is
[fonts.md](https://github.com/kengos/shojiku/blob/main/docs/engine/fonts.md).

```yaml
# packs/fonts/my-corporate/manifest.yml
version: 1
license: Proprietary
redistributable: false
faces:
  - id: my-corporate
    file: MyCorporate-Regular.ttf
    sha256: <output of sha256sum>
```

```yaml
# packs/locale/ja-jp.yml (an overlay over the builtin ja-JP)
fonts:
  uses: [biz-ud, ipamj-mincho, noto-sans-mono, my-corporate]
```

Now `fontFamily: my-corporate` resolves. Two things to watch: `uses`
REPLACES the list (state the whole set, not just your addition), and a
`fontFamily` naming a pack the locale doesn't `use` silently falls back.
The Dockerfile recipes below `COPY packs/` wholesale, so your own pack
rides the same line.

## 4. Ship it (the Dockerfile recipes)

Once the template is right, bake app + template + packs into one image.
These are the real recipe files for all five languages — the same files
`make proof-deploy` builds and renders against the public registries.

::: code-group

<<< ../examples/deploy/python/Dockerfile{docker} [Python]

<<< ../examples/deploy/ruby/Dockerfile{docker} [Ruby]

<<< ../examples/deploy/node/Dockerfile{docker} [Node]

<<< ../examples/deploy/dotnet/Dockerfile{docker} [.NET]

<<< ../examples/deploy/java/Dockerfile{docker} [Java]

:::

The Python recipe goes one step further and pulls its params out of a
SQLite database inside the image: static document facts (the issuer block,
the QR) stay in the template-side params, and only the transactional rows
come from the DB:

<<< ../examples/deploy/python/render.py{python}

## 5. Sign it, verify it

Sign before you distribute; the receiving side verifies. Neither touches
the network, and there is deliberately no flag that takes a passphrase on
the command line (`argv` is readable by other processes).

```bash
shojiku sign --input out.pdf --key signer.pem --cert signer.crt --output signed.pdf
shojiku verify --input signed.pdf --anchor signer.crt
```

`verify` prints a JSON report that includes the byte range the signature
actually covers, and exits non-zero when the document does not verify. The
certs you trust are named with `--anchor` every time — the machine's trust
store is never consulted.

## Next

- The template language itself: the [reference](https://github.com/kengos/shojiku/blob/main/docs/engine/README.md) — 32 pages, one per feature
- To feel how it behaves: the [playground](/playground)
- To hand the writing to an AI: the [agents](/agents) page
