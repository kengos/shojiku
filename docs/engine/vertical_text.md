# Vertical writing

`writingMode: vertical_rl` turns a `type: text` item into a **vertical
block**: characters fill a column top-to-bottom, and columns lay out
**right-to-left** from the box's right edge — the standard Japanese
the vertical direction (certificates, envelopes, gift labels, vertical
receipts). Both `writingMode`
and `textOrientation` are ordinary inherited [style](style.md)
properties, so a `container` can set the mode once and its text children
inherit it.

The mode is honored on **every text surface**, not just a plain text
item: rich [`spans`](text.md) (each span's runs stack down the column in
its own font/size/color), [`list`](list.md) (each entry becomes a
right-to-left column), [table](table.md) text cells (the cell fills the
row rectangle; an auto row is as tall as its longest column), and
[`page_number`](page_number.md). A text `mark:` (the circled-text overlay) is the one
warned fallback — see the scope section below.

This is the free-flowing vertical text counterpart to
[`char_grid`](char_grid.md) (the fixed manuscript-paper grid): here the engine
wraps proportionally and paginates the box, rather than filling numbered
cells.

## Syntax

```yaml
- type: text
  text: "吾輩は猫である。名前はまだ無い。"
  box: { w: 40, h: 260 }          # h is the column length to wrap against
  style:
    writingMode: vertical_rl      # horizontal_tb (default) | vertical_rl
    textOrientation: mixed        # mixed (default) | upright
    fontSize: 18
    lineHeight: 1.6               # the column WIDTH (cross-axis spacing)
    textAlign: left               # along-column: left→top, center, right→bottom
```

- **`box.h`** is the column length characters wrap against; a column that
  fills it starts a new column to its left. With no `h`, the block wraps
  against the containing region's height.
- **`box.w`** bounds how many columns fit; more columns than fit warn
  `vertical_text_overflow` (they still draw, extending left).
- **`lineHeight`** is the em multiplier for the **column width** (the gap
  between columns), mirroring how it sets line spacing in horizontal text.
- **`textAlign`** distributes a short column *along* its length:
  `left` → top, `center` → centered, `right` → bottom.

## Character orientation (`textOrientation`)

Inside a vertical block, `mixed` (the default) follows the full Unicode
**UAX#50 Vertical_Orientation property**: CJK, kana, Hangul, and
fullwidth forms stay **upright**, while Latin letters, digits, and other
horizontal scripts rotate **90° clockwise** so a run like `2026` reads
down the column (halfwidth katakana rotate too, per the property).
`upright` keeps every character upright (useful for short labels where
rotated Latin reads awkwardly).

Upright runs are shaped with the font's **GSUB `vert` feature** and real
`vmtx` advances — the long vowel mark `ー`, dashes, and brackets
(`「」（）—` …) rotate as the font's vertical alternates, and clause
punctuation (`、。`) sits where the font's vert glyphs place it (the
top-right of the cell in any CJK font). Rotated Latin runs are shaped
horizontally, so **kerning and ligatures** apply exactly as in
horizontal text. A font the shaper cannot parse degrades to a per-char
fallback: a closed vertical presentation-form table plus
engine-synthesized `、。`/small-kana nudges.

## Surfaces and per-surface notes

- **Rich `spans`.** Each span's runs stack down the column in its own
  font / size / color; the uniform column width is the largest span size
  × `lineHeight` (like the horizontal rich line grid). Kinsoku breaks
  columns across span boundaries; a span `textDecoration` draws its own
  side band (see the block knobs below).
- **`list`.** Each array entry is one column, laid right-to-left (the
  first entry rightmost). `box.w` caps how many columns fit — excess
  entries collapse into a leftmost `+{count}` (`overflowText`) column,
  the axis-swapped analog of the horizontal list reserving a line; a
  definite `box.h` clamps an over-long entry's down-extent with a
  trailing `…`.
- **Table text cells.** A cell whose column style is `vertical_rl` fills
  the row rectangle with columns. A definite `row.height` wraps columns
  against it; an auto row is as tall as its longest column. (The table's
  own default `verticalAlign: Middle` is not treated as an authored knob,
  so it does not warn.)
- **`page_number`.** The `{page}/{pages}` string stacks down a column,
  repeating per page.

## Block knobs (axes swapped)

