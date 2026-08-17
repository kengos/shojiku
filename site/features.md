---
title: "Feature list, with a page behind each one"
description: "What Shojiku can make and what it will not do: document kinds, layout, typesetting, fonts, and signing, each with a rendered example behind it."
---

# Features

Shojiku turns a YAML template and a JSON payload into a PDF. This page walks through what the engine actually produces: which documents it handles, and where it stops. Key spellings and defaults live in the [reference](/reference/).

Everything on this page is implemented. The 25 documents in the [gallery](/gallery) are PDFs this engine rendered, and each one ships with its template and data files.

## What it makes

Invoices, estimates, delivery notes, receipts, mailing labels, event tickets, product catalogues, certificates, résumés, restaurant menus, manuscript paper, and a vertically typeset paperback. All of those are in the gallery.

It suits a document with a fixed format and changing data. The same machinery covers one record on one sheet, 22 line items flowing across pages under a repeating header, and six copies imposed on a single sheet.

## Laying out a page

There are four ways to place things: [flow](/reference/flow) stacks them down the page, [flex](/reference/flex) puts them in a row and divides the slack, [grid](/reference/grid) aligns them to rows and columns, and absolute placement pins them to coordinates. One template mixes them freely. An invoice usually flows its body and pins the address block.

Nest with [container](/reference/container) so the children can size themselves in `%` of the parent. When content outgrows the page it breaks automatically; [page_break](/reference/page_break) breaks it where you say instead. Paper is either a name like A4 or Letter, or a real measurement, so an 80 mm receipt roll is a size like any other.

## Tables and repetition

[table](/reference/table) is the line-item element. Row count follows the data, and the header row can repeat at the top of every page the table spills onto. You get column widths, rules, merged cells, and per-row conditional styling: shading only the rows whose status is `partial`, say.

[repeat](/reference/repeat) stamps one shape many times: the 2×3 mailing labels and the 2×4 tickets in the gallery are both this. When each copy has its own height, [repeat_flow](/reference/repeat_flow) flows the boxes instead, which is how the catalogue cards sit at different heights without anyone computing offsets.

## Japanese typesetting

Vertical writing drives the whole layout, including line breaking and pagination. Ruby annotations, line-breaking rules, horizontal-in-vertical numerals, hanging punctuation and letter-spacing control are all present, and the paperback in the gallery is set with them. Manuscript paper has its own element, [char_grid](/reference/char_grid): one character per cell, ruby included.

Japanese era dates are a display choice, not a stored value. The data holds a date; the template decides whether it prints as Reiwa or as a Gregorian year. Postal-code boxes, per-tax-rate breakdowns and circled multiple-choice marks come up often enough in Japanese business forms to have their own elements, so you draw none of them by hand.

## Getting data in

Data fields are declared in a catalogue, [definitions.yml](/reference/definitions). A template may reference only the keys declared there; anything else fails before rendering starts. Types, constraints and sample values live in the catalogue too.

An amount is passed as a number and stored as one; a date stays a date. Grouping, currency symbols and date patterns are applied [at display time](/reference/data-binding). Formatting inherits the way CSS does, so a currency style set once on a parent governs every amount beneath it. Swapping the locale switches the currency, the date order and the font together. Japanese and English are built in; Traditional Chinese, Simplified Chinese, Hindi, Filipino and Thai ship as packs.

## Everything that is not text

There are fifteen element types: text, rect, line, table, page number, image, container, the two repeat forms, QR code, list, page break, character grid, ellipse and checkbox.

[Images](/reference/image) can be PNG, JPEG, GIF, WebP or SVG, with a fit rule against their box (`cover`, `contain`) and an opacity. A [QR code](/reference/qr_code) is generated from its value. A [link](/reference/link) becomes a clickable region in the PDF. Circles and checkboxes have their own element type, [form marks](/reference/form_marks), which is what the application-form example is built from.

## Fonts

Fonts ship as packs: BIZ UD Gothic and Mincho for Japanese, the Noto Sans family, a monospace face, Traditional and Simplified Chinese, Devanagari and Thai. Eight packs, and you can add your own.

The engine never looks at the fonts installed on the machine. That is deliberate: the same template rendered on your laptop and in CI reads the same font bytes, so it produces the same output. When a family cannot be resolved the engine says so as a [diagnostic](/reference/diagnostics) instead of quietly substituting something that looks close.

## Output and verification

Output is PDF, plus PNG for previews. The same input renders byte-for-byte identical PDFs on any machine at any time; even the metadata that would normally carry a timestamp is derived from the input.

Signing and verification are in the same engine. A verification report states what was checked and also what was *not*. A signature whose byte range fails to cover the whole document is reported as tampering even when the signature itself validates. Rendering, signing and verifying make no network calls.

## How you call it, and what it will not do

There is a command-line tool. For AI agents there is an MCP server that validates, previews and reports capabilities. Seven SDKs are published (Ruby, Python, .NET, Java, JavaScript, PHP and Go) and every one of them calls the same engine binary. It compiles to WASM for the browser, which is what runs the [playground](/playground) on this site, and there is a GUI editor, the <a href="/designer/" target="_self">Designer</a>.

The limits are worth stating too. The engine does no arithmetic: totals and tax amounts are computed before you hand them over. Templates carry no scripts, so conditions are expressed as data. System fonts are unavailable. And when a template asks for something the engine cannot do, it reports one of 132 diagnostic codes instead of rendering something plausible.
