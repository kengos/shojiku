# Engine features (implemented)

What the Shojiku engine (`engine/`) can do **today**. This is the record of
shipped capabilities and the decisions behind them; the **authorable
syntax** (keys, defaults, diagnostics) is specified per feature in the
[template reference](README.md); the
architecture and principles in
[architecture.md](../architecture.md), and the file-by-file map in
[`docs/code-map/`](../code-map/) (index: [`CLAUDE.md`](../../CLAUDE.md)).

Pipeline: `Template/Definitions → Bundle → Layout → Render → Preview → Sign
→ Verify → Archive`. Crates are `shojiku-<dir>` under `engine/`.

## Capabilities by area

### Core model & validation (`engine/core`)
- **Template model split along CSS lines**: structure (`template.rs`),
  positioning (`geometry.rs`), painting (`style.rs`). Untrusted input
  degrades to diagnostics, never panics; `yaml_guard` rejects non-finite
  numbers at the parse boundary.
- **AI-authorability hardening**: `version:` accepts bare numbers and
  strings (authored form round-trips); **every wire struct is
  `deny_unknown_fields`** (a typo'd key is a parse error, never a silent
  no-op) and **no unset field serializes** (`Option`+skip+accessor for
  every defaulted scalar) — GUI round-trips produce no churn. An unknown
  `fontFamily` warns `unknown_font_family` once per family. Capability
  key `template.version.scalar`.
- **Definitions / params / interpolation**: data dictionary, runtime
  params, `{key:format}` interpolation, cross-checked by `validate`
  (unknown keys, undeclared display variants, missing data). The
  definitions wire is an **OpenAPI-style schema isomorphic to the params
  JSON** ([definitions.md](definitions.md)): nested
  `type: object`/`properties`/`items`, `format` as the OPEN data-semantic
  vocabulary (known values refine the field type; unknown values are
  generation hints), `displayFormat`/`displayFormats` for display
  variants, JSON-Schema constraints (`required`/`enum`/length/range),
  and the authoring keys (`title`/`example`/`placeholder`/…). With both
  definitions and params, `validate` checks the params tree against the
  schema (`params_missing_required`/`params_type_mismatch`/
  `params_out_of_range`/`params_length_out_of_range`/
  `params_enum_mismatch`/`params_unknown_key`, all warnings; blanks —
  `null`/`""` — skip checks, matching the blank-form convention);
  `definitions_format_ignored` flags a known semantic format on a wrong
  base. `deny_unknown_fields` throughout (a mistyped key is a located
  parse error; the retired v1 `groups:` form errors with a migration
  hint); caps: depth 16 / 4096 nodes / 256 enum values; a definitions
  file with no properties warns `empty_definitions`. Capability key
  `definitions.schema`.
- **Nested array sources**: an array declared inside another array's
  `items:` (a `list` inside a `repeat` cell) is a data source in its own
  right, at any depth the schema cap admits. It is bound row-relatively,
  and its element fields are known under the joined dotted path — so a
  `list`'s per-entry `text:` keys are checked at validate
  (`unknown_data_key`) instead of surfacing as a layout `missing_data`,
  and each entry resolves through its declared display format,
  `placeholder` and `enum` labels exactly as a top-level array's rows do.
  Silent where the schema says nothing: an array with no `items:` claims
  no shape. No wire change — the recursive schema always parsed this;
  what shipped is the engine consuming it.
- **`equals` checked against the declaration**: a form mark's or a table
  row condition's `equals` literal is compared with what the field
  declares, before any params exist — a different scalar kind, or a value
  outside a declared `enum`, is a predicate no params can ever satisfy
  (`mark_equals_type_mismatch` / `mark_equals_not_declared`,
  `row_condition_type_mismatch` / `row_condition_equals_not_declared`).
  For a multi-select (an array source), the array's ELEMENT is what the
  literal is checked against. Literals are never echoed.
- **Enum display labels**: an `enum` member is a bare value OR a
  `{ value, label }` pair (mixed lists fine, per-member authored form
  round-trips) — a plain-text field with labeled members renders the
  LABEL wherever it is placed (text/table column/list entry/QR
  content), while params keep the machine value; `format: value` /
  `{key:value}` renders the value instead. Labels on any other field
  type warn `definitions_enum_labels_ignored` and stay inert;
  membership checks always compare the member's VALUE. Replaces
  host-side display ternaries (the Thinreports-migration gap: the
  legacy pickup slip printed `（入荷待ち）` from a Ruby ternary — the bundled
  pickup slip now declares it in definitions). Capability key
  `definitions.enum.labels`.
- **Located parse errors**: template and definitions parsing runs a
  two-pass parse (finite-guard on a `Value`, then a typed
  `serde_path_to_error` deserialize from the source string), so a
  structural mistake carries the field PATH and the YAML line/column
  instead of a bare location-less serde message. Plain-struct inputs
  (definitions, top-level template keys) get the full path + accurate
  location; internally-tagged enums (`Body`/`Item`) truncate the path to
  the enum boundary but the message still names the bad key and the
  expected fields. Echoed key/path text is clipped at the error boundary.
- **Page sizes**: named presets — ISO A (`A3`/`A4`/`A5`), JIS B
  (`B4`/`B5` — the Japanese B series), North American
  (`Letter`/`Legal`/`Tabloid`) — plus custom `{ w, h }`
  (≤ `MAX_PAGE_PT`), portrait/landscape. `orientation` swaps a named
  size; it is a no-op for a custom `{ w, h }` (which states its
  dimensions literally) and the combination warns `orientation_ignored`.
  Every size gets the same default 25pt page margin. Capability key
  `page.size.presets`.

### Character grids (`engine/core`, `engine/layout`)
- **`type: char_grid`** — one character per cell (genkoyoshi / kanji workbooks /
  application-form entry cells): `grid: { charsPerLine, lines, cellSize?, lineGap?,
  charGap? }`, `writingMode: horizontal_tb | vertical_rl`, school
  kinsoku (hanging punctuation + opening-bracket push) with `kinsoku: none` opt-out,
  full-sheet pagination in flow bodies, single-sheet + `char_grid_overflow`
  in bands/absolute. Cell size derives from the width when unset; the
  4096 cells/sheet cap and a page-cap-derived assignment bound hostile
  inputs. Emits only rects + plain text blocks — renderers untouched.
  Capability key `char_grid`. Reference: [char_grid.md](char_grid.md).
- **Aozora ruby** (`markup: aozora`): `|base《reading》` parsed in
  `engine/core` (linear, capped, malformed markup degrades to literal
  text + `ruby_markup_invalid`), readings laid along their base runs
  (above / right of), shrink-to-fit with a 4pt floor, proportional
  split across wrapped runs. Verbatim is the default — params are never
  interpreted without the template opting in. Capability key
  `char_grid.markup.aozora`.
- **Entry alignment** (`textAlign` on a `char_grid`): `center` / `right`
  fill a partly filled line toward its END, so a name in a name field sits
  at the right end (`vertical_rl`: the column's bottom — the physical
  keyword names the line's end in both modes, as it does for vertical
  text blocks). The shift is per line and runs AFTER assignment, so a
  full line has no free cells and never moves — wrapped body text is
  untouched, and a hanging-punctuation cell keeps its line full by construction.
  Read from the item's own style only, never inherited, for the same
  reason `fontSize` is: cells are cell-relative. Capability key
  `char_grid.textAlign`. Reference: [char_grid.md](char_grid.md).
- **Aozora sheet break** (`［＃改ページ］` under `markup: aozora`): the
  note ends the current sheet, so a pasted public-domain text paginates
  the way its source says. Breaks collapse like `type: page_break` on a
  fresh page (leading / consecutive / trailing add no sheet); outside a
  flow body the content past the break drops with `char_grid_overflow`.
  Every other `［＃…］` note renders literally and warns
  `aozora_note_ignored`, naming the note (the scan caps its body at 64
  chars, so the echo is bounded). Fullwidth only — halfwidth `[#…]` is
  ordinary text. Capability key `char_grid.markup.aozora.page_break`.
- **Aozora large-writing span** (`［＃「対象」は大書き］`, optionally `はＮ倍の`,
  under `markup: aozora`): a target drawn across an n×n block of cells
  (dialogue / heading emphasis), default 2×2. Each span character starts a
  fresh line block, blocks wrap at block granularity, and a block never
  straddles a sheet; the glyph draws at `n ×` the cell font, centered,
  with the grid cells complete underneath and ruby riding the block extent.
  `N < 2` renders literally and warns; `N` past `min(columns, lines)`
  clamps with `char_grid_markup_clamped`. Capability key
  `char_grid.markup.aozora.large`.
- **Aozora line placement** (`［＃Ｎ字下げ］` / `［＃地付き］` /
  `［＃地からＮ字上げ］` / `［＃中央］`, under `markup: aozora`): a note at
  a line head positions that source line — indent, end-flush, or center —
  overriding the item's `textAlign` for the line (the essay title sheet:
  title + author). `［＃中央］` is a Shojiku extension (Aozora Bunko has no
  centering notation); the rest are real aozora notes. Honored only at a
  line head and once per line (a mid-line or duplicate note renders
  literally and warns); an oversized count clamps with
  `char_grid_markup_clamped`. Capability key
  `char_grid.markup.aozora.placement`.
- **Vertical presentation rides GSUB `vert`**: a vertical grid's cells
  are one-cell vertical columns shaped through the same arrangement as
  free-flowing vertical text (§ Vertical writing) — `ー`/brackets
  rotate as the font's vert alternates, `、。`/small kana sit where its
  vert glyphs place them, a hang cell drops half a cell into the
  trailing corner, and shaper-less faces degrade to the closed
  forms/nudge tables per char.
- **Containers and repeat cells host char_grid**: a boxed grid is a
  flex/absolute child (one sheet, band semantics) and binds
  element-scoped inside `repeat`/`repeat_flow` cells — entry-box rows
  are a plain flex row and a card list carries one grid per array
  element. Capability key `char_grid.containers`.

### Box model (`engine/core`, `engine/layout-box`, `engine/layout`)

- **Horizontal-overflow diagnostic** (`horizontal_overflow`): a fixed
  row wider than its parent content box, or a definite-width flow item
  past the region's right edge, warns instead of silently rendering
  off-sheet; `overflow: hidden` parents clip by intent and stay silent
  (the `container_overflow` convention). Off-page checks for
  band/absolute items stay open — they collide with the deliberate
  page-margin escape hatch.

**Core invariant: everything resolves to absolute pt at layout time** —
the `tree.rs` renderer contract never changes for layout features.
Full authorable spec: [box](box.md), [flex](flex.md),
[grid](grid.md), [length](length.md).

- **Lengths**: bare pt number, `"N%"` (of the parent, same axis),
  `"Npt"`, physical `"Nmm"`/`"Ncm"`/`"Nin"` (authored unit round-trips —
  `80mm` never comes back as `226.77`), and font-relative `"Nem"` (the
  *inherited* font size at the resolution point) / `"Nrem"` (the engine
  default 10pt); `px` and non-finite rejected. `fontSize`/
  `letterSpacing` take the same strings (`em`/`%` on fontSize = the
  inherited size, so nested relative sizes multiply; letterSpacing `em`
  = the item's own computed size, `%` parse-rejected), and the flow
  body `gap` is a full `Length` (negatives clamp to 0).
- **Containers**: `Item::Container` nests (auto height = lowest child
  bottom), children resolve against it; `MAX_CONTAINER_DEPTH` 32.
- **Padding & margin**: bare number or per-side map, `%` of the parent
  *width* for all edges (CSS rule), border-box, no margin collapse;
  margin sides also take `auto` (free-space absorption).
- **Flex (the default)**: `direction: column|row`, `gap`, `alignItems`,
  `justifyContent`; unsized row children split the leftover by
  per-child **`flexGrow`** weight (default 1 = equal split).
- **Static grid**: `box.type: grid` — `columns`/`rows` as a count or a
  track list of `Length`s and/or **`fr` weights** (`["1fr", "2fr", 90]`;
  the leftover after the fixed tracks and gaps distributes across the
  weights like `flexGrow`), `columnGap`/`rowGap`, fill order `direction`;
  tracks clamp to `MAX_GRID_TRACKS` 64/axis. `fr` rows need a definite
  container height (auto-height degrades them with `grid_fr_no_basis`).
- **Min/max**: `minWidth`/`maxWidth`/`minHeight`/`maxHeight` on every
  item box, clamped in CSS order (min > max > size).
- **Participation rule**: a child that authors neither `box.x` nor
  `box.y` participates in flex/grid; either coordinate keeps absolute
  placement (every pre-flex template is byte-identical).
- **Math crate `shojiku-layout-box`**: the pure-geometry half (`Basis`,
  guarded resolution with the ±1e6 pt cap, `ResolvedBox`, flex/grid
  distribution) — unit-testable with plain numbers, no font fixtures.
- Capability keys: `box.percent`, `box.margin`, `box.padding`,
  `box.flex`, `box.grid`, `grid.fr`, `box.minmax`, `box.flexGrow`,
  `margin.auto`, `length.physical`, `length.em_rem`,
  `style.fontSize.length`, `style.letterSpacing.length`,
  `flow.gap.length`.

### Page geometry (`engine/core`, `engine/layout`)
- **`page.margin` is the coordinate origin**: bare number, per-side
  map, or legacy `[t,r,b,l]` array (all `Length` forms; authored form
  round-trips; default 25pt). `x: 0`/`y: 0` mean the margin corner;
  absolute items reach into the margin with negative coordinates
  (bleed/crop marks); margins that would consume a page axis fall back
  to 0 with `page_margin_too_large`. Resolved margins are returned in
  `LayoutOutput`/`inspect` so the GUI draws guides without
  re-implementing resolution.
- **Flow body `box` optional**: omitted = the whole margin box.
- **`type: page_break`**: the next flow item starts on a fresh page;
  a break on an untouched page is a no-op (consecutive breaks collapse,
  blank pages are never generated). Flow-only; bands/absolute/containers
  warn+skip.
- Capability keys: `page.margin`, `flow.box.optional`, `page_break`.

### Style system (`engine/core`, `engine/layout`)
- **Shape-style convergence**: `rect`, `ellipse`, `checkbox`, and the
  text `mark` are styled by the unified `Style` (+ `styleNames`) —
  `RectStyle`/`fillColor` are gone (`fillColor` is a located parse
  error pointing at `backgroundColor`). `rect` is a pure decoration box
  through the shared decoration path (per-side borders, `borderStyle:
  double`, `backgroundColor`, `opacity`) and — like every item — draws
  nothing unless authored. Marks keep a 1 pt outline default when no
  layer authors a width, stroke uniformly (per-side maps reduce to the
  top side, `shape_border_sides_ignored`), and inert text keys on shape
  inline styles warn `shape_style_ignored`. `line` deliberately keeps
  `width`/`color` (a stroke primitive, not a box). Capability key
  `style.shapes.unified`.
- **Per-side borders**: `borderWidth`/`borderColor` take a
  `{ top/right/bottom/left }` map (bare scalar = all sides, unchanged);
  new `borderStyle: solid | double` (scalar or per-side). Uniform solid
  borders keep the single stroked rect (byte-identical output);
  per-side/double emit edge-centered filled bands from existing tree
  primitives — renderers untouched. Negative widths are parse errors.
  Grid children take `columnSpan`/`rowSpan` (occupancy-map placement,
  clamped; `span_outside_grid` outside grids).
- **Unified `Style` bag**: every property `Option` (unset = inherit,
  else engine default), CSS camelCase names, `deny_unknown_fields`,
  round-trippable. Cascade: engine default ← inherited ancestor ←
  named styles in listed order ← inline. Inherited: `color`,
  `fontSize`, `fontFamily`, `fontWeight`, `fontStyle`, `letterSpacing`,
  `lineHeight`, `textAlign`, `lineBreak`; the rest reset per item.
- **Style-scalar sanity guards**: every numeric style scalar a template
  can set to anything is bounded at use, degrading to a diagnostic plus a
  usable fallback rather than reaching the measurement or stroke math.
  `fontSize` (1000 pt) and `lineHeight` (1000×) cap as a pair, so the
  tallest admitted line box is exactly the ±1,000,000 pt resolved-length
  cap; `letterSpacing` caps at ±1000 pt; `borderWidth` and the `line`
  item's `style.width` share one 0..=1000 pt stroke bound.
- **Named styles**: the `styles:` registry + `styleNames:` refs stay
  *named* in the file (round-trip; the GUI style picker);
  `undefined_style_name` and the `MAX_STYLES`/`MAX_STYLE_NAMES` caps.
- **Box decoration**: `borderWidth`/`borderColor` (drawn iff computed
  width > 0) + `backgroundColor` on every box (text, container, repeat
  cell, image) — emitted as one `RectShape` under the content, so
  renderers are untouched.
- **Overflow policies**: `textOverflow: visible|shrink|ellipsis|clip`
  on definite-height text (`shrink` = bounded bisection to a 4pt floor,
  `ellipsis` = kinsoku-aware `…` clamp, `clip` = reserve + cut);
  `overflow: hidden` clips container-like boxes to the border box via
  the tree's **clip group** (`LayoutItem::Clip` — the one nested node;
  fail closed on degenerate rects, renderer depth cap).