Every block-level [style](style.md) knob applies on a vertical block,
reading along the swapped axes. Kinsoku (`lineBreak`, every mode) is
honored throughout — a comma never starts a column, an opening bracket
never ends one.

- **`textOverflow`** runs against the box **width** (the vertical
  overflow axis — columns stack right-to-left): `clip` reserves the
  authored box and cuts at its edge; `shrink` bisects the font size
  (column width scales along, 4 pt floor); `ellipsis` keeps the columns
  that fit and ends the last with `…` (line-end-kinsoku-aware). `visible` (the
  default) warns `vertical_text_overflow` — except as a direct flow item,
  where it **paginates** (below). Rich `spans` keep the horizontal
  parity: `clip` is honored, `shrink`/`ellipsis` warn
  `span_overflow_unsupported` and behave like `visible`.
- **`verticalAlign`** maps CSS-logically to the column-stack shift:
  `top` → the right edge (the default), `middle` → centered, `bottom` →
  the left edge. (A table's own injected `verticalAlign: middle` cell
  default stays neutral — an *authored* cell value is also neutralized
  in v1.)
- **`hangingPunctuation`** hangs a column-terminating comma / full stop
  past the column **bottom** — excluded from the alignment basis, kept
  in the inked `width`, at most one per column, exactly the horizontal
  rules. Vertical columns hang on both the plain and `spans` paths
  (horizontal rich blocks remain un-hung in v1).
- **`textDecoration`** draws a **side band** per column (per run for
  `spans`): `underline` just right of the em cell — the JLREQ side-line
  convention; CSS leaves `text-underline-position: auto` UA-defined in
  vertical modes — and `line_through` on the column axis. Thickness
  comes from the same font tables as the horizontal line.
- **`textSpacingTrim`** (half-width punctuation) trims fullwidth punctuation cells to
  half-em down the column: `normal` between two adjacent fullwidth
  punctuation cells (a closing form keeps its ink at the cell top, an
  opening form slides up), `trim_start` also at a column-head opening
  bracket. Engine-synthesized like the horizontal pass (same class
  tables), so it works on every face.

## Tate-chu-yoko (`textCombineUpright`)

Short digit runs — a day "31", a year "2026" — read badly rotated down a
column. `textCombineUpright` (CSS `text-combine-upright` subset, an
inherited [style](style.md) property) turns runs of up to N consecutive
ASCII digits into ONE upright cell:

```yaml
- type: text
  text: "第12話は2026年1月31日"
  box: { w: 40, h: 260 }
  style:
    writingMode: vertical_rl
    textCombineUpright: { digits: 2 }   # none (default) | { digits: 2..=4 }
```

- A run of 2..=N digits shares one 1em cell, shaped horizontally and
  compressed (never stretched) to fit; a run LONGER than N is not
  combined at all (the CSS `digits` rule — no suffix of it re-combines).
- **`all`** (CSS `text-combine-upright: all`) combines the WHOLE styled
  scope into one upright cell — meant for a short `spans` entry (a date
  span combined as one cell); a whole `all` span is atomic (it never
  wraps mid-span) and compress-only, like `digits`. Honored literally on
  a plain vertical block too (the entire content becomes one cell — use
  it on short content).
- `digits` outside 2..=4 and unknown keywords are parse errors; `none`
  turns an inherited value off.
- The same digit-run vocabulary drives [`char_grid`](char_grid.md)
  cells: a vertical grid groups a matching digit run into one cell
  (`all` does not apply to a grid of cells).
