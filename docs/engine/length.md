---
reference:
  group: concept
  order: 1
  keys: [length]
  shapes: [Length]
  summary: "Every geometry value: absolute units, `%`, `em`/`rem`, and where each has no basis."
---

# Lengths & units

Every geometry value (`box` coordinates and sizes, min/max bounds,
margins, padding, gaps, table column widths and row heights) is a
**`Length`**. The canonical unit is the PDF point (1 pt = 1/72 inch).

## Accepted forms

| Form | Example | Meaning |
| --- | --- | --- |
| bare number | `w: 120` | pt. The canonical unit. |
| `"N%"` string | `w: "50%"` | Percent of the parent's resolved size along the same axis: `x`/`w` resolve against the parent's **width**, `y`/`h` against its **height**. Exception: margin/padding sides resolve `%` against the parent **width** for all four edges (the CSS rule). |
| `"Npt"` string | `w: "120pt"` | Explicit pt. |
| `"Nmm"` / `"Ncm"` / `"Nin"` | `w: "80mm"` | Physical units, absolute like pt (1 in = 72 pt, 1 cm = 10 mm, 1 mm = 72/25.4 pt). They need no layout context, so unlike `%` they also work where no basis exists (custom `page.size`, boxes inside auto-height containers). |
| `"Nem"` string | `w: "2em"` | Multiples of the **inherited font size** — the font size in effect where the length resolves (see below). Works on both axes, including inside auto-height containers. |
| `"Nrem"` string | `w: "1.5rem"` | Multiples of the **engine default font size** (10 pt), independent of the cascade — a stable scale unit. |

`px` is deliberately **not** a template unit; px exists only as the
preview backend's scale factor. `fr` is **not** a Length either — it is a
grid-track-only weight ([grid.md](grid.md)), so `"1fr"` anywhere a plain
length is expected is an "invalid length" parse error.

## What `em` means

`em` in a box length resolves against the font size the item
**inherits** at that point in the tree — the enclosing container's
computed `fontSize` (or the engine default 10 pt at the document root).
This is one uniform rule; note the deliberate divergence from CSS: an
item's **own** inline `fontSize` does not affect its **own** box lengths
(a container with `style: { fontSize: 20 }` gives its *children* a
20 pt em, while its own `padding` em still uses what the container
inherited).

Two style properties follow CSS instead:

- `fontSize: "1.5em"` / `"150%"` resolve against the *inherited* font
  size (nested relative sizes multiply); `"1.2rem"` scales the engine
  default.
- `letterSpacing: "0.1em"` resolves against the item's **own** computed
  font size (a same-layer `fontSize` applies first). `letterSpacing`
  rejects `%` at parse — CSS letter-spacing has no percentage form.

The `rem` root is the engine default font size today; a template-level
root style may replace that base later (pre-1.0).

## Round-trip

The authored unit is preserved: serialization writes `80mm` back, never a
normalized pt number. Bare numbers stay bare numbers.

## Guards (untrusted input)

- Non-finite values are rejected at parse time — bare numbers by the
  YAML guard, string forms like `"1e309%"` by the `Length` parser. For
  physical units both the authored value and its pt conversion must be
  finite (`"1e308in"` is rejected).
- At layout, any resolved length with magnitude > 1,000,000 pt is
  dropped with `length_out_of_range` and the caller's default applies — a
  chain of >100% values cannot amplify geometry.
- A `%` that needs the height of an auto-height parent cannot resolve;
  it is dropped with `percent_of_auto`.

## Where `%` has no basis

- `page.size` custom dimensions (parse error; `em`/`rem` are rejected
  there too — page geometry must be absolute).
- Heights (`h`, `minHeight`, `maxHeight`, `y`) inside an auto-height
  container (`percent_of_auto` at layout). `em`/`rem` need no height
  basis and still resolve there.
A `line`'s `from`/`to` take the full vocabulary on both axes (`x`
against the placement box's width, `y` against its height) — see
[line.md](line.md); a `%` `y` under an auto-height parent drops with
`percent_of_auto` like any other height.

Capability keys: `length.physical`, `box.percent`, `length.em_rem`,
`style.fontSize.length`, `style.letterSpacing.length`,
`flow.gap.length`, `line.length`.

## Limitations

- `%` needs a definite basis. Against an auto axis the value is dropped
  (`percent_of_auto`).
- A resolved length past ±1e6 pt falls back to the key's default
  (`length_out_of_range`).
- Physical units are STRINGS (`"15mm"`); a bare number is always pt.
- `page.margin` takes a bare pt number or a per-side map — a single
  unit-bearing scalar (`margin: 15mm`) is refused.
- There is no `calc()` and no arithmetic of any kind.

## See also

- [box.md](box.md) — where lengths are authored
- [layout-model.md](layout-model.md) — the resolve pass and its caps
