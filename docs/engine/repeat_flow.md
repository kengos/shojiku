---
reference:
  group: item
  keys: [repeat_flow]
  summary: "One auto-height card per array element, in normal flow — a vertical card list."
---

# `type: repeat_flow` — flow repeat (card list)

A `repeat_flow` lays **one auto-height card per element** of a `data`
array in normal flow — a vertical card list. Where [`repeat`](repeat.md)
is the rigid n-up sheet (fixed grid slots, whole pages at a time — even
`breakBefore: auto` only lets the grid START at the cursor),
`repeat_flow` is the flowing counterpart: cards start at the cursor,
stack with `gap`, and
paginate card-by-card. Flow-body only. Unknown keys are parse errors.

## Syntax

```yaml
- type: repeat_flow
  data: { key: cards }        # array → one card per element, in order
  gap: 8                      # Length between cards; % of region height
  item:                       # a container: the per-element card
    box: { padding: 8 }
    style: { backgroundColor: "#f7f7f7" }
    items:
      - type: text
        data: { key: title }  # resolves against the bound element
      - type: text
        text: "{summary}"
```

## Keys

<!-- rf:table:start repeat_flow#keys (generated — edit the catalog or reference/tables.yml, then `make reference:generate`) -->
| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `data` | `{ key }` | required | The array params key. |
| `gap` | [Length](length.md) | 0 | Between cards; negative clamps to 0, out-of-range drops with `length_out_of_range`. |
| `item` | container | required | The per-element card, a [`container`](container.md): auto height by default (`box.h` fixes it), horizontal auto margins work, its `style`/`styleNames` cascade to children, and its decoration paints per instance. |
<!-- rf:table:end -->

## Behavior

- **Data scope**: identical to `repeat` cells — every `data:` / `{key}`
  inside the card resolves against the bound element; `validate` checks
  card bindings against the array property's row schema.
- **Pagination = keep-together**: a card is an atom; one that doesn't
  fit moves whole to the next page (no mid-card split), so keep-together
  is inherent — there is no `keepTogether` key. A card taller than the
  region warns `section_overflow` and overflows. Bounded by the 500-page
  cap; the element loop stops once the cap truncates output.
- **v1 in-card boundaries** (same as `repeat` cells):
  `table`/`page_number`/nested repeats warn and skip. `image` works —
  static `src:` shared, `data:` element-scoped (see [image.md](image.md)).
- **Card bindings are element-scoped**, with the same
  [`scope: document`](data-binding.md#scope--the-escape-back-to-the-document)
  escape a `repeat` cell takes for a value that belongs to the whole
  document rather than the card. A `{key}` interpolation reaches that
  escape by declaring the name under
  [`bindings:`](data-binding.md#named-binding-declarations).
- An empty array places nothing. A card-item `id:` yields one box-index
  placement per element.
- The `repeat_flow` item itself yields one box-index fragment **per page**
  it spans (border == content, at the flow region's x/width): cards sharing
  a page merge into one span, the inter-card gap absorbed. The fragment
  carries the item's `path` and its authored `id:`. An empty array (or
  truncation before the first card) leaves the path with zero placements —
  a box-index consumer must tolerate that.

## Limitations

- Flow bodies only (`repeat_flow_in_absolute_body`, `repeat_flow_in_band`,
  `repeat_flow_in_container`).
- One card per row. There is no grid — a fixed n-up sheet is
  [`repeat`](repeat.md).
- The per-element sub-template is `item:`, not `cell:`; writing `cell:` is a
  parse error (`parse_error`).
- `table` is unsupported inside a card (`table_in_cell`).
- A single card taller than the flow region overflows rather than splitting
  (`section_overflow`).

## Diagnostics

| Code | Meaning |
| --- | --- |
| `repeat_flow_in_absolute_body` / `repeat_flow_in_band` / `repeat_flow_in_container` | outside a flow body; skipped |
| `missing_data` / `not_an_array` | array source problems |
| `section_overflow` | a single card taller than the flow region |

Capability key: `repeat_flow`.

## See also

- [repeat.md](repeat.md) — the rigid n-up counterpart
- [table.md](table.md) — columnar data instead of free-form cards
