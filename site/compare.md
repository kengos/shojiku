---
title: Compare
---

# Would another engine do?

Maybe — they are good tools with different centers of gravity. An honest map:

## HTML/CSS engines (WeasyPrint, Prince, wkhtmltopdf, Puppeteer print)

Tools for making paper out of web assets. Strong for document-like pages,
existing CSS, free-flowing long text. The things business forms need —
pixel-fixed boxes, table headers that repeat across page breaks, n-up
imposition, entry cells, Japanese line-breaking rules — live outside CSS or
in implementation-specific corners. Byte determinism is not guaranteed
either: a browser engine may draw differently between runs, which is why
regression tests end up as screenshot diffs.

Shojiku draws from a layout tree; the same input produces the same bytes,
and CI gates every bundled example by byte comparison.

## Programmatic PDF libraries (ReportLab, prawn, the FPDF family)

Drawing with coordinates and an API. They can draw anything, but the layout
becomes code — not a file a designer, a PM, or an AI agent can read. There
is no field catalog; only code review protects the wiring between data and
page.

A Shojiku template is declarative YAML, and `definitions.yml` validates the
wiring: a reference to an undeclared key stops with a diagnostic code before
anything renders.

## pdfme

A good tool with the same template + data instinct, including a browser
designer. The difference is the center of gravity: pdfme is JSON templates +
TypeScript, at home in Node and the browser. Shojiku's engine is
locale-agnostic Rust; the CLI, Docker, seven SDKs, browser WASM and the MCP
server all emit identical bytes, and the paper culture the engine grew up in
— vertical writing, manuscript grids, wareki dates, locale packs — is built
in as layers. Signing and verification are engine operations too.

## Typst / LaTeX

In a different league as typesetting languages. For prose-led documents —
papers, books — go there. Business forms, where the data leads and a frame
must not move a single point, are a different problem, and Shojiku only does
that one.

## Choosing

- Document resembles a web page, CSS assets exist → WeasyPrint / Prince
- Full control in code, one language → ReportLab / prawn
- Prose-led typesetting → Typst
- Business documents, in files both humans and AI can edit, byte-identical
  everywhere, verified at the end → Shojiku
