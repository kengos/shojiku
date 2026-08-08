---
reference:
  group: root
  order: 5
  keys: [styles]
  shapes: [Style, BorderColor, BorderStyle, BorderStyleKind, BorderWidth, FontStyle, FontWeight, HangingPunctuation, LineBreak, Overflow, TextAlign, TextCombineUpright, TextDecoration, TextOrientation, TextOverflow, TextSpacingTrim, VerticalAlign]
  summary: "Every appearance property and the three-surface cascade that resolves them per item."
---

# `style` — appearance properties & the cascade

Appearance is a CSS-style property bag: every property is optional, and
**unset means inherit** (for inherited properties) or the engine default.
Styles come from three authoring surfaces, resolved per item in
precedence order (low → high):

```text
engine default ← inherited ancestor ← named styles in listed order ← inline style
```

- **Inline**: `style: { fontSize: 12 }` on the item.
- **Named styles**: the template-level `styles:` registry; items
  reference entries with `styleNames: [a, b]` (later wins, layered below
  the inline style). Caps: 256 registry entries (`MAX_STYLES`), 16 names
  per item (`MAX_STYLE_NAMES`); an unknown name warns
  `undefined_style_name`.
- **Inherited**: a `container` (and `repeat` cell / `repeat_flow` card)
  cascades its resolved *inherited* properties to descendants.

Unknown property keys are parse errors (`deny_unknown_fields`).

## Inheritance is a separate axis from positioning

