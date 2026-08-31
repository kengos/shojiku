---
reference:
  group: item
  keys: [container]
  shapes: [ContainerItem]
  summary: "An origin and a resolved size: children position, resolve `%`, and inherit against it."
---

# `type: container`

A container establishes an origin and a resolved size: children position
relative to it, resolve `%` against it, and receive its inherited style
properties. Containers nest up to `MAX_CONTAINER_DEPTH` (32).

## Syntax

```yaml
- type: container
  id: amount_box
  box: { x: "10%", w: "80%", h: 56, padding: 6 }
  style: { borderWidth: 1.2, fontSize: 11 }   # decoration + cascade
  items:
    - type: text
      box: { x: 0, y: 14, w: "100%", h: 28 }
      text: "{amount.total_in_tax}−"
```

<!-- rf:table:start container#syntax (generated — edit the catalog or reference/tables.yml, then `make reference:generate`) -->
| Key | Type | Description |
| --- | --- | --- |
| `box` | map | `w` omitted defaults to the parent width minus the x offset; `h` omitted = **auto height** (the lowest child bottom edge). Layout-mode keys (`type`/`direction`/`gap`/`alignItems`/`justifyContent`, grid tracks) select how children place — see [flex.md](flex.md) / [grid.md](grid.md). |
| `style` / `styleNames` | | Decoration paints the container's own border box; the **inherited** properties cascade to all descendants ([style.md](style.md)). |
| `items` | array | Children. Each child with no authored `box.x`/`box.y` is a flex/grid item; one with either is absolutely placed within the container. |
<!-- rf:table:end -->

## Behavior

- **Auto height** grows to the lowest child bottom edge plus vertical
  padding. A `%` length that needs the height of an auto-height
  container cannot resolve — it drops with `percent_of_auto`.
- In a **flow**, containers behave like any other stacked item: `box.y`
  is ignored, an explicit `h` reserves exactly `h`. Taller content warns
  `container_overflow` and overflows visually — unless the container
  opts into `overflow: hidden`, which clips children to the border box
  and suppresses the warning.
- **Not allowed inside containers**: `page_number` (band-only),
  `repeat` / `repeat_flow` (flow constructs), and `page_break` — all
  warn and skip. A `table` child IS allowed: it renders as one
  **bounded** block (no pagination — the pagination keys warn
  `table_pagination_key_ignored`; see [table.md](table.md)), which is
  how two tables sit side by side in a `direction: row` container.
- Containers keep **atom-unit page breaking** in a flow: a container
  that doesn't fit moves whole to the next page (no fragmentation).

## Limitations

- Nesting is capped at 32; a deeper subtree is skipped
  (`container_depth_exceeded`).
- The flow-only items do not work inside a container: `repeat`
  (`repeat_in_container`), `repeat_flow` (`repeat_flow_in_container`) and
  `page_break` (`page_break_in_container`) are skipped, and `page_number` is
  band-only (`page_number_in_container`).
- Content taller than a definite `h` warns (`container_overflow`) unless
  `overflow: hidden` suppresses it — the content is not clipped by default.
- `%` against an auto-height container is dropped (`percent_of_auto`).

## Diagnostics

| Code | Meaning |
| --- | --- |
| `container_overflow` | content taller than a definite-`h` content box; suppressed by `overflow: hidden` |
| `container_depth_exceeded` | nesting > 32; subtree skipped (error) |
| `percent_of_auto` | `%` of an auto-height container's height |
| `page_number_in_container` / `repeat_in_container` / `repeat_flow_in_container` / `page_break_in_container` | unsupported child; skipped (a `table` child IS supported — rendered as one bounded block) |

Capability key: `container`.

## See also

- [box.md](box.md) — the geometry keys
- [flex.md](flex.md) / [grid.md](grid.md) — child placement
- [repeat.md](repeat.md) / [repeat_flow.md](repeat_flow.md) — data-driven container reuse (cells/cards are containers)
