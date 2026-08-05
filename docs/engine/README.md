# Shojiku template reference

The complete authorable surface of the Shojiku engine, one page per
feature (MDN-style): what you can write in `templates.yml`, what each
key means, its defaults, and the diagnostics it can produce. This is
the human- and machine-readable source for "what syntax exists" — the
same material the MCP tool surface returns; keep it accurate against
the code (see the curation rules in [../README.md](../README.md)).

Feature availability per engine build is machine-checkable: `shojiku
capabilities` prints the key list, and each page notes its capability
keys. Template authors targeting one engine build can ignore them —
they exist so GUIs/SDKs can gate features across engine versions.

The development-facing companion [features.md](features.md) carries the
implemented-capability inventory and the decision log — *that* a feature
exists and why it is shaped that way; the pages here carry only *how to
author it*.

## A minimal template

```yaml
page: { size: A4, margin: 25 }
sections:
  body:
    type: flow
    items:
      - type: text
        text: "Hello {customer.name}"
```

Full file structure (bands, bodies, styles registry):
[template.md](template.md).

## Rendering a template

```bash
# PDF (the core command)
shojiku render --templates templates.yml --params params.json \
  --definitions definitions.yml --output out.pdf     # --output - writes to stdout

# Static + data checks, diagnostics as JSON (definitions/params optional)
shojiku validate --templates templates.yml --params params.json

# Per-page preview PNGs ({page} is replaced by the 1-based page number)
shojiku preview --templates templates.yml --params params.json \
  --output "page-{page}.png" --scale 2.0            # 2.0 px/pt ≈ 144 dpi

# The resolved layout tree + box index as JSON (GUI/AI surface)
shojiku inspect --templates templates.yml --params params.json

# This build's feature keys (no inputs needed)
shojiku capabilities
```

Useful defaults on `render` / `preview` / `inspect`:

- `--lang <id>` selects the locale (default: the template
  `defaults.locale`, then `ja-JP`); `--locale-dir` / `--font-dir`
  (repeatable) locate the packs,
  adding to `$SHOJIKU_LOCALE_DIR` / `$SHOJIKU_FONT_DIR` then
  `./packs/{locale,fonts}`. See [fonts.md](fonts.md).
- A font pack whose faces are **pinned** (`sha256` + `url:`) but absent is
  downloaded into `$SHOJIKU_CACHE_DIR` before rendering; `--offline`
  refuses instead, and `--font-fetch-allow <host>` trusts an extra
  source. Rendering itself never uses the network. See [fonts.md](fonts.md).
