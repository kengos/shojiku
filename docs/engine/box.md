# `box` — position, size, spacing, bounds

Every item (except `line` and `page_break`) takes a `box:` map that
places and sizes it. Box sizing is **border-box**: `w`/`h` are the outer
box, `padding` insets the content, `margin` spaces the box within its
parent. Unknown keys are parse errors (`deny_unknown_fields`) — a typo
like `alignItmes:` cannot silently mean "unset".

## Syntax

```yaml
box:
  x: 10                # Length; omitted = 0 (flow items ignore y)
  y: 20
  w: "50%"             # omitted = fill the parent width (minus margins)
  h: 40                # omitted = auto height (content-sized)
  minWidth: 100        # min/max bounds, each a Length
  maxWidth: "80%"
  minHeight: 24
  maxHeight: 200
  margin: 8                          # bare number = all sides
  # margin: { top: 10, left: auto }  # per-side map; margin sides accept auto
  padding: { top: 4, bottom: 4 }     # same forms, no auto, non-negative
  # layout-mode keys (containers / repeat cells / repeat_flow cards only):
  type: flex           # flex | grid (unset behaves like flex)
  direction: row       # flex main axis / grid fill order
  gap: 10              # Length between flex children
  alignItems: center
  justifyContent: space_between
  columns: ["1fr", "2fr"]   # grid tracks: Length or `fr` weight (type: grid only)
  rows: 2
  columnGap: 6
  rowGap: 4
```

## Position & size

| Key | Type | Omitted means | Description |
| --- | --- | --- | --- |
| `x`, `y` | [Length](length.md) | 0 | Offset from the parent box origin. In a **flow**, `y` is ignored (the cursor owns it) and `x` offsets within the flow region. Authoring `x` or `y` on a container child opts it out of flex placement (see [flex.md](flex.md)). |
| `w` | Length | fill parent width minus horizontal margins | `%` resolves against the parent width. |
| `h` | Length | **auto height** — grows to content (lowest child bottom for containers, wrapped text height for text) | `%` resolves against the parent height. A definite `h` activates `textOverflow` policies on text. |

## Min/max bounds

`minWidth` / `maxWidth` / `minHeight` / `maxHeight` clamp the
**border-box** size in **CSS order — min wins over max wins over the
size** (`minWidth: 200, maxWidth: 100` resolves to 200). Width bounds
resolve `%` against the parent width, height bounds against its height
(a `%` height bound against an auto-height parent drops with
`percent_of_auto`, like `h`).

- An authored `w`/`h` is clamped at resolve; a filled (unset) width is
  clamped after the fill; an **auto height** is clamped after the content
  height is known. A `minHeight` taller than the content reserves the
  extra space, which `verticalAlign` then distributes — and which a flow
  text carries across a page split, leading the first fragment and
  trailing the last ([text](text.md) § Pagination of long text); a `maxHeight`
  shorter than the content behaves like a too-short explicit `h` —
  content overflows visually, without a warning (the author set the
  bound).
- A fixed flex-row child's width is clamped in the row pre-pass; an
  *unsized* (flex-share) child's min/max is deferred (needs iterative
  flex resolution).
- The clamped size is what the `inspect` box index reports.

## `margin` — outer spacing

A bare number (all sides) or a per-side map
(`{ top: 10, left: "5%" }`). **The map specifies all four sides: an
unset side is 0**, not some inherited default — `margin: { top: 10 }`
means top 10, everything else 0. Positional shorthand strings
(`"10 20"`) are rejected with a pointer to the map form; unknown keys
are rejected. Only authored keys serialize back.

- **`%` resolves against the parent's *width* for all four sides** (the
  CSS margin/padding rule), so vertical edges stay definite inside
  auto-height containers.
- Margin offsets the box within its parent (`x`/`y` shift by the
  left/top margin) and reserves space around it: flow siblings space
  **additively with `gap` — no margin collapse**; auto heights and
  pagination include margins. A missing `w` fills the parent minus the
  horizontal margins.
- **Negative margins are allowed** (CSS-style overlap), but an atom's
  reserved height clamps at 0 so the flow cursor stays monotonic.
- Margin sides also accept **`auto`** (`margin: { left: auto }`): under
  flex placement (and horizontally for flow items) auto margins absorb
  the free space — `left`+`right` auto centers, a single `auto` pushes to
  the opposite side; elsewhere they resolve to 0. The bare string
  `margin: auto` is rejected (the map form is the one spelling).

## `padding` — inner spacing

Same forms as `margin`, minus `auto`; negative values are rejected at
parse. Padding insets the content without growing the box (border-box):
a container's child basis, a text item's wrap width and
vertical-alignment area, an image's fit box, and `repeat` cells. `rect`
has no content and ignores padding. Auto heights grow by the vertical
padding; an explicit `h` does not (content overflowing the *content box*
warns `container_overflow` / `text_overflow`). Content sizes clamp at 0
when padding exceeds the box.

## Layout-mode keys

Only meaningful on boxes with children (`container`, `repeat` cells,
`repeat_flow` cards): `type` (`flex` | `grid`; unset behaves like flex),
`direction`, `gap`, `alignItems`, `justifyContent`, and the grid track
keys `columns` / `rows` / `columnGap` / `rowGap`. See
[flex.md](flex.md) and [grid.md](grid.md). On a leaf item's box these
keys lay out nothing: `validate` warns `layout_key_on_leaf`; grid keys
without `type: grid` warn `grid_key_ignored`. The child-side keys —
`flexGrow` ([flex.md](flex.md)) and the grid spans `columnSpan` /
`rowSpan` ([grid.md](grid.md)) — are valid on leaves; spans outside a
grid parent warn `span_outside_grid` at layout.

## Diagnostics

| Code | Meaning |
| --- | --- |
| `length_out_of_range` | resolved length exceeds ±1e6 pt; default used |
| `percent_of_auto` | `%` against an auto-height parent; value dropped |
| `layout_key_on_leaf` | flex/grid keys on a non-container box |
| `grid_key_ignored` | grid keys without `box.type: grid` |
| `container_overflow` | content taller than a definite-`h` container's content box |

Horizontal overflow warns wherever a definite width can be compared
against the box that holds it: `horizontal_overflow` for a fixed-width
flex row exceeding its parent and a definite-width flow item past the
region edge, `child_overflow` for a column or `x`/`y`-positioned child
past its parent's content box, and `sheet_overflow` for a band /
absolute-body item past the edge of the **sheet** (see
[diagnostics.md](diagnostics.md)).

The sheet — not the margin box — is the bound for band and absolute-body
items on purpose: reaching into the page margins is a deliberate escape
hatch (a full-bleed background, a rule wider than the text column), so
only ink that leaves the paper is a defect. Items that FILL (no authored
`w`) are bounded by their basis and never warn, and a parent with
`overflow: hidden` clips by intent and stays silent.

Capability keys: `box.margin`, `box.padding`, `box.percent`,
`box.minmax`, `margin.auto`.

## See also

- [length.md](length.md) — the unit forms every key accepts
- [flex.md](flex.md) / [grid.md](grid.md) — child placement modes
- [style.md](style.md) — `overflow: hidden` clipping (a style property, not a box key)
