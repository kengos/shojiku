# `char_grid` — manuscript-paper / workbook / form character cells

One character per cell in a fixed grid: manuscript paper (genkoyoshi),
kanji practice sheets, and application-form boxes (postal-code entry
cells). The engine assigns cells — including the school kinsoku
hang-back — so the bound string stays verbatim in params. Vertical
writing (`vertical_rl`) and Aozora-Bunko-style ruby readings are built in.

Capability keys: `char_grid`, `char_grid.markup.aozora`,
`char_grid.containers`, `char_grid.textAlign`,
`char_grid.markup.aozora.page_break`, `char_grid.markup.aozora.large`,
`char_grid.markup.aozora.placement`.

```yaml
- type: char_grid
  data: { key: manuscript }          # or text: "静的テキスト{key}"
  grid: { charsPerLine: 20, lines: 10, cellSize: 9mm, lineGap: 4.5mm }
  writingMode: vertical_rl           # horizontal_tb (default) | vertical_rl
  markup: aozora                     # opt-in ruby notation; omit = verbatim
  style: { fontFamily: ipamj-mincho, borderColor: "#a8674f" }
```

## Keys

| Key | Values | Default | Meaning |
| --- | --- | --- | --- |
| `text` / `data` | like a text item | — | Content: static text with `{key}` interpolation, or one bound value. Neither set warns `empty_char_grid_item`. An empty string draws a blank sheet (printable manuscript paper). |
| `bindings` | map of name → binding | unset | Named declarations for this item's `{name}` interpolations — the option set the bare `{key}` grammar cannot carry, incl. a key outside `[A-Za-z0-9_.]` ([data-binding.md](data-binding.md#named-binding-declarations)). |
| `grid.charsPerLine` | integer ≥ 1 | required | Cells per line. |
| `grid.lines` | integer ≥ 1 | required | Lines per sheet. `charsPerLine × lines` is clamped to 4096 cells (`char_grid_clamped`). |
| `grid.cellSize` | [length](length.md) | derived | Cell side (cells are square). Omitted: the content width divided by `charsPerLine` (horizontal) or `lines` (vertical), gaps subtracted. Non-positive warns `invalid_cell_size` and skips the item. |
| `grid.lineGap` | length ≥ 0 | `0` | Space between lines — the ruby band. Ruby for the *first* line draws above (horizontal) / right of (vertical) the grid: reserve room with `box.padding` or leftover box width. |
| `grid.charGap` | length ≥ 0 | `0` | Space between cells along a line (workbook-style separated boxes). |
| `writingMode` | `horizontal_tb` \| `vertical_rl` | `horizontal_tb` | `vertical_rl` runs lines top-to-bottom, columns right-to-left. |
| `kinsoku` | `school` \| `none` | `school` | See below. |
| `markup` | `aozora` | unset | Opt-in content markup: ruby (`《》`), the `［＃改ページ］` sheet break, the large-writing span notes, and the line-placement notes — see the sections below. Unset, every character (including `《》` and `［＃…］`) renders verbatim — bound user data is never interpreted by default. |
| `rubySize` | length | 0.4 × cellSize | Ruby font size. Each reading is centered along its base run's extent (horizontal: above it; vertical: beside it) and shrinks to fit when longer — 4pt floor, past which `ruby_overflow` warns. A 2-char reading over a 1-cell base therefore shrinks to ~half a cell per char and stays centered on that cell. |
| `box` / `style` / `styleNames` / `id` | common keys | — | `box.w` defaults to the full width; the grid is drawn from the content box's top-left. `id` lands in the box index per sheet page. |

