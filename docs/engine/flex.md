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
| `alignItems` | `stretch` \| `start` \| `center` \| `end` \| `baseline` | `stretch` | Cross-axis alignment. `stretch` fills an unset cross size: a child with no `w` fills a `column`'s width, and a child with no `h` **is resized to** a `row`'s cross size — the row's own height when it has one, otherwise its tallest child's (CSS Flexbox §9.4). A cross-axis `auto` margin opts a child out, since an `auto` margin beats alignment everywhere else here too. `baseline` aligns row children on their **first text baseline** — a child with no text (a mark, rect, image, or clipped box) synthesizes its baseline from its bottom edge, so a `checkbox` bottom sits exactly on its label's baseline (the natural look for label + mark rows; `center` centers *line boxes*, which reads as skew when the font carries large below-baseline space). In a column it behaves like `start` (the CSS fallback); cross-axis auto margins win over any alignment. |
| `justifyContent` | `start` \| `center` \| `end` \| `space_between` \| `space_around` \| `space_evenly` | `start` | Main-axis distribution of free space when the container's main size is definite (an auto-height column has none, so it is inert there). Negative free space degrades the CSS way (`space_*` act like `start`). |

Keys are camelCase, values snake_case — like every wire enum.

## Child key (on a flex item's own `box`)

| Key | Values | Default | Description |
| --- | --- | --- | --- |
| `flexGrow` | number ≥ 0 | 0 | The child's share of the **leftover** main-axis size, among children without an authored size on that axis (CSS `flex-grow`). `flexGrow: 2` next to `flexGrow: 1` takes ⅔ of what is left after every child's basis. The default is CSS's: nothing grows unless asked. |
| `flexBasis` | `content` \| `0` | `content` | The main size such a child **starts from**, before `flexGrow` shares out the rest (CSS `flex-basis`). `content` is its max-content width — the width at which its text would not wrap. `0` starts it at nothing, so `flexGrow` divides the whole row: that is CSS's `flex: 1`, and it is what this engine used to do unconditionally. A length basis is deliberately not accepted — `w` already sizes a child. |

Unlike the container keys above, these are **child** properties, so they
are valid on a leaf box (a `text` without `w` sizes to its content).
Both are inert on a child with an authored size on the main axis, and
under `grid` (cells are track-sized).

`flexGrow` works on **both axes**, each on its own main axis: in a `row`
it shares out leftover WIDTH, and in a `column` leftover HEIGHT, against
a definite parent height. `flexBasis` is a row key — a column child's
basis is its content height, which the engine measures rather than
letting you name.

**Not every kind has a max-content width.** Where one is undefined the
child keeps a plain share of the row, exactly as `flexBasis: 0` would:

- `rect`, `ellipse`, `image` and `qr_code` **require** an authored
  `w`/`h` and warn without one, so an unsized one never lays out at all —
  there is no case for a basis to size.
- **vertical-writing text** has no width-intrinsic size: its inline axis
  runs downward, so its horizontal extent is a function of the available
  HEIGHT, not of the text.
- **`table`** resolves its column widths as `%` of the region it is
  placed in, so it has no region-free intrinsic width.
- **`list`, `char_grid`** and **rich `spans` text** are measurable in
  principle but resolve their content through the data scope or a
  per-span style chain; they are not measured today.
- A **`container`** measures its own children — side by side in a `row`,
  the widest in a `column`. One with no flex children at all (only
  absolutely placed ones, or only a `line`) measures 0, as CSS says of a
  flex container with nothing in flow.

## Participation rule

A child that authors **neither `box.x` nor `box.y`** is a flex item; a
child with either keeps absolute placement (the escape hatch every
pre-flex template already uses, so existing templates are unchanged).
Paint order stays document order.

## Behavior

- **Main axis**: flex items place in document order with `gap` between
  them. In a `row`, children with an authored `w` keep it; children
  without **start at their content width and then split the leftover by
  their `flexGrow` weight** — CSS's `flex-basis: auto`. Write
  `flexBasis: 0` together with `flexGrow: 1` — CSS's `flex: 1` — for a
  child that starts from nothing and takes an equal share of the whole
  row. That pair is the migration for any template written before the
  `flexGrow` default became 0.
  A negative / non-finite `flexGrow` warns (`invalid_flex_grow`) and
  contributes 0; if every unsized child weighs 0 the split falls back to
  equal so the row is never silently empty.
- **A `column` shares leftover HEIGHT the same way**, when the parent
  height is definite: a child with no `h` starts from its content height
  and takes its `flexGrow` share of what is left. It costs nothing unless
  asked for, since the default is 0. An auto-height column has no
  leftover to share, exactly as CSS says of an indefinite main size.
- **A row that cannot fit shrinks before it overflows.** When the
  children's content is wider than the container they give the excess
  back in proportion to their bases — CSS's `flex-shrink: 1` — so text
  re-wraps rather than running off the edge. `minWidth` floors that (and
  `maxWidth` caps growth): a child pinned at a bound stops flexing and
  its share moves to the others. Only a row that still does not fit
  afterwards warns `flex_row_overflow`.
- **Auto margins beat alignment and justification** (CSS order): on the
  main axis they absorb all free space before `justifyContent`; on the
  cross axis they override `alignItems`. In a row, unsized children
  consume the free space first, so auto margins and `justifyContent`
  only act when every child has a width.
- **The flow body** is the column-flex special case with pagination;
  flow items additionally honor **horizontal** auto margins
  (`margin: { left: auto }` right-aligns a fixed-width flow item).
  Vertical auto margins do nothing there, which is CSS: a block-level
  box in normal flow gives `margin-top: auto` and `margin-bottom: auto` a
  used value of 0 (CSS 2.1 §10.6.3), and they absorb free space only in
  flex and grid. For a block pinned to the bottom of every page, use a
  `footer` band; for one at a fixed offset, an absolute `box.y`. Bands
  and the absolute body are untouched (absolute placement).
- **`%` resolves against the container**, for every flex child. A `%`
  length or `%` margin on an unsized row child means a share of the flex
  container's content width, as in CSS — not of the slot the child
  happened to get, which would make one authored `10%` mean different
  numbers depending on how many siblings there were.
- **Known deviation from CSS**: a `column` grows but never SHRINKS.
  When its children's content heights already exceed a definite parent
  height they keep them, rather than being squeezed in proportion the way
  a row's widths are. Shrinking a width makes text re-wrap and stay
  visible; height has no equivalent, so a column shrink would only clip —
  and `column` is the default `direction`, so it would re-size the
  children of every container ever authored. Deliberate, and the reason
  is the asymmetry rather than the effort.

## Diagnostics

| Code | Meaning |
| --- | --- |
| `layout_key_on_leaf` | flex keys on a leaf item's box (nothing to lay out) |
| `invalid_flex_grow` | `flexGrow` is negative / non-finite; degraded to 0 |
| `reflow_budget_exhausted` | too many nested boxes needing a second placement; the innermost keep their content size |

Capability keys: `box.flex`, `box.flexGrow`, `box.flexBasis`.

## See also

- [grid.md](grid.md) — the explicit track-based mode
- [box.md](box.md) — auto margins, participation via `x`/`y`
- [container.md](container.md) — the item that hosts flex children

## Overflow

A row whose fixed widths + gaps exceed the parent content box warns
`flex_row_overflow` (unsized children shrink their shares instead and
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
