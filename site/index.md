---
layout: home
title: Shojiku
hero:
  name: Shojiku
  text: Write YAML. Get documents.
  tagline: Invoices, receipts, application forms, manuscript paper. A YAML template and a JSON of data render to byte-identical PDFs on every machine.
  image:
    src: /brand/hero.png
    alt: The Shojiku hero banner — itself rendered by the Shojiku engine
  actions:
    - theme: brand
      text: Get started
      link: /tutorials
    # target forces a full page load: /designer/ is a separate app merged into
    # the deployed output, so VitePress's SPA router must not intercept it.
    - theme: alt
      text: Open the Designer
      link: /designer/
      target: _self
    - theme: alt
      text: GitHub
      link: https://github.com/kengos/shojiku
---

<div class="sj-note">The banner above is output from the engine this site describes — one 200mm×90mm template (<a href="https://github.com/kengos/shojiku/tree/main/examples/dev/site-hero/">templates.yml</a>). The two vertical columns on the right are a manuscript-paper <code>char_grid</code>; the red seal is an <code>ellipse</code> stamped over the blank cells.</div>

## Live preview

The WASM engine loaded together with this page. Edit the YAML below and the engine re-renders it on the spot (nothing is sent to a server).

For example, change `fontSize: 14` on `store_name` to `24` and the store name grows right there. The Japanese example loads the Japanese fonts (about 9 MB) at the press of a button.

Here it ran in your browser, but the CLI, Docker and the SDKs all produce the same bytes from the same input.

<ClientOnly><LiveRenderer /></ClientOnly>

## Architecture

Shojiku's main job is generating documents like receipts and the customer copy of a reception slip — an engine for business documents that get printed and handed over, not shown on a screen.

In the Python SDK:

```python
import shojiku

client = shojiku.Client(
    templates="templates/",        # the directory holding your templates.yml
    font_dirs=["packs/fonts"],
    locale_dirs=["packs/locale"],
)
params = {"order": fetch_order(order_id)}  # the values on the page, from your DB
result = client.generate("receipt-ja", params)
open("receipt.pdf", "wb").write(result.artifact.bytes)
```

For how templates are written and what they can express, see the [reference](https://github.com/kengos/shojiku/blob/main/docs/engine/README.md) (one page per feature) and the [tutorials](/tutorials). The skills for handing the writing to an AI are on the [agents](/agents) page.

## Signing, too

Once a receipt is handed out, the question can become whether your server really produced it. Most PDF generation libraries have no signing at all; in Shojiku it is part of the engine's job.

```python
provider = shojiku.LocalPem(key="signer.key", cert="signer.crt")
signed = result.artifact.sign(provider)
open("receipt-signed.pdf", "wb").write(signed.artifact.bytes)
```

Keep the signed PDF in storage and `verify` can later confirm that it is what your server produced.

If the key may not live in your application at all — a cloud KMS, an HSM — signing splits into two calls. Shojiku hands out the bytes a signature has to cover, whatever holds the key signs them, and Shojiku writes the signature into the document. The private key never enters the process that renders the PDF.

```ruby
provider = Shojiku::ExternalSigner.new(cert: "signer.crt", algorithm: :ecdsa_p256_sha256) do |to_be_signed|
  kms.sign(key_id: ENV.fetch("KEY_ID"), message: to_be_signed,
           message_type: "RAW", signing_algorithm: "ECDSA_SHA_256").signature
end

signed = result.artifact.sign(provider)
```

Shojiku ships no KMS client of its own — the block is whichever client your application already uses. This is available through the C ABI and, among the language SDKs, in Ruby; the other six follow.

## The vertical writing that sat on wish lists for years

Most PDF generation libraries never got around to vertical writing. Shojiku supports it. A vertical-writing novel look, an A3 résumé spread — you can just make them, along with the application forms you see at retail counters and exam-style worksheets. It can be closer to home than it sounds: a Japanese restaurant's specials menu (English text, USD prices, a vertical brand column) ships as one of the bundled examples. Math notation for exam papers (TeX or similar input) is in preparation.

Documents like these can be authored by an AI agent as well, so the tedious part of the work can be handed over.

| | |
| :---: | :---: |
| [![Vertical-writing novel](/gallery/typography-novel-ja/preview-2.png)](/gallery) | [![Japanese restaurant menu: English text with vertical brand and dish names](/gallery/business-restaurant-menu-us/preview-1.png)](/gallery) |

For more output examples, see the [gallery](/gallery).

## Making documents with an AI agent

You do not have to write the template yourself. The MCP server and the skills ship with the engine, so you can just ask an agent. Setup is two commands (the Claude Code form; see the [quickstart](https://github.com/kengos/shojiku/blob/main/docs/quickstart.md) for the details):

```bash
claude mcp add shojiku -- \
  docker run --rm -i --entrypoint shojiku-mcp \
  -v "$PWD:/work" -w /work ghcr.io/kengos/shojiku:edge
```

```bash
npx skills add kengos/shojiku
```

Then just ask:

> Make a reception-slip template: shop name on top, the reservation number and a QR code in the middle, an order-items table below.

The agent writes the YAML, validates through the MCP server, checks the preview, and fixes until the diagnostics are gone. That is all it takes to get a PDF. See the [agents](/agents) page for the setup.

## Fine adjustments by hand, in a GUI

When an AI-authored template has a spot you do not like, the GUI is there for a human to fix it by hand. Open the <a href="/designer/" target="_self">Designer</a> in your browser, load the `templates.yml`, and adjust positions and styles on the canvas.

![The Designer with the estimate template open, the total-amount text selected for editing](/media/designer-editor.png)