Style notes: authored `fontSize` sets the character size; unset it
defaults to 0.7 × cellSize (inherited sizes are deliberately ignored —
cells are cell-relative). `textAlign` (`left` default / `center` /
`right`) is read the same way — from the item's own `style` /
`styleNames`, never inherited — and fills a partly filled line toward
its END: see [Alignment](#alignment-textalign). `borderWidth` is the **grid line** width
(default 0.5pt; `0` turns the grid ruling off), `borderColor` its color.
`backgroundColor` fills the grid area; `color` paints the characters.

## Placement and pagination

Flow body: content beyond one sheet continues on **full sheets** on
following pages (every sheet draws its complete grid, filled or not).
Everywhere else — bands, absolute bodies, containers, `repeat` /
`repeat_flow` cells — the item draws exactly one sheet; overflowing
characters are dropped with `char_grid_overflow`. Inside a repeat cell
the content binds element-scoped, so a card list can carry one grid
per array element (a data-driven kanji drill: `repeat_flow` +
`text: "{kanji}"`).

**Side-by-side entry boxes** (postal-code boxes next to a `〒` label,
a phone number split `3-4-4`) are a flex row:

```yaml
- type: container
  box: { direction: row, gap: 2mm, alignItems: center }
  items:
    - { type: text, box: { w: 6mm }, text: "〒" }
    - type: char_grid
      box: { w: 26mm }
      text: ""                          # empty string = blank boxes
      grid: { charsPerLine: 3, lines: 1, cellSize: 8mm }
    - { type: text, box: { w: 4mm }, text: "-", style: { textAlign: center } }
    - type: char_grid
      box: { w: 34mm }
      text: ""
      grid: { charsPerLine: 4, lines: 1, cellSize: 8mm }
```

`\n` in the content starts a new line (`\n\n` leaves a blank line);
`\r` is ignored. ASCII/half-width characters occupy one cell each. On a
**vertical** grid, the inherited
[`textCombineUpright`](vertical_text.md) style property groups runs of
up to N consecutive ASCII digits into ONE cell (tate-chu-yoko — "12月" costs
two cells instead of three); runs longer than N stay one digit per
cell, and large-writing spans never combine.

## Alignment (`textAlign`)

Cells fill from the line's start by default, which puts a name in a name
field at the wrong end. `textAlign` fills toward the line's **END**
instead:

```yaml
- type: char_grid
  text: "{applicant.name}"
  grid: { charsPerLine: 8, lines: 1, cellSize: 8mm }
  style: { textAlign: right }        # left (default) | center | right
```

- The shift is **per line** and runs after cell assignment, so a **full
  line never moves** — wrapped body text is unaffected and only a partly
  filled line (the entry-grid case) shifts. `center` floors an odd
  remainder toward the line's start.
- In `vertical_rl` a line runs DOWN a column, so `right` is flush-bottom and
  `center` centers along the column — the physical keyword names the
  line's end in both modes (the same mapping vertical text blocks use).
- Ruby follows the shifted cells: readings key off cell positions.
- A hanging-punctuation cell occupies its line's last cell, which is exactly why
  that line is full and does not move. A line that line-end kinsoku shortened (an
  opening bracket pushed to the next line) *is* short, so it de-rags
  like any other — the prohibition survives, since the pushed bracket
  still starts a line.
- The value is read from the item's own `style` / `styleNames` only. An
  inherited `textAlign` is ignored, exactly like `fontSize`.

## Sheet break (`［＃改ページ］`)

Under `markup: aozora`, the Aozora Bunko note `［＃改ページ］` ends the
current sheet — public-domain aozora texts carry it natively, so a
long-form work paginates the way its source says:

```yaml
- type: char_grid
  data: { key: manuscript }          # "…序文［＃改ページ］第一章…"
  grid: { charsPerLine: 20, lines: 10, cellSize: 9mm }
  markup: aozora
```

- **Flow body**: content after the break starts the next sheet (a new
  page when a sheet fills the region; sheets that fit stack).
- **Everywhere else** (bands, absolute bodies, containers, cells): the
  item is one sheet, so content past the break is dropped with
  `char_grid_overflow`, like any other overflow.
- Breaks **collapse** like `type: page_break` does on a fresh page: a
  leading break, consecutive breaks, and a trailing break add no sheet.
- A `［＃…］` note the engine does not act on — not `改ページ`, a large-writing
  note, or a line-placement note (the two sections below) —
  renders literally (each character takes a cell) and warns
  `aozora_note_ignored`, naming the note. The notes are fullwidth-only:
  `[#改ページ]` in halfwidth is ordinary text, and `［` not followed by
  `＃` is too. A note that does not close within 64 characters stays
  literal and warns `ruby_markup_invalid`.
- Without `markup: aozora` the whole notation renders verbatim, one cell
  per character — the standing posture that bound data is never
  interpreted.

## Large characters (`［＃「…」は大書き］`)

Under `markup: aozora`, a large-writing note draws a character (or short phrase)
across an **n×n block** of cells — the dialogue/heading emphasis of manuscript paper:

```yaml
- type: char_grid
  text: "会話《かいわ》［＃「会話」は大書き］とは何か。"
  grid: { charsPerLine: 12, lines: 12, cellSize: 11mm }
  markup: aozora
```

- The note's `「…」` **target must be the text just before it** (the
  pending run, or the base of a `《…》` it immediately follows, as above);
  otherwise it renders literally and warns `ruby_markup_invalid`.
- `［＃「題」は大書き］` is **2×2**; `［＃「題」はＮ倍の大書き］` is n×n
  (`N` fullwidth or ASCII, ≤ 2 digits). `N < 2` renders literally and
  warns; `N` past `min(columns, lines)` clamps with
  `char_grid_markup_clamped`.
- **Block-level placement**: each span character starts a fresh line and
  fills its own n×n block, blocks filling along the line and wrapping at
  block granularity; the following content resumes on a fresh line below
  the block row. A block never straddles a sheet boundary (it is pushed
  whole to the next sheet). The character draws at `n ×` the cell font
  size, centered in its block; the grid ruling stays complete underneath.
