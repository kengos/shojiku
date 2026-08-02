---
title: Tutorials
description: "From rendering one PDF to baking a template into a Docker image and shipping it. Every command is transcribed from something CI actually runs."
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
job; the edit → validate → preview loop lives there.

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

Bundle the font and locale packs with your app, the same way you bundle
the templates. The release tarball is the easiest way to get the full
set, and you can delete the packs for locales you do not use.

```bash
wget https://github.com/kengos/shojiku/releases/download/v0.1.0/shojiku-0.1.0-packs.tar.gz
tar xzf shojiku-0.1.0-packs.tar.gz   # unpacks packs/fonts and packs/locale
```

## 3. Use your own images

This is for putting your own image, a logo say, into a template. Put the
file in an `assets/` directory next to the template file.

```
templates/
  receipt-ja/
    templates.yml
    assets/
      logo.png
```

With this layout, a relative path in the template is all it takes to
draw it. There is no step where you hand the engine the bytes.

```yaml
- type: image
  box: { w: 120, h: 40 }
  src: assets/logo.png
```

Paths resolve against the template file's directory; the CLI can move
the root with `--assets-dir`. `data:` URIs, inline SVG and params-bound
dynamic images are also available. The exact rules are in
[image.md](https://github.com/kengos/shojiku/blob/main/docs/engine/image.md).

## 4. Use a font beyond the bundled packs

This is for a family you picked in the [Designer](/designer/)'s font
picker, or a corporate font of your own. On the template side the
selection is the `fontFamily` style property.

```yaml
# templates.yml — set it on a container and the elements below inherit it
style: { fontFamily: my-corporate }
```

To make that id resolve, the engine needs a font pack, registered in the
locale.

**If the Designer picked it**, the export kit (zip) already contains the
pack, license file included. Unzip it into `packs/fonts/` and the pack
side is done.

**If you have the TTF**, write the pack yourself. Put the font file
under `packs/fonts/my-corporate/` and declare one license plus a sha256
per face in `manifest.yml`. The sha256 and the face's embedding rights
(fsType) are verified at load.

```bash
mkdir -p packs/fonts/my-corporate
sha256sum packs/fonts/my-corporate/MyCorporate-Regular.ttf   # goes into the manifest
```

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

Either way, finish by adding the pack to the locale's `uses`. A one-file
overlay is enough.

```yaml
# packs/locale/ja-jp.yml (an overlay over the builtin ja-JP)
fonts:
  uses: [biz-ud, ipamj-mincho, noto-sans-mono, my-corporate]
```

`uses` restates the whole list rather than appending, so keep the
bundled packs in place when you add yours. A `fontFamily` naming a pack
the locale does not `use` warns `unknown_font_family` and falls back to
the locale's default font.

Pack lookup works the same in the CLI and the SDKs: the search list
grows from explicit directories, to the environment, to `./packs/fonts`
and `./packs/locale` in the current directory. In an SDK the explicit
directories are client options (the `font_dirs` / `locale_dirs` passed
in section 2's Python example). The environment variables are
`SHOJIKU_FONT_DIR` / `SHOJIKU_LOCALE_DIR` (PATH-separated); the CLI
flags are `--font-dir` / `--locale-dir`. The Dockerfiles in the next
section `COPY packs/` wholesale, so your own pack rides the same line.
The exact rules (auto-fetch via pinned `url:`, fallback chains) are in
[fonts.md](https://github.com/kengos/shojiku/blob/main/docs/engine/fonts.md).

## 5. Ship it (the Dockerfile recipes)

Once the template is right, bake the app, the templates and the packs
into one image. These are the real recipe files for all five languages —
the same files `make proof-deploy` builds and renders against the public
registries.

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

## 6. Sign it, verify it

Sign before you distribute; the receiving side verifies. Neither touches
the network, and there is deliberately no flag that takes a passphrase on
the command line (`argv` is readable by other processes).

```bash
shojiku sign --input out.pdf --key signer.pem --cert signer.crt --output signed.pdf
shojiku verify --input signed.pdf --anchor signer.crt
```

`verify` prints a JSON report that includes the byte range the signature
actually covers, and exits non-zero when the document does not verify. The
certs you trust are named with `--anchor` every time; the machine's trust
store is never consulted.

## Next

- The template language itself: the [reference](https://github.com/kengos/shojiku/blob/main/docs/engine/README.md) — 32 pages, one per feature
- To feel how it behaves: the [playground](/playground)
- To hand the writing to an AI: the [agents](/agents) page
