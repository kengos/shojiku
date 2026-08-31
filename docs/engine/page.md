---
reference:
  group: root
  order: 2
  keys: [page]
  shapes: [PageSpec, PageSize, Orientation, PageMargin]
  summary: "Sheet geometry: paper size, orientation, and the margin box every coordinate resolves against."
---

# `page` — size, orientation, margin

The `page:` block fixes the sheet geometry for every page of the
document. All three keys are optional.

## Syntax

```yaml
page:
  size: A4                          # A3-A5 | B4/B5 (JIS) | Letter/Legal/Tabloid | { w, h }
  # size: { w: 80mm, h: 200mm }     # custom size, absolute units only
  orientation: portrait             # portrait | landscape
  margin: 25                        # bare number: all sides
  # margin: { top: 30, left: "5%" } # per-side map, unset side = 0
  # margin: [25, 20, 25, 20]        # legacy [t, r, b, l] array
```

## Keys

<!-- rf:table:start page#keys (generated — edit the catalog or reference/tables.yml, then `make reference:generate`) -->
| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `size` | named \| `{ w, h }` | `A4` | Named size or custom dimensions. Named presets (capability key `page.size.presets`): ISO A — `A3` 841.89 × 1190.55, `A4` 595.28 × 841.89, `A5` 419.53 × 595.28 pt; **JIS** B (the Japanese B series, not ISO B) — `B4` 728.5 × 1031.81 (257 × 364 mm), `B5` 515.91 × 728.5 (182 × 257 mm); North American — `Letter` 612 × 792, `Legal` 612 × 1008, `Tabloid` 792 × 1224 pt. Every named size gets the same default 25pt margin. Custom `w`/`h` are absolute [lengths](length.md) (bare pt or `mm`/`cm`/`in`; `%` is rejected — there is no parent to resolve against), positive, ≤ 14,400 pt per side (the PDF page limit, `MAX_PAGE_PT`). |
| `orientation` | `portrait` \| `landscape` | `portrait` | Landscape swaps the two dimensions of a **named** size. It is a **no-op for a custom `{ w, h }`** — a custom size already states its dimensions literally, so `orientation` never double-swaps it; express the orientation in the dimensions. The combination `custom size + orientation: landscape` warns `orientation_ignored`. |
| `margin` | number \| map \| array | `25` (all sides) | Printable-area insets. **The all-sides form is a bare pt number only** — `margin: 15mm` (one value with a unit) is a parse error; for units use the per-side map (`{ top: "15mm", right: "15mm", bottom: "15mm", left: "15mm" }`). Sides accept every length unit; `%` resolves against the page **width** for all four sides (the CSS edge rule). **A per-side map specifies all four sides: an unset side is 0, not 25** — `margin: { top: 30 }` zeroes the other three. Negative sides, `auto`, wrong array lengths, and unknown map keys are parse errors. The authored form round-trips. |
<!-- rf:table:end -->

## The margin box is the coordinate origin

`x: 0` / `y: 0` mean the margin corner — for bands, both body kinds, and
the flow region — and widths/heights fill and `%` values resolve against
the margin box. Consequences:

- **Absolute items may use negative coordinates** to reach into the
  margin (`x: -25` — bleed/crop-mark territory).
- **`margin: 0`** is the one-line escape hatch for sheet-absolute
  coordinates (coordinate-faithful imports).
- Margins that would consume a whole page axis fall back to 0 on that
  axis with a `page_margin_too_large` warning, so the origin always has
  positive room.
- The resolved post-clamp margins are returned on `LayoutOutput::margin`
  and surfaced in the `inspect` envelope for Designer margin guides.
- **The usable area is page size minus both margins per axis** — compute
  it once before placing absolute items or bands: A4 with the default
  `margin: 25` gives a margin box of 595.28 − 50 = **545.28 pt wide**
  and 841.89 − 50 = **791.89 pt tall**, so a full-width band line is
  `w: "100%"` (or 545.28) and a bottom-of-page footer item needs
  `y ≈ 791.89 − item height` (there is no footer-local origin —
  [page_number.md](page_number.md) shows the computed example).

## Limitations

- `orientation` is IGNORED on a custom `{ w, h }` size
  (`orientation_ignored`) — express the orientation in the dimensions
  instead, or the two swap each other back.
- Margins that consume a page axis fall that axis back to 0
  (`page_margin_too_large`).
- One geometry per document. Size, orientation and margin are fixed for every
  page; there is no per-section page setup.

## Diagnostics

| Code | Meaning |
| --- | --- |
| `page_margin_too_large` | margins consume a page axis; that axis falls back to 0 |
| `orientation_ignored` | `orientation: landscape` on a custom `{ w, h }` size is ignored (express orientation in the dimensions) |

Capability keys: `page.margin`, `flow.box.optional`.

## See also

- [template.md](template.md) — where `page:` sits in the file
- [length.md](length.md) — the unit forms sides accept
- [layout-model.md](layout-model.md) — the box tree the margin box roots