- **Font style properties**: `fontWeight`/`fontStyle` render real
  variant faces when the family has them, else synthetic bold
  (stroke)/italic (skew) with layout-owned constants; `letterSpacing`
  (± capped) is added to every advance in the one shared measurement
  path.
- **`textDecoration`**: `underline`/`line_through` resolved from the
  font's own metrics into a tree-level spec — renderers draw one rect
  per line with zero font knowledge.
- **`opacity`**: per-item paint alpha (deliberately not CSS group
  compositing); out-of-range warns and draws opaque.
- Capability keys: `styles`, `styleNames`, `style.fontWeight`,
  `style.fontStyle`, `style.letterSpacing`, `style.lineBreak`,
  `style.textSpacingTrim`, `style.hangingPunctuation`,
  `style.backgroundColor`, `style.backgroundColor.box`, `style.border`,
  `style.textOverflow`, `style.textOverflow.clip`, `style.overflow`,
  `style.verticalAlign`, `style.textDecoration`, `style.opacity`.
  Reference: [style](style.md).

### Text (`engine/layout`, `engine/render-*`)
- **HarfBuzz shaping (harfrust)**: text is shaped behind the single
  measure/draw seam (`font/shape.rs`) — kerning (advances tighten pairs
  like `AV`), standard ligatures (`fi`/`ffi` collapse to one glyph whose
  source range still spans every cluster char, so PDF ToUnicode
  extraction is unchanged), and GPOS positioning. A run is itemized into
  maximal same-face segments (the existing per-glyph fallback rule),
  each shaped by the face that covers it; chars no face maps keep the
  missing-glyph advance. `run_width` is exactly the sum of the shaped
  advances, so a line's reserved width equals its drawn width. Non-zero
  `letterSpacing` suppresses optional ligatures (CSS). Renderers never
  re-shape — the layout font layer decides every glyph id, advance, and
  offset. (harfrust is MIT, shares fontations' `read-fonts` with skrifa,
  no ttf-parser.)
- **Wrapping & CJK kinsoku**: greedy wrap with CJK break opportunities.
  `lineBreak` (a CSS `line-break` subset) selects the strictness of
  Line-start kinsoku: `normal` (default, CSS-aligned — small kana, `ー`, and `〜`
  may start a line), `strict` (also holds small kana, `ー`, and `〜゠`
  back), `loose` (only closing brackets and commas/full stops held;
  centered punctuation `・：；！？` and inseparables `‥…` freed), and
  `anywhere` (no kinsoku). Line-end kinsoku (opening brackets) applies in every
  mode but `anywhere`; prohibited characters are pushed off line edges by
  push-out. The prohibition sets live in one place (`shojiku-layout`
  `wrap::kinsoku`), shared with the ellipsis clamp. **Note:** `normal`
  follows CSS; documents that relied on the older `normal` (small kana
  held back) set `lineBreak: strict`. Break points use a per-char width
  estimate; each finished line is re-measured with shaping, so reserved
  and drawn widths cannot disagree.
- **Inline rich text — `spans:`**: styled fragments (`{ text|data,
  style, styleNames }`) inside one text item; only the text-run
  properties apply per span, layered on the block's computed style
  (block `textDecoration` propagates). Wrapping runs over the joined
  text (words cross span boundaries unbroken; kinsoku moves chars
  across spans); mixed sizes share one **uniform line grid** (one line
  height + one baseline per block). The tree carries per-run output
  additively (`TextLine.runs` + the block baseline; plain output is
  byte-identical), and both renderers draw through one shared runs
  view. Rich `textOverflow` honors `visible`/`clip`; `shrink`/
  `ellipsis` warn (`span_overflow_unsupported`). Capability key
  `text.spans`.
- **JP micro-typography — `textSpacingTrim` + `hangingPunctuation`**
  (both inherited, both default to a no-op so existing output is
  unchanged). **Half-width punctuation** (`textSpacingTrim: space_all | normal |
  trim_start`) trims the internal half-em a fullwidth punctuation carries:
  `normal` between two adjacent punctuation, `trim_start` also at a line
  head. Decision: it is **engine-synthesized after shaping** (a post-pass
  over the shaped advances in `shojiku-layout` `font/shape/trim`), *not*
  ridden off the OpenType `chws`/`halt` features — no bundled face carries
  `chws` and only `ipamj-mincho` carries `halt`, so a feature-riding design
  would be a silent no-op on the JP default face; the synthesis is
  deterministic across every face. **Hanging punctuation** (`hangingPunctuation: none
  | allow_end | force_end`) hangs a line-terminating comma/full stop past
  the end edge (a wrap post-pass in `wrap::hang`): `allow_end` for a comma
  that would otherwise wrap, `force_end` also for a fitting one (excluded
  from the alignment width). A line hangs **at most one character**, and
  only when the pull leaves a legal line start — a comma glued to a
  closing bracket (`…。」`) is kinsoku's to push out, so hanging never
  exposes a new violation. The hung character is excluded from alignment
  but kept in the reported inked width so `inspect` metrics stay honest;
  kinsoku and the hang pass split the work by one shared `hangable`
  predicate and each run once, so they terminate. The shaping API
  bundles these into `RunOptions`
  (`letter_spacing` + `trim` + `line_start`), the one home vertical
  writing's direction will join. v1 subset: trim covers adjacent-pair +
  line-head only. Both apply wherever the shared text block runs — plain
  text items, table cells, and bands; rich (`spans`) blocks are trimmed
  but not hung; `list` and `char_grid` get neither. `ellipsis` clamping
  drops any hang, and a table's auto-height row is pre-measured without
  trim/hang (a safe upper bound — they only reduce line count, never
  clip). Capability keys `style.textSpacingTrim`,
  `style.hangingPunctuation`.
- **Long-text pagination**: an auto-height flow text taller than the
  region splits at line boundaries like table rows, filling the current
  page first; decoration and vertical chrome are cloned per fragment —
  the WHOLE box, so per-side borders, `double` and dashed sides redraw
  complete at each fragment's height. A `minHeight` taller than the text
  keeps its reservation across the split: the slack `verticalAlign` put
  above the content leads the first fragment, the slack below it trails
  the last, so the fragment heights sum to the reserved height.
  Definite-height text never splits (that is `textOverflow`'s domain).
- **Missing glyphs**: `missing_glyph` fires only when *no* face in the
  fallback chain covers the char; deduped and bounded per block.
- Reference: [text](text.md).

### Vertical writing (`engine/core`, `engine/layout`, `engine/render-*`)

- **`writingMode: vertical_rl` + `textOrientation: mixed | upright`** —
  inherited [style](style.md) properties (CSS names) that turn a
  `type: text` item into a vertical block: characters fill a column
  top-to-bottom, columns lay out right-to-left, and `textAlign` maps
  along the column (left→top, center, right→bottom). `mixed` keeps
  CJK/kana upright and rotates Latin/digits 90° clockwise; `upright`
  keeps everything upright. Kinsoku (`lineBreak`, every mode) is honored
  via the shared prohibition sets. The mode is honored on every text
  surface — plain text, rich `spans` (per-span runs stacked down each
  column), `list` (entries become right-to-left columns), table text
  cells, and `page_number` — not just a plain text item. Capability keys
  `style.writingMode`, `style.textOrientation`,
  `style.writingMode.surfaces`. Reference:
  [vertical_text.md](vertical_text.md).
- **Decision — real vertical shaping, font-authoritative**: upright runs
  are shaped top-to-bottom by the text shaper (harfrust), which applies
  the font's GSUB `vert` feature (`ー`/dashes/brackets rotate as the font
  intends; the shaper deliberately applies `vert` only, upstream
  HarfBuzz policy on `vrt2`), advances by real `vmtx` values, and places
  glyphs by their vertical origin — no engine substitution or cell
  nudges on this path (`、。` positioning comes from the font's vert
  glyphs, matching browsers). Rotated Latin/digit runs are shaped
  HORIZONTALLY (full kerning and ligatures, the same
  letter-spacing-suppresses-ligatures rule) and drawn rotated 90° cw
  about per-glyph cells that tile the run exactly. Character orientation
  under `mixed` follows the **full UAX#50 Vertical_Orientation
  property** (a generated table, `scripts/gen-uax50.py`, pinned Unicode
  version; `U`/`Tu`/`Tr` upright, `R` rotated — halfwidth katakana now
  rotate). The arrangement has ONE home (`font::arrange_vertical`, every
  glyph carrying its final cell-relative draw position) that both
  renderers only translate/rotate; column extents are the sum of the
  shaped advances, and the wrapper's break-point estimate reads the same
  `vmtx` data per char, so measure and draw agree. Hostile-font
  numbers (advances, offsets, cluster ranges) pass range guards that
  degrade rather than blow up column math.
- **Decision — the closed presentation-form/nudge tables survive as the
  degrade path only**: a face whose bytes fail the shaper falls back to
  the per-char v1 arrangement (forms table + `、。`/small-kana nudges) so
  a broken font still renders a readable column — and now a readable
  [`char_grid`](char_grid.md) cell too (its vertical cells ride the same
  arrangement; § char_grid).
- **Decision — cover every text surface, degrade loudly only where the
  geometry is not v1**: rich `spans`, `list`, table text cells, and
  `page_number` render vertically (the wrapping engine already measures
  per-char down-advances, so a span carries `RichSpan.orient` and the
  same greedy/kinsoku pass breaks columns; a `list` entry becomes a
  right-to-left column; a table cell fills the row rectangle, its auto
  row as tall as the longest column). A text `mark:` (circled text) stays the
  one warned fallback (`vertical_text_unsupported`) — its glyph-band
  overlay is horizontal.
