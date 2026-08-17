---
reference:
  group: item
  keys: [line]
  shapes: [LineStyle, PointSpec, AnchorEdge, AnchorOffset]
  summary: "A stroked segment between two points — no box, its own style shape."
---

# `type: line`

A straight stroked segment between two points. A line has no `box`;
`from`/`to` resolve against the same parent origin as sibling items, and
both axes take a full [`Length`](length.md) — `x` against the placement
box's width, `y` against its height.

That is what makes an **underline under a flex child** expressible:
the child's real width is a share of the row, decided at layout time, so
no pt value can be written down while authoring. Put the line inside the
child and reach its edge with `to: { x: "100%" }`.

Bare numbers are `pt`, so every template written before this is
unchanged — and they serialize back as bare numbers, never as `"0pt"`.

**No `styleNames` and no cascading `style` properties**: `line` is a
stroke primitive with no box, so it keeps its own style shape
(`width`/`color`/`opacity`/`style` only, `deny_unknown_fields`) — the one
shape that did NOT converge onto the unified [`Style`](style.md). Use
`text`/`container`/`rect` items when you need the shared style
vocabulary.

## Syntax

```yaml
- type: line
  from: { x: 0, y: 28 }
  to: { x: "100%", y: 28 }   # the right edge of the box this line sits in
  style:
    width: 0.8            # pt, default 1
    color: "#000000"      # default black
    opacity: 0.5          # 0..=1 paint alpha, default 1 (opaque)
    style: dashed         # solid (default) | dashed | dotted | double
```

### Anchored to another item

An endpoint can name another item's `id:` instead of coordinates, and the
line then runs to wherever that item ends up:

```yaml
- type: line
  from: { x: 0, y: 40 }
  to: { item: total_box, edge: left, offset: { x: -4 } }
```

This is CSS anchor positioning, and it carries CSS's consequences —
stated here rather than left to be discovered:

- **The line becomes absolutely positioned.** It reserves no height
  wherever it is authored, and it **paints after** everything else on its
  page (CSS 2.1 Appendix E paints positioned content above in-flow
  content). A leader line therefore crosses over the content it points
  at, not under it.
- **It is drawn on the page its TARGET landed on**, not on the page the
  surrounding section happened to be building.
- A **mixed** endpoint pair — one coordinate, one anchor — resolves the
  coordinate half against the **page margin box**, the same rule an
  absolutely-placed line already follows.
- `edge` is OPTIONAL here, defaulting to `center`. CSS makes
  `<anchor-side>` mandatory because `anchor()` answers a one-axis inset
  question; a line endpoint is a point — both axes at once — so there is
  no axis to make the side mandatory for.

An endpoint is one arm or the other, never a mix: `{ x: 0, item: total }`
is a parse error naming both keys.

A dashed cut-here guide is one item:

```yaml
- type: line
  from: { x: 0, y: 4 }
  to: { x: 515, y: 4 }
  style: { width: 0.8, color: "#adb5bd", style: dashed }
```

## Keys

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `from` / `to` | `{ x, y }` ([`Length`](length.md) each) **or** `{ item, edge?, offset? }` | required | Endpoints relative to the parent origin (margin box / flow region / container **content** box). `x` resolves against that box's width, `y` against its height; a bare number is pt. A `%` `y` under an auto-height parent has no basis — it warns `percent_of_auto` and drops to 0, like every other vertical `%`. |
| `from.item` / `to.item` | string (another item's `id:`) | — | Anchors this endpoint to that item's placement. Makes the whole line absolutely positioned; see above. No item with that id warns `anchor_unknown_target` and nothing is drawn. |
| `from.edge` / `to.edge` | `top` \| `right` \| `bottom` \| `left` \| `center` | `center` | Which point of the target's border box to land on — the `<anchor-side>` subset CSS Anchor Positioning Level 1 defines. |
| `from.offset` / `to.offset` | `{ x, y }` (pt numbers) | `{ x: 0, y: 0 }` | Shifts the resolved point. Either axis may be omitted. |
| `style.width` | number (pt) | `1` | Stroke width. Capped 0..=1000 pt — it shares `borderWidth`'s bound, since both reach the renderers' stroke math directly. A negative, non-finite, or over-cap width warns `invalid_line_width` and strokes at the 1 pt default (unlike `borderWidth`, whose `0` legitimately means "no border", a `line` that strokes nothing draws nothing). An authored `0` passes through undiagnosed. |
| `style.color` | `#rrggbb` | black | Stroke color. |
| `style.opacity` | number `0..=1` | `1` | Paint alpha for the stroke. Out-of-range warns `invalid_opacity` and draws opaque. |
| `style.style` | `solid` \| `dashed` \| `dotted` \| `double` | `solid` | Stroke pattern, sharing the border wire's keyword set ([style.md](style.md)). `dashed` paints three widths on and three off, `dotted` one and one. `double` draws two parallel lines a third of the width each, offset either side of the authored geometry along its normal — so a diagonal doubles correctly. Advertised as the `line.style` capability. |

Unknown keys in `style:` are parse errors — `borderWidth` on a `line`
is a typo pointing at `width`, not a silent no-op.

In a flow, a line participates like any other item (its reserved height
is the segment's vertical extent, floored at 0 — endpoints above the
origin reserve nothing rather than pulling the flow cursor back over
what is already placed); inside containers the endpoints are relative to
the container's content box, so `padding` insets them.

## Underlining a flex child

A line is never a flex item itself — it has no box to size — so it
always takes the absolute path and resolves against its parent. Nest it
in the child you want to underline:

```yaml
- type: container
  box: { direction: row, gap: 12 }   # each field is an equal share
  items:
    - type: container                # ← the field; width decided at layout
      box: { h: 28, padding: { left: 2 } }
      items:
        - { type: text, data: { key: name } }
        - type: line
          from: { x: 0, y: 24 }
          to: { x: "100%", y: 24 }   # ← spans the field, whatever it is
          style: { width: 0.6 }
```

In the `inspect` box index a line reports its **endpoint bounding box**
(content == border; zero-thickness when axis-aligned — the stroke inks
`width/2` beyond it, and hit-test tolerance is the overlay's job).

Capability keys: `line`, `line.style`, `line.length` (the `Length`
endpoints — an older engine rejects the string form on `from`/`to`),
`line.anchor` (the `{ item, edge?, offset? }` endpoint arm).

## Limitations

- A `line` has no `box`: no margin, no padding, no min/max, and it never
  participates in flex or grid. It always resolves against its parent's
  content box.
- Its `style` is its OWN shape — `width`, `color`, `style`, `opacity` — not
  the full style property set.
- A width that is negative or non-finite falls back to 1 pt
  (`invalid_line_width`).
- `double` becomes two parallel strokes offset along the segment's normal;
  there is no other multi-stroke form, and a zero-length line stays one
  stroke.
- In a band or an absolute body, endpoints past the sheet warn
  (`sheet_overflow`).
- An anchored endpoint resolves to the **first** placement of that id on
  the page; a second placement of the same id there warns
  (`anchor_ambiguous_target`). Two anchored endpoints whose targets land
  on different pages draw nothing (`anchor_cross_page`).
- Ids are not checked for uniqueness, and a line anchored to its own `id:`
  resolves to nothing (`anchor_unknown_target`) — an anchored item is
  never itself an anchor target, because the index is built from the
  pages as laid out.
- There is no drag-to-attach on the canvas yet: the Designer edits the
  anchor as fields, not by dropping an endpoint onto a target.

## See also

- [rect.md](rect.md) — for horizontal rules a thin rect also works
