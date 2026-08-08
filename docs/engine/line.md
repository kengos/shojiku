---
reference:
  group: item
  keys: [line]
  shapes: [LineStyle, PointSpec]
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
| `from` / `to` | `{ x, y }` ([`Length`](length.md) each) | required | Endpoints relative to the parent origin (margin box / flow region / container **content** box). `x` resolves against that box's width, `y` against its height; a bare number is pt. A `%` `y` under an auto-height parent has no basis — it warns `percent_of_auto` and drops to 0, like every other vertical `%`. |
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
endpoints — an older engine rejects the string form on `from`/`to`).

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

## See also

- [rect.md](rect.md) — for horizontal rules a thin rect also works