Positioning resolves by **containment** (a child's `%` and origin
compute against its parent box); style resolves by **inheritance** (an
unset property takes the nearest ancestor's value). These axes are
independent — a container never passes its position down, and style
never participates in geometry. See
[layout-model.md](layout-model.md).

## Property reference

| Property | Type / values | Engine default | Inherited | Description |
| --- | --- | --- | --- | --- |
| `fontSize` | number (pt) or length string | `10` | yes | Strings take `pt`/`mm`/`cm`/`in`, `em`/`%` (of the *inherited* size — nested relative sizes multiply), or `rem` (of the engine default). Non-positive/non-finite computed values fall back with `invalid_font_size`; computed sizes over 1000 pt fall back with `font_size_out_of_range` (the cap pairs with `lineHeight`'s so the tallest admitted line box is the ±1,000,000 pt resolved-length cap). |
| `fontFamily` | string (face id from the lang pack) | pack default face | yes | Valid ids and the default: [fonts.md](fonts.md) (default `biz-udp-gothic`; also `biz-ud-gothic`, `ipamj-mincho`). |
| `fontWeight` | `normal` \| `bold` | `normal` | yes | `bold` selects the family's real bold face when it ships one (the `biz-*-gothic` families do); otherwise it renders as synthetic emboldening (glyphs stroked in the text color, advances unchanged — CSS faux bold). |
| `fontStyle` | `normal` \| `italic` | `normal` | yes | Synthetic baseline-anchored skew (~12°), advances unchanged. |
| `letterSpacing` | number (pt, negative allowed) or length string | `0` | yes | Strings take `pt`/`mm`/`cm`/`in` or `em`/`rem` (`em` = the item's own computed fontSize); `%` is a parse error (CSS letter-spacing has none). Added to every character advance; measurement, wrapping, alignment, and drawing share the one policy. Magnitude capped at ±1000 pt (`invalid_letter_spacing` → 0). |
| `lineHeight` | number (multiplier of fontSize) | `1.4` | yes | Non-positive/non-finite falls back with `invalid_line_height`; multipliers over 1000 fall back with `line_height_out_of_range`. |
| `color` | `#rrggbb` string | black | yes | Text color. |
| `textAlign` | `left` \| `center` \| `right` | `left` | yes | On a vertical (`vertical_rl`) block the keyword names the line's end along the column (`right` = bottom). A `char_grid` honors it too — filling a partly filled line toward its end — but reads it from the ITEM only, never inherited ([char_grid.md](char_grid.md)). |
| `verticalAlign` | `top` \| `middle` \| `bottom` | `top` | no | Vertical alignment within the item's box (needs a definite `h`, or `minHeight` slack). On a vertical (`vertical_rl`) block it maps CSS-logically to the column-stack shift: `top` → right edge, `middle` → centered, `bottom` → left edge ([vertical_text.md](vertical_text.md)). |
| `lineBreak` | `normal` \| `strict` \| `loose` \| `anywhere` | `normal` | yes | CSS `line-break`. `normal`/`strict`/`loose` pick the CJK kinsoku strictness — `strict` also holds small kana/`ー`/`〜゠` off a line start, `loose` frees centered punctuation (`・：；！？`) and inseparables (`‥…`); `anywhere` breaks between any two characters with no kinsoku. Per-mode sets and migration: [text.md](text.md). |
| `textSpacingTrim` | `space_all` \| `normal` \| `trim_start` | `space_all` | yes | Half-width punctuation (CSS `text-spacing-trim` subset). `space_all` (the default) trims nothing — output is unchanged. `normal` trims the internal space between two adjacent fullwidth punctuation glyphs (e.g. `」「`, `、」`) to half-width; `trim_start` also trims a fullwidth opening bracket at a line head (a column head on a vertical block — [vertical_text.md](vertical_text.md)). Engine-synthesized after shaping (works on every face, not font-feature dependent). A v1 subset — see [text.md](text.md). |
| `hangingPunctuation` | `none` \| `allow_end` \| `force_end` | `none` | yes | Hanging punctuation (CSS `hanging-punctuation` subset). A line-terminating comma / full stop (`、。，．`) hangs past the end edge. `allow_end` hangs one that would otherwise wrap (keeping the line count down); `force_end` also excludes a *fitting* trailing comma from the alignment width so it hangs into the margin under center/right alignment. Plain text blocks in v1 (vertical columns hang on both the plain and `spans` paths — [vertical_text.md](vertical_text.md)). See [text.md](text.md). |
| `backgroundColor` | `#rrggbb` string | none | no | Filled rectangle covering the border box, under the content. Honored on text-drawing items, `container`, `repeat` cells, `image`, and `qr_code` boxes. |
| `borderWidth` | number (pt) \| `{ top/right/bottom/left }` map | `0` (no border) | no | Border stroke over the border box, drawn iff a side's computed width > 0. The bare number is all four sides; the map is per side (unset side = 0; negative widths are parse errors). Does not change geometry (each side draws centered on the box edge). Capped 0..=1000 pt (`invalid_border_width`). On a `table` the map form draws the outer frame only ([table.md](table.md)). `rect` items use their own style shape instead. |
| `borderColor` | `#rrggbb` string \| per-side map | black | no | Inert while the side's width is 0 — a named style can carry a palette color items opt into with a width. |
| `borderStyle` | `solid` \| `double` \| `dashed` \| `dotted` \| per-side map | `solid` | no | `double` splits the side's width into two lines of a third each (CSS). `dashed` paints three stroke widths on and three off, `dotted` one and one; both intervals are floored at 0.25pt so a hair-thin border cannot explode the dash walk. A uniform border (one width, one colour, and any style except `double`) stays a single stroked rect carrying the pattern; a per-side or `double` border renders as filled bands per side, with each dashed/dotted side stroked as a centred line instead (corners overlap; paint order top/right/bottom/left). |
| `borderRadius` | number (pt) \| length string | `0` (square) | no | Rounds the border box's corners (CSS `border-radius`, single value — no per-corner form). `%` resolves against BOTH axes independently, so `50%` is a circle on a square box and a full ellipse on an oblong one; an absolute radius too large to fit shrinks by ONE uniform factor (CSS overlapping-curves rule), which is what makes a big value a stadium ("pill") rather than an ellipse. Honored on a box whose border is uniform, and on its `backgroundColor` fill. A per-side or `double` border, a `table`, or a form mark warns `border_radius_ignored` and draws square corners; a negative or non-finite value warns `invalid_border_radius`. `overflow: hidden` clips to the rounded box. |
| `textOverflow` | `visible` \| `shrink` \| `ellipsis` \| `clip` | `visible` | no | What text does when it exceeds a **definite `box.h`** (auto-height boxes grow instead). On a vertical block the overflow axis is the box **width**, and a direct-flow `visible` overflow paginates by columns ([vertical_text.md](vertical_text.md)). See [text.md](text.md). |
| `overflow` | `visible` \| `hidden` | `visible` | no | What a container-like box (`container`, `repeat` cell, `repeat_flow` card) does with children outside its border box. `hidden` clips children to the border box (decoration stays outside — it *is* the box) and suppresses `container_overflow`; an auto-height box still clips horizontally. Inert on other items (text uses `textOverflow: clip`). |
| `textDecoration` | `none` \| `underline` \| `line_through` | `none` | no | Decoration line on text (also `list` entries and table cells via the column style). Position/thickness come from the font's own metrics (post/OS2 tables, conventional fallback), drawn in the text color, sized to each line's measured width; follows `shrink` (computed at the final size) and pagination. On a vertical block it draws a SIDE band per column — underline right of the em cell (the JLREQ side-line convention), line-through on the column axis ([vertical_text.md](vertical_text.md)). Not inherited (matches CSS; decoration *propagation* is not modeled) — set it on the text item itself. |
| `opacity` | number `0..=1` | `1` | no | Paint alpha for the item's own painting: text glyphs + decoration line, `backgroundColor` fill, and border stroke alike. **Per-item paint alpha, not CSS group compositing** — nested items don't multiply, and a container's opacity does not affect its children. `rect`/`line` items take `opacity` in their own style shapes. Out-of-range warns `invalid_opacity` and draws opaque. QR modules ignore it (scannability). |
| `writingMode` | `horizontal_tb` \| `vertical_rl` | `horizontal_tb` | yes | CSS `writing-mode` subset. `vertical_rl` turns a `type: text` item into a vertical block: characters fill top-to-bottom and columns lay out right-to-left. Honored on every text surface — plain text, rich `spans`, `list`, table text cells, `page_number`; a text `mark:` (the circled-text overlay) is the one warned fallback (`vertical_text_unsupported`). See [vertical_text.md](vertical_text.md). |
| `textOrientation` | `mixed` \| `upright` | `mixed` | yes | CSS `text-orientation` subset; consulted only inside a vertical block. `mixed` keeps CJK/kana upright and rotates Latin/digits 90° clockwise; `upright` keeps every character upright. See [vertical_text.md](vertical_text.md). |
| `textCombineUpright` | `none` \| `{ digits: 2..=4 }` \| `all` | `none` | yes | Tate-chu-yoko (CSS `text-combine-upright` subset): `digits` makes runs of up to N consecutive ASCII digits share one upright cell of a vertical column; `all` combines the whole styled scope (meant for a short span) into one cell. Plain blocks, rich `spans` (per-span override), vertical `list` entries, and vertical [`char_grid`](char_grid.md) cells (digits only). Longer runs stay uncombined; out-of-range `digits` / unknown keywords are parse errors. Inert in horizontal text. See [vertical_text.md](vertical_text.md) § Tate-chu-yoko. |

Colors are `#rrggbb` only; invalid colors warn `invalid_color` (echoes
are snippet-capped — colors are untrusted input).

## Named styles

```yaml
styles:
  heading: { fontSize: 24, textAlign: center, lineHeight: 1.2 }
  framed:  { borderWidth: 0.8, borderColor: "#333333" }

sections:
  body:
    type: flow
    items:
      - type: text
        styleNames: [heading, framed]   # listed order, later wins
        style: { color: "#aa0000" }     # inline overrides named
        text: 領収書
```

Styles are flat — a style cannot reference another — and stay **named**
in the serialized template (round-trip; GUI style picker).

## Box decoration

`backgroundColor` (fill) + `borderWidth`/`borderColor` (stroke) decorate
the resolved border box, under the item's content — for text blocks,
containers, repeat cells/cards, images, and QR codes alike. A uniform
solid border is one filled+stroked rectangle; a per-side or `double`
border renders as edge-centered filled bands per side (see the
`borderWidth`/`borderStyle` rows above), and a dashed/dotted side of such
a border is stroked as a centered line so its gaps survive.
`borderRadius` rounds the whole border box — fill and stroke follow the
same curve, and `overflow: hidden` clips to it.

### Stroke/fill spellings

| Surface | Fill | Stroke width | Stroke color |
| --- | --- | --- | --- |
| every boxed item (`style:`) — text, containers, tables, images, **`rect`**, **`ellipse`/`checkbox`/text `mark`** | `backgroundColor` | `borderWidth` (default 0; marks default 1) | `borderColor` |
| `line` (own style shape — a stroke primitive, not a box) | — | `width` (default 1) | `color` |

The shape items converged onto the unified `Style` (capability
`style.shapes.unified`): `rect` gets per-side borders, `borderStyle`,
and named styles like everything else, and — like everything else —
**draws nothing unless authored** (the old implicit 1pt rect stroke is
gone). Form marks (`ellipse`/`checkbox`/`mark`) keep a 1pt outline
default when no layer authors a width, stroke uniformly (a per-side map
warns `shape_border_sides_ignored`), and warn `shape_style_ignored` for
inert text keys on their inline styles. The retired `fillColor`
spelling is a parse error pointing at `backgroundColor`.

`line`'s style **rejects unknown keys like every other wire struct** —
`borderWidth` on a `line` is a parse error pointing at the typo, not a
silent no-op ([line.md](line.md)).

## Limitations

- Unset means inherit (for inherited properties) or the engine default.
  There is no `initial`/`unset` keyword to reset one.
- The `styles:` registry is capped at 256 (`too_many_styles`) and
  `styleNames` at 16 per item (`too_many_style_names`); an undefined name
  warns and is skipped (`undefined_style_name`).
- Out-of-range values FALL BACK rather than failing the render: a bad or
  oversized font size becomes 10 pt (`invalid_font_size`,
  `font_size_out_of_range`), a line height 1.4 (`invalid_line_height`,
  `line_height_out_of_range`), letter spacing 0 (`invalid_letter_spacing`),
  a border none (`invalid_border_width`), opacity opaque
  (`invalid_opacity`), and a colour the default (`invalid_color`).
- `borderRadius` is one value for all corners, and is refused on a per-side
  or `double` border, on a `table`, and on the form marks
  (`border_radius_ignored`).
- Not a CSS engine: no selectors, no media queries, no pseudo-classes, no
  transitions. `styleNames` and a table's `row.conditionalStyles` are the
  only conditional surfaces.

## Diagnostics

| Code | Meaning |
| --- | --- |
| `undefined_style_name` | `styleNames` references a name not in `styles:` |
| `too_many_styles` / `too_many_style_names` | registry/name-list caps exceeded; extras ignored |
| `shape_style_ignored` | inert (text/box) keys on a shape item's inline style |
| `shape_border_sides_ignored` | per-side `borderWidth` on `ellipse`/`checkbox`/`mark` reduced to the top side |
| `border_radius_ignored` | `borderRadius` on a per-side/`double` border, a `table`, or a form mark; square corners drawn |
| `invalid_border_radius` | a negative or non-finite `borderRadius`; square corners drawn |
| `invalid_font_size` / `invalid_line_height` / `invalid_letter_spacing` / `invalid_border_width` / `invalid_color` / `invalid_opacity` | hostile values; guarded fallback |
| `font_size_out_of_range` / `line_height_out_of_range` | finite but absurd values past the 1000 caps; guarded fallback |

Capability keys: `styles`, `styleNames`, `style.fontWeight`,
`style.fontStyle`, `style.letterSpacing`, `style.lineBreak`,
`style.lineBreak.strict_loose`, `style.textSpacingTrim`,
`style.hangingPunctuation`, `style.backgroundColor`,
`style.backgroundColor.box`, `style.border`,
`style.border.sides`, `style.borderStyle`,
`style.borderStyle.dashed_dotted`, `style.borderRadius`,
`style.textOverflow`,
`style.textOverflow.clip`, `style.overflow`, `style.verticalAlign`,
`style.textDecoration`, `style.opacity`.

## See also

- [text.md](text.md) — text layout, wrapping, overflow policies
- [container.md](container.md) — the cascade carrier
- [rect.md](rect.md) / [line.md](line.md) — their non-cascading style shapes
