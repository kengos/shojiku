# Flow — stacking & pagination

A `type: flow` body stacks items top-down with `gap` between them and
paginates when content passes the region bottom. "Auto move up" is
inherent: a short table pulls later items up.

## Syntax

```yaml
sections:
  body:
    type: flow
    box: { x: 0, y: 105, w: "100%", h: 620 }  # omitted = whole margin box
    gap: 16                                    # pt between stacked items
    items:
      - { type: text, text: "…" }
      - { type: table, data: { key: order_items }, columns: [ … ] }
      - { type: page_break }
      - { type: text, text: "next page" }
```

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `box` | map | whole margin box | The region the flow occupies on every page, resolved against the page margin box (`%` works). |
| `gap` | [Length](length.md) | 0 | Vertical gap between stacked items, additive with item margins (no collapse). `%` resolves against the flow-region height (matching `repeat_flow.gap`); negatives clamp to 0. |
| `items` | array | `[]` | Laid out in order. |

## Behavior

- **Stacking**: each item occupies its resolved height at the cursor;
  `box.y` is ignored (`box.x` still offsets horizontally). Fixed-width
  flow items honor **horizontal auto margins**
  (`margin: { left: auto }` right-aligns).
- **Pagination**: an item that doesn't fit moves to the next page as a
  whole — each flow item is an *atom*, the indivisible unit the
  paginator places — with these refinements:
  - **Tables** paginate row by row and repeat headers
    ([table.md](table.md)).
  - **Auto-height flow text** taller than the region splits at line
    boundaries the same way: it fills the space left on the
    current page, then continues line by line, decoration and padding
    cloned onto every fragment. A definite-`h` text never splits — that
    overflow belongs to [`textOverflow`](text.md).
  - **`repeat`** aligns its grid to fresh pages, unless
    `breakBefore: auto` starts it at the cursor (a shorter first page,
    same-size cells — [repeat.md](repeat.md)); **`repeat_flow`**
    paginates card-by-card ([repeat_flow.md](repeat_flow.md)).
- **`type: page_break`** starts the next item on a fresh page; a break
  at the top of an untouched page is a no-op, so consecutive breaks
  collapse and blank pages are never generated
  ([page_break.md](page_break.md)).
- Any other item taller than the flow region warns `section_overflow`
  and draws over; more than 500 pages (`MAX_PAGES`) errors
  `page_overflow` and truncates output.

## Flow-only items

`repeat`, `repeat_flow`, and `page_break` are only valid directly in a
flow body — in bands, absolute bodies, or containers they warn
(`<item>_in_band` / `<item>_in_absolute_body` / `<item>_in_container`)
and are skipped. A `table` is not flow-only: it only *paginates* in the
flow body — in a band, absolute body, or container it renders as one
**bounded** block instead ([table.md](table.md) § Placement with
`box`); the one place a table cannot go is inside a `repeat` /
`repeat_flow` / `cell:` cell (`table_in_cell`).

## Diagnostics

| Code | Meaning |
| --- | --- |
| `section_overflow` | an unsplittable item is taller than the flow region |
| `page_overflow` | layout exceeded 500 pages; output truncated (error) |

## See also

- [layout-model.md](layout-model.md) — the box tree and bases
- [flex.md](flex.md) — the flow body is the paginating column-flex case