- `--assets-dir` is what image `src:` paths resolve against (default:
  **the template file's directory**). Asset policy:
  `--asset-mode open|bundled-only`, `--allow/deny-dynamic-image <id>`.
- Diagnostics print to stderr; `validate` exits non-zero on errors.

Try the bundled example:

```bash
shojiku render --templates examples/business/receipt-ja/templates.yml \
  --params examples/business/receipt-ja/params.json \
  --definitions examples/business/receipt-ja/definitions.yml --output receipt.pdf
# or via the Docker image (`make docker-build` builds the local
# `shojiku-ci:local` tag; its default command renders exactly this example):
docker run --rm shojiku-ci:local > receipt.pdf
# your own files: mount them and pass normal CLI arguments
docker run --rm -v "$PWD:/work" shojiku-ci:local render \
  --templates /work/templates.yml --params /work/params.json \
  --output /work/out.pdf
```

Getting the binaries in the first place (source build or Docker, plus
MCP-server registration for AI agents) is covered in the
[quickstart](../quickstart.md).

## Item types

Every `items:` entry is a map with a `type:`. Where an item may appear
depends on which part of the page holds it. A page
([template.md](template.md)) is made of optional **bands** — `header`
and `footer`, repeated at the top/bottom of every page — and one
**body** between them, which is either `type: flow` (items stack
top-to-bottom and paginate onto new pages as they run out of room — the
usual choice, [flow.md](flow.md)) or `type: absolute` (every item
pinned at its own `box.x`/`box.y`, single page). The placement column
below uses:

- **F** — in a flow body
- **A** — in an absolute body
- **B** — in a band (header/footer)
- **C** — inside a `container` item, wherever that container sits
- **cell** — inside a `repeat` cell / `repeat_flow` card

| `type:` | What it draws | Allowed placement | Page |
| --- | --- | --- | --- |
| `text` | static / interpolated / bound text; rich `spans:` | F A B C cell | [text.md](text.md) |
| `rect` | rectangle (border/fill) | F A B C cell | [rect.md](rect.md) |
| `line` | stroked segment; `Length` endpoints (`to: { x: "100%" }`) | F A B C cell | [line.md](line.md) |
| `image` | PNG/JPEG/GIF/WebP/SVG asset | F A B C cell | [image.md](image.md) |
| `qr_code` | layout-time vector QR | F A B C cell | [qr_code.md](qr_code.md) |
| `list` | one line per array entry + overflow clamp | F A B C cell | [list.md](list.md) |
| `container` | nestable box: origin, size, style cascade | F A B C cell | [container.md](container.md) |
| `table` | paginating data-driven rows; a column binds a value or hosts a `cell:` sub-template; `box:` narrows it in flow or places it as one bounded block elsewhere | F A B C (not cell) | [table.md](table.md) |
| `repeat` | imposition / n-up grid of data-scoped cells | F only | [repeat.md](repeat.md) |
| `repeat_flow` | flowing card list, one card per element | F only | [repeat_flow.md](repeat_flow.md) |
| `page_break` | start a fresh page | F only | [page_break.md](page_break.md) |
| `char_grid` | manuscript-paper / workbook character cells (+ruby) | F A B C cell | [char_grid.md](char_grid.md) |
| `ellipse` | box-inscribed oval; circled-option mark or decoration | F A B C cell | [form_marks.md](form_marks.md) |
| `checkbox` | always-drawn frame + params-driven check | F A B C cell | [form_marks.md](form_marks.md) |
| `page_number` | `{page} / {pages}` | B only | [page_number.md](page_number.md) |

Disallowed placements warn and skip (never a hard failure) — codes in
[diagnostics.md](diagnostics.md).

## Concepts

| Page | Covers |
| --- | --- |
| [template.md](template.md) | file structure: `page` / `styles` / `defaults` / `formats` / `sections`, bands, bodies, common item keys |
| [defaults.md](defaults.md) | document presentation defaults: root style (rem root), per-type format defaults, the `formats:` registry |
| [page.md](page.md) | page size, orientation, margin; the margin box as coordinate origin |
| [document.md](document.md) | `document:` metadata: title / description / keywords / language / authors → the PDF's document properties (PDF only) |
| [length.md](length.md) | units: pt, `%`, `mm`/`cm`/`in`, `em`/`rem`; round-trip; guards |
| [box.md](box.md) | `box:` geometry — x/y/w/h, margin/padding, minWidth/maxWidth/minHeight/maxHeight |
| [flex.md](flex.md) | default child placement: direction, gap, alignItems, justifyContent, auto margins |
| [grid.md](grid.md) | `box.type: grid` — column/row tracks, fill order |
| [flow.md](flow.md) | stacking, gap, pagination, what splits and what moves whole |
| [style.md](style.md) | every style property, the cascade, named styles, box decoration |
| [text.md](text.md) | wrapping, kinsoku, `textOverflow`, long-text pagination |
| [vertical_text.md](vertical_text.md) | `writingMode: vertical_rl` / `textOrientation` — vertical text (plain, spans, list, table cells, page_number) |
| [link.md](link.md) | `link: { url }` hyperlinks on text/image/spans → PDF annotations |
| [data-binding.md](data-binding.md) | `data:` bindings, `{key:format}` interpolation, `bindings:` named declarations, params, format types |
| [definitions.md](definitions.md) | `definitions.yml`: the OpenAPI-shaped schema (properties/items, `format` hints, constraints, display variants, params validation) |
| [fonts.md](fonts.md) | locales, lang packs, valid `fontFamily` face ids |
| [layout-model.md](layout-model.md) | the resolve invariant, box tree, caps, box index |
| [diagnostics.md](diagnostics.md) | every diagnostic code by stage |

## The `box:` keys at a glance

| Key | Meaning | Page |
| --- | --- | --- |
| `x` `y` | offset from the parent origin (authoring either opts a container child out of flex) | [box.md](box.md) |
| `w` `h` | border-box size; omitted = fill width / auto height | [box.md](box.md) |
| `minWidth` `maxWidth` `minHeight` `maxHeight` | CSS-order size clamps | [box.md](box.md) |
| `margin` | outer spacing; per-side map; `auto` sides | [box.md](box.md) |
| `padding` | inner spacing (non-negative) | [box.md](box.md) |
| `type` | child layout mode: `flex` (default) \| `grid` | [flex.md](flex.md) / [grid.md](grid.md) |
| `direction` `gap` `alignItems` `justifyContent` | flex keys (grid reuses some) | [flex.md](flex.md) |
| `flexGrow` | child's weighted share of leftover row width | [flex.md](flex.md) |
| `columns` `rows` `columnGap` `rowGap` | grid tracks & gaps | [grid.md](grid.md) |
| `columnSpan` `rowSpan` | grid child's track span (≥ 1) | [grid.md](grid.md) |

## Style properties at a glance

Inherited: `fontSize` `fontFamily` `fontWeight` `fontStyle`
`letterSpacing` `lineHeight` `color` `textAlign` `lineBreak`
`textSpacingTrim` `hangingPunctuation` `writingMode` `textOrientation`
`textCombineUpright`.
Not inherited: `verticalAlign` `backgroundColor` `borderWidth`
`borderColor` `borderStyle` `borderRadius` `textOverflow` `overflow`
`textDecoration`
`opacity`.
Full table with defaults and value sets: [style.md](style.md).

## Reading order for new authors

1. [template.md](template.md) — the file skeleton
2. [box.md](box.md) + [length.md](length.md) — placing things
3. [style.md](style.md) + [fonts.md](fonts.md) — making them look right
4. [flow.md](flow.md) + [table.md](table.md) — variable-length content
5. [data-binding.md](data-binding.md) — wiring in params

AI agents authoring a template end-to-end (three files → validate →
preview loop) should also load the step-by-step playbook in
[skills/shojiku-template-author/](../../skills/shojiku-template-author/SKILL.md)
(AI-only — written as instructions to the agent).

Runnable examples live in the **repository source** (`examples/` at the
repo root) — a docs-only distribution (e.g. what an MCP consumer sees)
does not include them; the snippets on each feature page are the
self-contained fallback. Each example directory commits its **rendered
output** (`output.pdf` + `preview-<n>.png`) next to the sources, so you
can see what a template produces without rendering anything;
`make examples` regenerates them all. The set (gallery order and
one-line pitches: README.md § Gallery):
[`examples/business/invoice-ja`](../../examples/business/invoice-ja) (a multi-page A4 invoice:
paginating table with repeating header, pre-computed totals, QR + link;
`params-short.json` renders the single-page variant),
[`examples/business/estimate-ja`](../../examples/business/estimate-ja)
(the invoice's sibling: single-rate one-pager, estimate-terms box, a
negative discount row),
[`examples/business/delivery-note-ja`](../../examples/business/delivery-note-ja)
(a delivery note: `headerGroups` spanning band, data-driven
`row.conditionalStyles`, a receipt-stamp field — partial ↔ complete
delivery as two params files),
[`examples/business/pickup-slip-ja`](../../examples/business/pickup-slip-ja)
(the Thinreports-migration worked example — the
[migration walkthrough](../migration-thinreports.md)'s result, with the
legacy `.tlf` + Ruby host beside it),
[`examples/forms/application-form-ja`](../../examples/forms/application-form-ja)
(an A4 application form: form marks, 〒 entry cells, wareki `placeholder` —
a blank ↔ filled-sample params pair),
[`examples/business/event-tickets-ja`](../../examples/business/event-tickets-ja) (2×4
n-up event tickets with per-element QR; `params-few.json` = one sheet),
[`examples/business/catalog-ja`](../../examples/business/catalog-ja) (a product catalog:
`repeat_flow` variable-height cards, dynamic images, `fit: cover`),
[`examples/business/shipping-labels-ja`](../../examples/business/shipping-labels-ja)
(2×3 n-up shipping labels: 〒 cells, `list` + an overflow-count line, per-order QR),
[`examples/forms/certificate-ja`](../../examples/forms/certificate-ja) (an A4 landscape
certificate: double border, mincho + letter spacing, seal/medal SVGs, wareki),
[`examples/typography/kokugo-print-ja`](../../examples/typography/kokugo-print-ja)
(a kokugo worksheet: kanji practice cells + ruby, a vertical copying grid, answer cells),
[`examples/typography/novel-ja`](../../examples/typography/novel-ja) (a B5 vertical paperback booklet:
ruby-paginating vertical body, strict kinsoku + hanging punctuation, a tate-chu-yoko colophon,
vertical page numbers),
[`examples/business/restaurant-menu-us`](../../examples/business/restaurant-menu-us)
(a US Japanese-restaurant menu: English menu + USD prices with vertical
Japanese accents — `writingMode: vertical_rl` brand column + per-dish
dish names, double border, mincho),
[`examples/business/invoice-en`](../../examples/business/invoice-en) (Letter US-style
invoice: USD cents, plural-aware quantities, Net-30 terms block),
[`examples/forms/certificate-en`](../../examples/forms/certificate-en)
(Letter-landscape certificate: real italics, en-US dates),
[`examples/business/receipt-ja`](../../examples/business/receipt-ja)
(an A4 receipt: containers, `%`, named styles),
[`examples/business/receipt-us`](../../examples/business/receipt-us) (80mm thermal, custom
page size),
[`examples/business/receipt-zh-tw`](../../examples/business/receipt-zh-tw) /
[`examples/business/receipt-zh-cn`](../../examples/business/receipt-zh-cn) (the same
receipt geometry under zh locale packs),
[`examples/business/receipt-hi-in`](../../examples/business/receipt-hi-in) (Devanagari
conjuncts + lakh/crore digit grouping) /
[`examples/business/receipt-fil-ph`](../../examples/business/receipt-fil-ph) (Latin
face + the Philippine peso),
[`examples/typography/genkoyoshi-ja`](../../examples/typography/genkoyoshi-ja) (a B5 vertical
200-cell genkoyoshi: `char_grid` + aozora ruby) and its horizontal twin
[`examples/typography/genkoyoshi-yoko-ja`](../../examples/typography/genkoyoshi-yoko-ja),
[`examples/forms/rirekisho-ja`](../../examples/forms/rirekisho-ja) (an A3 landscape JIS-style
rirekisho: custom page size, 2-column header, full-width tables), and
[`examples/dev/layout-showcase`](../../examples/dev/layout-showcase) — the
component-showcase document (rich spans, hyperlinks, flex/grid,
overflow policies, zebra table, list, QR, SVG gradient, `repeat_flow`,
`repeat` imposition starting in place with trim guides and a
document-scoped cell value (`breakBefore: auto`, `cutMarks`,
`scope: document`), `page_break`),
one labeled section per feature family, each demo
followed by a code panel showing the YAML that produces it. The
showcase is the **visual index** of the engine, Bootstrap-docs style:
its rendered pages show the look and the syntax side by side; open the
feature's reference page for the full key table. It grows with the
engine — every new authorable feature adds a showcase section (demo +
code panel) in the cycle that ships it.
