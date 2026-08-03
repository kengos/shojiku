# `type: line`

A straight stroked segment between two points. Lines are **pt-only**:
`from`/`to` are bare-number points (no `%`, no `box`), resolved against
the same parent origin as sibling items.

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
  to: { x: 327, y: 28 }
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
| `from` / `to` | `{ x, y }` (pt numbers) | required | Endpoints relative to the parent origin (margin box / container). |
| `style.width` | number (pt) | `1` | Stroke width. Capped 0..=1000 pt — it shares `borderWidth`'s bound, since both reach the renderers' stroke math directly. A negative, non-finite, or over-cap width warns `invalid_line_width` and strokes at the 1 pt default (unlike `borderWidth`, whose `0` legitimately means "no border", a `line` that strokes nothing draws nothing). An authored `0` passes through undiagnosed. |
| `style.color` | `#rrggbb` | black | Stroke color. |
| `style.opacity` | number `0..=1` | `1` | Paint alpha for the stroke. Out-of-range warns `invalid_opacity` and draws opaque. |
| `style.style` | `solid` \| `dashed` \| `dotted` \| `double` | `solid` | Stroke pattern, sharing the border wire's keyword set ([style.md](style.md)). `dashed` paints three widths on and three off, `dotted` one and one. `double` draws two parallel lines a third of the width each, offset either side of the authored geometry along its normal — so a diagonal doubles correctly. Advertised as the `line.style` capability. |

Unknown keys in `style:` are parse errors — `borderWidth` on a `line`
is a typo pointing at `width`, not a silent no-op.

In a flow, a line participates like any other item (its reserved height
is the segment's vertical extent); inside containers the endpoints are
container-relative.

In the `inspect` box index a line reports its **endpoint bounding box**
(content == border; zero-thickness when axis-aligned — the stroke inks
`width/2` beyond it, and hit-test tolerance is the overlay's job).

Capability key: `line`.

## See also

- [rect.md](rect.md) — for horizontal rules a thin rect also works
