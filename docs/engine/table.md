---
reference:
  group: item
  keys: [table]
  shapes: [Column, ColumnType, RowSpec, RowConditionalStyle, HeaderGroup, TableHeaderSpec, EmptyBehavior]
  summary: "A data-driven table: bound or container columns, spanning headers, conditional rows, row-by-row pagination."
---

# `type: table`

A data-driven table: rows come from an array params key, and each column
either binds a key relative to the row object or hosts a **`cell:`**
sub-template of freely placed items ([Container cells](#container-cells)). In the **flow body** tables
paginate row by row and repeat headers on continuation pages. With the
**`box:`** they can also be placed like any other item — narrowed
and centered in the flow, or dropped into a container / absolute body /
band / grid cell — where they render as **one bounded block** (see
[Placement with `box`](#placement-with-box)). All four table structs
reject unknown keys, and every optional scalar is omitted-when-unset
(round-trip clean; effective defaults below).

## Syntax

```yaml
- type: table
  id: items_table
  data: { key: order_items }        # array property in definitions
  autoPageBreak: true               # default true
  repeatHeader: true                # default true
  keepTogether: false               # default false
  emptyBehavior: collapse           # collapse | reserve
  cellPadding: 4                    # pt, default 4
  styleNames: [table_frame]
  style: { borderWidth: 0.5 }      # scalar: grid stroke + cascade into cells
  # style: { borderWidth: { top: 2, right: 2, bottom: 2, left: 2 } }
  #   the per-side map draws an OUTER FRAME around each page fragment
  #   instead (the inner grid keeps the 0.5pt default); borderColor /
  #   borderStyle sides apply to that frame (double / dashed / dotted
  #   included); borderRadius is refused on a table (a ruled grid cannot
  #   meet a curve) and warns border_radius_ignored
  mergeEmptyCells: false            # true: empty-cell runs merge rightward
  headerGroups:                     # optional spanning row above the labels
    - { label: 期間, span: 2 }
    - { label: 内容, span: 1, style: { fontWeight: bold } }
  header:
    height: 22                      # Length, fixed
    style: { backgroundColor: "#ededed", fontWeight: bold }
  row:
    minHeight: 24                   # Length, default 24pt (auto rows grow)
    # height: 20                    # fixed rows: activates cell textOverflow
    style: { backgroundColor: "#ffffff" }
    alternateStyle: { backgroundColor: "#f7f7f7" }   # zebra: even rows
    conditionalStyles:              # data-driven layers, over the zebra one
      - when: { key: kind, equals: heading }   # row-relative, form-mark form
        style: { textAlign: center }
  columns:
    - { id: name_col, label: 品名, data: { key: name } }
    - label: 数量
      data: { key: quantity }
      width: "15%"                  # Length; omitted = equal leftover share
      style: { textAlign: right }
    - label: 金額
      data: { key: amount, format: currency }
      width: 90
      style: { textAlign: right, textOverflow: ellipsis }
    - { label: QR, data: { key: token }, type: qr_code, width: 60 }
    - { label: 写真, data: { key: photo }, type: image, fit: cover, width: 60 }
    - label: 明細                     # a `cell:` column instead of `data:`
      width: 120
      cell:
        box: { padding: 3, gap: 2 }
        items:
          - { type: text, data: { key: name }, style: { fontWeight: bold } }
          - { type: text, text: "備考: {note}", style: { fontSize: 8 } }
```

## Spanning & non-text cells

- **`headerGroups`** renders one extra row above the column labels (its
  `label` interpolates exactly like a column's); each
  group spans `span` columns (cumulative span clamps to the column
  count, `header_group_span_clamped`; uncovered columns become one
  unlabeled trailing cell). It repeats with the header on every page.
  A group's `style` applies in full: the text properties (`color`,
  `fontWeight`, `fontSize`) and its own `backgroundColor` / border, which
  paint over the group row's band so each group can be tinted
  independently. A group that authors neither keeps the band's default
  fill (`#ededed`, or `header.style.backgroundColor` when set).
- **`mergeEmptyCells: true`**: in a body row, a run of empty text cells
  merges into the next non-empty cell to its right (trailing empties
  extend the last non-empty cell; an all-empty row is one full-width
  cell) — section-heading rows (a rirekisho's education/employment
  headings) read as one wide
  cell with correct rules. Swallowed cells lose their column-`id`
  placement; qr/image/`cell:` columns never merge. Explicit body rowspan/colspan
  stays out of scope (rows are data-driven).
- **`type: qr_code` columns** encode the bound value at layout time (the
  same caps and diagnostics as the `qr_code` item); the code square
  scales to the row height minus the cell padding, centered.
- **`type: image` columns** draw a per-element asset: at prepare time
  every row's bound value (data URI or bundled path) loads under
  `dyn:<array>[<index>].<key>`, gated by the asset policy with the
  **column `id`** as the policy identity and capped at 1000 loads per
  template (`cell_image_assets_capped`). `fit` picks the object-fit
  (default `contain`; `cover`/`none` overflow is clipped). `fit` on a
  non-image column warns `ignored_column_key`.
- Qr/image cells scale to the row height instead of driving it — pair
  them with `row.height` (or let text cells set the height).

## Container cells

A column with **`cell:`** renders a per-row sub-template instead of a
bound value: any items a container may hold (`text` / `rect` / `image` /
`qr_code` / `list` / `char_grid` / form marks / nested `container`s,
flex or `type: grid`), laid out **with the cell's own top-left as the
coordinate origin**. It is the `repeat` cell ([repeat.md](repeat.md)),
in a table column — same `ContainerItem`, same row scoping.

```yaml
- label: 明細
  width: 120
  cell:
    box: { padding: 3 }         # the cell's own inset; `cellPadding` does not apply
    style: { fontSize: 8 }      # cascades to the items below
    items:
      - { type: text, data: { key: name } }        # scoped to THIS row
      - { type: text, text: "残り {days} 日" }      # interpolation too
```

- **`data:` and `cell:` are mutually exclusive**, and a column needs one
  of them (`column_content_conflict` / `column_content_missing`). The
  `data`-only knobs `type:` and `fit:` are conflicts on a `cell:` column.
  When a column authors both anyway, layout draws the `cell` (like `src`
  winning over `data` on an image) so a preview still renders.
- **Bindings are row-scoped**: `data: { key: … }` and `{key}` inside the
  cell read the bound row element, exactly like a table column's own
  binding or a `repeat` cell's — unless the binding authors
  [`scope: document`](data-binding.md#scope--the-escape-back-to-the-document),
  which reads top-level params instead. A bare `{key}` has no scope slot
  of its own; to escape one name inside a mixed line, declare it under
  [`bindings:`](data-binding.md#named-binding-declarations).
  An `image` inside a cell loads one
  asset per row (`dyn:<array>[<index>].<key>`), sharing the per-template
  cell image cap; a document-scoped one loads once (`dyn:<key>`).
- **Row height**: an auto row is as tall as its tallest cell (the cell's
  `box.y` offset, content, padding, and vertical margins). A `%` height
  inside a cell resolves against the row's FINAL height and does not
  drive it. A fixed `row.height` wins, and content past it is the cell's
  own overflow story — `overflow: hidden` on the cell clips it
  ([style.md](style.md)).
- **Coordinate origin**: the cell corner. `cellPadding` insets text / qr
  / image cells only; a container cell uses `cell.box.padding` instead,
  so `box: { x: 3, y: 4 }` on a child always means 3pt/4pt from the
  cell's own edge.
- **Style layering**: the column's `style`/`styleNames` are the cell's
  cascade layer (as they are for a text column); `cell.style` layers on
  top of it, and both reach the items inside.
- **Addressing**: the cell is `…columns[c].cell` in the box index and its
  items `…columns[c].cell.items[j]` — one set per row.
- A `table` inside a cell is not supported (`table_in_cell`; skipped).

## Table keys

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `data` | `{ key }` | required | The array params key; one row per element. |
| `columns` | array | required | See below. |
| `autoPageBreak` | bool | `true` | Rows that don't fit continue on the next page. `false`: overflowing rows warn `row_overflow`. |
| `repeatHeader` | bool | `true` | Redraw the header on continuation pages. |
| `keepTogether` | bool | `false` | A table that would split but fits on one page breaks to a fresh page first; taller-than-a-page tables paginate as usual. |
| `emptyBehavior` | `collapse` \| `reserve` | `collapse` | Empty array: `collapse` hides the table entirely; `reserve` renders the header row only. |
| `cellPadding` | number (pt) | `4` | Inner padding of every cell; negative clamps with `invalid_cell_padding`. |
| `style` / `styleNames` | | | The grid stroke (`borderWidth`, table default **0.5 pt** — `0` removes the grid; `borderColor` default black) + inherited properties cascade into every cell. |

Row keys live under `row:` (`minHeight` / `height` / `style` /
`styleNames` / `alternateStyle` / `alternateStyleNames` /
`conditionalStyles`) — see [Rows & header](#rows--header).

## Columns

| Key | Type | Description |
| --- | --- | --- |
| `label` | string | Header cell text (a `cell:` column's header is still a plain label). **Interpolates `{key}` like static text**, against **top-level** params — header chrome belongs to the document, not to any row — so `label: "{labels.amount}"` lets one template print its headings in whichever language the params carry. A label with no `{…}` resolves to itself. |
| `data` | `{ key, format? }` | Row-relative binding ([data-binding.md](data-binding.md)); `scope: document` reads top-level params instead, so a column can show one document-wide value (a `type: image` column then loads one shared asset rather than one per row). Exclusive with `cell`; one of the two is required. |
| `cell` | container | A per-row sub-template — see [Container cells](#container-cells). Exclusive with `data` / `type` / `fit`. |
| `width` | [Length](length.md) | `%` of the flow region width; physical units work; omitted = an **equal share of the leftover** after the sized columns (all omitted = an even split). Negative → 0 with `invalid_column_width`. |
| `style` / `styleNames` | | Cell styling: `backgroundColor`/border decorate the full cell; `textOverflow` becomes meaningful with fixed row heights. |
| `id` | string | One box-index placement per cell (header included), content box inset by the cell padding. |

## Rows & header

- `row.minHeight` (Length, default 24 pt): auto rows grow from it.
- `row.height` (Length): fixes every body row — activating the
  column-level `textOverflow` policies (`shrink`/`ellipsis`/`clip`).
  Negative → auto with `invalid_row_height`. `%` resolves against the
  region height.
- `row.style`/`styleNames` fill/style body rows;
  `row.alternateStyle`/`alternateStyleNames` overlay **even** rows
  (2nd, 4th, … — the `nth-child(even)` analog) for zebra striping.
- `row.conditionalStyles`: data-driven row layers — see
  [Conditional row styles](#conditional-row-styles).
- `header.height` (Length): fixes the header row.
  `header.style.backgroundColor` replaces the default header fill
  (`#ededed`).
- **Vertical alignment** defaults to `middle` in every table row, and an
  authored `verticalAlign` wins wherever it is written: on a column (for
  its body cells AND its own label), on `header.style` (every label in
  that row), or on a `headerGroups` entry (that group). A label takes its
  column's value over the header's — the precedence `textAlign` already
  follows there. Capability key: `table.header.style.verticalAlign`.

## Conditional row styles

`row.conditionalStyles` styles the rows whose **own data** matches a
predicate — the rirekisho heading-row case, where a heading row must
centre while the rest of the column stays left-aligned. Entries apply in
listed order **after** the base and zebra layers, so a later entry wins
over an earlier one and any of them wins over `alternateStyle`.

```yaml
row:
  alternateStyle: { backgroundColor: "#f6f8fa" }   # zebra first
  conditionalStyles:                                # …then the matches
    - when: { key: kind, equals: heading }          # row-relative key
      styleNames: [banner]                          # optional
      style: { backgroundColor: "#dbe7ff", textAlign: center }
    - when: { key: flagged }                        # no `equals` → boolean
      style: { backgroundColor: "#fff3cd" }
```

- **`when` is the form-mark predicate** ([form_marks.md](form_marks.md)),
  read **relative to the row element** exactly like a column's `data:`:
  `equals` matches a scalar type-strictly (`"2"` never equals `2`) or,
  for an array value, by contains (multi-select); with no `equals` the
  value is read as a boolean and the entry applies when it is `true`.
- A **missing key is silent** — a blank-form params set simply matches
  nothing, and the table renders exactly as it would without the
  entries. A value the predicate cannot act on warns
  (`row_condition_type_mismatch` / `row_condition_value_not_bool`) and
  the layer is not applied.
- The layers behave like `row.style`: **inherited** properties
  (`textAlign`, `color`, `fontWeight`, …) cascade into the row's cells;
  **non-inherited** ones (`backgroundColor`, borders) decorate the row
  band. A column's own `style` still wins for its own cell.
- The **header row is never conditioned** (it is chrome, not a bound
  element), and `mergeEmptyCells` composes: a merged full-width cell
  takes the conditional alignment across the whole row.
- At most **16 entries** per table (`too_many_row_conditions`; extras
  are ignored). Every body row evaluates every entry.

## Placement with `box`

`box` is the same geometry map every item carries (`x`/`y`/`w`/`h`,
`margin`/`padding`, min/max — [box.md](box.md)). It is **geometry only**;
the grid border stays on `style`. Its effect depends on where the table
sits:

- **In the flow body**: `box` narrows the table horizontally — `box.w`
  sets the width, `box.x` offsets it, `auto` left/right margins center
  it. `box.y` and height stay flow-owned (the table still stacks and
  **paginates** as usual). Use it for a narrow centered totals table.
- **Everywhere else** — a container child, an absolute body, a band, or
  a `grid` cell — the table renders as **one bounded block** at its
  `box` and does **not** paginate; `repeatHeader`/`autoPageBreak`/
  `keepTogether` are inert there (validate warns
  `table_pagination_key_ignored`). A block taller than a definite
  `box.h` (or its container) is the parent's overflow story
  (`overflow: hidden` clips — [style.md](style.md)).

This is what lets two variable-row tables sit **side by side** (each in a
`direction: row` container child, or each with its own `box.x`/`box.w`)
— the A3 two-page-spread rirekisho layout. A table inside a cell — a
`repeat`/`repeat_flow` cell or another table's `cell:` column — is not
supported yet (`table_in_cell`; skipped).

```yaml
- type: container            # left / right columns of an A3 spread
  box: { direction: row, gap: 20 }
  items:
    - type: table            # bounded block, no pagination
      data: { key: education }
      columns: [ { label: 年, data: { key: year }, width: 40 }, … ]
    - type: table
      data: { key: licenses }
      columns: [ … ]
```

## Pagination & the box index

In the flow body rows paginate with `autoPageBreak`; headers repeat with
`repeatHeader`. The table yields **one fragment rectangle per page** it
spans in the `inspect` box index (path `…items[i]`); every column yields
one placement per cell (path `…items[i].columns[c]`, header included) —
id-carrying or not; a `cell:` column adds its container
(`…columns[c].cell`) and every item inside it. A `headerGroups` cell is
addressed by its own authored position (`…items[i].headerGroups[g]`,
repeated with the header on every page), never as the leftmost column it
spans — a group click and a column click are different selections. The
cells layout synthesizes (the trailing region no group covers, the
all-empty `mergeEmptyCells` collapse) are authored nowhere and emit no
box, so a click there falls through to the table fragment. A bounded
(`box`-placed) table never paginates, so it
is a single rectangle. An authored `id:` on the table or a column adds a
stable lookup alias on top of the path (a group authors no `id:`).

## Limitations

- Not inside a cell. A `table` in a `repeat` cell, a `repeat_flow` card, or a
  column's `cell:` is skipped (`table_in_cell`).
- No body-cell spanning (colspan). `headerGroups` spans the HEADER only, and
  a span past the column count is clamped (`header_group_span_clamped`); a
  full-width banner row is expressed from the data with
  `row.conditionalStyles` + `mergeEmptyCells`.
- One grid stroke width — there is no thick-outer/thin-inner pair.
- A column takes exactly one of `data`/`cell` (`column_content_conflict`,
  `column_content_missing`), and `fit` on a non-image column is ignored
  (`ignored_column_key`).
- Outside a flow body a table is one BOUNDED block: the pagination keys warn
  and do nothing (`table_pagination_key_ignored`).
- Sized columns wider than the flow width warn (`table_too_wide`), and with
  `autoPageBreak: false` an overflowing row warns (`row_overflow`).
- `row.conditionalStyles` is capped at 16 entries
  (`too_many_row_conditions`).
- `cellPadding` does not inset a container cell — use `cell.box.padding` —
  and a radius is refused on a table (`border_radius_ignored`).

## Diagnostics

A problem inside a CELL names where the cell's content is authored: a
column cell names its column (`…items[i].columns[c]`), so two columns
with the same problem report separately instead of collapsing into one
warning about the table; a `headerGroups` cell names its group
(`…items[i].headerGroups[g]`) — the same address its box carries, so a
diagnostics-row jump lands on the cell to fix. Problems about the
`headerGroups` LIST itself (`header_group_span_clamped`) and the table's
own `data` problems stay on the table item.

| Code | Meaning |
| --- | --- |
| `table_in_cell` | table inside a `repeat`/`repeat_flow` cell or a `cell:` column; skipped |
| `column_content_conflict` | a column authors both `data` and `cell` (or `type`/`fit` beside `cell`); `cell` wins |
| `column_content_missing` | a column authors neither `data` nor `cell`; the cell renders empty |
| `table_pagination_key_ignored` | `repeatHeader`/`autoPageBreak`/`keepTogether` on a bounded (non-flow) table; inert |
| `not_an_array` / `missing_data` | the bound source is not an array / absent |
| `table_too_wide` | sized columns exceed the flow width |
| `row_overflow` | a row overflows with `autoPageBreak: false` |
| `invalid_column_width` / `invalid_row_height` / `invalid_cell_padding` | negative geometry; clamped/auto |
| `header_group_span_clamped` | `headerGroups` spans exceed the columns; clamped/dropped |
| `row_condition_not_boolean` | an `equals`-less `conditionalStyles` entry targets a non-boolean field |
| `row_condition_type_mismatch` | a row value's type differs from the entry's `equals`; layer not applied. With definitions, the DECLARED type is checked the same way at validate |
| `row_condition_equals_not_declared` | the entry's `equals` literal is outside the field's declared `enum` — a layer that can never apply |
| `row_condition_value_not_bool` | a row value is not a boolean under an `equals`-less entry; layer not applied |
| `too_many_row_conditions` | more than 16 `conditionalStyles` entries; the rest are ignored |
| `ignored_column_key` | `fit` on a non-image column; ignored |
| `cell_image_assets_capped` | per-element cell images over the 1000-load cap; rest skipped |
| `missing_asset` / `empty_qr_code_item` / `qr_content_too_long` | non-text cell content problems; the cell stays empty |

Capability keys: `table`, `table.column.width.length`,
`table.row.height`, `table.style`, `table.keepTogether`, `table.boxes`,
`table.headerGroups`, `table.headerGroups.style.fill` (per-group
fills/borders paint), `table.header.style.verticalAlign`,
`table.mergeEmptyCells`, `table.column.type`,
`table.row.conditionalStyles`,
`table.column.cell` (container cells), `table.box` (placement),
`style.border.sides` (the outer-frame form).

## See also

- [repeat_flow.md](repeat_flow.md) — free-form cards instead of columns
- [list.md](list.md) — a bounded per-element list without pagination
