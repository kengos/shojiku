---
title: Compare
description: "HTML/CSS engines, programmatic PDF libraries, pdfme, Typst and LaTeX: what each is good at, and where Shojiku sits among them."
---

# Compared with other tools

Each is good at different things. In turn:

## HTML/CSS engines (WeasyPrint, Prince, wkhtmltopdf, Puppeteer print)

Tools that turn browser rendering straight into a PDF. For letting a user
download the page you are already showing on screen, they are a good
choice, and existing CSS assets carry over.

The rendering, though, depends on the environment: browser and library
versions and the installed fonts can change the output. The things
business forms need (table headers that repeat across page breaks, n-up
imposition, entry cells, Japanese line-breaking rules) are either missing
from the CSS standard or supported differently by every tool.

There is also the problem that the output bytes are not the same on
every run. Fix one spot in a template and you cannot check mechanically
that the other documents did not change; verification falls back to
eyeballing screenshot diffs.

Shojiku produces the same bytes for the same input. A byte comparison
alone catches a regression, and CI gates every bundled example that way.

## Programmatic PDF libraries (ReportLab, prawn, the FPDF family)

Tools that draw directly, with coordinates and an API (pseudocode):

```python
c = canvas.Canvas("receipt.pdf", pagesize=A4)
c.setFont("Helvetica", 14)
c.drawString(96, 720, customer.name)
c.drawRightString(500, 690, f"${order.subtotal_ex_tax:,}")  # the ex-tax box
c.drawRightString(500, 660, f"${order.total_in_tax:,}")     # the in-tax box
c.save()
```

They can draw anything, but because the layout becomes code, they are a
poor fit for working together with a designer, a PM, or an AI agent.
Which data lands where is something you learn only by reading the code,
the code tends to grow long, and maintaining it gets genuinely painful.

On top of that, take the pseudocode above: the only difference between
the ex-tax box and the in-tax box is whether the y is `690` or `660`. Swap them and nothing
errors; a plausible-looking page comes out anyway. A field you forgot
to draw is the same, and the only thing that notices is a pair of eyes.

In Shojiku the layout is a YAML file, not code. Which key appears where
is visible in the file, and a designer, a PM and an AI agent can all
edit the same file. A mismatch between the template and the catalog of data items
(`definitions.yml`) is caught by validate before anything renders, and
a missing or mistyped params value comes back as a warning with a
diagnostic code.

## pdfme

A good tool with the same template + data idea, including a browser
designer. If your server side is Node, you do not need to migrate to
Shojiku.

The big difference is whether you can use it from anything other than
Node. Shojiku's engine is a Rust binary, so any language can use it.
Each also has features of its own — Shojiku brings deep vertical
writing (kinsoku, ruby, tate-chu-yoko), Japanese-era dates, and signing
and verification — so choose by your requirements.

## Typst / LaTeX

Long, prose-led documents like papers and books are not what Shojiku is
for; use Typst or LaTeX there. Shojiku targets the printing of business documents a
few pages long: receipts, delivery notes, forms.