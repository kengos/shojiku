---
reference:
  group: item
  keys: [repeat]
  shapes: [GridSpec, GridDirection, BreakBefore]
  summary: "Imposition / n-up: N data-scoped copies of one cell laid onto each page."
---

# `type: repeat` — imposition / n-up

A `repeat` lays **N instances of a `cell`** onto each page, one per
element of a `data` array — e.g. four gift receipts on an A4 sheet. Each
cell is **data-scoped to its element**, so the cell template is authored
once (no per-instance field renaming). Flow-body only.

## Syntax

```yaml
- type: repeat
  data: { key: receipts }     # array → one cell per element, in order
  breakBefore: auto           # page (default) | auto — start at the cursor
  cutMarks: true              # trim guides outside the grid
  grid:
    columns: 2                # cells across; columns × rows = cells/page
    rows: 2                   # cells down (2×2 = 4-up)
    direction: row            # fill order: row (default) | column
    gap: 15                   # both axes (CSS shorthand)
    columnGap: 15             # Length, resolves against the region width
    rowGap: 15                # Length, resolves against the region height
  cell:                       # a container: fills its grid slot by default
    box: { padding: 8 }
    style: { borderWidth: 0.6 }
    items:
      - type: text
        data: { key: code }   # resolves against the bound element
      - type: text
        data: { key: store_name, scope: document }   # page-global value
      - type: qr_code
        box: { w: 60, h: 60 }
        data: { key: url }
```

## Keys

