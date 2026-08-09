---
reference:
  group: item
  keys: [ellipse, checkbox]
  summary: "Choice marks drawn as vector paths — circling a printed option, or a checkbox."
---

# `type: ellipse` / `type: checkbox` — form marks

Choice marks for real forms: circling a printed choice, a
checkbox, an application-form option field. Both render as **vector paths**
(never font glyphs, so output never depends on font coverage) and work
in flow, absolute bodies, bands, containers, and `repeat` cells.

The design goal is the **blank↔filled one-template workflow**: the same
template ships with a blank-form params file and a filled-sample one.
A mark's *presence* is content (params-driven), but its *geometry is
template-fixed* — an unmatched mark still reserves its box, so layout
never shifts a single point between the two params sets.

## `ellipse`

A box-inscribed oval. With no `data:` it always draws (decoration — e.g.
an oval circling a heading); with `data:` it draws only when the binding
matches (e.g. circling the chosen payment method on a receipt).

```yaml
# Always-on decoration (no data): a red outline circling a heading.
- { type: ellipse, box: { x: 10, y: 10, w: 60, h: 30 }, style: { borderColor: "#cc0000" } }
```

The style is the unified [`Style`](style.md) decoration subset
(`borderWidth`/`borderColor`/`backgroundColor`/`opacity`, plus named
styles via `styleNames`). Unlike `rect`, a mark whose layers author no
`borderWidth` keeps a **1 pt black outline default** — a mark's visible
geometry is its function, so the blank-form state must print. Marks
stroke one closed path: a per-side `borderWidth` map reduces to the top
side and warns `shape_border_sides_ignored`; text keys on the inline
style warn `shape_style_ignored`.