- Surfaces: plain vertical blocks, rich `spans` (the span cascade
  carries it — a span-level value overrides the block's), vertical
  [`list`](list.md) entries (the definite-`h` `…` clamp keeps a
  combined group whole — kept or dropped, never split), and vertical
  `char_grid` (digits only). Horizontal text ignores it (CSS: vertical
  modes only). Capability keys: `style.textCombineUpright` (digit
  runs), `style.textCombineUpright.all` (the `all` keyword, the
  span/list surfaces, and ruby on every surface + ruby-aware
  pagination).

## Ruby (`ruby: [{ base, text }]`)

Template-authored readings — the structured counterpart of char_grid's
opt-in aozora markup (bound user data is never interpreted;
`base`/`text` are verbatim template strings, never interpolated).
Honored on **every text surface**: vertical plain and `spans` blocks
(readings right of the base runs, this section), and horizontal plain
and `spans` blocks (readings above the base runs — see
[text.md](text.md) § Ruby):

```yaml
- type: text
  text: "吾輩は猫である"
  box: { w: 60, h: 260 }
  rubySize: 6                       # optional; default = half the font size
  ruby:
    - { base: 吾輩, text: わがはい }
    - { base: 猫, text: ねこ }
  style: { writingMode: vertical_rl, lineHeight: 1.8 }
```

- Entries apply **in listed order, non-overlapping**: each base matches
  the first occurrence in the DRAWN text after the previous match (what
  the reader sees is what is annotated — an ellipsized tail cannot
  match). An unmatched base warns `ruby_base_not_found` and later
  entries still apply.
- Each reading is a small upright column immediately **right of its
  base run's em cell** (the JLREQ convention), shrunk linearly to the
  run's extent with a 4pt readability floor (`ruby_overflow` past it),
  and split proportionally when the base wraps across columns. Give the
  block `lineHeight` ≳ 1.5 (or a smaller `rubySize`) so readings have a
  clear band between columns.
- On a `spans` block, bases are located through the per-run
  arrangements (a base may cross a span boundary within a column); the
  reading sits right of ITS base run's em cell and draws in the block
  style at the shared preferred size.
- A ruby'd item placed directly in a flow region **paginates with its
  readings**: each fragment carries the readings of its own columns,
  re-anchored beside them (a base run spanning the page break splits
  its reading proportionally, like any wrapped base).
- Entries are bounded (256; `too_many_ruby_entries`); an empty
  `base`/`text` warns `empty_ruby_entry` and one longer than 64
  characters warns `ruby_entry_too_long` — both skipped.

## Column pagination (flow)

A vertical text item placed **directly in a flow region** whose columns
need more width than the box holds continues on the **next page**:
whole columns, right-to-left reading order preserved, each following
page re-starting at its own right edge (the `textOverflow: visible`
default; a policy that resolved the overflow never paginates). The
`vertical_text_overflow` warning is replaced by the pagination — it still
fires when not even one column fits, and in bounded contexts
(containers, bands, absolute bodies, cells), which keep the
place-as-one-unit behavior.

## Inspect metrics (per column)

A vertical text item's `inspect` placement carries
`text: { columns: [...] }` — the axis-swapped analog of the horizontal
`lines`: per column `y`/`height` (the drawn extent), `baseline` (the
column-axis x glyph cells center on), and `emLeft`/`emRight` (the em
band). Capability key: `inspect.text_metrics.vertical`; the knob +
pagination behaviors advertise as `style.writingMode.block_styles`.

## v1 scope and limitations

Each remaining limit degrades loudly.

- **A text `mark:` (circled text) is not vertical.** Its glyph-band oval is a
  horizontal overlay, so on a vertical block it is skipped and warns
  `vertical_text_unsupported`.
- **Rich `spans` overflow**: `shrink`/`ellipsis` warn
  `span_overflow_unsupported`, matching the horizontal rich block.
- [`char_grid`](char_grid.md)'s vertical cells now shape through the
  same GSUB `vert` arrangement as this page's blocks (its item-level
  `writingMode` remains its own key).

## Diagnostics

| Code | When |
| --- | --- |
| `vertical_text_unsupported` | a vertical writing mode reached a text `mark:` (the circled-text overlay) |
| `span_overflow_unsupported` | `textOverflow: shrink`/`ellipsis` on a vertical `spans` block (overflowing like `visible`) |
| `vertical_text_overflow` | more columns than the box width holds, where pagination cannot take over (bounded contexts; not even one column fits; a `shrink` still overflowing at its 4 pt floor) |
| `ruby_base_not_found` | a `ruby` entry's `base` never occurs in the drawn text (reading skipped) |
| `ruby_overflow` | a reading longer than its base run even at the 4 pt floor |
| `empty_ruby_entry` | a `ruby` entry with an empty `base` or `text` (validation) |
| `too_many_ruby_entries` | more than 256 `ruby` entries (only the first 256 apply) |
| `ruby_entry_too_long` | a `ruby` entry's `base` or `text` over 64 characters (entry skipped) |
