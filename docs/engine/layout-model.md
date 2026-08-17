---
reference:
  group: concept
  order: 4
  keys: [layout-model]
  summary: "How a template plus params becomes the resolved layout tree every backend draws."
---

# The layout model

How `shojiku-layout` turns a template + params into the fully resolved
layout tree (`engine/layout/src/tree.rs`) that every render backend
draws. This page carries the cross-cutting model; the authorable surface
is split per feature — see the [reference index](README.md).

## The one invariant

**Everything resolves to absolute pt at layout time.** Containers,
relative offsets and `%` lengths all disappear inside the layout pass;
the `LayoutDocument` handed to `render-pdf` / `render-png` contains only
absolute page coordinates. Renderers never re-measure, re-format, or
re-resolve. (The tree also carries the document's resolved
[metadata](document.md) — interpolated and gated by layout, written by
the PDF backend, ignored by PNG. Not geometry, same rule: the renderer
writes what it is given.) The single exception: `overflow:
hidden` / `textOverflow: clip` emit a rectangular **clip group**
(`kind: clip`) — the one nested tree node — and both backends honor it
(krilla clip path / tiny-skia mask). Renderers still never re-measure;
they only cut at the rect layout resolved. A degenerate clip rect draws
nothing (fail closed), and renderers cap clip nesting at
`MAX_CLIP_DEPTH` (64) against hand-built trees.

## The box tree

```text
Page (margin box = coordinate origin)
  Band (header/footer)      — absolute items, margin box is the parent box
  Body: absolute            — absolute items, margin box is the parent box
  Body: flow                — items stack vertically inside the flow box
    Container               — establishes origin + resolved size
      Container…            — nests (children resolve against it)
```

- **Parent box (`Basis`)**: bands and the absolute body resolve against
  the page **margin box** ([page.md](page.md)); flow items resolve
  against the flow region; container children resolve against the
  container. The flow region's own `box` resolves against the margin
  box; **omitted, the flow occupies the whole margin box**.
- Geometry keys and their semantics: [box.md](box.md). Child placement
  (flex/grid, participation): [flex.md](flex.md) / [grid.md](grid.md).
  Stacking and pagination: [flow.md](flow.md).

## Style cascade — a separate axis from positioning

Positioning resolves by **containment**: a child's `%` and origin are
computed against its parent box (`Basis`). Text **style** resolves by
**inheritance**, the CSS way: an unset property takes its value from the
nearest ancestor that set it. These two axes are deliberately
independent — **a container never passes its position down as
inheritance**, and style never participates in the `Basis` math. The
cascade resolves every property to a concrete `ComputedStyle`
(precedence low→high: engine default ← inherited ← named styles in
listed order ← inline); carried through the walk as engine state, not
through `Basis`. Property table and inheritance flags:
[style.md](style.md).

## Resolve caps (untrusted templates)

Templates are untrusted input; the resolve pass is guarded:

- **Nesting depth** ≤ `MAX_CONTAINER_DEPTH` (32, mirroring the SVG group
  cap): deeper subtrees are skipped with `container_depth_exceeded`
  (validate reports it statically; layout enforces it independently).
- **Resolved size bound**: any resolved length with `|v| > 1_000_000pt`
  (or non-finite) is dropped with `length_out_of_range` and the caller's
  default applies — a chain of >100% values cannot amplify geometry.
- **Unresolvable `%`**: `percent_of_auto`, value dropped (above).
- **Page cap**: 500 pages (`MAX_PAGES`), then `page_overflow` truncates.
- Params never supply geometry: all `x`/`y`/`w`/`h` are template-owned
  (the params ↔ geometry boundary).

Per-construct caps live on their pages: grid tracks
([grid.md](grid.md)), imposition cells ([repeat.md](repeat.md)), list
entries ([list.md](list.md)), QR content ([qr_code.md](qr_code.md)),
style registry ([style.md](style.md)).

## The box index (GUI sidecar)

Alongside the tree, `layout()` returns a **`BoxIndex`**: per page, one
`{ path, id?, border, content }` placement for **every** laid-out item —
id-carrying or not (repeat-cell and card items once per element, band
items once per page, split text once per fragment). A `table`, `repeat`,
or `repeat_flow` item yields one fragment rectangle per page it spans
(none for a page where nothing landed); a table column additionally
yields one placement per cell, header included. Exposed through the
`shojiku inspect`
envelope (`{ engine, document, boxes, margin }`) for Designer overlays;
**not** part of the renderer contract. Capability key:
`inspect.boxes.all_items`.

`path` is the box's stable structural address in the same grammar the
parse/validate diagnostics use, so a GUI correlates canvas geometry back
to a YAML node without its own id injection:

- section base `sections.body` / `sections.header` / `sections.footer`,
- an item at index `i` in a list of items → `…items[i]`, nesting through
  containers/grids (`…items[i].items[j]`),
- a `repeat` cell container `…items[i].cell` and its children
  `…items[i].cell.items[j]`; a `repeat_flow` card `…items[i].item` and
  `…items[i].item.items[j]`,
- a table cell → `…items[i].columns[c]` (one box per column per row, so
  the same path recurs per row/page — the GUI groups by path); a
  `headerGroups` cell → `…items[i].headerGroups[g]` (its own authored
  position, never the leftmost column it spans). The cells layout
  synthesizes — the trailing header region no group covers, the
  all-empty `mergeEmptyCells` collapse — are authored nowhere and emit
  no box: a click there falls through to the table fragment.

`path` is always present and synthesized from structure alone (never from
an authored `id:` or data key). `id` is the item's authored `id:` when it
has one — a lookup alias, omitted from the JSON when absent. The geometry
is identical whether or not an item authors an `id:`. A `line` reports
its endpoint bounding box (zero-thickness when axis-aligned — the stroke
inks `width/2` beyond it; hit-test tolerance is the overlay's job);
`page_break` has no geometry and emits no box, but still consumes its
`items[i]` index.

A **text** item's placement additionally carries per-line **text
metrics**: for each line, `{ x, width, baseline, capTop, emTop, emBottom }`
in page coordinates — the baseline and the cap-height/em bands a GUI or
AI needs to snap overlays (underlines, circle guides, alignment checks) to
real glyph geometry without re-measuring a preview. Capability key:
`inspect.text_metrics`.

## Fonts & text pipeline

Text measurement and drawing share one policy (`FontFace`): wrapping,
kinsoku, `letterSpacing`, and synthetic bold/italic are decided at
layout and recorded on the tree; renderers only execute. Missing glyphs
draw as `.notdef` and warn `missing_glyph` once the fallback chain is
exhausted. Details: [text.md](text.md).

## Phasing

The capability inventory and the reasoning behind each feature live in
[features.md](../engine/features.md).

## Limitations

- The caps are hard: 500 pages (`page_overflow`), 32 levels of container
  nesting (`container_depth_exceeded`), and ±1e6 pt on any resolved length
  (`length_out_of_range`).
- The second-placement pass is budgeted; past it the innermost children keep
  their first placement (`reflow_budget_exhausted`).
- The engine computes GEOMETRY, never data. No sums, no sorting, no
  filtering: what the params carry is what the page shows.
- Renderers never re-measure. Anything a backend would need to decide for
  itself has to be decided here first.