To circle a **text choice** (the common case), do not hand-place a
standalone `ellipse` over the label — its glyph band sits a couple pt
above the box center, so the oval needs per-font pixel-tuning. Use the
text-anchored [`mark:`](#text-anchored-circle-mark-on-text) below, which
auto-centers on the glyphs.

## Text-anchored circle (`mark:` on text)

A `mark:` on a **text item** overlays an oval that auto-centers on the
item's glyph band and auto-sizes to it — no hand-measured coordinates,
and a font change never invalidates the fit. It is **paint-only**: the
oval never changes the text's reserved box, so a blank↔filled params
pair never shifts layout.

```yaml
# Circle the chosen payment method. Each label is a normal text item; only the
# matching oval draws. No x/y tuning — the oval finds the glyphs.
- { type: text, box: { x: 80,  y: 40, w: 40 }, style: { textAlign: center }, text: 現金,
    mark: { data: { key: payment, equals: cash } } }
- { type: text, box: { x: 132, y: 40, w: 56 }, style: { textAlign: center }, text: カード,
    mark: { data: { key: payment, equals: card } } }   # params: payment: "card"

# Always-on decoration (no data) with a red outline, plus extra clearance.
- { type: text, text: 合計, mark: { padding: 4, style: { borderColor: "#cc0000" } } }
```

- **`data:`** is the same presence binding as a standalone mark (below):
  absent = always draw (decoration); with `equals`/boolean it draws only
  on a match. Omit it for a pure decoration oval.
- **`padding:`** ([Length](length.md)) overrides the clearance between the
  glyph band and the oval. Unset applies an em-proportional default with a
  perceptual **overshoot** baked in (a round shape flush with the caps
  reads smaller than it is), so the oval circles the text without cutting
  it. A negative value clamps so the oval stays positive.
- **`style:`** is the unified [`Style`](style.md) decoration subset
  (`borderWidth`/`borderColor`/`backgroundColor`/`opacity`, +
  `styleNames`), like a standalone ellipse — 1 pt outline default.
- A multi-line label gets one oval spanning all its lines (best for short
  labels).

## `checkbox`

The **frame** (a stroked box) is chrome and always draws; the **check
mark** is content, drawn when static `checked: true` is set or `data:`
matches. An empty box is the blank-form state.

```yaml
- { type: checkbox, box: { x: 40, y: 100, w: 10, h: 10 }, data: { key: agree } }        # bound to a boolean
- { type: checkbox, box: { x: 40, y: 116, w: 10, h: 10 }, data: { key: status, equals: "2" } }
- { type: checkbox, box: { x: 40, y: 132, w: 10, h: 10 }, checked: true }               # static
- { type: checkbox, box: { x: 40, y: 148, w: 10, h: 10 } }                              # always-empty chrome
```

`checked` and `data:` are mutually exclusive; if both are set `data:`
wins and validation warns `mark_content_conflict`. The check mark is
stroked in the frame's `borderColor` (default black).

For a checkbox beside a text label, put the pair in a flex row with
`alignItems: baseline` ([flex.md](flex.md)) — the frame's bottom edge
sits on the label's baseline. **Omit `box.w`/`box.h`** and the frame
defaults to the inherited font's **cap-height square** (≈ 0.8em), which
is the size that reads as matched to the label; baseline alignment puts
any excess height *above* the caps, so an oversized frame floats high.

```yaml
- type: container
  box: { direction: row, gap: 6, alignItems: baseline }
  items:
    - { type: checkbox, data: { key: agree } }        # auto cap-height square
    - { type: text, text: "利用規約に同意する", style: { fontSize: 11 } }
```

An explicit `box.w`/`box.h` still wins when you want a specific size; a
present `box:` with only `x`/`y` (placement, no size) also auto-sizes.

## Binding presence: `data: { key, equals }`

> The same predicate is available on **every** item type as
> [`visible:`](visible.md) — this section describes the mark's own `data:`
> key, and `visible:` reuses its grammar and its truth table unchanged. Use
> `data:` to decide whether a MARK is drawn; use `visible:` to decide whether
> any item is shown at all.

`key` reads a params value (scoped to the enclosing `repeat` element, else
top-level params; `data: { key, scope: document }` is the
[escape](data-binding.md#scope--the-escape-back-to-the-document) for a
page-global flag that should tick the mark in every cell). Then:

- **`equals` set** — the mark draws when the value **equals** it. The
  comparison is **type-strict**: `equals: "2"` (string) never matches the
  number `2`, and vice-versa. A type mismatch warns
  `mark_equals_type_mismatch` (it usually means the wrong literal was
  authored — e.g. `equals: 0` vs a DB string `"0"`). Numbers compare
  exactly by representation, so an integer `2` and a float `2.0` are
  different values — match the form your system emits. Feed a DB enum
  code straight through: `status: "shipped"` + `equals: "shipped"`.
- **`equals` set, value is an array** — **multi-select**: the mark draws
  when the array *contains* the value. One field drives a whole group:

  ```yaml
  # params: causes: ["1", "3"]  →  boxes 1 and 3 check, box 2 does not.
  - { type: checkbox, box: {...}, data: { key: causes, equals: "1" } }
  - { type: checkbox, box: {...}, data: { key: causes, equals: "2" } }
  - { type: checkbox, box: {...}, data: { key: causes, equals: "3" } }
  ```

- **`equals` omitted** — the value is read as a **boolean**; the mark
  draws when it is `true`. A non-boolean warns `mark_value_not_bool`
  (layout) / `mark_binding_not_boolean` (validation, needs a `boolean`
  field in [definitions](definitions.md)).

The same `{ key, equals? }` predicate — and the same truth table —
selects a table row's conditional style
([table.md](table.md#conditional-row-styles)); there it reads a key
relative to the row element and carries its own diagnostic codes.

`equals` accepts a string, number, or boolean scalar; a map or sequence is
a parse error. A **missing** params value draws nothing, silently — a
blank form simply omits the key.

## Sizing

`box.w`/`box.h` take any [Length](length.md) — pt, `%`, mm/cm/in, or
`em`/`rem` (`w: 1rem` sizes the mark to the document text). A **checkbox**
may omit them (or its whole `box:`) to default to the inherited font's
cap-height square; that default is the metric size and ignores
`minWidth`/`maxWidth`/`minHeight`/`maxHeight` (set an explicit `box.w`/
`box.h` if you need a bounded size). A standalone **ellipse** still
requires a size — an absent or non-positive one warns `mark_missing_size`
and skips. A text-anchored `mark:` never takes a size (it auto-fits the
glyphs).

## Limitations

- An `ellipse` needs a positive `box.w`/`box.h`; only a `checkbox` may omit
  them and auto-size (`mark_missing_size`).
- Per-side `borderWidth` is reduced to the top side
  (`shape_border_sides_ignored`), and a radius is refused
  (`border_radius_ignored`).
- Text and box style keys are inert on a mark (`shape_style_ignored`).
- An `equals`-less binding must target a boolean
  (`mark_binding_not_boolean`, `mark_value_not_bool`). With `equals`, the
  literal must sit inside the field's declared enum
  (`mark_equals_not_declared`) and match the value's type
  (`mark_equals_type_mismatch`).
- Two shapes only. There is no radio, no cross, no tick-style key.

## Diagnostics

| Code | Severity | Meaning |
| --- | --- | --- |
| `mark_missing_size` | warning | `box.w`/`box.h` absent or non-positive; skipped |
| `mark_content_conflict` | warning | checkbox sets both `checked` and `data` (`data` wins) |
| `mark_equals_type_mismatch` | warning | value type differs from `equals`; not drawn. With definitions, the DECLARED type is checked the same way at validate |
| `mark_equals_not_declared` | warning | the `equals` literal is outside the field's declared `enum` — a mark that can never be drawn |
| `mark_value_not_bool` | warning | `equals`-less binding value is not a boolean; not drawn |
| `mark_binding_not_boolean` | warning | (validation) an `equals`-less binding targets a non-boolean field |
| `unknown_data_key` | error | (validation) the binding key is not in definitions |
| `shape_style_ignored` | warning | (validation) text/box keys on a mark's inline `style` have no effect |
| `shape_border_sides_ignored` | warning | a per-side `borderWidth` map on a mark reduced to the top side |

Capability keys: `ellipse`, `checkbox`, `text.mark`,
`checkbox.auto_size`, `inspect.text_metrics`, `style.shapes.unified`.

## See also

- [rect.md](rect.md) — the shape style ellipse/checkbox share
- [definitions.md](definitions.md) — the `boolean` field type for checkbox bindings
- [data-binding.md](data-binding.md) — how `key` resolves against params and cells
- [visible.md](visible.md) — the same presence predicate on any item, with the reserve-box / `collapse:` choice
