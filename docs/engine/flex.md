# Flex layout (`box.type: flex`, the default)

A container box (and a `repeat` cell / `repeat_flow` card) lays out its
children **flex-like by default** — the layout-mode key lives on the box
(`box.type`; unset behaves the same as `flex`).

## Syntax

```yaml
- type: container
  box: { h: 120, direction: row, gap: 10,
         alignItems: center, justifyContent: space_between }
  items:
    - type: image
      box: { w: 36, h: 36 }
      src: logo.svg
    - type: text          # no w: takes the leftover width
      text: "{issuer.name}"
```

## Keys (on the container's `box`)

| Key | Values | Default | Description |
| --- | --- | --- | --- |
| `direction` | `column` \| `row` | `column` | Main axis. `column` stacks; `row` sets children side by side. |
| `gap` | [Length](length.md) | 0 | Main-axis gap between flex children (`%` of the main-axis content size; negative = 0). Absolutely placed children ignore it. |
| `alignItems` | `stretch` \| `start` \| `center` \| `end` \| `baseline` | `stretch` | Cross-axis alignment. `stretch` is the existing fill behavior for an unset cross size (fill width in a column); in a row it does not resize children yet (v1: behaves like `start`). `baseline` aligns row children on their **first text baseline** — a child with no text (a mark, rect, image, or clipped box) synthesizes its baseline from its bottom edge, so a `checkbox` bottom sits exactly on its label's baseline (the natural look for label + mark rows; `center` centers *line boxes*, which reads as skew when the font carries large below-baseline space). In a column it behaves like `start` (the CSS fallback); cross-axis auto margins win over any alignment. |
| `justifyContent` | `start` \| `center` \| `end` \| `space_between` \| `space_around` \| `space_evenly` | `start` | Main-axis distribution of free space when the container's main size is definite (an auto-height column has none, so it is inert there). Negative free space degrades the CSS way (`space_*` act like `start`). |

Keys are camelCase, values snake_case — like every wire enum.

## Child key (on a flex item's own `box`)

| Key | Values | Default | Description |
| --- | --- | --- | --- |
| `flexGrow` | number ≥ 0 | 1 | The child's share when a `row` splits leftover main-axis width among children **without** an authored `w` (CSS `flex-grow`). `flexGrow: 2` next to `flexGrow: 1` takes ⅔ of the leftover. Default 1 = the equal split (unchanged prior behavior). |

Unlike the container keys above, `flexGrow` is a **child** property, so it
is valid on a leaf box (a `text`/`image` without `w` grows). It is inert
on a child with an authored `w`, in a `column`, and under `grid` (cells
are track-sized). Column grow is a follow-up.

## Participation rule

A child that authors **neither `box.x` nor `box.y`** is a flex item; a
child with either keeps absolute placement (the escape hatch every
pre-flex template already uses, so existing templates are unchanged).
Paint order stays document order.

## Behavior

- **Main axis**: flex items place in document order with `gap` between
  them. In a `row`, children with an authored `w` keep it; children
  without **split the leftover width by their `flexGrow` weight**
  (default 1 = an equal split; intrinsic content width is a follow-up).
  A negative / non-finite `flexGrow` warns (`invalid_flex_grow`) and
  contributes 0; if every unsized child weighs 0 the split falls back to
  equal so the row is never silently empty.
- **Auto margins beat alignment and justification** (CSS order): on the
  main axis they absorb all free space before `justifyContent`; on the
  cross axis they override `alignItems`. In a row, unsized children
  consume the free space first, so auto margins and `justifyContent`
  only act when every child has a width.
- **The flow body** is the column-flex special case with pagination;
  flow items additionally honor **horizontal** auto margins
  (`margin: { left: auto }` right-aligns a fixed-width flow item).
  Vertical auto margins never act in a flow. Bands and the absolute body
  are untouched (absolute placement).
- **v1 deviations**: `%` margins of an *unsized row child* resolve
  against its share, not the container width; row cross `stretch` does
  not resize. Both are deliberate v1 simplifications, not bugs.

## Diagnostics

| Code | Meaning |
| --- | --- |
| `layout_key_on_leaf` | flex keys on a leaf item's box (nothing to lay out) |
| `invalid_flex_grow` | `flexGrow` is negative / non-finite; degraded to 0 |

Capability keys: `box.flex`, `box.flexGrow`.

## See also

- [grid.md](grid.md) — the explicit track-based mode
- [box.md](box.md) — auto margins, participation via `x`/`y`
- [container.md](container.md) — the item that hosts flex children

## Overflow

A row whose fixed widths + gaps exceed the parent content box warns
`horizontal_overflow` (unsized children shrink their shares instead and
never warn). A parent with `overflow: hidden` clips by intent and stays
silent. Definite-width flow items reaching past the flow region's right
edge warn the same code.

Individual children are checked too, against the box they were placed
in: a **column** child or an `x`/`y`-positioned (absolute) child whose
border box plus right margin passes its parent's content box warns
`child_overflow`, and the diagnostic names the CHILD (`items[i]`), not
the container. A ROW
child is deliberately not re-checked here — the row-level check above
already speaks for it, and both firing would report one overflow twice.

The message states **how much** a child overflows by, never which side
it spills off: cross-axis alignment is applied after the check, and an
over-wide child under `alignItems: center` puts half the excess past the
LEFT edge, under `end` all of it. Only the amount is invariant. (Auto
margins absorb nothing when space is already short, so they never move
an overflowing child.)
