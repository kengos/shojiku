# `type: rect`

A rectangle: a pure decoration box painted by the unified
[`Style`](style.md) — the same `backgroundColor` / `borderWidth` /
`borderColor` / `borderStyle` / `opacity` keys every other item uses,
including named styles via `styleNames`. `rect` has no content, so
`padding` and all text-level style keys are ignored (inert keys on the
inline style warn `shape_style_ignored`); it needs explicit `w`/`h`.

**Nothing draws unless a style layer authors it**: a bare `rect` is
invisible (there is no implicit default stroke). Author `borderWidth`
for an outline, `backgroundColor` for a fill.

## Syntax

```yaml
- type: rect
  box: { x: 0, y: 0, w: 200, h: 40 }   # w/h required (rect_missing_size)
  styleNames: [panel]                   # named styles, like any item
  style:
    borderWidth: { bottom: 2 }   # scalar or per-side map, pt; unset = none
    borderColor: "#333333"       # scalar or per-side; unset side = black
    borderStyle: double          # solid (default) | double | dashed | dotted
    borderRadius: 6              # rounds the corners (uniform borders only)
    backgroundColor: "#f7f7f7"   # fill, default none
    opacity: 0.5                 # 0..=1 paint alpha, default 1 (opaque)
```

## Keys

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `box` | map | required | Position and size ([box.md](box.md)); margins work, padding is ignored. |
| `styleNames` | list | — | Named styles from the `styles:` registry, layered below the inline `style`. |
| `style.*` | [Style](style.md) decoration subset | — | `backgroundColor`, `borderWidth`, `borderColor`, `borderStyle`, `borderRadius`, `opacity`. A side draws iff its computed width > 0. Text keys are inert and warn `shape_style_ignored`. |

The retired shape-style spelling `fillColor` is a located parse error —
use `backgroundColor`. Engines without the `style.shapes.unified`
capability key expect the old `fillColor` wire instead.

## Diagnostics

| Code | Meaning |
| --- | --- |
| `rect_missing_size` | `box.w`/`box.h` absent |
| `shape_style_ignored` | text/box keys on the inline `style` that have no effect on a rect |
| `invalid_opacity` | out-of-range `opacity`; drawn opaque |
| `invalid_border_width` | non-finite or absurd width; no border |

Capability keys: `rect`, `style.shapes.unified`.

## See also

- [line.md](line.md) — a stroked segment (keeps its own `width`/`color` style)
- [style.md](style.md) — the shared decoration vocabulary
- [form_marks.md](form_marks.md) — `ellipse`/`checkbox` (same Style, 1pt frame default)
