---
layout: home
title: Shojiku
hero:
  name: Shojiku
  text: Write YAML. Get documents.
  tagline: Invoices, receipts, application forms, manuscript paper. Two YAML files and one JSON render to byte-identical PDFs on every machine — an engine built for AI agents.
  image:
    src: /brand/hero.png
    alt: The Shojiku hero banner — itself rendered by the Shojiku engine
  actions:
    - theme: brand
      text: Get started
      link: /tutorials
    - theme: alt
      text: Open the Designer
      link: /designer/
    - theme: alt
      text: GitHub
      link: https://github.com/kengos/shojiku
---

<div class="sj-note">The banner above is output from the engine this site describes — one 200mm×90mm template (<a href="https://github.com/kengos/shojiku/tree/main/examples/dev/site-hero/">templates.yml</a>). The two vertical columns on the right are a manuscript-paper <code>char_grid</code>; the red seal is an <code>ellipse</code> stamped over the blank cells.</div>

## Edit the YAML. Render it right here.

The editor holds a real bundled example. Rendering happens in the WASM engine inside your tab — nothing is uploaded. The Latin example renders immediately on ~1.2 MB of fonts; one click fetches the Japanese font pack (10 MB) for the Japanese one.

<ClientOnly><LiveRenderer /></ClientOnly>

## For the documents other engines give up on

Shojiku grew out of Japanese business paperwork: vertical-writing book typography, 200-character manuscript paper, an A3 résumé spread, an application form whose blank and filled versions render from one template without a single point shifting. Swap the locale pack and the same receipt renders in Traditional Chinese, Simplified Chinese, or Hindi — the geometry never moves.

| | |
| :---: | :---: |
| [![Vertical-writing novel](/gallery/typography-novel-ja/preview-2.png)](/gallery) | [![Rirekisho](/gallery/forms-rirekisho-ja/preview-1.png)](/gallery) |

The [gallery](/gallery) holds every bundled example; CI byte-compares each one on every run.

## One engine, all the way to verification

Authoring, checking and shipping all pass through the same engine. Signing and verification are CLI operations and use no network.

1. **validate** — machine-readable diagnostics with stable codes, before anything renders.
2. **preview** — one PNG per page; look before you ship.
3. **render** — the same input produces the same bytes from the CLI, Docker, every SDK and the browser.
4. **sign** — an incremental-update signature; the file stays a readable PDF.
5. **verify** — reports the byte range the signature actually covers, and names what it did not check.

The [tutorials](/tutorials) walk the whole path; the [playground](/playground) shows how the template language behaves.

## Hand the loop to an AI agent

The MCP server ships in the same Docker image. An agent writes YAML, validates, looks at the preview, and iterates against diagnostic codes — the loop this engine was designed around. Details on the [agents](/agents) page.

## There is a GUI. It is one way in, not the only one.

The [Designer](/designer/) is a visual editor over the same engine, reading and writing the same files your agent does. Open a document in the GUI, fix it in YAML, open it in the GUI again.