- **Ruby** rides the block run's outer side (above, horizontal; right,
  vertical) over the full block extent, with the usual shrink-to-fit.

## Line placement (`［＃…字下げ］` / `［＃地付き］` / `［＃中央］`)

Under `markup: aozora`, a placement note at a **line head** positions that
source line within the grid, overriding the item's `textAlign` for the
line — the essay title sheet (title + author) and dialogue indents:

```yaml
- type: char_grid
  text: "［＃中央］吾輩は猫である\n\n［＃地付き］夏目漱石"
  grid: { charsPerLine: 12, lines: 12, cellSize: 11mm }
  writingMode: vertical_rl
  markup: aozora
```

| Note | Effect |
| --- | --- |
| `［＃Ｎ字下げ］` | the line's first physical row starts `N` cells in; a wrapped continuation resumes at the line head (the manuscript-paper convention) |
| `［＃地付き］` | the line's characters sit at its END (flush-bottom in `vertical_rl`) |
| `［＃地からＮ字上げ］` | as 地付き, leaving `N` cells after the run |
| `［＃中央］` | the line's characters center along it — **a Shojiku extension** (青空文庫 has no centering notation), the others are real aozora notes |

- Honored **only at a source line head** (stream start, after `\n`, after
  a sheet break) and **once per line**; a mid-line or second placement note
  renders literally and warns `ruby_markup_invalid`.
- The placement overrides the item's `textAlign` for its line; a FULL
  line has no free cells and never moves. `字下げ`/`地から上げ` past the
  line width clamps with `char_grid_markup_clamped`; `［＃０字下げ］` /
  `［＃地から０字上げ］` render literally and warn (`地付き` is the way to
  write a plain end-flush). A placement + large-writing on the same line places
  the block row (`［＃中央］［＃「題」は大書き］` centers the block row).
- **Blank lines and vertical position** need no markup: a `\n` starts a
  new line and `\n\n` leaves a blank one, so "put the title a few lines
  down" is written with leading newlines, not a note.

## Kinsoku (`school`)

The school-education rule set used on genkoyoshi:

- **Hanging punctuation**: `、 。 ， ． ！ ？ 」 』 ） 〕 〉 》 ｝` never start a
  line — they share the previous line's last cell, drawn toward its
  trailing corner.
- **Line-end kinsoku**: opening brackets `「 『 （ 〔 〈 《 【 ｛` never end a
  line — the cell stays empty and they open the next line.
- Small kana (`っ ゃ …`) may start a line (the elementary-school
  convention).

`kinsoku: none` fills strictly in order. The rule sets are closed;
extending them is a deliberate decision, not a drive-by edit.

## Vertical writing (`vertical_rl`)

Vertical cells shape with the **same GSUB `vert` arrangement** as the
free-flowing [vertical text surfaces](vertical_text.md):

- `ー` (the long-vowel mark), dashes, and brackets (`「」（）—` …) rotate as the
  font's vertical alternates — no closed substitution table.
- `、 。 ， ．` and small kana sit where the font's vert glyphs place
  them (the top-right of the cell in any CJK font); a hanging
  cell additionally drops half a cell so it reads in the trailing
  corner.
- A font the shaper cannot parse degrades per character to the closed
  presentation-form/nudge tables, so a broken font still renders a
  readable grid.

## Ruby (`markup: aozora`)

The Aozora Bunko notation, so public-domain texts paste straight in:

- `《reading》` annotates the maximal run of kanji just before it:
  `吾輩《わがはい》は猫である`.
- `|` (or `｜`) scopes the base explicitly: `|昨日《きのう》` — needed
  when the base includes kana or crosses a kanji-run boundary.
- A reading whose base run wraps across lines splits proportionally.

Malformed markup (unclosed `《`, empty reading, no base, a reading over
64 chars, dangling `|`) renders literally and warns
`ruby_markup_invalid`. Interpolation runs first, so a `{key}` value can
carry readings — only when the template opted in with `markup: aozora`.

## Diagnostics

`char_grid_clamped`, `invalid_cell_size`, `empty_char_grid_item`,
`char_grid_overflow`, `ruby_markup_invalid`, `aozora_note_ignored`,
`ruby_overflow`, plus the shared content codes (`missing_data`,
`missing_glyph`). Full list: [diagnostics.md](diagnostics.md).

## Example

[`examples/typography/genkoyoshi-ja`](../../examples/typography/genkoyoshi-ja) — B5 縦書き
200字詰め原稿用紙 rendering the opening of 吾輩は猫である with ruby;
[`examples/forms/rirekisho-ja`](../../examples/forms/rirekisho-ja) uses a one-line
grid as 郵便番号 boxes.
