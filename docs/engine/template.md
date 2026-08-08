---
reference:
  group: root
  order: 1
  keys: [template]
  shapes: [Template, Version, Sections, Band, Repeat, Body, BoxSpec, Item]
  summary: "The file's own shape: top-level keys, the header/body/footer sections, and what every item shares."
---

# Template file structure

A template (`templates.yml`, YAML or JSON) describes one document: the
page geometry, an optional named-style registry, and the sections whose
items produce content. Parsing rejects non-finite numbers (`.nan`/`.inf`)
anywhere in the document.

## Syntax

```yaml
version: 0.1.0            # optional, informational
name: receipt_ja          # optional, informational

document:                 # what the PDF says it IS → document.md
  title: 領収書 {order.code}
  language: ja-JP

page:                     # page size / orientation / margin → page.md
  size: A4
  margin: 25

styles:                   # named-style registry (CSS classes) → style.md
  heading: { fontSize: 24, textAlign: center }

sections:
  header:                 # optional band, repeats per page
    repeat: every_page    # every_page | first_page | except_first_page | last_page
    height: 100           # pt, informational (items use absolute coords)
    items: [ ... ]
  body:                   # required: exactly one body
    type: flow            # flow | absolute
    box: { x: 0, y: 105, w: "100%", h: 620 }   # flow only; omitted = whole margin box
    gap: 16               # flow only: pt between stacked items
    items: [ ... ]
  footer:                 # optional band, same shape as header
    repeat: every_page
    items: [ ... ]
```

## Top-level keys

| Key | Type | Required | Description |
| --- | --- | --- | --- |
| `version` | number or string | no | Author-owned version marker; the engine does not interpret it. `version: 1`, `1.5`, and `"2.0"` all parse and round-trip in the authored form (capability key `template.version.scalar`). |
| `name` | string | no | Template name. |
| `document` | map | no | Document metadata written into the PDF's `/Info` dictionary and XMP: `title`, `description`, `keywords`, `language`, `authors`. Each value interpolates like static text. PDF only — PNG previews carry no metadata. See [document.md](document.md). |
| `page` | map | no | Page size, orientation, and margin. Defaults: A4 portrait, 25pt margin. See [page.md](page.md). |
| `styles` | map of name → style | no | Named-style registry; items reference entries via `styleNames`. Max `MAX_STYLES` (256) entries. See [style.md](style.md). |
| `defaults` | map | no | Document presentation defaults: `style` (the cascade root; the rem root follows it) + `formats` (per-type format defaults). See [defaults.md](defaults.md). |
| `formats` | map of name → format | no | Named format registry (date/datetime patterns), referenced via `format:`. Max 256 entries. See [defaults.md](defaults.md). |
| `sections` | map | yes | `header` / `body` / `footer`. Only `body` is required. |

## Sections

**Bands** (`header` / `footer`) hold absolutely positioned items repeated
on pages selected by `repeat` (default `every_page`). Coordinates resolve
against the page margin box. `page_number` items are only valid here.

**Body** is either:

- `type: flow` — items stack top-down with `gap` between them and
  paginate; the region `box` resolves against the margin box and may be
  omitted (= the whole margin box). See [flow.md](flow.md).
- `type: absolute` — items place at their authored coordinates on page 1
  (no pagination); the margin box is the parent box.

## Items

Every entry in an `items:` array is a map with a `type:` discriminator.
See the [item-type table in the reference index](README.md#item-types).
Common keys shared by (almost) all items:

| Key | Type | Description |
| --- | --- | --- |
| `type` | string | Required discriminator (`text`, `rect`, …). |
| `id` | string | Optional stable id. Every item gets per-page resolved rectangles in the `inspect` box index (GUI overlays), addressed by structural `path`; an `id` adds a stable lookup alias on top. |
| `box` | map | Geometry: position, size, margin/padding, min/max, layout mode. See [box.md](box.md). |
| `style` | map | Inline appearance properties. See [style.md](style.md). |
| `styleNames` | array of string | Named styles from `styles:`, applied in listed order (later wins), below `style`. Max 16 per item. |
| `link` | `{ url }` | Hyperlink → PDF annotation; text/image items (and rich spans) only. See [link.md](link.md). |

Exceptions: `line` has `from`/`to` points instead of `box` and its own
`style` shape; `rect` uses its own `style` shape ([rect.md](rect.md));
`page_break` takes only `id`.

## Round-trip fidelity

The wire format is designed so a parsed template serializes back to what
the author wrote: optional keys are omitted (never injected as defaults),
authored length units are preserved (`80mm` stays `80mm`), and named
styles stay named. Unknown keys anywhere in the template — every wire
struct rejects them — are parse **errors**, not silent no-ops: a typo
cannot mean "unset".

## Limitations

- Unknown keys anywhere are parse ERRORS, not silent no-ops (`parse_error`):
  a typo cannot mean "unset", in any wire struct.
- `.nan`, `.inf` and overflowing numbers are refused anywhere in the document
  (`non_finite_number`).
- One `body`, and `header`/`footer` are the only bands. There is no third
  section and no per-page section switch.
- `version` is author-owned: the engine records it and interprets nothing.
- There is no include/import. A template is one file.

## See also

- [README.md](README.md) — the reference index
- [layout-model.md](layout-model.md) — how items resolve to absolute pt
- [data-binding.md](data-binding.md) — `data:` bindings and `{key}` interpolation