- **The block knobs apply with the axes swapped**
  ([vertical_text.md](vertical_text.md)): `textOverflow`
  clip/shrink/ellipsis against the box WIDTH; `verticalAlign` as the
  CSS-logical column-stack shift (top→right, middle→center,
  bottom→left; a table's injected cell default stays neutral);
  `hangingPunctuation` past the column bottom (plain AND spans paths);
  `textDecoration` as a side band (underline right of the em cell — the
  JLREQ side-line convention, a deliberate choice where CSS leaves `auto`
  UA-defined; line-through on the column axis; per-run bands for
  spans); `textSpacingTrim` as a vertical half-width-punctuation pass sharing the
  horizontal class tables (measure == draw through `vertical_extent`).
  `vertical_style_ignored` no longer fires (the code stays registered —
  append-only contract). Rich shrink/ellipsis keep warning
  `span_overflow_unsupported` (horizontal parity).
- **Column pagination**: a direct-flow vertical block whose columns
  overflow the box width continues on the next page (whole columns,
  reading order preserved, fragments re-anchored at each page's right
  edge; decoration cloned per fragment). Policy-resolved and
  cannot-fit-one-column overflows keep the `horizontal_overflow` warn
  and place whole; bounded contexts are unchanged. Table-cell rows keep
  measuring the UNTRIMMED extent (the wrapper's break estimate) so the
  definite-height render pass never re-wraps.
- **Per-column inspect metrics**: `text: { columns: [{ y, height,
  baseline, emLeft, emRight }] }` on a vertical item's placed box (the
  axis-swapped `lines`), rebuilt per pagination fragment. Capability
  keys: `inspect.text_metrics.vertical`,
  `style.writingMode.block_styles`.
- **Tate-chu-yoko (`textCombineUpright: none | { digits: N } | all`)** — an
  inherited style property (CSS `text-combine-upright` subset): runs of
  up to N (2..=4, parse-rejected outside) consecutive ASCII digits —
  or, under `all`, the WHOLE styled scope — share ONE upright 1em cell
  of a vertical column, on plain vertical text blocks, rich `spans`
  (the span cascade carries it; each `TextRun` records its own
  `combine` for the renderers), vertical `list` entries (the
  definite-`h` `…` clamp trims at combined-group boundaries — a group
  is kept whole or dropped whole), AND vertical `char_grid` cells
  (digits only — `all` does not apply to a grid of cells). The group is
  shaped horizontally on one face, compressed (never stretched) into
  the cell (`VGlyph.scale`, applied about the pen origin by both
  renderers), and measured as one cell by the wrapper (a run LONGER
  than N stays wholly uncombined — the CSS `digits` rule, no suffix
  re-combines; an `all` span is one ATOMIC token that never wraps
  mid-span). Horizontal text ignores it (CSS: the property acts in
  vertical modes only). Capability keys `style.textCombineUpright`,
  `style.textCombineUpright.all` (the `all` keyword + the span/list
  surfaces + ruby-everywhere below).
- **Ruby (`ruby: [{ base, text }]` + `rubySize`)** — template-authored
  reading pairs on a text item (verbatim strings, never interpolated —
  bound data cannot smuggle readings; the aozora markup stays
  char_grid's opt-in), honored on EVERY text surface: vertical plain
  and `spans` blocks (readings as small upright columns right of the
  base run — JLREQ), horizontal plain and `spans` blocks (readings
  centered above the base run's em band; the line box never grows —
  the documented convention is lineHeight ≳ 1.5). Bases match the
  DRAWN text in listed order (non-overlapping, forward), located
  through the same arrangements the renderers draw (per-run for rich
  blocks — a base may cross a span boundary); readings shrink linearly
  to the run's extent with a 4pt floor (`ruby_overflow`) and split
  proportionally when the base wraps. Default size = half the block's
  font size; `rubySize` overrides. Unmatched bases warn
  `ruby_base_not_found`. A ruby'd flow block PAGINATES with its
  readings — each fragment re-anchors its own lines'/columns' readings
  (the former place-whole limitation and the `ruby_unsupported` code
  are retired). Entries are bounded (`MAX_RUBY_ENTRIES` 256,
  `too_many_ruby_entries`); empty entries warn `empty_ruby_entry` at
  validate. Capability keys `text.ruby` (the original vertical-plain
  support), `style.textCombineUpright.all` (the every-surface + 
  pagination expansion).
- **Decision — char_grid vertical cells ride GSUB `vert`**: a vertical
  grid's cells are emitted as one-cell vertical COLUMNS (the tree
  carries the AUTHORED chars; `TextBlock.vertical: upright`), so the
  renderers' shared arrangement shapes them with the font's `vert`
  alternates — `ー` and brackets rotate as the font intends, `、。` sit
  where its vert glyphs place them — and shaper-less faces degrade to
  the closed forms/nudge tables automatically. The closed tables are no
  longer a tree-level substitution anywhere; char_grid ruby readings
  ride the same vertical path (real vmtx extents). Horizontal grids are
  unchanged. No new syntax → no new capability key.

### Hyperlinks (`engine/core`, `engine/layout`, `engine/render-pdf`)
- **`link: { url }` on text items, image items, and rich spans**: the
  URL takes `{key:format}` interpolation, resolved against the current
  data scope (per-element inside `repeat` cells). Object form only —
  reserved for `destination:` later; unknown keys reject.
- **Layout is the trust boundary**: the resolved URL is gated before it
  enters the tree — scheme allowlist `http`/`https`/`mailto`/`tel`
  (ASCII-case-insensitive), no control characters, ≤ 2048 bytes;
  rejects warn (`unsupported_link_scheme` / `link_url_too_long` /
  `empty_link_url`) and drop the link. The tree carries the sanitized
  URL on `TextBlock` (plain blocks) / `TextRun` (rich; span link
  overrides the block's, a rejected span link does not fall back) /
  `ImageShape`.
- **PDF backend** emits one borderless URI-action annotation per line
  rect (per run for rich), or the image draw box, after the page's
  surface closes; clip groups recurse with the same depth cap and
  fail-closed degenerate-rect guards as drawing. PNG ignores links (no
  annotation surface; links have no visual form). Capability key
  `link.url`.
- Reference: [link](link.md).

### Document metadata (`engine/core`, `engine/layout`, `engine/render-pdf`)
- **A root `document:` block** carrying `title`, `description`,
  `keywords`, `language` and `authors` — each taking `{key:format}`
  interpolation like static text, resolved against top-level params
  through the same binding funnel the drawn strings use. Unknown keys
  reject; there is no per-block `bindings:` map, so an interpolation
  name must be inside the reference charset.
- **Layout is the trust boundary**, as it is for links: values are
  interpolated, then gated before they enter the tree — no control
  characters, ≤ 2048 bytes, and for `language` a `[A-Za-z0-9-]` tag of
  ≤ 64 bytes. The language gate is load-bearing rather than tidy: the
  XMP writer escapes every other value but writes a language tag RAW,
  so an ungated tag could close the element and inject markup. A
  rejected field warns — `document_metadata_control_chars` /
  `document_metadata_too_long` / `invalid_document_language`, one code
  per reason so the whole message translates — and is dropped;
  over-long lists warn `too_many_document_entries` and keep the first 64.
- **A reject is never replaced by a fallback.** `title` falls back to
  the template `name:` then to `Shojiku Document`, and `language` to
  `defaults.locale` — but only from an ABSENT value, so a refused value
  cannot hide behind plausible output.
- **PDF backend** writes the whole set through krilla, which lands it in
  BOTH the `/Info` dictionary and the XMP packet, plus the catalog
  `/Lang` (what assistive technology reads) for the language. PNG
  ignores metadata — the format has no channel for it — exactly as it
  ignores links.
- **No creation date, by decision**: none is authorable and none is
  written, so the same inputs keep producing the same bytes.
- The resolved metadata rides `LayoutDocument`, so `inspect` exposes it
  to the GUI and to AI consumers for free. Capability key
  `template.document.metadata`.
- Reference: [document](document.md).

### Fonts (`packs/`, `engine/formatter`, `engine/layout`)
- **Fonts-only shared packs**: `packs/fonts/<pack>/manifest.yml`
  (version, one license per pack, `redistributable`/`embeddingAttested`,
  per-face `sha256`) referenced by flat `packs/locale/<id>.yml` via
  `uses:`. Face/family ids are one flat namespace (`fontFamily:
  biz-udp-gothic` regardless of pack); first-dir/first-id wins, so user
  packs override bundled ones. Every face is sha256-verified at load
  and OS/2 `fsType`-checked (`font_embedding_restricted` unless
  attested). A pack is confined to its own directory: a `uses:` entry
  must be a plain single path segment (letters, digits, `-`, `_`, at
  most 64 characters — anything else fails the locale-pack parse), a
  manifest `file:` may be neither absolute nor `..`-climbing, and the
  resolved face must still sit inside the pack directory once symlinks
  are followed. A pack directory that is itself a symlink is refused.
  A face file that is simply *absent* stays fine — that is how a pinned
  pack travels without its bytes.
- **Face-variant selection**: faces declare `family`/`weight`/`style`;
  `FontStore::resolve` matches with independent weight/style fallback
  and reports whether the pick is a *real* bold/italic — synthetic
  effects apply only when no real variant exists.
- **Per-glyph fallback chain**: the locale's `fonts.fallback` list is
  tried for glyphs the primary lacks (bundled faces only — never system
  fonts, for sign/verify determinism); the chain rides the tree so
  renderers draw each glyph with the face that measured it.
- **Bundled lineup**: ja default `biz-udp-gothic` (proportional kana,
  real bold) with fallback `ipamj-mincho` (IPAmj Mincho,
  the ~55k-glyph rare-name tail, IPA Font License v1.0); fixed-pitch
  `biz-ud-gothic` for aligned digits; `noto-sans` for en-US (real
  bold/italic/bold-italic). All packs OFL or IPA, redistributable.
- **CLI search paths**: additive `--font-dir`/`--locale-dir`
  (repeatable, earlier wins) over `$SHOJIKU_FONT_DIR`/
  `$SHOJIKU_LOCALE_DIR` over `./packs/{fonts,locale}`.
- **Pinned faces + host auto-fetch** (`fonts.face.url`): a manifest face
  may carry `url:` beside its `sha256`, so a pack travels as a *reference*
  (manifest, no bytes). The CLI resolves a missing face from a
  content-addressed cache or fetches it, verifies it against the pin, and
  caches it — all BEFORE layout, so render/sign/verify stay socket-free and
  a cache-resolved face renders byte-identically to an installed one.
  `--offline` refuses to fetch (warm cache + `--offline` = air-gapped, same
  output); `--font-fetch-allow <host>` extends the https-only allowlist
  (`fonts.gstatic.com`, `github.com`, `objects.githubusercontent.com`,
  `raw.githubusercontent.com`), re-checked on every redirect hop. Mechanics
  live in `engine/fetch` (`shojiku-fetch`), a host-only crate no engine
  crate depends on. Cache root: `$SHOJIKU_CACHE_DIR` > the platform
  user-cache dir.
- **Bytes-first loading (host-injected)**: alongside the filesystem
  loader there is a verified bytes-first path —
  `FontStore::load_from_injected` over `resolve_face_bytes` — where the
  host (browser/Workers WASM, the future MCP server) fetches each `uses`
  pack's manifest and face bytes and injects them. It runs the *same*
  sha256/fsType verification, first-id-wins dedupe, path confinement,
  and locale fallback chain as the filesystem path, so a rendered PNG is
  identical either way. The unverified `from_faces` shortcut is test-only
  and is never reachable through the authoring surface.
- **Subset loading (browser-preview posture)**: alongside the strict
  bytes-first loader (every `uses` pack required) there is an opt-in
  lenient path — `FontStore::load_from_injected_subset` /
  `resolve_face_bytes_subset` / the WASM `loadFontsSubset` op — that
  loads from whatever `uses` packs the host has fetched so far, SKIPS the
  absent ones, and returns their ids. A skipped pack's glyphs degrade to
  the existing `missing_glyph` diagnostic; the host fetches the pack,
  re-injects the full set, and reloads to upgrade the store in place. So
  a browser Designer paints a JP preset from the ~19 MB primary lineup
  (biz-ud + noto-sans-mono) without waiting on the ~45 MB `ipamj-mincho`
  fallback, which is fetched lazily only when the host sees a
  `missing_glyph` (a rare-kanji document) OR an `unknown_font_family` (a
  preset AUTHORING `fontFamily: ipamj-mincho`, whose glyphs the fallback
  face already covers, so `missing_glyph` never fires) — both over the
  absent-set gate. Only pack *absence* is lenient — a malformed manifest,
  missing declared bytes, or a `../` traversal in an injected pack still
  fails loudly (sha256/fsType integrity unchanged), and the DEFAULT-face
  (primary) pack stays required. The render/sign path is untouched: it
  uses the strict loaders for the full deterministic chain, so this is a
  preview-path posture only. Capability key: `wasm.fonts.subset`.
- **Per-face fetch hints on the WASM seam** (`wasm.fonts.faces`): beside
  `fontFilesNeeded` (file names only, shape unchanged) the session
  exposes `fontFacesNeeded(packId)` → JSON `[{file, url?}]` — the
  declared manifest's face list with each face's `fonts.face.url` pin,
  parsed engine-side so a JS host never re-parses `manifest.yml`. This
  is how a host re-fetches a pinned pack it does not ship bytes for
  (the Designer's picked-font draft reload). `url` is omitted when the
  manifest carries none; the sha256 deliberately stays engine-side
  (verification cannot be skipped from JS). Answers for DECLARED packs
  only — a load consumes the injection, so the listing is read between
  `addFontPack` and `loadFonts*`.
- **The Designer's Google-Fonts picker** consumes all of the above: a
  checked-in catalog snapshot (`scripts/gen-font-catalog.py` — static
  OFL/Apache families from google/fonts at ONE pinned commit sha, no
  API key), fetch-then-pin manifest generation in the browser (sha256
  via SubtleCrypto over the exact injected bytes, YAML-serialized —
  never string-composed), a locale-overlay `fonts.uses` extension, and
  an export kit (store-only zip: template + pinned manifest + verbatim
  licence text + overlay) that renders on a fresh machine via the CLI
  auto-fetch. Substance in `docs/code-map/gui-app.md`; variable families
  are excluded (PDF has no variable-font concept — the repo holds only
  the VF for them), widening via the Developer API is backlog.
- Fonts parse via **skrifa** (fontations); no ttf-parser in the tree.
  Reference: [fonts](fonts.md).

### Locale data & wareki (`engine/formatter`, `engine/cli`)
- **Builtin locale packs**: ja-JP and en-US chrome (number separators,
  currency symbols/precision, weekday names, date patterns, era data,
  font-pack references) is CLDR-generated YAML checked in under
  `engine/formatter/src/lang/builtin/` and compiled in via
  `include_str!` — `--lang ja-JP` (or the bare `ja`; case-insensitive,
  unique-language-prefix match) renders with zero pack files, and WASM
  ships locale data in-binary. Regenerated by
  `scripts/gen-locale-builtins.py` (authoring-time CLDR fetch, pinned
  version; CI never runs it — the render path stays network-free).
- **Shipped locale packs**: zh-TW, zh-CN, hi-IN and fil-PH ship as
  whole packs under `packs/locale/` — **a new locale is data, not
  engine code** (the locale-data boundary): the builtins stay ja-JP +
  en-US, and everything else is a file a host loads (`--locale-dir` /
  `$SHOJIKU_LOCALE_DIR`) or injects as a string (`setLocale(tag,
  text)`). One emitter generates both: `PACK_CONFIG` in
  `scripts/gen-locale-builtins.py` → `packs/locale/`, `CONFIG` →
  the builtins; every pack embeds the same `CURRENCIES` set. Goldens
  per shipped pack live in `engine/formatter/tests/shipped_packs/`. Every
  shipped pack also has a real DOCUMENT proof under `examples/business/`
  (a receipt per locale), not just unit goldens.
  Each pack references its font packs (`noto-sans-tc` / `noto-sans-sc`
  / `noto-sans-devanagari` + `noto-sans` for Latin fallback), so a zh
  or hi document renders glyphs instead of `missing_glyph` boxes.
- **Overlay merge**: a found `packs/locale/<id>.yml` deep-merges over
  the builtin per key — mappings recurse, scalars/sequences replace —
  so user files carry only the keys they change; a non-builtin locale's
  file is the whole pack (the shipped packs above). An id matching
  neither errors listing the builtin ids + searched dirs; ids are
  charset-guarded (`[A-Za-z0-9_-]`) before touching the filesystem.
- **Digit-group sizes (CLDR `#,##,##0`)**: the number wire carries
  `groupSize` (digits in the rightmost group, default 3) and
  `secondaryGroupSize` (the repeating size to its left, default = same
  as `groupSize`), so hi-IN renders `₹1,23,45,678` in lakh/crore
  positions instead of uniform 3s. The sizes are pack DATA derived from
  the locale's CLDR decimal pattern by the generator and emitted only
  where they differ from uniform-3; the engine's algorithm is generic,
  so a new locale needs no engine change. They apply to every numeric
  type (CLDR groups the decimal pattern, not just currency). Sizes come
  from untrusted pack input, so `0` means "no grouping" rather than a
  divide-by-zero, and an absurd size simply never matches.
- **Wareki era formatting**: the locale wire gains `eras:
  [{ name, start: "yyyy-mm-dd" }]` (strict date parse) + `eraYearOne`;
  pattern tokens `G` (era name) and `y` (era year, year 1 →
  `eraYearOne`, ja `元`) alongside Gregorian `yyyy`. Builtin ja-JP
  ships the modern era table (Meiji through Reiwa) and `wareki` date/datetime
  variants (`format: wareki` → `令和7年4月1日`); dates before every era
  fall back (`G` empty, `y` Gregorian).
- **Capability surface**: keys `locale.builtin` / `format.wareki` /
  `format.number.groupSizes`; `EngineInfo` gains `builtinLocales` for
  GUI locale pickers.
  References: [fonts](fonts.md),
  [data-binding](data-binding.md).

### Format model v2 (`engine/formatter`, `engine/core`, `engine/layout`)
- **CLDR-subset pattern grammar**: `'…'` literal quoting (`''`
  = apostrophe, unterminated quotes degrade), month names `MMM`/`MMMM`,
  full weekdays `EEEE`, the 12-hour clock `h`/`hh` + `a` (pack
  `dayPeriods`), and the compact era token `GG` (era `abbr`, 令和 →
  `R7.4.1`). The token inventory is an **append-only contract**;
  builtins regenerate from real CLDR shapes (en-US default is now
  `MMM d, y, h:mm a`).
- **Currency named variants**: `default` = the bare grouped
  amount (BEHAVIOR CHANGE — composes with template literals), `symbol`
  (`¥9,000`), `name` (`9,000円`, CLDR displayName). Precision:
  the field's `precision:` → pack override → the compiled CLDR fractions
  table (`currency-fractions.yml`, all codes — an unlisted code keeps
  its digits and warns instead of silently truncating). Every builtin
  pack embeds the same 24-code set (the locale-roadmap currencies +
  EUR). A `symbol`/`name` pick on a plain **number** promotes the value
  to the currency type with that variant (capability
  `format.currency.coerce`) — money display without a definitions type;
  validate accepts the two picks on number fields accordingly.
- **Semantic units**: definitions carry `unit: item` (a KEY,
  breaking change from the locale→string map); the pack maps it to
  plural-aware words (`one`/`other`) with `unitFormat` layout — en gets
  `1 item` / `3 items` with no leading-space hack; unknown keys render
  verbatim + `unknown_unit`. Percentages route through the locale
  separators + `percentFormat`.
- **Template presentation defaults**: `defaults: { style,
  formats }` + the `formats:` named registry (see
  [defaults](defaults.md)) — the root style heads the cascade
  and the `rem` root follows its computed fontSize; per-type format
  defaults mean placements just bind keys. Precedence contract:
  pack ← template default ← the field's `displayFormat:` ← placement, documented in
  [data-binding](data-binding.md); degradations warn
  (`unknown_format_variant` deduped, `format_pattern_ignored`) instead
  of failing.
- **Dead wire removed**: `Definitions.timezone` and the pack's
  `timezoneDefault` are gone (parsed-but-unused was a standing lie).
- **Document locale + currency in `defaults:`**: the document
  `locale` and `currency` moved out of `definitions.yml`'s top level
  into the template `defaults:` block — one home for presentation
  defaults, alongside the root style + per-type formats. `locale` is the
  CLI's pack-selection fallback (`--lang` > `defaults.locale` > `ja-JP`);
  `currency` is threaded to the formatter via `FormatContext` as the
  middle of the code chain (the field's `currency:` → `defaults.currency` →
  pack `currencyDefault` → `JPY`), so currency bindings stay a bare
  `{key}`. Hard move — the old `definitions.locale`/`currency` keys are
  removed; the definitions wire is now `deny_unknown_fields`, so a stale
  copy is a located parse error, not a silent drop.
- **Blank-form placeholder**: a `data:` binding and a `definitions.yml`
  field both take a `placeholder` — verbatim text drawn when the bound
  value is absent, `null`, or `""`, suppressing the
  `missing_data`/`format_error` an intentionally-blank fillable form
  would otherwise emit. Decision: the placement's `placeholder` overrides
  the field's, matching the `format` precedence; the field-level one also
  covers `{key}` interpolation segments (which carry none of their own).
  Drawn verbatim (never interpolated, never formatted); `""` = a clean
  blank. A value that is PRESENT but invalid still reports `format_error`
  (blank ≠ data bug), and whitespace/`0`/`false` are real values, not
  blanks. Resolved at the single layout binding choke point, so text
  `data:`/interpolation, spans, `qr_code`, `char_grid`, and table columns
  all honor it; images have no text placeholder. The blank↔filled
  one-template invariant now holds for typed text bindings, not just form
  marks and geometry — the `examples/forms/rirekisho-ja` blank ↔ filled-sample pair
  proves it. Capability key `binding.placeholder`.
- **Capability surface**: `format.patterns.cldr`,
  `format.currency.variants`, `format.units.semantic`,
  `template.defaults`, `template.defaults.document`, `template.formats`,
  `binding.placeholder`.

### Data-driven tables (`engine/core`, `engine/layout`)
- Array-bound rows, per-column keys, repeating headers, pagination,
  `emptyBehavior`, per-cell styles.
- **Header spanning & empty-cell merge**: `headerGroups` (a spanning group row above the
  labels, repeating with the header; each group's own `backgroundColor` /
  border paints over the row's band, so groups tint independently —
  capability key `table.headerGroups.style.fill`; an authored
  `verticalAlign` is honored on a group, on `header.style`, or on a column
  for its own label, the column's winning over the header's —
  `table.header.style.verticalAlign`) and opt-in `mergeEmptyCells`
  (empty text-cell runs merge into their right neighbor — the rirekisho
  education/employment heading-row case; qr/image cells never merge).
  Explicit body rowspan/colspan is deliberately out of scope: rows are
  data-driven.
- **Header labels interpolate**: a column `label` and a `headerGroups`
  `label` run through the same resolver every other text-bearing item
  uses, against **top-level** params (header chrome is document-level,
  not row-scoped). This was the last authored string the engine drew
  verbatim, which pinned one language into any template with a table;
  now `label: "{labels.amount}"` prints the heading the params carry. A
  brace-free label resolves to itself, so existing templates are
  byte-identical.
- **Non-text columns**: column `type: text | qr_code | image`.
  QR cells encode at layout (shared seam with the item, same caps);
  image cells draw per-element assets prepared by the scoped walk in
  `shojiku-image` (`dyn:<array>[<i>].<key>`, policy identity = the
  column `id`, loads capped at 1000 with `cell_image_assets_capped`),
  `fit` per column (`ignored_column_key` elsewhere).
- **Outer frame**: the per-side map form of the table's
  `borderWidth` draws a frame around each page fragment (double rules
  via `borderStyle`); the scalar form keeps the classic full grid.
- `Length` column widths (omitted = equal leftover share); authorable
  grid stroke/fills/zebra via the table/row/alternate/header style
  layers; fixed `row.height`/`header.height` (activating per-column
  `textOverflow`) or auto rows growing from `row.minHeight`;
  `keepTogether` breaks a table to a fresh page rather than splitting
  one that would fit.
- A table `id:` yields one box-index fragment per page, a column `id:`
  one placement per cell.
- **Placement — `box` on a table**: the same geometry map every
  item carries (geometry only; the grid border stays `style`). In the
  flow body it narrows/centers the table horizontally (`box.w`/`box.x` +
  `auto` margins) while pagination continues; in a container / absolute
  body / band / grid cell the table renders as ONE **bounded** block (no
  pagination — a too-tall block is the parent's `overflow` story) via a
  single `table_atom`. This unblocks two variable-row tables **side by
  side** (the A3 two-page-spread rirekisho). Pagination keys on a bounded table are
  inert and warn `table_pagination_key_ignored` at validate; a table in a
  cell stays unsupported (`table_in_cell`). Capability `table.box`.
- **Container cells (`cell:` columns)**: a table column renders EITHER a
  bound value (`data:`, optionally `type: qr_code`/`image`) OR a `cell:`
  sub-template of freely placed items, with the CELL's top-left as the
  coordinate origin and bindings scoped to the row element — the
  `repeat` cell's container, in a table column (both now share one
  slot-filling cell implementation). An auto row is as tall as its
  tallest cell; a fixed `row.height` wins and content past it follows
  the cell's own `overflow`. The exclusivity is a validate ERROR
  (`column_content_conflict` / `column_content_missing`) rather than a
  parse rejection, so the diagnostic carries the column's own path — a
  parse error truncates to `sections.body` at the internally-tagged item
  boundary — and a best-effort preview still renders (`cell` wins).
  A per-column `text:` interpolation shorthand was deliberately NOT
  added: a one-line cell holding one text item covers it without a third
  content mode widening the exclusivity matrix. `cellPadding` stays a
  text/qr/image knob (the cell corner is the origin; authors inset with
  `cell.box.padding`). Capability `table.column.cell`.
- **Conditional row styles**: `row.conditionalStyles` entries apply
  style layers to the body rows whose own element matches a
  `when: { key, equals? }` predicate — the form-mark vocabulary,
  row-relative (type-strict scalar match, array-contains for
  multi-select, or a boolean read when `equals` is absent). They layer
  in listed order after the base and zebra styles, so a data-driven
  layer always wins over the positional one; inherited properties reach
  the cells while non-inherited ones decorate the row band; the header
  row is never conditioned; and a missing key is silent, so a blank
  form renders identically to one with no entries. 16 entries max
  (`too_many_row_conditions`). Diagnostics
  `row_condition_not_boolean` (validate) /
  `row_condition_type_mismatch` / `row_condition_value_not_bool`
  (layout, warned once per entry). Capability
  `table.row.conditionalStyles`.
- Reference: [table](table.md).

### Imposition & repetition (`engine/core`, `engine/layout`)
- **`type: repeat` (n-up)**: tiles a data array into a rigid
  `columns × rows` grid of cells filling the flow region, paginating
  when a page fills; cells are element-scoped sub-templates (authored
  once, validated against the array property). Grid clamped to
  `MAX_IMPOSITION_PER_PAGE` 64. Examples: `examples/business/event-tickets-ja` (2×4 tickets), `examples/business/shipping-labels-ja` (2×3 shipping labels).
- **Start-in-place** (`repeat.breakBefore`): `breakBefore: auto` starts
  the grid at the flow cursor instead of forcing a fresh page, so a
  heading above a sheet no longer costs a page. Only the first page's
  ROW COUNT shrinks (to the whole rows fitting under the cursor); slots
  stay derived from the full region, so cells are identical on every
  page. A cursor too low for one row falls back to a fresh page without
  a diagnostic. Default `page` = the unchanged fresh-page grid.
  Demo: the imposition section of `examples/dev/layout-showcase`.
- **`type: repeat_flow`**: one auto-height card per element stacked at
  the flow cursor with a `gap`, paginating card-by-card (a card that
  doesn't fit moves whole — cards are atoms and never split).
- **Item-level box-index fragments** (`repeat.boxes`): both repeat forms
  place only cells/cards, but the item itself now emits one box-index
  fragment per page it fills (border == content, at the flow region's
  x/width, spanning the occupied vertical extent) carrying the item's
  `path` + `id:` — mirroring a table's per-page fragments, so a Designer
  can address the repeat item, not only its children. A page/array where
  nothing lands emits no fragment (a path may have zero placements).
- **Grid `gap` shorthand** (`repeat.grid.gap`): the imposition grid takes
  the CSS both-axes `gap` with `columnGap`/`rowGap` falling back to it,
  the same form a `box.type: grid` container already accepted. Negative
  gaps now clamp to 0 on this grid too — they previously overlapped the
  cells silently.
- **Cut marks** (`repeat.cutMarks`): `cutMarks: true` draws trim guides
  for the grid — two ticks per cut position (the grid's outer edges plus
  each interior gap's centre), reaching outward from the grid's bounding
  box into the page margin so no ink lands on a cell. Every page the grid
  occupies is marked with its own row count, and the full grid is marked
  even on a partly filled last sheet. A sheet side with no room outside
  the grid omits its ticks and warns `cut_marks_clipped`. The ticks are
  chrome: no box-index placement, no `id`.
- **Document-scope escape** (`binding.scope`): a binding inside any
  data-scoped construct (`repeat` cell, `repeat_flow` card, table `cell:`
  column) takes `scope: document` to read TOP-LEVEL params instead of the
  bound element — the store name / pickup date printed on every ticket.
  Default `element` is the unchanged ambient scope, and `document` is
  inert outside a construct so a sub-template composes identically either
  way. It rides every binding carrier including a form mark's presence
  binding and an `image` (whose asset then loads once under the shared
  `dyn:<key>` id rather than per element). A bare `{key}` keeps no scope
  slot — the `{key:format}` grammar stays two-part — so a mixed line
  reaches the escape by declaring the name (see below). `validate`
  follows the escape, so a document-scoped key is checked against the
  top-level scalars rather than skipping the check.
- **Named binding declarations** (`binding.declarations`): an item-local
  `bindings:` map of interpolation NAME → the same option set a `data:`
  binding carries, so a `{name}` inside a mixed line can take a scope, a
  placeholder, a format, or a key the reference charset cannot spell
  (`{品名}` otherwise prints its own braces). Carried by `text` (its
  `spans` resolve through the owning item's map), `qr_code`, `char_grid`,
  `list` (per-entry, so a declaration is entry-scoped unless it escapes)
  and `image` (its `link.url`); each item's `link.url` is covered too. An
  UNDECLARED name is unchanged — the name is the key at the ambient
  scope — and `data:` never consults the map, keeping the two namespaces
  separate. An inline `{name:format}` overrides the declaration's format;
  everything else comes from the declaration. Validation reports a
  declaration nothing uses, a name that redirects an already-resolving
  key, a name outside the reference charset, and — the mistake the
  feature exists for — a `{…}` that looks like a key but cannot parse.
  Bounded at 256 declarations per item (advisory).
- Capability keys: `repeat`, `repeat.breakBefore`, `repeat.grid.gap`,
  `repeat.cutMarks`, `binding.scope`, `binding.declarations`,
  `repeat_flow`, `repeat.boxes`.
  Reference: [repeat](repeat.md), [repeat_flow](repeat_flow.md),
  [data-binding](data-binding.md).

### QR & list items (`engine/core`, `engine/layout`)
- **`type: qr_code`**: content like a text item (`text:`/`data:`,
  scope-aware — per element in cells); encoded at *layout time* into
  merged vector rects (no asset pipeline, renderers untouched);
  `errorCorrection` levels; 1 KiB content cap and module-size warning.
- **`type: list`**: an array field, one entry per line, per-entry
  ellipsis (entries never wrap); a definite height clamps and appends
  the `overflowText` `{count}` line (`他{count}件`); `MAX_LIST_ENTRIES`
  1000; never paginates by design (a cell is a fixed slot). The
  per-entry `text:` template resolves against the array's declared
  element — including for a NESTED source — so its keys are validated
  and its values carry their field specs.
- Capability keys: `qr_code`, `list`. Reference:
  [qr_code](qr_code.md), [list](list.md).

### Form marks (`engine/core`, `engine/layout`, `engine/render-*`)
- **`type: ellipse`**: a box-inscribed oval (four cubic Béziers). No
  `data:` = always-on decoration; `data:` = the circle drawn only on a match.
  Styled by the unified `Style` decoration subset (+ `styleNames`);
  when no layer authors `borderWidth` the outline defaults to 1 pt
  black — a mark's visible geometry is its function.
- **`type: checkbox`**: an always-drawn stroked frame (chrome) plus a
  check mark (an open round-stroked polyline) drawn when `checked: true`
  or `data:` matches (`data` wins over `checked`).
- **Presence binding `data: { key, equals }`** (scope-aware like text):
  `equals` set = type-strict equality (`"2"` ≠ `2`); an **array** value
  is multi-select (draws when it *contains* `equals`); `equals` omitted =
  a boolean binding (draws on `true`). A missing value draws nothing,
  silently — the blank-form state.
- **Geometry is params-independent**: an unmatched mark still reserves
  its box, so the same template renders blank and filled params with
  identical layout (the one-template filled-sample workflow). Marks render as
  vector paths, never font glyphs, keeping output font-coverage-free.
- New tree primitive `LayoutItem::Path` (carries the backend-neutral
  `PathCmd` currency; both renderers already play paths back, stroke caps
  and joins forced round). New definitions field type `boolean`.
- **`alignItems: baseline`** (landed with the marks — label + mark rows
  drove it): row children align on their first text baseline; a child
  with no text (mark/rect/image/clipped box) synthesizes its baseline
  from its bottom edge, so a checkbox bottom sits on the label baseline.
  Column direction falls back to `start` (CSS); cross-axis auto margins
  win. Capability key `box.alignItems.baseline`.
- **Text-anchored circled-text `mark:` on a text item** (the overlay fix): a
  `mark: { data, padding?, style }` on a `TextItem` draws an oval that
  auto-centers on the item's glyph band and auto-sizes to it — no
  hand-measured coordinates, and a font change never invalidates the fit.
  Paint-only: it never changes the text's reserved box, so a blank↔filled
  pair never shifts layout. `data:` is the same presence binding;
  `padding:` overrides the clearance, whose default bakes in a perceptual
  **overshoot** (a round shape flush with the caps reads smaller than it
  is). Replaces the previous "place a standalone ellipse and pixel-tune
  the text `y` per font" workaround.
- **Checkbox auto-size**: `checkbox` `box.w`/`box.h` (indeed the whole
  `box:`) may be omitted — the frame defaults to the inherited font's
  **cap-height square**, the size that reads as matched to a label. An
  explicit size still wins.
- **Metrics surface (`inspect`)**: a text item's `PlacedBox` gains
  `text.lines[]` = per-line `{ x, width, baseline, capTop, emTop,
  emBottom }` in page coordinates, so a GUI (or an AI patch loop) can snap
  overlays to the glyph band instead of pixel-measuring a preview. Cap
  height / descent come from the face (OS/2 `sCapHeight`), with pure
  conventional fallbacks for faces that omit them. A paginated flow
  text rebuilds the list per fragment (band offsets are per-block
  constants, re-anchored at each fragment's line ys — the horizontal
  counterpart of the vertical splitter's per-fragment rebuild), so
  every page's placement reports its OWN drawn lines.
- Capability keys: `ellipse`, `checkbox`, `text.mark`,
  `checkbox.auto_size`, `inspect.text_metrics`. Reference:
  [form_marks](form_marks.md), [flex](flex.md).

### GUI enablers (`engine/layout`, `engine/cli`)
- **Path-addressed box index**: `layout()` returns a `BoxIndex` sidecar
  parallel to the pages — border+content boxes for every placement of
  **every** item, id-carrying or not (per element in repeats, per page
  in bands, per fragment in pagination; every table column cell). Each
  box carries a `path` — its structural address in the parse/validate
  diagnostic grammar (`sections.body.items[3].items[0]`, `…cell.items[1]`,
  `…columns[2]`, `…headerGroups[1]`), synthesized from position alone and
  never from an
  authored id — so a Designer canvas hit-tests and correlates every node
  back to YAML without GUI-side ephemeral-id injection. A table cell
  layout synthesizes without an authored home (the trailing header
  region no `headerGroups` entry covers, the all-empty `mergeEmptyCells`
  collapse) emits no box — a click falls through to the table fragment. An authored `id:`
  becomes an optional lookup alias on top (geometry is identical with or
  without it). The renderer contract never sees the sidecar. Capability
  key `inspect.boxes.all_items`.
- **`shojiku capabilities`**: `{ version, capabilities }` JSON with no
  inputs; the key list is the GUI's feature gate. **Every
  wire-format/output-surface widening appends a key in the same PR.**
- **`inspect` envelope**: `{ engine, document, boxes, margin }` — one
  stable handshake per render.
- **Diagnostics v2** (`engine/diagnostics`): every diagnostic carries a
  closed-enum `code`, typed `args` (`String | Number | Bool`), a
  re-categorizable `category`, an English `message` rendered from the
  code's registry template + args, an optional document `path`, and a
  non-contract `origin` (`file:line`). The engine never translates — a
  consumer localizes from `code` + `args`; `code` and per-code arg keys
  are an append-only frozen contract. `validate` surfaces structural
  parse failures as `parse_error` / `non_finite_number` diagnostics
  (with the field path + line/column) instead of an opaque error, so a
  GUI renders them inline. Duplicate `(code, path, message)` diagnostics
  collapse at the output boundary. Capability keys: `diagnostics.args`,
  `diagnostics.parse_error`. See [diagnostics.md](diagnostics.md).
- **Located layout diagnostics**: a layout-stage diagnostic names the
  item that raised it, in the box-index path grammar — the walk stamps
  the innermost enclosing item on the way out, so warnings raised by
  shared helpers, by the flow paginator, and by the pure box-model crate
  are all addressable without each emit site knowing where it is. `path`
  is structural only (a data key rides in `args.key`), so two items with
  the same problem no longer collapse into one unaddressable warning.
  Document-scope diagnostics stay unlocated. Inside a table a cell names
  where its content is AUTHORED, across all three passes over a row (the
  binding resolve, the auto-height measurement, the drawing pass): a
  column cell names its column, a `headerGroups` cell names its group
  (`…headerGroups[g]` — the same address its box-index placement
  carries, so boxes and diagnostics can never disagree; decided when the
  box index stopped addressing group cells as their leftmost column). A
  cell layout synthesizes (the uncovered trailing header region, the
  all-empty `mergeEmptyCells` collapse) is authored nowhere and stays on
  the table item, as do problems about the `headerGroups` list itself
  (`header_group_span_clamped`). Capability key:
  `diagnostics.layout.path`.

### Images (`engine/image`)
- Source classification (bundled path / `data:` URI / inline SVG /
  remote-rejected), `AssetPolicy` (open vs bundled-only + caps), path
  confinement, raster decode (png/zune-jpeg/gif/image-webp). SVG is a
  **subset parser** (roxmltree + svgtypes + kurbo).
- **`fit`** (CSS `object-fit`): `contain`/`stretch`/`cover`/`none`;
  the overflowing modes clip to the content box via the clip node.
  Capability key `image.fit.cover_none`.
- **The SVG viewport clips**, so an SVG gets that same clip node under
  EVERY fit, not only the overflowing ones. Its intrinsic size is the
  `viewBox`, but a path may lie outside it — and until this was fixed a
  `contain`/`stretch` SVG painted those paths over the rest of the
  page, past the box the template reserved for it. A raster is exactly
  its pixel rect, so it still clips only when the fit overflows
  (`Asset::clips_to_viewport` decides; the rule is the same for image
  items and `type: image` table cells).
- **SVG gradients**: linear/radial fills, both `gradientUnits`,
  `gradientTransform`, `spreadMethod`, one-level `href` stop
  inheritance (cycle-guarded), radial focal point; stops clamped and
  capped (`MAX_GRADIENT_STOPS` 256); degenerate/unknown gradients warn
  and skip, never panic. Gradient *strokes* warn and keep the solid.
  Capability key `image.svg.gradient`.
- **`opacity`**: a whole-image paint alpha (`0..=1`) applied as a group
  in both backends (PDF `push_opacity`, PNG `PixmapPaint.opacity` for
  raster + a temp-layer composite for SVG), so a partly-transparent
  image reads as one unit. Out-of-range values warn `invalid_opacity`
  and draw opaque. Capability key `image.opacity`.
- **Images in `repeat`/`repeat_flow` cells**: a static `src:` is one
  shared asset drawn once per element; a `data:` binding is
  element-scoped (`dyn:<array>[<i>].<key>`, loaded by the scoped cell
  walk in `engine/image/src/prepare/cells.rs` under the shared
  `MAX_CELL_IMAGE_ASSETS` cap it shares with table image columns).
  Capability key `image.cells`.
- **`image` definitions field type**: declares an image reference so the
  Designer can offer an upload widget and validation confirms the bound
  key exists; verbatim (like a string) when bound to text. Capability
  key `definitions.field.image`. Reference: [image](image.md),
  [definitions](definitions.md).

### Render backends (`engine/render-pdf`, `engine/render-png`)
- The layout tree (`engine/layout/src/tree.rs`) is the **single**
  layout↔renderer contract; every backend draws fully-resolved absolute
  pt and never re-measures or re-formats.
- **PDF** via **krilla** (pure Rust, write-only, automatic font
  subsetting; its `simple-text` shaping stays off — it would pull the
  unmaintained ttf-parser back in and could kern away from reserved
  widths).
- **PNG preview** via **tiny-skia** (BSD-3-Clause): rasterizes the
  *same* tree — glyph outlines from the font layer, one uniform px/pt
  `scale` as the only transform.
- Capability keys: `render.pdf`, `preview.png`, `inspect.boxes`.

### Signing & verification (`engine/signing`, `engine/verify`)
- **A separate lifecycle stage, never the renderer's job.** `render-pdf`
  does not sign; a signed PDF is always the output of an explicit step.
  Both crates are **host-side** — no sockets, and not in the WASM build,
  so the Designer renders in the browser but neither signs nor verifies
  there. The policy and its deferrals are
  [agents/signing.md](../agents/signing.md).
- **Invisible signatures over documents this engine rendered.** The
  writer appends an incremental-update revision carrying a signature
  dictionary, a zero-rect widget and an interactive form, and reports the
  `/ByteRange` around the reserved window. A document outside the
  supported shape (cross-reference streams, object streams, `/Encrypt`,
  an existing `/AcroForm`, a non-zero object generation) is refused by an
  explicit check that NAMES what was unsupported — never signed on a
  best-effort basis.
- **A private key is optional.** `prepare_sign` hands out the digest and
  the ranges and `complete_sign` takes a finished container back, so a
  caller whose key lives in a smartcard or a cloud service never puts it
  in this process; `LocalPemSigner` (PKCS#8 PEM, plain or passphrase-
  encrypted; RSA PKCS#1 v1.5 and ECDSA P-256, both over SHA-256) is one
  caller of that seam rather than a privileged path. What the external
  key actually signs is the CMS signed ATTRIBUTES
  (`SignatureContainer::to_be_signed`), which carry the digest — not the
  digest itself. The seam is reachable from outside the engine through
  the C ABI's two-call surface, the CLI's `sign-prepare` / `sign-complete`
  verbs, and every language SDK's `ExternalSigner`.
- **Signatures are reproducible**: the CMS container carries no
  `signingTime`, so the same document signed twice with the same RSA key
  yields the same bytes. `/ID` is carried into the appended trailer
  unchanged for the same reason.
- **Verification reports four independent checks** — the signature over
  the declared range, that the declared range COVERS the document, every
  certificate's validity period, and a chain to a **caller-supplied**
  trust anchor. The operating-system trust store is never consulted, and
  the clock is a parameter rather than a hidden global.
- **A valid signature over an incomplete range is a forgery, and the
  verifier says which one it found.** Because a PDF admits appended
  revisions, a document can carry a cryptographically perfect signature
  covering only its original bytes while a later revision changes what a
  reader sees. Coverage is therefore a check of its own, in its own
  field, so "valid signature, incomplete coverage" is distinguishable
  from "wrong signature".
- **The report states what it did NOT check** — revocation and
  timestamps — on a PASSING verdict as well as a failing one. A valid
  verdict that quietly skipped revocation would turn a missing capability
  into a false assurance.
- **One parser, shared.** `shojiku-verify` reads documents through
  `shojiku-signing`'s public PDF model and OID table rather than a second
  implementation: two parsers over the same bytes can disagree, and a
  disagreement means the verifier checked something other than what a
  reader sees.
- **An error on these surfaces cannot hold heap data, and the compiler
  enforces it.** Every variant is built from `&'static str` and numbers,
  which is what keeps a hostile file's bytes out of whatever logs a
  failure — and rather than trusting the next author to remember,
  `assert_errors_are_bounded!` asserts `!needs_drop` over each error type,
  so a variant that grew a `String` stops the build. The other surface's
  rule is the opposite on purpose: an authoring error CLIPS the text it
  quotes, because naming the mistyped key is its job — and it is handed
  to the compiler the same way, through the field TYPE rather than a
  call each site must remember (see below).
- **Everything the engine quotes back is bounded and control-free, by
  one guard.** Any message that echoes a template key, a params value, a
  pack id or a file path is text the document chose, so it is stripped of
  control characters (an escape sequence in an error is an injection
  channel into whatever terminal or log reads it) and of bidirectional
  formatting characters (which reorder how the rest of the line DISPLAYS
  without changing its bytes — the zero-width joiners are deliberately
  kept, since they carry meaning in real text) and clipped by
  character count — 200 for a single value, 400 for a whole message, and
  tighter where the domain says so (64 for a locale id, 32 for a
  currency code or a length snippet). A clipped value ends in `…`.
  The guard lives in one place, and the error enums carry an `Echo`
  field type rather than calling it, so a new variant cannot reopen the
  hole. Every surface that prints an engine error applies the same bound
  on the way out: the CLI's stderr and its per-diagnostic lines, the
  `--report` sidecar an SDK reads, the C ABI status wire, the MCP
  JSON-RPC error, and the `Error.message` the browser build throws.
  Diagnostic `args` were already bounded and are unchanged, so a
  translating consumer sees exactly the values it saw before.
  **A value composed INTO a message takes only a share of that message's
  budget**, so the text explaining the failure always survives beside it:
  a few diagnostics render as a single opaque `detail` field, and there an
  unbounded value would otherwise leave the reader a wall of their own
  input and no statement of what was wrong with it. The location a
  diagnostic points at is bounded on the same rule wherever it embeds a
  document-declared name.
- **The parsers that read attacker-chosen bytes have fuzz targets** —
  the shared document reader, the whole verifier, the `/Contents` window
  decoder, the CMS container decoder and the anchor loader. They live in
  `engine/fuzz`, outside the workspace (nightly + libFuzzer), and run on
  demand via `make fuzz`; the gates run the committed corpus through the
  same entry points instead, so the targets cannot rot and any crash
  found becomes a regression file. Seeds that would embed a certificate
  are generated at fuzz time, never committed — this repository holds no
  key material.
- No template wire change and no capability key: signing configuration
  never enters a template, and the capability registry describes the
  authoring surface, which these crates are deliberately not part of.

### Authoring surface (`engine/authoring`)
- **One shared lib layer** behind every host. The
  `validate`/`prepare`/`preview`/`inspect`/`capabilities` operations —
  and the `CAPABILITIES`/`EngineInfo` list — live in `engine/authoring`;
  the CLI, the MCP server, the WASM bindings, the C ABI library and the
  N-API addon are thin wrappers over the *same* layer, so no surface
  grows a second grammar and every surface advertises one identical
  capability set.
- **Bytes-first by construction**: inputs are source strings, fonts and
  assets are injectable bytes, locale packs are an id + an overlay
  string, and sha256 font verification happens inside the engine — the
  core surface has no filesystem or command-line dependency. Filesystem
  pack discovery (search dirs, overlay files) for the FS hosts (CLI, MCP
  server) lives in the crate's feature-gated `fs` module (default-on;
  bytes-injecting hosts build with `default-features = false`); command
  wiring stays per host. A `prepare` call returns the three-part bundle
  a Designer needs — preview-ready document + box sidecar + diagnostics
  — or the full diagnostics list on any error.

### CLI (`engine/cli`)
- `render` / `validate` / `inspect` / `preview` / `sign` / `verify` /
  `capabilities`; signing flags (`--key`, `--cert`, `--passphrase-env` —
  and deliberately no flag carrying the passphrase itself, since `argv`
  is readable by other processes); verification's required, repeatable
  `--anchor`; asset flags (`--assets-dir`, `--asset-mode`, `--allow/deny-dynamic-image`);
  preview flags (`--output`, `--scale`, `--page`); pack flags above. A
  thin wrapper over `engine/authoring` (see above): it adds file reads,
  filesystem search-dir resolution, stderr diagnostics, PDF-render
  composition, and output writing.
- **A machine-readable operation report** (`--report <path>` on `render`
  / `sign` / `verify`, capability key `cli.report`): one JSON object
  carrying `ok`, the engine's `diagnostics` on success as well as
  failure, a render's `pageCount`, a verify's `verification` report on
  either verdict, and — when it failed — a `failure` object naming
  whether the CALLER or the DOCUMENT was at fault beside the same
  `{step, kind, message}` the C ABI reports. It exists for the
  subprocess SDKs: stderr prose cannot express a diagnostic's `code` or
  its typed `args`, and nothing else on the wire separates caller error
  from a refused document. The spellings deliberately match the C ABI's
  (`pageCount`; `diagnostics` as the `{"items": […]}` object) so one
  mapping serves every SDK. The failure `message` is stripped of control
  characters and capped, as it is at the C ABI boundary, because an
  engine error quotes template paths and content. Purely additive:
  without the flag, stdout, stderr and the exit code are unchanged.
- **Signing in two calls** (`sign-prepare` / `sign-complete`, capability
  key `cli.sign.external`), for a key this process is never given.
  `sign-prepare` takes the document, the signer's certificate and an
  `--algorithm` (`rsa-pkcs1-sha256` or `ecdsa-p256-sha256`) and prints
  `{toBeSigned, digest, byteRange, capacity}` — the C ABI's own key names
  — on stdout, and carries the same object in the `--report` envelope as
  `prepared`. `sign-complete` takes the SAME three inputs plus
  `--signature <file>` holding the RAW signature bytes, and writes the
  signed document. Neither verb takes a key or a passphrase: what gets
  signed is the CMS signed attributes, and the certificate and the
  signature are both public. This is what the two subprocess SDKs drive.
- Prebuilt binaries come from `make cli-dist` (on-demand): release CLIs
  for linux x64/arm64 and windows x64-gnu plus `SHA256SUMS`, the
  artifacts a GitHub Release offers. macOS builds need a macOS runner
  and are produced at release time. No SDK ever downloads one.

### C ABI library (`engine/capi`)
- **`shojiku-capi`**: a `cdylib` exposing the authoring surface plus
  signing over a C ABI — the fourth thin host, and the binary the
  python / ruby / c# / java SDKs load. Operations:
  `shojiku_engine_info` / `validate` / `render` / `preview` / `sign` /
  `sign_prepare` / `sign_complete` / `verify`, plus `shojiku_abi_version`
  and the result accessors. The header
  (`engine/capi/include/shojiku.h`) is hand-written and pinned to the
  exports by a both-ways parity test that also pins the numeric status
  codes.
- **Signing in two calls, so the private key can stay out of the
  process.** `shojiku_sign_prepare` reserves the signature window and
  reports, as JSON, the bytes a signature must cover (`toBeSigned`,
  base64), the document's own digest, the `/ByteRange` and the window's
  capacity; the caller signs those bytes wherever the key lives — a
  cloud KMS, an HSM, a smartcard — and `shojiku_sign_complete` writes
  the finished signature into the document. `algorithm` is
  `"rsa-pkcs1-sha256"` or `"ecdsa-p256-sha256"`, and the signature is
  that operation's raw output (PKCS#1 v1.5 bytes; an ASN.1 DER sequence
  for ECDSA — what both major cloud key services return). What gets
  signed is the CMS signed ATTRIBUTES, not the bare document digest,
  which is why the payload carries both and names them.
  The pair is **stateless**: no prepared-document handle crosses, both
  calls take the same document, certificate and algorithm, and the
  second re-derives what the first prepared — sound because preparing is
  deterministic. Completing with a signature made over a different
  document is not detected at the boundary; it produces a well-formed
  document that fails verification. The two paths do not fork: the
  external one reaches the same `sign_document` call the local one does,
  and produces byte-identical output for the same material.
  Shojiku ships no cloud-KMS client of its own — the caller signs with
  whatever client their language already has. Capability key
  `capi.sign.external`.

### Node addon (`engine/napi`)
- **`shojiku-napi`**: the N-API addon the npm package loads, and the one
  host that reaches the engine THROUGH another host rather than beside
  it — node has no stdlib FFI, so it cannot load the C ABI library the
  way python, ruby, c# and java do, and an addon that re-parsed the
  request envelope would be a second definition of one wire. It links
  `shojiku-capi` and calls its entry points, so the envelope crosses
  unparsed and the status codes are the same integers. It reads the
  result handle into an owned value and frees it before anything reaches
  JavaScript, so the npm package never holds a pointer. The N-API shim
  is behind a non-default `shim` cargo feature, which keeps the
  marshalling glue out of the workspace test/coverage surface exactly as
  `engine/wasm`'s wasm-bindgen shim is kept out by its target gate;
  `make napi` builds it and loads the result under the node floor.
- **`shojiku_verify`** takes the signed PDF and required PEM trust
  anchors — there is no fallback to the machine's trust store, because
  the verifier never consults one. `success` is the VERDICT, so a caller
  who checks only that fails closed on an invalid signature, and the
  report (including the checks this release does NOT perform) rides the
  result either way; a failed verdict adds an error object naming the
  first failed check. A document that cannot be evaluated at all carries
  no report, which is a different fact from an empty one.
- **A render reports its page count** as `{"pageCount": n}` on the
  result's JSON payload — the artifact metadata every SDK exposes.
  It could not reuse `shojiku_result_page_count`, which counts a
  PREVIEW's rasterized pages; redefining that would have moved the ABI
  revision instead of appending to it. Signing reports no page count: it
  appends a revision to bytes it never laid out.
- **Three contracts hold the surface together**: nothing is
  NUL-terminated (every string and buffer crosses as pointer + length,
  because PDF bytes contain NUL); exactly one allocation kind crosses,
  with one destructor, and accessors lend pointers that die with it; and
  a panic becomes a status code rather than an unwind, so no profile
  building this crate may set `panic = "abort"`.
- **Operations may be called concurrently**, and the header says so:
  the library holds no shared mutable state, so concurrent calls neither
  interfere nor need a caller-side lock, and they produce identical
  bytes for identical input — determinism is not a single-threaded
  property. A HANDLE is still single-owner (one free, never shared
  across threads). The claim ships executed: four threads render one
  document and are asserted to produce the same bytes as a
  single-threaded call. This is what lets a binding release its
  runtime's lock (a GIL, a GVL) around a call.
- **Two failure levels**, mirroring the SDK contract: a non-zero status
  means the caller erred (null pointer, non-UTF-8, a request the schema
  rejects); a document that will not lay out, a pack that is not
  installed or a key that will not sign are outcomes — status zero,
  `success` zero, engine diagnostics attached, untranslated. Both render
  the same `{step, kind, message}` object.
- **Inputs are text, not paths**: one JSON request envelope carrying the
  template/definitions/params sources (`deny_unknown_fields`, so a
  misspelled key is a located error), with the PDF, key, certificate and
  passphrase crossing `sign` as separate byte arguments — key material
  is read in place and never copied. No network surface: a font pack
  that is missing is a failure, never a download.
- Artifacts come from `make capi-dist` (on-demand): release cdylibs for
  linux x64/arm64 and windows x64-gnu plus `SHA256SUMS`. macOS builds
  need a macOS runner and are produced at release time.
- Capability key `capi.abi`, so a consumer reading engine info from any
  host learns this build ships the C ABI; the revision itself comes from
  `shojiku_abi_version`.

### MCP server (`engine/mcp`)
- **`shojiku-mcp`**: a stdio MCP server (newline-delimited JSON-RPC 2.0,
  hand-rolled — zero new dependencies, no async runtime) exposing the
  authoring surface as tools: `validate` / `render_preview` /
  `inspect_layout` / `capabilities`. Capability key `mcp.stdio`; the
  binary ships in the Docker image
  (`docker run -i --entrypoint shojiku-mcp`).
- **Diagnostics ride every template tool response** (the
  [agents/mcp.md](../agents/mcp.md) three-part principle): `render_preview`
  answers one PNG image part per page followed by the diagnostics JSON;
  `inspect_layout` answers the inspect envelope + diagnostics; the
  layout tree/boxes for a preview are retrievable via `inspect_layout`
  with the same inputs. A conformance test pins the tool names/schemas,
  and a guard test keeps an image from ever traveling alone.
- **Each source travels as a path or inline** — `definitionsPath`/
  `templatePath`/`paramsPath`, or `definitions`/`template`/`params`
  carrying the source text itself for a client that shares no filesystem
  (capability key `mcp.inline_sources`). The two spellings of one source
  are mutually exclusive (invalid params), and an inline payload is
  capped at 512 KiB per argument, independent of the transport's own
  frame cap. Optional `lang`/`scale`/`page` are unchanged.
- **Asset policy is per call** (`mcp.asset_policy`), mirroring the CLI:
  `assetsDir` picks the bundled-asset root, `assetMode`
  (`open` | `bundled-only`) with the `allowDynamicImage`/
  `denyDynamicImage` id lists (≤256 entries each) shrinks what
  params-supplied image content an item may carry. Defaults are the
  previous behavior — open policy, root = the template file's directory;
  an inline template resolves bundled assets only when the call passes
  `assetsDir` (otherwise a `src:` answers `assets_root_missing`).
- Packs resolve via the same search-dir chain
  as the CLI (`--font-dir`/`--locale-dir` > env > `./packs/*`). Broken
  templates answer their diagnostics in-band (`isError`), gated BEFORE
  pack/font loading so environment errors never mask them; hostile
  frames (oversized lines — 1 MiB cap —, malformed JSON, unknown
  methods/tools with clipped echoes) get JSON-RPC errors and the loop
  survives. Responses are bounded: at most 20 pages per preview call
  without an explicit `page`.

### Build / CI / security posture
- Pure-Rust workspace, single static binary, clean WASM story.
- **Anti-bloat gate**: every `.rs` ≤300 lines hard with a first-line
  `//!` role header (`make budget`); function length via
  `clippy::too_many_lines` (150).
- `cargo deny` (advisories/licenses/bans/sources, **zero ignores**),
  trivy on the Docker job, Dependabot weekly, **coverage blocking at
  100% lines**; doc-only changes skip CI.
- License: triple **MIT OR Apache-2.0 OR BSD-3-Clause**. Bundled
  examples (the full inventory + gallery order live in
  `docs/code-map/repo.md` and README.md § Gallery): business documents
  (`invoice-ja`/`invoice-en`, `estimate-ja`, `delivery-note-ja`,
  `pickup-slip-ja` — the Thinreports-migration worked example,
  `application-form-ja`, `event-tickets-ja`, `catalog-ja`,
  `shipping-labels-ja`, `certificate-ja`/`certificate-en`,
  `restaurant-menu-us`), education and publishing (`kokugo-print-ja`,
  `genkoyoshi-ja`/`-yoko-ja`, `novel-ja` — the vertical-typography
  showcase), the six locale receipts
  (`receipt-ja`/`-us`/`-zh-tw`/`-zh-cn`/`-hi-in`/`-fil-ph`),
  `examples/dev/layout-showcase` (component tour), the per-locale
  `examples/presets/blank-*` family, and
  `examples/forms/rirekisho-ja` (A3 landscape custom size; authored end-to-end by a
  zero-context AI via `skills/shojiku-template-author/` — the
  authoring-skill proof).

## Decision log

- **Signing with a key held elsewhere is two stateless calls, and the
  key service is the adopter's.** The engine has had the
  `prepare_sign`/`complete_sign` split since the signing crate shipped;
  what it lacked was any way to reach it from outside. A prepared-document
  HANDLE was rejected: the C ABI has exactly one allocation kind and one
  destructor, and a second would be a second ownership rule in seven
  SDKs. So both halves take the same document, certificate and algorithm,
  and the completing half re-prepares — which the existing determinism
  guarantee (`/ID` carried through, no `signingTime`) makes exact, and
  which removes the class of bug where a caller supplies a digest that
  disagrees with the bytes being signed. The completing half also reaches
  the engine through the shipped `Signer` trait rather than a second
  code path, so the external and local routes provably write the same
  bytes. Shipping AWS/GCP KMS clients was rejected in the same pass:
  `deny.toml` carries zero advisory ignores, the SDKs are thin wrappers
  by contract, and every one of these languages already has a first-party
  client in the adopter's application.

- **Document metadata is PDF-only, and its language gate is a security
  control rather than validation.** The PNG backend has no metadata
  channel, so `document:` is silently inert there — a warning would fire
  on every Designer preview and redden the WARNING-clean examples gate,
  and the same reasoning already governs links. On the PDF side the XMP
  packet is XML: the writer escapes ordinary values but emits a language
  tag verbatim, so `language` is charset-gated where the other fields
  only need control-character and length gates. Two further calls fell
  out of writing it: a gate REJECT does not fall through to a fallback
  (the fallbacks exist so a value is not authored twice, not to paper
  over a refusal), and `creationDate` is not authorable at all — a
  rendered timestamp would break "same inputs ⇒ same bytes", which
  signing rests on. Adding `language`'s fallback to `defaults.locale`
  changed the bytes of every committed example that declares a locale:
  one added `dc:language` + `/Lang` element, no page pixels moved.

- **char_grid alignment reuses `textAlign`; the shift is per line and
  post-assignment.** No `start`/`end` logical keywords were added: the
  physical values already name the line's end in vertical writing (the
  vertical text block's mapping), so widening the enum for every item
  would have bought nothing. Alignment shifts cells AFTER assignment
  rather than driving it, which is what makes the kinsoku interaction
  fall out for free: a full line has no free cells, and a hanging-punctuation cell
  sits in its line's last cell — so wrapped body text and hung
  punctuation never move, and only the entry-grid case shifts. Per-line
  (CSS) semantics over whole-content: the driving case is single-line
  entry grids, and per-line is what an author already expects from
  `textAlign`. The value is read item-level (never inherited) for the
  same reason `fontSize` is — cells are cell-relative, so an inherited
  body alignment must not silently shift a grid.
- **Aozora `［＃改ページ］` is the sheet-break wire; other notes stay
  literal and warn.** The Aozora Bunko corpus carries the notation natively,
  so a pasted public-domain text needs no re-authoring — and it rides
  the EXISTING `markup: aozora` opt-in rather than adding a second
  grammar or an item-level key, keeping the standing posture that
  unmarked bound data renders verbatim. Break collapse mirrors
  `type: page_break`'s fresh-page no-op (leading / consecutive /
  trailing add nothing), so the two breaks are one mental model. The
  unsupported-note diagnostic deliberately ECHOES its note (the
  `missing_glyph` precedent) instead of the parser's usual no-echo
  posture: an aozora paste carries many notes, and "which one did you
  ignore" is the whole value — the note scan's 64-char cap is what
  makes the echo bounded.

- **Font fetching is a host crate, never the engine.** Pinned-face
  auto-fetch (`fonts.face.url`) lives in `engine/fetch` (`shojiku-fetch`),
  which the CLI depends on and no engine crate does — so the network + TLS
  dependency tree stays out of `shojiku-authoring` (which WASM builds) and
  out of formatter/layout/render entirely. The seam is
  `FontStore::load_from_specs`: the host fills a cache and repoints each
  face's path, then loads exactly as the filesystem path does (same
  sha256/fsType verification), so the fetch is invisible below it. The pin
  is the integrity control and fetch failures are hard errors (no
  fallback), which is what preserves "same inputs → same bytes"; the host
  allowlist is only defense-in-depth. MCP auto-fetch was deliberately NOT
  added (an AI-driven server must not be SSRF-able by a passed-in
  manifest); the WASM seam ships the `url` hint READ-ONLY
  (`fontFacesNeeded`, key `wasm.fonts.faces`) — the engine still never
  fetches; the JS host does, behind its own allowlist.
- **The Designer's font catalog is a checked-in snapshot pinned to one
  google/fonts commit, not an API call.** Probed alternatives all failed
  a hard requirement: Google's unauthenticated metadata endpoint carries
  no file urls and no licence field; both css APIs return opaque
  `l/font?kit=` urls (and silently dropped requested faces); Fontsource
  and Bunny redistribute Google Fonts as unicode-range SUBSETS (~360
  glyphs vs ~3000 full) behind a mutable `@latest` url — fatal for a
  sha256 pin and for verbatim user data. Commit-pinned
  raw.githubusercontent urls are immutable, the family's own licence
  text lives in the same tree, and the host is already on the engine's
  default fetch allowlist, so an exported kit renders with zero extra
  flags. Accepted cost: variable-only families (Roboto, Open Sans,
  Inter, Montserrat) are absent until a Developer-API (keyed) snapshot
  widens the catalog — the snapshot schema already accommodates it.
- **A new locale is a pack, not a builtin.** Enabling zh-TW/zh-CN/hi-IN/
  fil-PH added ZERO engine `src/` lines: the wire already carried every
  piece (standalone whole-pack parse, `setLocale(tag, text)`, the host
  `--locale-dir` discovery), so the work was data + one emitter target.
  The builtins stay ja-JP + en-US deliberately — they exist so the
  engine renders those two with no file on disk (and so WASM ships them
  in-binary), NOT as the growth path. Growing `BUILTIN_LOCALE_IDS` puts
  locale data in every binary that will never render that locale; a pack
  costs a host one file read. Corollary: the emitter
  (`gen-locale-builtins.py`) gained a `PACK_CONFIG` target rather than a
  second script, so builtins and packs cannot drift in shape.
- **Two zh presets, not one shared "Chinese" preset.** zh-TW and zh-CN
  differ in script, currency (TWD/CNY), tax wording and decimal
  convention (whole NT$ vs yuan/jiao/fen subdivision), and the Designer catalog is strictly
  per-locale — one preset tagged for both would show wrong wording to
  one market and leave the SC font pack render-unproven. The marginal
  cost is one example directory; the two receipts share a geometry so
  the diff between them is purely linguistic.
- **Chinese font packs are primary-tier, not lazy.** The lazy tier
  exists for the 45 MB rare-kanji FALLBACK (ipamj-mincho), which a
  document needs only for unusual glyphs. `noto-sans-tc`/`-sc` (11/16
  MB) are the DEFAULT face of their locale: lazy-loading them would make
  every zh first paint a wall of `missing_glyph` boxes, then re-render.
  The existing 25 MiB `packTier` threshold already sorts this correctly
  — the rule is about the face's ROLE, and size happens to track it.
- **WASM host-misuse errors carry their own code registry, not
  `DiagnosticCode`.** Document problems are diagnostics (the translating
  `code` + `args` contract); host-API misuse (no locale, a stale
  `pageIndex`, …) is a different axis — a programmer/host error, not a
  template problem — so it gets a separate append-only `WasmError::code()`
  registry rather than sharing the diagnostics enum. It reuses
  `ArgValue` for arg sanitization only. Keeping the two apart means a
  host can `catch` and branch on a recoverable code (clamp + re-render)
  without the diagnostics catalog ever having to describe host errors.
- **MCP server = hand-rolled stdio JSON-RPC, not an SDK crate.** The
  official Rust MCP SDK (rmcp) drags tokio + a ~30-crate transitive
  tree into a workspace whose deny.toml carries zero advisory ignores;
  four tools over newline-delimited stdio need only serde_json (already
  present), so `shojiku-mcp` implements the loop directly (user
  decision). Revisit if the surface grows past tools (resources,
  sampling) or a second transport lands. Tool inputs are file **paths**
  (the AI authoring loop works on project files; asset-root semantics
  match the CLI) — inline-content arguments remain an additive widening.
  The CLI's filesystem pack discovery moved into `shojiku-authoring`
  behind a default-on `fs` feature so both FS hosts share one search-dir
  contract while WASM builds stay filesystem-free
  (`default-features = false`).
- **Shapes converged onto `Style`; `line` stayed out; marks keep a 1pt
  frame default.** One property model = one GUI property panel — the
  driver for folding `RectStyle` pre-1.0 (breaking: the implicit 1pt
  rect stroke is gone, `fillColor` → `backgroundColor` with no alias,
  matching the `hide` removal precedent). The form marks deliberately
  keep an item-level 1pt outline default on top of Style (like the
  table grid's 0.5pt): a checkbox/ellipse whose frame vanished on an
  unstyled form would break the blank↔filled printing invariant.
  `line` keeps `width`/`color` — it strokes a segment, not a box, and a
  per-side `rect` border now covers the "rule that follows the box
  model" case. Marks stroke ONE closed path, so per-side maps reduce to
  the top side with a warning instead of pretending four bands.
- **Preview transport = browser WASM, shipped as `engine/wasm`.** The
  Designer previews client-side via a wasm build of the render path — a
  static app (Cloudflare Pages deployable, standalone-capable), never a
  parallel renderer. The production bindings (`engine/wasm`, crate
  `shojiku-wasm`) are the **third thin host over `engine/authoring`**
  (after the CLI and MCP server), built for `wasm32-unknown-unknown`
  with authoring `default-features = false` (no filesystem). Decisions:
  the crate lives **inside the engine workspace** (it takes the same
  gates — 100% coverage, line budget, deny — as any production code; the
  `#[wasm_bindgen]` shim is a marshalling-only module gated to
  `cfg(target_arch = "wasm32")` so the pure session core stays
  host-coverable, and `wasm-bindgen`/`js-sys` are target-gated so no
  host build pulls them); the **JS API is JSON-string-in/out + byte
  arrays** (diagnostics `{"items":[…]}`, the inspect envelope, and
  capabilities are the SAME JSON the CLI/MCP emit — one wire grammar —
  and PNG/RGBA/font bytes cross as `Uint8Array`, never base64); a render
  returns the **three-part bundle** (pages + inspect envelope +
  diagnostics), and document problems come back AS diagnostics — the
  surface throws only on host-API misuse (fonts not loaded, no locale, a
  non-finite scale). Fonts/assets/locale packs are injected ONCE and
  retained, so a debounced edit re-passes only the source strings. The
  verified bytes-first paths are `FontStore::load_from_injected` (sha256
  + embedding checked) and the new **`prepare_assets_injected`** —
  bundled `src:`/`data:` images resolve against a host-injected byte map
  (`AssetsRoot::Injected`) with the SAME walk, keys, caps, and
  traversal-confinement as the filesystem path, so JS never hand-computes
  an asset key. Preview has an encode-free **raw-RGBA form** beside PNG
  (`render_raw`/`preview_raw`, capability `preview.raw`): un-premultiplied
  RGBA the canvas paints via `ImageData`, skipping the PNG encode that
  was ~78% of the spike's render time. Size (`make wasm`, `wasm-release`
  profile — opt-level=s + fat LTO, then `wasm-opt -Oz`): **4.67 MB raw /
  1.63 MB gzip**, budget-gated (≤5.5 MiB / ≤1.6 MiB); the budget has been
  raised twice, once for engine feature growth and once for the PDF
  backend joining the build (see the browser-PDF entry below). The throwaway feasibility spike
  (`spike/wasm-preview/`) proved this and has been **removed**; its
  disqualified shortcuts (`from_faces` no-verify, thrown-string
  diagnostics) never entered the production layer. Its baseline numbers
  (spike, receipt-ja A4 @ scale 2, Apple Silicon Chromium): binary
  4.07 MB raw / 1.28 MB gzip, instantiate ~150 ms, parse 39 ms + layout
  ~25 ms + PNG encode ~230 ms, font payload 8.9 MB injected in ~6 ms.
  Capability keys: `wasm.bindings` (the host surface) + `preview.raw`.
  A browser golden-path e2e (`make wasm-e2e`, Playwright in Docker) is
  on-demand, not in `verify`; `make wasm` (build + size budget) IS in
  `verify`.
- **Typed host-misuse errors (capability `wasm.errors.typed`).** The
  surface's host-misuse throws (no locale, fonts not loaded, a stale
  `pageIndex`, an uncapped raw all-pages request, …) cross the boundary
  as a JS `Error` carrying a stable snake_case `code` string and a typed
  `args` object alongside the message — the diagnostics discipline
  applied to the host-API surface, so a host branches on the code (clamp
  a `page_out_of_range` and re-render) instead of matching the
  localizable message. `WasmError::code()`/`args()` (in
  `engine/wasm/src/error.rs`, reusing `shojiku_diagnostics::ArgValue` so
  a hostile locale/font detail is control-stripped/clipped) are an
  append-only registry; the message is unchanged, so an older host that
  only reads `.message` is unaffected. Document problems still ride the
  render bundle's diagnostics, never a throw. The Designer transport
  surfaces the same `code`/`args` on its `TransportError`.
- **Preview page selection (capability `preview.page`).** Both WASM
  render ops (`renderPng`/`renderRaw`) take an optional 0-based
  `pageIndex`: passed, they rasterize ONE page instead of every page;
  omitted, the previous all-pages behavior holds. The single-page
  primitive is `render_png_page`/`render_raw_page` in `render-png`
  (bounds-checked, `RenderPngError::PageOutOfRange`), surfaced through
  authoring as `preview_page`/`preview_page_raw`; a selected page is
  byte-identical to that page of the all-pages render (same
  validate-once/rasterize pipeline). Two motivations settled the shape:
  **memory** — the raw-RGBA form accumulates every uncompressed page in
  the module heap before crossing to JS, so the WASM all-pages *raw*
  render is now capped (`MAX_RAW_PAGES` 20, mirroring the MCP
  preview-page cap) and throws a typed `TooManyRawPages`; the PNG form
  encodes-and-drops per page and stays uncapped; **host parity** — the
  CLI `--page` and the MCP `render_preview` `page` arg (both 1-based, the
  established host convention) now push selection down through the same
  authoring seam, rasterizing only the requested page instead of
  all-then-select (observable output/messages unchanged; the page count
  for the range/cap check comes from the laid-out document, needing no
  render). Single page only — no range form until a consumer needs it.
- **Real PDF output from the browser (capability `wasm.render.pdf`).**
  The Designer previewed PNG pixels, so the actual deliverable was unseen
  until the CLI ran. `shojiku-render-pdf` therefore joins the WASM build
  and the host exposes `renderPdf(template, params, definitions?)` →
  `{ ok, pdf, diagnostics }`. Composition stays in the HOST, exactly as
  the CLI does it — `engine/authoring` still does not depend on
  render-pdf, so that layer keeps building for `wasm32` without the PDF
  stack. The op takes no `scale` (PDF is vector) and no page index (a PDF
  is the whole document), and deliberately imposes **no cap of its own**:
  a cap the CLI does not apply would make a browser download differ from
  the CLI's output, which is the exact gap this closes; layout's page cap
  is the bound. The bundle omits the inspect envelope (a canvas concern
  the preview loop already holds fresh). Verified by rendering
  `examples/business/receipt-ja` through the browser engine and comparing
  sha256 against the committed `output.pdf`: **byte-identical**, ~38 ms
  with the full ja font set injected. krilla compiles for
  `wasm32-unknown-unknown` unmodified; its cost is paid by adding
  **`wasm-opt -Oz`** to `make wasm` (which also cut the pre-PDF module by
  37% raw / 11% gzip) plus a gzip-budget raise 1.5 → 1.6 MiB — net
  transfer 1.39 MB → 1.63 MB. Browser-side, a PDF is rendered only after
  the FULL font set is loaded (the preview's lenient subset load would
  otherwise embed fallback glyphs and break the byte parity), and the
  bytes reach the user through the host's existing download seam — the
  GUI still never renders or writes a PDF itself, it shows the engine's
  bytes in the browser's own viewer.
- **Subset font-pack loading for the browser preview (capability
  `wasm.fonts.subset`).** A browser Designer must not block a JP preset's
  first paint on the locale's full `uses` chain — ja-JP is ~64 MB, ~45 MB
  of which is the `ipamj-mincho` rare-name fallback. So the WASM host
  gained an opt-in lenient load (`loadFontsSubset` →
  `Session::load_fonts_subset` → `FontStore::load_from_injected_subset` →
  `resolve_face_bytes_subset`) that builds the store from whatever `uses`
  packs are injected so far, SKIPS the absent ones, and returns their ids.
  A skipped pack's glyphs degrade to the existing `missing_glyph`
  diagnostic (no new code); the host lazily fetches the pack, re-injects
  the FULL set (it holds the bytes JS-side, so there is no engine-side
  double residency), and reloads to upgrade the store — the fetch → inject
  → reload loop itself lives in the `designer-app` shell. **The ipamj-mincho split was
  decided against**: no `ja-names` optional-pack split and no lighter
  Designer-side fallback — lazy fetch alone, so the primary lineup
  (biz-ud + noto-sans-mono ≈ 19 MB) paints immediately and the 45 MB
  fallback is fetched on demand: on `missing_glyph` when a rare kanji
  needs it, or on `unknown_font_family` when a preset authors
  `fontFamily: ipamj-mincho` directly (the shell's trigger set, both over
  the absent-pack gate).
  Leniency is *absence*-only: a malformed manifest, missing declared
  bytes, or a `../` traversal in an injected pack still fails loudly, and
  the primary (default-face) pack stays required. Render/sign determinism
  is untouched — packs stay sha256/fsType-verified at injection and the
  strict loaders (the render path) still require the full chain; this is a
  preview-path posture only.

- **Authoring surface = one shared crate (`engine/authoring`), not a
  widened CLI lib.** The CLI's `validate`/`prepare`/`preview`/`inspect`/
  `capabilities` pipelines and the capability list were factored into a
  new bytes-first crate the CLI wraps and the WASM bindings +
  `engine/mcp` wrap too — one contract, no CLI-shaped second
  grammar. A new crate (over widening `shojiku-cli`'s lib target) so the
  layer builds for `wasm32-unknown-unknown` without dragging in clap or
  render-pdf, and so a downstream crate never depends on one named
  "cli"; PDF render stays composed in the CLI (authoring does not depend
  on render-pdf, keeping that surface additive/reversible). The MCP
  server has since shipped as the second wrapper. The spike's
  disqualified `from_faces` shortcut is retired: the layer's verified
  bytes-first font path is `FontStore::load_from_injected` over the new
  `resolve_face_bytes` (host-injected manifest strings + face bytes,
  same sha256/fsType/fallback as the filesystem path), and failed stages
  return the typed `Diagnostics` bundle rather than a thrown string. Pure
  refactor otherwise — no wire change, so no new capability key, and the
  bundled examples render byte-identically.

- **Diagnostics: closed code registry, one message template per code, no
  engine translation.** `code` is a closed enum (the compiler enforces
  uniqueness and IS the registry), each mapping to a single English
  template parameterized by typed `args`; multi-context messages that
  once differed by wording (e.g. `missing_data` across scalar/table/list/
  repeat scopes) are unified via a `scope`/`detail` arg rather than one
  code per phrasing. The message is a rendering of the args, so the two
  cannot drift, and a localizing consumer keys off `code` + `args`. The
  volatile "which module emitted this" need is served by a separate
  non-contract `origin` (`file:line`), never folded into `code`; the
  semantic grouping is a separate re-categorizable `category`. Dedup
  identity is `(code, path, message)` — not `(code, path)` — so
  path-less diagnostics differing only by a typed arg (one
  `unknown_font_family` per family name) stay distinct while true
  measure/render duplicates collapse.
- **Parse errors located via `serde_path_to_error`, not a serde alias**:
  the table column wire keeps its one canonical `data: { key, format }`
  shape (no flattened `key:`/`format:` alias — a second grammar the GUI
  would have to re-parse); the guess-hostile *error* is fixed at the
  class level instead by locating every structural failure to its field
  path + YAML line. The tagged-enum path-truncation limitation
  (`Body`/`Item` buffer their content) is accepted — the serde message
  still names the expected fields, and the fully-located half (plain
  structs: definitions, top-level keys) covers the marquee evidence.
- **`emptyBehavior: hide` dropped**: it was a pre-1.0 alias of `collapse`
  kept "for a future distinction" that never materialized; two spellings
  for one behavior is a GUI dropdown trap. Removed (breaking, pre-1.0);
  authoring `hide` is now a located parse error listing the real
  variants. Examples were unaffected (all use `collapse`).
- **`orientation` is a no-op for custom sizes, not a double-swap**:
  CSS-aligned — a custom `{ w, h }` states its dimensions literally, so
  swapping again on `orientation: landscape` silently flipped an
  intended-landscape page back to portrait. The combination now warns
  `orientation_ignored`; named sizes still swap.
- **Currency `default` = the bare amount**: a symbol you didn't ask for
  cannot compose (`{total}円` would double-decorate); symbol/name are
  explicit picks a document usually sets ONCE via
  `defaults.formats.currency`. The old behavior (default = `¥…`) was a
  deliberate break, pre-1.0, with every bundled example updated.
- **Variant names `symbol`/`name`** follow the ICU/CLDR vocabulary
  (currency symbol vs display name) and avoid colliding with the
  `quantity` sense of "unit".
- **`symbol`/`name` on a number coerce to currency** (placement pick
  only): workshop-mode documents (no engineer definitions) had NO path
  to a ¥ display — the preview infers `number` from the params value and
  the variant warned `unknown_format_variant`. The coercion is the
  natural half-step past the existing type-override rule (`format:
  currency` already coerced, but lands on the bare default variant); it
  applies only via the placement/interpolation pick, never through
  `displayFormat`/`defaults.formats` (definitions-side currency-ness
  stays the schema's `(type, format)` mapping), and only widens Number —
  percentage/quantity/string picks stay warned. A registry entry named
  `symbol`/`name` loses to the coercion on number fields (registry
  patterns are date patterns and never applied to numbers). The
  Designer's paste import, blank-start currency fields, and workshop
  drag-to-bind author `format: symbol` on money placements; the format
  picker offers `symbol`/`name` on number fields, gated on
  `format.currency.coerce`.
- **The fractions table is engine-wide, not per-pack**: currency
  precision is locale-independent supplemental data; one compiled copy
  keeps packs small and unlisted codes correct.
- **Units: definitions carry meaning, packs carry words** — the
  engineer↔PM seam says a new locale must never edit definitions; the
  plural set is bounded (CLDR categories; v1 ships one/other).
- **Format defaults live in the template, patterns only centrally**:
  presentation is PM-side (CSS-`:root` analog), but per-placement
  pattern strings would recreate the Thinreports format sprawl —
  placements and definitions reference by name only.
- **timezoneDefault deleted, not honored**: honoring it needs a tzdb
  dependency no current feature justifies; an unused wire key is a
  standing lie. Re-adding is additive if demand appears.

The *why* behind the capabilities above, kept as history. Features are
identified by their wire spellings, never by internal work-item codes.

- **Form marks bind by an `equals` predicate, not per-option bools**:
  `data: { key: payment, equals: "card" }` reads a DB enum code straight
  through, versus `payment_card: true` params (ugly, and it pushes the
  presentation split onto the data producer). Comparison is type-strict
  so a wrong literal (`equals: 0` vs a string `"0"`) is surfaced, not
  silently non-drawing; an array value extends the *same* predicate to
  multi-select (contains) rather than adding a second grammar (the nth
  selector rejected for zebra set the precedent). A mark's presence is
  content but its geometry stays template-fixed — the only params-driven
  channel is *whether* a path draws, never where — which keeps the
  params↔geometry security boundary and makes blank↔filled one-template.
- **Marks are vector paths, never font glyphs**: a ✓ glyph would hang
  determinism on font coverage. One new tree primitive `LayoutItem::Path`
  carries the shared `PathCmd` currency (ellipse = 4 cubics, check = a
  short open polyline) and is the receptacle for future path decoration
  (e.g. a wavy underline).
- **Ruby notation is Aozora-Bunko-compatible and opt-in**: `《》` + `|`
  beats LaTeX `\ruby{}{}` or a bespoke `%{}` because public-domain
  Japanese texts carry it natively; the explicit `markup: aozora` key
  keeps the params-verbatim boundary (no auto-detection) and gives GUIs
  a machine-checkable signal for a future ruby editor.
- **`B4`/`B5` mean JIS, not ISO**: the engine's market (Japanese
  business forms, the Thinreports install base) says B5 = 182×257mm;
  ISO B names can land later as new preset names if demand appears.
- **char_grid vertical cells were unified onto GSUB `vert`**: the v1
  closed substitution+offset model (font-independent, IPAmj forms via
  the fallback chain) was a deliberate stopgap while the tree carried
  chars drawn horizontally per cell; once the shared vertical
  arrangement existed, emitting each cell as a one-cell vertical column
  removed the tree-level substitution entirely — the closed tables
  survive only as the shaper-less degrade path inside the arrangement
  (§ Vertical writing).

- **Per-side borders widen the existing keys instead of adding CSS flat
  keys**: `borderWidth: { top: 2 }` (the EdgeSpec/PageMargin map
  precedent) beats `borderTopWidth` × 8 — fewer keys, one precedence
  story, GUI edits a structured map (user decision). On tables the map
  form means the OUTER frame only, because the scalar already means
  "the whole grid" and back-compat pins it; inner rules compose from
  row/column borders instead.
- **Table spanning is header groups + empty-cell merging, not body
  rowspan**: body rows are data-driven, so an explicit per-row span
  wire would cross the params↔presentation boundary. `mergeEmptyCells`
  expresses the rirekisho heading-row case declaratively from the data
  shape itself.
- **A row's own data selects its style, through the form-mark
  predicate**: `row.conditionalStyles` entries pair a
  `when: { key, equals? }` — the SAME declarative vocabulary a form
  mark binds its drawing with, read relative to the row element — with
  the style layers to apply, in listed order over the base and zebra
  ones. Reusing the mark predicate (rather than growing a selector
  mini-grammar) keeps one truth table in the engine and one thing for
  an author to learn; a 16-entry cap bounds the per-row work, and a
  missing key stays silent so a blank form renders unchanged.
- **Cell assets are per-element ids, not per-key**: `dyn:<array>[<i>].
  <key>` lets layout and prepare agree without a registry; the column
  `id` is the policy identity so allow/deny lists stay item-shaped;
  the 1000-load cap bounds params-driven fan-out.
- **Builtin locale data is generated YAML, not generated Rust**: the
  CLDR codegen emits the same wire format the overlay files use and the
  engine embeds it via `include_str!` — one parser, one wire shape, and
  the overlay merge falls out as a generic YAML deep merge (mappings
  per key, scalars/sequences replace; whole-file replacement was
  rejected as strictly weaker). The repo's `packs/locale/*.yml` copies
  were **deleted**, not slimmed: full duplicates beside the builtin
  invite silent divergence; `packs/locale/README.md` documents the
  overlay form instead. CLDR values that clash with shipped goldens are
  pinned as explicit curated overrides in the script (ja JPY stays
  half-width `¥`, not CLDR's `￥`).
- **Era tokens follow CLDR's japanese-calendar spelling**: `G` + `y`
  (`Gy年M月d日`), with `y` meaning *era year* and `yyyy` staying
  Gregorian — single `y` was previously an unclaimed token, so nothing
  breaks. Era names and `eraYearOne` live in locale data, not engine
  code (the engine stays i18n-agnostic — even `元` comes from the
  pack), and `eras:` is a plain list any locale or overlay may carry.
- **Links live on the layout tree, not a sidecar**: the tree is the one
  layout↔renderer contract, and a link's activation area *is* drawn
  geometry (line/run/image rects) — so `link` rides the existing
  primitives and pagination/translation/clipping carry it for free; a
  page-level annotation sidecar would have needed parallel plumbing
  through every walk. The PNG backend ignoring the field was accepted:
  a link has no visual form, so "both backends draw the same tree"
  still holds. URL gating happens at layout (params are untrusted and
  interpolation happens there), never in renderers; the scheme
  allowlist starts strict (http/https/mailto/tel) and widens on demand.
- **Rich text is a `spans:` array on a uniform line grid**: inline
  markup was rejected — a second grammar the TS Designer would re-parse
  and keep in sync, and markup arriving via params would let *data*
  drive presentation across the params↔geometry boundary. Mixed sizes
  share one block-level line height + baseline (per-line line boxes
  deferred): the uniform grid reads as a baseline grid, keeps the
  long-text pagination math valid, and is additive to relax later. The
  tree widening is additive (`runs` empty = the old wire) and one
  shared runs view keeps PDF/PNG structurally identical. Rich
  `shrink`/`ellipsis` wait for demand (scale-factor bisection /
  run-aware trim) rather than shipping half-tested.
- **Min/max clamps live in `ResolvedBox`, min > max > size**: the four
  bounds are geometry on `OptBox` (geometry never inherits), clamped by
  one pure helper at the single "after resolve, before distribution"
  point. An *unsized* flex-share child's min/max was cut: clamping a
  flex-grown width without iterative re-flow would desync row
  positions — it belongs with the flex intrinsic-size follow-ups.
- **Clipping is opt-in and box-scoped**: `overflow: hidden` (CSS
  spelling; `scroll`/`auto` rejected — no scrolling on paper) clips to
  the border box and suppresses the overflow warnings (a diagnostic
  about explicitly requested behavior is noise). Text keeps its own
  `textOverflow: clip` — one spelling per surface. The clip group now
  carries corner radii, so a rounded box with `overflow: hidden` clips
  to its own curve rather than to the square that encloses it.

- **Dashes live on the tree primitive, corner geometry is
  layout-owned**: `borderStyle: dashed | dotted` resolves to one
  concrete on/off pair in pt that both backends hand to their native
  dashing API — the same layout-decides/renderers-execute split as
  `stroke_width`. Emitting the segments in the tree instead would put
  hundreds of rects on the page for one dotted A4 border. The intervals
  are floored at a quarter point: a hair-thin authored width would
  otherwise ask the rasterizers to walk billions of dash segments. A
  dashed side of a PER-SIDE border cannot be a filled band (the gaps
  are the point), so that one side is stroked as a centred line.
  `borderRadius` goes the other way — layout builds the kappa-cubic
  rounded-rect path once and both renderers replay it, so fill, stroke
  and clip cannot drift apart.

- **`borderRadius` shrinks by CSS's uniform factor, not per axis**: an
  over-large radius scales BOTH axes by one factor (CSS Backgrounds
  §5.5), which is what makes a big absolute value a stadium ("pill")
  rather than a full ellipse; `%` still resolves against each axis
  independently, so `50%` is a circle on a square and an ellipse on an
  oblong. The single-value form only — per-corner radii would need four
  more keys for a case no business form has asked for. A per-side or `double`
  border, a `table`, and the form marks REFUSE a radius with a warning
  instead of rounding some edges: mismatched sides have no shared
  corner, a ruled grid cannot meet a curve, and a mark's outline is its
  own closed shape.

- **The `line` item keeps its own style shape but shares the border
  KEYWORDS**: `style: dashed` on a `line` is the cut-here-line staple, so
  the stroke pattern had to reach the one primitive that is a stroke.
  Reusing `BorderStyleKind` (rather than a `line`-only enum) keeps one
  vocabulary for the GUI's line-type picker to offer everywhere.
  `double` has no single-stroke form, so it becomes two parallel
  strokes offset along the segment's NORMAL — a diagonal doubles
  correctly, and a zero-length line stays one stroke rather than
  emitting NaN coordinates.
- **Flow repeat is a separate `type: repeat_flow`, not a `repeat`
  mode**: the two have disjoint key sets and opposite page semantics; a
  mode key would create per-mode invalid-key combinations (the
  silent-typo hole) and force the GUI into show/hide panels. The
  external acceptance run *predicted* this spelling. Keep-together
  vocabulary is the table's `keepTogether` (`pageBreakInside` rejected);
  no key ships while cards are atoms that never split.
- **Zebra striping is `row.alternateStyle`, not an nth-pattern DSL**: a
  structured second style overlaid on even rows is field-editable by
  the GUI; an `nth-child` selector string would be a second grammar.
  The table grid keeps a 0.5pt-black table-specific default (untouched
  templates render identically; `borderWidth: 0` opts out).
- **Page margin shifts the origin instead of staying informational**:
  the external acceptance run showed authors expect `margin: 36` +
  `w: "100%"` to *mean* something. Origin-shift chosen over an opt-in
  key (pre-1.0 hard change; examples re-based in the same PR); the top
  margin is one assembly-time translate so the resolve pass stays
  y-less. The legacy `[t,r,b,l]` array stays accepted — structured
  YAML, eases coordinate imports.
- **The GENERAL page break is an item, not a per-item `breakBefore`
  key**: an item is discoverable (GUI palette, one YAML line) and
  touches no other wire struct; a break key on every struct would widen
  the whole wire for one use case. Fresh-page no-op matches CSS
  forced-break collapsing. This rejected a UNIVERSAL key — `repeat`
  later took a `breakBefore` of its own (below), because it is the one
  item that forces a break nobody asked for.
- **`repeat` start-in-place is an opt-in on the one item that breaks by
  itself**: an imposition grid always aligned to a fresh page, so a
  title above it wasted a page per document (found in an external
  acceptance run). `breakBefore: auto | page` was chosen over the
  candidate `align: cursor` — it means exactly CSS `break-before`
  (`page` forces, `auto` doesn't), while `align` collides with the
  alignment vocabulary and describes the wrong thing. It generalizes if
  `table`/`char_grid` ever want the same opt-in. **Only the first
  page's row count shrinks**: slots keep deriving from the full region
  so cells stay identical across pages, because imposed sheets get
  physically cut — shrinking page-1 slots to fit was rejected for
  breaking that. A cursor with room for less than one row falls back to
  a fresh page (never a zero-row grid, which would not advance), and
  stays silent: `auto` asks for "start here if it fits". Default `page`
  keeps every existing template byte-identical.
- **Long text fills the current page, not a fresh one**: splitting
  starts at the cursor like table rows — always breaking first would
  leave near-empty pages behind short predecessors. Only flow-direct
  auto-height text splits: a fixed `box.h` asked for a box (the
  overflow policies own that), and container fragmentation needs a real
  fragmentation model, not a special case.
- **QR is an item, not an image asset**: encoding at layout time into
  existing rect shapes sidesteps scoped asset preparation entirely and
  keeps renderers untouched (`qrcodegen`: zero deps, MIT). The list is
  a first-class item, not an in-cell table: the count-aware
  `他{count}件` line needs the engine to know how many entries did NOT
  fit — pre-formatted caller strings cannot.
- **`textOverflow` is a style property; `clip` stayed unparsed until
  real**: the policy rides `Style` (CSS name transfer, named-style
  reuse, table columns for free); accepting `clip` before the clip
  primitive existed would have silently meant "visible" — the exact
  silent fallback the North star forbids. Policies act only on definite
  heights because an auto-height box growing *is* the fit.
- **Border lives on `Style`, not `box`**: CSS models border as a
  non-inherited style property; only a style key lets the named-style
  registry carry borders. Flat scalar keys over a CSS shorthand string
  (GUI consult). Border width does not change geometry (the stroke
  draws on the border-box edge, matching `rect`).
- **Grid: explicit-only, row-major fill, tracks as count-or-list**:
  unset `box.type` stays flex-like and grid keys without `type: grid`
  warn — a template's layout mode should be readable off one key. Fill
  order defaults row-major (CSS `grid-auto-flow: row`; forms/labels
  read that way) even though flex's default axis is `column`. Tracks
  are a count or a `Length` list, never a string grammar; `auto`/`fr`
  were cut (they need content measurement).
- **Flex participation is "no authored x/y", not a position key**:
  mapping the absolute escape onto the coordinates themselves makes
  every existing template byte-identically compatible and lets the GUI
  derive the mode from fields it already edits. Enum values are
  snake_case (`space_between`) matching the established wire enums;
  keys stay camelCase.
- **Row flex avoids intrinsic measurement**: unsized row children split
  the leftover (weighted by `flexGrow`) instead of max-content sizing —
  text has no natural width without a measurement mode the engine
  doesn't have; the split covers the common 2–3-column layouts.
- **Boxes are a sidecar, not tree items**: adding ids to `LayoutItem`
  would widen the renderer contract and force both renderers to skip
  non-drawing data; a parallel index keeps the contract byte-identical
  and evolves with GUI needs. Capabilities live in the CLI because the
  CLI is the product surface today.
- **Box math is a crate, not a layout module**: flex/grid are
  algorithm-heavy; the crate boundary keeps them testable with plain
  numbers (no font fixtures) under the 100% gate. Wire types in core,
  pure geometry in layout-box, content measurement + pagination in
  layout.
- **Edges are a per-side map, not a CSS shorthand string**: the first
  cut shipped `margin: "10 20 30 40"` and was reworked pre-merge after
  the GUI consult — a shorthand string is a second grammar the TS side
  would reimplement, and per-side keys make GUI edits one key per side.
  Unknown keys are rejected so `letf:` cannot silently mean 0.
- **Padding/margin are border-box, width-based `%`, no collapse**:
  content-box sizing and margin collapse would make "absolute pt at
  layout time" harder to predict; no-collapse matches the additive
  `gap` model; `%`-of-width for all four edges (the CSS rule) makes
  vertical padding work in auto-height containers.
- **Physical units preserve the authored form**: `Length::Physical`
  keeps `80mm` as `80mm` (round-trip North star) while converting with
  a constant factor — deterministic, no layout context.
- **`em` = the inherited font size, uniformly**: box lengths resolve
  `em` against the cascade font size in effect where they resolve (the
  `Basis` carries the `em`/`rem` bases), so an item's own inline
  `fontSize` does not move its own box — a deliberate divergence from
  CSS chosen because table geometry, grid tracks, and the flex row
  pre-pass all resolve child boxes before child styles exist; one rule
  beats a text-item special case. `fontSize` (em/% of the inherited
  value) and `letterSpacing` (em of the own computed size) follow CSS
  inside the cascade. The `rem` root is the engine default font size —
  the smallest reversible choice; a template-level root style may
  replace it later.
- **Synthetic-first bold/italic**: shipped synthetic effects before
  face-variant selection because the then-bundled faces had no
  variants — variant selection would have been dead code. Layering real
  variants later only flipped the synthetic flags off; no template
  changed. Layout owns the decision (flags + constants on the tree);
  renderers only execute.
- **Glyph placement is font-owned**: the font layer owns advances
  (including the missing-glyph fallback width) and positioned glyphs;
  wrap, both renderers, and overflow math route through that single
  path so reserved and drawn widths cannot drift.
- **Backend choices**: Rust over Go for the pure-Rust
  shaping/font/PDF/codec story + single static binary + WASM; krilla
  for PDF (write-only, auto-subsetting — fixed multi-MB CJK output);
  tiny-skia for PNG preview; skrifa (fontations) for fonts —
  ttf-parser and resvg/usvg are rejected wholesale (unmaintained /
  MPL), enforced by deny.toml with zero ignores.
- **Module hygiene is a gate, not a review note**: the ≤300-line budget
  + `//!` headers + function-length lint are CI-enforced; oversized
  files split into directory modules with stable public paths
  (`pub use` at module roots), and near-e2e layout tests live in one
  `tests/e2e` binary.
- **Coordinate unit**: bare numbers are **pt**; `%` only as a string;
  `px` rejected as a template unit.
- **definitions.yml is an OpenAPI-shaped schema**: the wire mirrors the
  params JSON (nested `properties`/`items`) so an AI can derive it
  near-verbatim from a DB schema or an OpenAPI spec, and the Designer
  can generate sample params from ONE file; `format` is the open
  data-semantic vocabulary (generation hints included), display
  variants are `displayFormat`/`displayFormats`. A hard pre-1.0 break:
  the `groups` list form is removed (migration-hint error), all bundled
  examples migrated. The catalog flatten keeps the validator/formatter
  contract unchanged, and params-vs-schema validation rides the same
  schema.
- **Hard renames pre-1.0, no aliases**: `align→textAlign`,
  `valign→verticalAlign`, `font→fontFamily` — one spelling per
  property.
- **Name & license**: `shojiku`; triple MIT OR Apache-2.0 OR
  BSD-3-Clause.
