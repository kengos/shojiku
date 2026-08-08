---
reference:
  group: layout
  order: 3
  keys: [grid]
  shapes: [TrackSpec, GridTrack]
  summary: "Explicit column tracks — `fr` weights and `auto` sizing — instead of a flex stack."
---

# Static grid (`box.type: grid`)

An explicit `box.type: grid` on a container (or `repeat` cell /
`repeat_flow` card) tiles its children into **column tracks** instead of
a flex stack. Grid is explicit-only: grid keys without `type: grid` warn
`grid_key_ignored` rather than implying a mode switch.

## Syntax

```yaml
- type: container
  box: { type: grid, columns: ["30%", "70%"], rowGap: 4 }
  items:              # row-major: label, value, label, value, …
    - { type: text, text: "小計" }
    - { type: text, text: "{amount.subtotal}", style: { textAlign: right } }
    - { type: text, text: "合計" }
    - { type: text, text: "{amount.total}", style: { textAlign: right } }
```

## Keys (on the container's `box`)

| Key | Values | Default | Description |
| --- | --- | --- | --- |
| `type` | `grid` | — | Required to activate grid placement. |
| `columns` | count \| list of [Length](length.md)/`fr`/`auto` | 1 column | Column tracks: a **count** (equal split of the content width minus gaps) or a **track list** (`["auto", "1fr", "30%", 50]`, any Length, `fr` weight — see [`fr` weights](#fr-weights) — and/or `auto`, sized to the widest cell placed in the track). |
| `rows` | count \| list of Length/`fr`/`auto` | auto rows | A count needs a definite container height (auto-height degrades to auto rows with a diagnostic); rows beyond an explicit list are implicit — auto, sized by their tallest child. Writing `auto` in the list says exactly that, so `["auto", "1fr"]` reads the way it looks. An `fr` row needs a definite height (auto-height degrades with `grid_fr_no_basis`). |
| `columnGap` / `rowGap` | Length | 0 | Per-axis gaps; the flex `gap` doubles as the both-axes shorthand (specific keys win). Negative gaps are 0. |
| `direction` | `row` \| `column` | `row` | Fill order (CSS `grid-auto-flow` analog): `row` = row-major. |
| `justifyContent` | flex values | `start` | Distributes leftover width across tracks (only meaningful for track lists — counts consume the axis). |
| `alignItems` | flex values | `stretch` | Aligns children within their row (with vertical auto margins). |

Child keys (on a grid child's `box`, like `flexGrow` in flex):

| Key | Values | Default | Description |
| --- | --- | --- | --- |
| `columnSpan` | count ≥ 1 | 1 | How many column tracks the child spans; the cell run is the spanned widths plus the gaps between them. Clamped to the track count (`grid_span_clamped`). |
| `rowSpan` | count ≥ 1 | 1 | How many row tracks the child spans; cells beneath are reserved. Clamped to 64 (`grid_span_clamped`). |

## Behavior

- **Fill order** is document order along `direction`. The participation
  rule is the flex one: authored `box.x`/`box.y` = absolute escape hatch.
- **Spans** consume a rectangle of cells from an occupancy map: each
  child takes the first free run that fits in fill order (a span that
  cannot fit in the row's remaining columns wraps whole). A row-spanning
  child pours any height its spanned rows don't cover into its **last**
  spanned auto row (the v1 distribution); over explicit tracks it warns
  `grid_cell_overflow` instead. Span keys outside a `type: grid` parent
  warn `span_outside_grid` and are inert.
- **Cells**: a child fills its track width (`%` resolves against the
  cell); horizontal auto margins center/push within the cell. A child
  taller than its explicit row track warns `grid_cell_overflow` and
  overflows visually, CSS-like — to clip, author `overflow: hidden` on
  the child container itself. A child *wider* than its column-track run
  warns `grid_column_overflow` (its own code, carrying only numbers —
  `child`/`track`/`span` — so a translating consumer writes its own
  sentence). A definite-width child either fits its track run or spills
  over its neighbour; a child with no authored `w` fills the run and
  never warns. Sizing a track to its content is what `auto` columns are
  for.
- **Caps**: track counts and list lengths clamp to `MAX_GRID_TRACKS`
  (64) per axis with `grid_tracks_clamped`, so hostile counts cannot
  drive allocation.

## `fr` weights

A track in a list may be an **`fr` weight** (`"1fr"`, `"2.5fr"`) instead
of a fixed [Length](length.md). After the fixed tracks and the gaps are
subtracted from the axis, the leftover distributes across the `fr`
tracks in proportion to their weights — the same machinery as flex
`flexGrow`:

```yaml
box: { type: grid, columns: ["1fr", "2fr", 90] }   # 90pt fixed; the
                                                   # rest splits 1:2
```

- `fr` is a **grid-track-only unit** — it is not a `Length`, so `"1fr"`
  anywhere a plain length is expected (box `w`, margins, gaps, column
  widths) is an "invalid length" parse error.
- Weights must be finite and non-negative (parse-rejected otherwise); a
  `0fr` track takes no leftover. When the fixed tracks already fill (or
  overflow) the axis, `fr` tracks collapse to 0. All-zero weights degrade
  to an equal split.
- **Columns** always have a width basis, so column `fr` always resolves.
  **Rows** need a definite container height (like a row *count*); an
  auto-height container degrades `fr` rows to auto with `grid_fr_no_basis`.
- An `fr` row splits the leftover after the fixed rows, the gaps **and
  the auto rows** — mixing `fr` rows with `auto` or implicit content rows
  in one definite-height grid works, and the auto rows are measured
  before the split rather than counting as nothing.
- **Limitation**: a row-SPANNING child does not feed that measurement. A
  span pours its overflow into its LAST spanned row only once the rows it
  covers have sizes, and one of those is the `fr` size being computed —
  genuinely circular, unlike the column case. So an auto row whose extra
  height would have come from a span is measured without it, and the `fr`
  rows take slightly more than they should. Keep row-spanning children
  out of grids that mix `fr` with auto rows, or give those rows fixed
  heights.

## `auto` tracks

A track in a list may also be **`auto`**. An `auto` **column** is as
wide as the widest cell placed in it — its content width, the width at
which that cell's text would not wrap:

```yaml
box: { type: grid, columns: ["auto", "1fr"] }   # label column fits its
                                                # text; the rest follows
```

- Sizing runs **before** the cells are laid out, which is why the grid
  assigns cells first and sizes tracks second. `fr` tracks still take
  whatever is left after the fixed and `auto` ones.
- Only children occupying a **single** column contribute a width. CSS
  spreads a spanning child's demand across the tracks it covers; doing
  that needs the other tracks' sizes, which is the circularity this
  ordering avoids. An `auto` column holding nothing but spanning
  children therefore sizes to 0.
- Content is measured with no container to bound it, so a long unwrapped
  string can ask for more than the whole grid. The `auto` tracks then
  scale down together to what is actually there, and the content wraps
  inside them.
- The measurement is the same one flex `flexBasis: content` uses, so the
  kinds with **no** max-content width are the same — see the list on
  [flex.md](flex.md#child-key-on-a-flex-items-own-box). A cell with an
  authored `w` contributes that width directly.
- `auto` in a **row** list is the implicit auto row (as tall as its
  tallest child), which is what omitting the entry already means. It
  adds no machinery; it is accepted so a mixed list reads plainly.
- Like `fr`, `auto` is **grid-track-only** — `"auto"` where a plain
  length is expected is a parse error, and older engines reject it the
  same way.

## Limitations

- Explicit only: grid keys without `box.type: grid` are ignored
  (`grid_key_ignored`) and never imply the mode.
- 1..=64 tracks per axis (`grid_tracks_clamped`); a `columnSpan`/`rowSpan`
  past the axis is clamped (`grid_span_clamped`).
- `fr` ROW tracks need a definite height. In an auto-height container they
  size as auto rows instead (`grid_fr_no_basis`).
- A child wider than its track run spills over its neighbour
  (`grid_column_overflow`); taller than an EXPLICIT row track it warns
  (`grid_cell_overflow`) — auto rows grow instead.
- Span keys on a child of a non-grid box are inert (`span_outside_grid`).
- No named areas and no auto-placement algorithm: children fill the tracks in
  order.

## Diagnostics

| Code | Meaning |
| --- | --- |
| `grid_tracks_clamped` | `columns`/`rows` outside 1..=64 tracks (or an empty list); clamped |
| `grid_cell_overflow` | child TALLER than its explicit row track; overflows visually |
| `grid_column_overflow` | child WIDER than the column-track run it spans; overflows visually |
| `grid_key_ignored` | grid keys authored without `box.type: grid` |
| `grid_span_clamped` | `columnSpan`/`rowSpan` beyond the axis; clamped |
| `span_outside_grid` | span keys on a child of a non-grid box; ignored |
| `grid_fr_no_basis` | `fr` row tracks in an auto-height container; sized as auto rows |

Capability keys: `box.grid`, `grid.span`, `grid.fr`.

## See also

- [flex.md](flex.md) — the default mode and the shared alignment keys
- [repeat.md](repeat.md) — the *data-driven* grid (one cell per array element)