<!-- rf:table:start repeat#keys (generated — edit the catalog or reference/tables.yml, then `make reference:generate`) -->
| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `data` | `{ key }` | required | The array params key. |
| `breakBefore` | `page` \| `auto` | `page` | `page` aligns the grid to a fresh page. `auto` starts it at the flow cursor, so a title above the grid costs rows instead of a whole page — see [Behavior](#behavior). |
| `grid.columns` / `grid.rows` | integer ≥ 1 | `1` / `1` | Cells across/down per page. `columns × rows` clamps to `MAX_IMPOSITION_PER_PAGE` (64) with `imposition_grid_clamped`. |
| `grid.direction` | `row` \| `column` | `row` | `row` fills left-to-right then wraps down; `column` top-to-bottom then wraps right. |
| `grid.gap` | [Length](length.md) | 0 | Both axes at once (the CSS shorthand, as on a [`box.type: grid`](grid.md) container). An axis key below wins over it. |
| `grid.columnGap` / `grid.rowGap` | [Length](length.md) | `gap` | Slot width = `(region_w − columnGap·(columns−1)) / columns`; height likewise. `%` resolves against the region width / height respectively. Negative gaps are 0 (CSS). |
| `cutMarks` | boolean | `false` | Draw trim guides for the grid — see [Behavior](#behavior). |
| `cell` | container | required | A [`container`](container.md) whose parent box is the slot. It **fills the slot by default** (definite height), so `%` and `verticalAlign` resolve against the slot; an explicit `cell.box` insets/resizes within it. |
<!-- rf:table:end -->

## Behavior

- **Data scope**: inside a cell, every `data:` binding and every `{key}`
  interpolation resolves against the **bound array element** (like a
  table row). A value that belongs to the whole document rather than the
  element — a store name, a pickup date — takes the explicit escape
  `data: { key: …, scope: document }`. A bare `{key}` has no scope slot,
  so a mixed line declares the name it wants to escape under
  [`bindings:`](data-binding.md#named-binding-declarations).
  See [data-binding.md](data-binding.md#scopes).
- **Cut marks** (`cutMarks: true`): short ticks just outside the grid's
  bounding box at every cut position — the grid's outer edges plus the
  centre of each interior gap (a gapless grid marks the shared cell
  edge). Two ticks per cut, one at each end, reaching **outward** so no
  ink lands on a cell; they extend into the page margin
  ([bleed/crop-mark territory](page.md)) and are clamped to the sheet.
  Every page the grid occupies is marked with that page's own row count,
  and the FULL grid is marked even on a partly filled last page (the
  sheet is cut into the same pieces either way). A side of the sheet with
  no room outside the grid draws nothing there and warns
  `cut_marks_clipped`. The ticks are chrome: they carry no `id` and never
  appear in the box index.
- **Pagination**: cells fill the grid; when a page's grid is full the
  next cell starts a fresh page's grid. By default (`breakBefore: page`)
  a `repeat` aligns its grid to the region top on every page, so if the
  current page already has content it breaks to a fresh page first.
  Content **after** a `repeat` always starts on a new page, opt-in or
  not — the grid consumes the region. (For cursor-flowing cards, use
  [`repeat_flow`](repeat_flow.md).)
- **`breakBefore: auto`** starts the grid at the flow cursor instead, so
  a heading above it no longer costs a page. Only the FIRST page's row
  count shrinks — to however many whole rows fit under the cursor — and
  every page after it is a full grid at the region top. **Cell geometry
  never changes**: slots are always derived from the full region, since
  an imposed sheet gets physically cut. If not even one row fits under
  the cursor, the grid falls back to a fresh page (silently: `auto`
  means "start here if it fits"). On an untouched page `auto` and the
  default are identical.
- **Scope boundary (v1)**: `table` and `page_number` inside a cell are
  unsupported — they warn and skip. `qr_code` works (encoded at layout
  time, no asset pipeline), and so does `image`: a static `src:` is one
  shared asset, a `data:` binding loads one asset per element
  (element-scoped, capped) — see [image.md](image.md).
- A cell-item `id:` yields one box-index placement per element.
- The `repeat` item itself yields one box-index fragment **per page** it
  fills (border == content, at the flow region's x/width, spanning that
  page's grid top down to the deepest slot placed on it — so a partly
  filled last page gets a shorter fragment, and a `breakBefore: auto`
  first page starts at the cursor). The fragment carries the
  item's `path` and its authored `id:`. Nothing lands in the array
  (empty/missing data, or truncation before the first cell) means no
  fragment for that path — a box-index consumer must tolerate a path with
  zero placements.

## Limitations

- Flow bodies only (`repeat_in_absolute_body`, `repeat_in_band`,
  `repeat_in_container`).
- 64 cells per page maximum; a larger grid (or a zero axis) is clamped
  (`imposition_grid_clamped`).
- A cell is a FIXED grid slot: it does not grow with its content. A card that
  should size to its own text is [`repeat_flow`](repeat_flow.md).
- `table` and `page_number` are unsupported inside a cell (`table_in_cell`,
  `page_number_in_container`).
- `cutMarks` with no room outside the grid omit those ticks
  (`cut_marks_clipped`).
- Per-element cell images share the 1000-load cap
  (`cell_image_assets_capped`).

## Diagnostics

| Code | Meaning |
| --- | --- |
| `repeat_in_absolute_body` / `repeat_in_band` / `repeat_in_container` | `repeat` outside a flow body; skipped |
| `imposition_grid_clamped` | grid over the cells/page cap (or a zero axis); clamped |
| `cut_marks_clipped` | a sheet side has no room outside the grid; those ticks are omitted |
| `cell_image_assets_capped` | per-element cell images over the shared load cap; the rest are skipped |
| `missing_data` / `not_an_array` | array source problems |

Capability keys: `repeat`, `repeat.breakBefore` (the `breakBefore` key —
older engines parse-reject it), `repeat.grid.gap`, `repeat.cutMarks`,
`binding.scope` (the `scope: document` escape), `repeat.boxes` (the
per-page fragments).
Examples: `examples/business/event-tickets-ja`, `examples/business/shipping-labels-ja`, `examples/dev/layout-showcase`
(the imposition section demos `breakBefore: auto`).

## See also

- [repeat_flow.md](repeat_flow.md) — the flowing card-list counterpart
- [grid.md](grid.md) — the *static* grid (fixed children, no data)
