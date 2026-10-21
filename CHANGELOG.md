# Changelog

Notable changes to Shojiku, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Every published version ships as one set — the engine, the CLI, the
Docker image and all seven SDKs carry the same version number, so an
entry here applies to whichever of them you use unless it says otherwise.
A release's [GitHub Release](https://github.com/kengos/shojiku/releases)
page carries the same notes with the install instructions and the
platform binaries.

## [Unreleased]
### Added

- **`shojiku_core::yaml`, one door for reading YAML in the Rust crate.**
  While it reads a document it refuses an oversize input, nesting past 120
  levels, a mapping key that is not a string or appears twice, a NaN or
  infinite number, an integer from 65 to 128 bits wide and a local YAML
  tag (`!name`), and it hands back the engine's own `Value` tree.

- **The key catalog now says what each style key does, not only what it
  accepts.** `catalog.schema.json` states each `Style` key's initial value,
  whether it inherits, and the bounds the engine holds a number to; which
  style keys change each item type's output; which values name an item id,
  a named style, a format or a data key; and which capability key an older
  engine would lack. A tool building a property panel or checking a
  template reads them from the same document as the shapes, so it no longer
  has to copy them from the engine by hand. They are `x-shojiku-*` keywords
  a validator ignores, plus `minimum`/`maximum` on the numeric keys; no
  `default` is written, since a form generator would copy it into the
  template and stop the key inheriting.
- **The Designer sets a character grid's alignment and tate-chu-yoko.** A
  `char_grid` now offers Text alignment (`textAlign`), which moves a partly
  filled line toward its end — named top, middle and bottom when the grid is
  vertical — and, on a vertical grid, Horizontal in vertical
  (`textCombineUpright`, digit runs only, as the grid combines nothing for
  `all`). The engine already drew both; until now they could only be written
  in the file. The grid's size and alignment fields also stop showing a value
  inherited from a container or the document defaults, which the grid never
  uses.

### Changed

- **Every YAML the engine reads goes through that door**: templates,
  definitions, params, locale packs and their overlays, and font-pack
  manifests. Some documents read before are now refused:
  - a mapping key that is not a string in params, definitions or a locale
    pack (`2024: 100` read as the key `"2024"`); quote it, `"2024": 100`.
    Templates already refused one, and a font-pack manifest or a locale
    overlay already failed on one with a different message.
  - a local YAML tag (`!note x`) anywhere, which no wire format uses.
    Each door used to treat one its own way, from ignoring the tag to a
    template error about enums.
  - a NaN or infinite number anywhere in a pack, including under a key the
    pack does not read.
  - in a locale pack, a duplicate key inside a table such as `dateFormats`
    (the last one used to win) and an integer past 64 bits under a key the
    pack does not read.
  - nesting deeper than 120 levels, where the limit used to be 128. A
    template chain of 58 to 61 containers, which reached the container
    limit and reported `container_depth_exceeded`, now reaches this one
    first and reports `parse_error`.
  - a retired v1 definitions file (`groups:`) that also holds one of the
    above, or a NaN, reports that refusal rather than the v1 migration
    hint.
- **Where a refused document is reported.** A non-string key, a duplicate
  key, an integer past 64 bits, a local tag and nesting too deep are each a
  `parse_error` with the path and the line/column of the node (a NaN keeps
  its own `non_finite_number`). A duplicate key, an integer past 64 bits and
  nesting too deep used to be a `parse_error` whose position, if any, was
  only inside the message text, and a template's non-string key had no
  line/column. The path of a refusal at the document
  root is `.` rather than empty, and a non-string key's message reads
  "every key must be one". In a pack or a manifest, the message of one of
  these refusals ends with its path and line/column. The Designer's
  "remove this key" quick-fix reads none of these and is unchanged.

### Changed

- **Text is shaped by a newer HarfBuzz (harfrust 0.14, matching HarfBuzz
  14.5.1).** Every bundled example renders to the same bytes as before,
  across Latin, Japanese (horizontal and vertical), Chinese, Thai and
  Devanagari; other fonts and scripts may still shape differently. When
  the shaper reports that it hit its length, operation or nesting limit
  on a stretch of text (a hostile font's substitutions can provoke it),
  that stretch now falls back to unshaped per-character advances instead
  of drawing what the shaper left behind.
- **A `borderStyle` on an ellipse, a checkbox or a text mark now warns
  `shape_style_ignored`.** These marks draw their outline as one solid
  stroke, so a dashed, dotted or double pattern there never did anything;
  validation now says so, as it already did for text keys on them. A
  template that sets one renders exactly as before, with one more warning.
- **The Rust crates are built as edition 2024 and use let chains, so
  depending on them from crates.io needs rustc 1.88 or newer.** The crates
  declare no `rust-version`, so an older compiler fails partway through the
  build rather than being told the version up front. `cargo install
  shojiku-cli` is the same case, including for the Go and PHP SDKs when the
  CLI they drive is installed that way. The prebuilt CLI binaries, the
  Docker image and the five SDKs that carry the engine library need no Rust
  toolchain.

### Removed

- **The diagnostic code `horizontal_overflow`**, deprecated in 0.3.0.
  Nothing has emitted it since 0.3.0, and it is gone from the code registry
  and the Designer's catalogs. Each reason it covered has its own code:
  `sheet_overflow`, `child_overflow`, `grid_column_overflow`,
  `flow_item_overflow`, `flex_row_overflow` and `vertical_text_overflow`.
- **The diagnostic code `vertical_style_ignored`**, deprecated in 0.3.0.
  No release ever emitted it, since the block-level knobs it was reserved
  for apply to vertical text. A host that translates or matches on it can
  drop it.
- **The diagnostic code `grid_cell_overflow`**, deprecated in 0.3.0.
  Nothing has emitted it since 0.3.0. Match `grid_row_overflow` and
  `grid_span_overflow`, which report the two conditions it covered.
- **`page.margin` as a `[top, right, bottom, left]` array**, deprecated in
  0.3.0. It is now a parse error, and the message names the per-side map
  to write instead, `{ top, right, bottom, left }`; one number for all four
  sides works too.
  The catalog schema no longer offers the array. The Designer shows an
  array margin as the 25pt default, and the first margin edit replaces it.

### Fixed

- **The key catalog's length pattern admitted strings the engine refuses.**
  The `pattern` on a length string (`"10mm"`, `"5%"`) and on a grid track's
  `fr` weight checked only the END of the string, so `"abc10mm"` passed it.
  Both are now anchored at the start as well and state the number the parser
  reads, so a tool validating against `catalog.schema.json` refuses a string
  the engine refuses for its shape. A value too large to represent
  (`"1e400mm"`) still matches the pattern and is refused by the engine.

### Security

- **A mapping key that is not a string is refused in params, definitions
  and locale packs too**, with no deprecation release.
  Templates have refused one since 0.3, because the typed read buffers some
  mappings and can read a numeric key as a field number; which mappings it
  buffers is a detail of serde rather than of the wire, so the one YAML
  reader now refuses the key in every document.

### For contributors

- The Docker housekeeping targets are `make docker:clean:containers`,
  `docker:clean:volumes`, `docker:clean:images` and `docker:clean:all`,
  and each resource prints as removed or kept with the reason. They
  replace `clean:cache` and `clean:images`; `clean:target` now removes only
  the tree's host `engine/target`, and the target slot volumes moved to
  `docker:clean:volumes` (`SLOT=<k>` still resets one).

## [0.3.0] - 2026-10-14

This release is mostly about the Designer. In 0.2.0 a good part of the
template format could be written in YAML and nowhere else; in this one most of
it has a control in the Designer — tables, conditional formatting, grids and
n-up sheets, rich text, vertical Japanese text and ruby, links, names and
anchors, and the data dictionary. The other half of the release is the engine,
which matters most if you author templates by hand or through an AI agent: it
checks more of what it is given, refuses oversized and deeply nested input
before building a document from it, reports warnings at the item they belong
to, and serves its own syntax reference over MCP. Some entries name a
capability key in parentheses. An engine that reports the key has the feature,
so a program embedding the engine (a host) can check before relying on it.

Upgrading: three changes affect how an existing template parses or renders.
`mergeEmptyCells` now merges an empty cell into the cell on its left, as a
spreadsheet does; a table's `verticalAlign` set on a row or on the table now
reaches its cells; and a mapping key that is not a string is refused, so a
style or format named by a bare number (`5:`), which used to work, must now be
quoted (`"5":`). Two changes affect integrations: the MCP tools
`get_reference` and `get_example` return their content as embedded resources,
and a key an item does not take is reported at the item rather than at the
page body. The Fixed section lists where output changes because it was wrong
before, and the one template form under Deprecated still parses, with a
warning, until 0.4.0.

### Added

#### Designer

- **Tables.** A selected table's panel is split into collapsible sections,
  as Google Docs shows table properties, and a closed section summarises its
  settings in one line. The header row, the body rows, banded rows and every
  column share one set of format controls (font, size, bold, italic, colour,
  background, alignment), and **Text (whole table)** sets the default every
  cell starts from. Six preset styles apply a look in one click. Header
  groups can be added and removed. The rows section sets body row height
  (auto with a minimum, or fixed), header height, cell padding, what an
  empty table shows and whether empty cells merge; a table placed directly
  in the page body also gets the page-break switches (continue rows on the
  next page, repeat the header, keep the table on one page). Each control
  shows the value a cell actually renders with, and says when that value
  comes from the document's defaults. A column can print text, a QR code, an
  image or a free layout of items (**Column type**), and the column sheet,
  which lays the columns out side by side, compares and switches their
  types. The header row can be hidden on the page while its labels stay in
  the PDF's text layer.
- **Conditional formatting works the way it does in Google Sheets.** Rules
  are listed as sentences, each with tags for the formatting it adds;
  opening one shows its condition, format presets and controls, and every
  change shows on the page at once. A rule's value is picked from the
  field's choices, the sample data, or **Yes**/**No** — and **No** is new:
  it writes the boolean `false`, so a rule, a **When to show** condition or
  a checkbox can match a false flag. Rules reorder by drag or by buttons,
  the top rule winning; the engine's limit of 16 rules per table is enforced
  at **Add a rule**.
- **Containers, grids and repeats.** A container switches between side by
  side, stacked and grid at any time without losing an item, and gains
  settings for distributing free space, aligning items across the row or
  column (including by the first line of text), and dividing the space by
  ratios. A grid sets each column's width and each row's height (fit
  content, ratio or fixed), spacing per direction, fill order and how many
  cells a child spans. **Insert ▸ Place list data ▸ Grid** makes an n-up
  sheet — tickets, labels, cards cut from one page — with columns, rows,
  gaps, fill order, whether it starts on a new page, and cut marks. The
  repeated frame of a grid cell, a card or a column's free-layout cell has
  its own settings (arrangement, size, padding, fill, border, overflow,
  opacity) and its own row in the **Structure** panel, and a list of cards
  sets **Space between cards**.
- **Text styling that only YAML could set.** The Style tab is folded into
  sections and gains letter spacing, underline and strikethrough (together,
  if you want both), vertical alignment, what text does when it does not fit
  (overflow, shrink, "…", clip), opacity, padding and margin per side (with
  **Auto** margins to centre a fixed-width item) and minimum/maximum sizes.
  A page number, a list and a container get font controls; manuscript paper
  gets a Style tab.
- **Rich text is written on the page.** Double-click a text, select some
  words and press bold, italic, underline, strikethrough or a colour, and
  only those words change; plain text becomes mixed-style text on the first
  such change, in one undo step. The text's styled pieces (fragments) are
  split and merged for you, pieces you did not edit stay exactly as written
  in the file, and deleting a fragment's words deletes the fragment.
  Settings the on-page bar has no button for (size, font, named styles, a
  fragment's own link, and a bound value's field, format and blank text) are
  set per fragment in the panel.
- **Japanese typesetting.** A **Vertical text & line breaks** section sets
  text direction, character orientation, 縦中横 (digits set across inside
  vertical text, which can also be applied to selected characters), the
  line-break rules (禁則), bracket and punctuation spacing and hanging
  punctuation. A **Ruby (furigana)** section adds readings to fixed text, a
  data field or mixed-style text. A **Circle** section draws an oval around
  the printed characters, always or only when a field has a given value, so
  a single template can circle whichever option the data picks. Manuscript
  paper's grid, ruling, ruby notation, ruby size, line-break rules and named
  styles all have controls now.
- **Names and anchors.** Every item, column and cell frame has a **Name
  (ID)** field; duplicates are refused, and a rename updates every anchor
  that points at the old name. An ellipse can be drawn around another item,
  and a line end attached to one, by picking the item from a list grouped by
  section; picking an unnamed item names it in the same undo step. An
  attached end can be offset by a set distance in points.
- **Links.** A text, an image or a single rich-text fragment takes a
  **Link** whose URL can include a data field; a URL the engine would refuse
  is refused at the field. Linked items carry a chain mark on the canvas,
  and hovering or tabbing to one shows where it goes.
- **The data dictionary.** The data-item editor shows the definitions as a
  tree of groups, tables and lists, adds an item anywhere in it, and renames
  or deletes one — a rename rewrites every place this template uses it and
  every sample data set, in one undoable step, and lists what it will
  rewrite before you confirm. It also sets a field's allowed values (each
  with optional text to print in its place), value and length ranges,
  required, blank text, an example for sample generation, currency, decimal
  places, unit, a default display format and the list of formats a field
  allows. A gear on each field in the palette opens the editor on that
  field.
- **Display formats.** Document settings gain a display-formats section: how
  dates, times and money look throughout the document, and a registry of
  named patterns, which the engine previews as you type and which you can
  build by pressing buttons for each part (weekday, month, era). The format
  picker on a bound item offers only what the engine will honour for that
  field's type, shows the field's own declared formats first, offers a
  locale pack's own variants (和暦, Japanese era dates, among them) and marks
  the date-only ones on a datetime field. Renaming or deleting a named
  format rewrites every reference, including a format named inside a text
  placeholder such as `{issued:closing}`.
- **Creating things.** Insert gains Line (with editable endpoints), Ellipse,
  Checkbox, Character grid, Page break, Header and Footer; a header or
  footer's height and the pages it prints on are editable, and the page body
  can be switched between flowing and fixed-position (asking first, and
  listing what changes), with its own item spacing and area. A QR code's
  error correction, a line's opacity, a template's name and version, and
  whether an image is a fixed picture or a data field are now set in the
  panel. Images can be pasted from the clipboard, and GIF and WebP can be
  placed.
- **Moving things.** Items can be dragged into a different container on the
  canvas or in **Structure**, where moving the pointer left or right changes
  the nesting level. Right-click offers duplicate, delete and borders.
  Dragging a column in the column sheet shows where it will land, and Escape
  cancels any list drag.
- **Seeing what the page does.** The margin box is outlined on the canvas
  with its `0,0` corner marked; the diagnostics panel lists printed text
  that overlaps other text; the page re-renders as you type into the text
  field; a hidden header row is outlined rather than left as a gap; the
  border editor explains that you pick the pen, then the edges; and more
  warnings have a one-click **Fix**, some offering a choice of two.
- **A data field placed in text can be swapped for another** by clicking its
  placeholder and picking another field, leaving the wording around it and
  its format alone.

#### Template format and engine

- **`visible:` shows or hides any item based on the data** (the Designer's
  **When to show**), as in `visible: { key: status, equals: approved }`,
  keeping its space by default, or closing up with `collapse: true`, like
  CSS `visibility: hidden` and `display: none`.
- **A line end can attach to another item and an ellipse can be drawn around
  one:** `to: { item: total_box, edge: left }` and `anchor: <id>`. An
  anchored item follows its target wherever the layout puts it and is drawn
  on the target's page; one in a header or footer is drawn on every page. It
  is hidden when its own container is hidden, and a missing target warns and
  draws nothing.
- **`header: { visuallyHidden: true }`** paints nothing for a table's header
  row but keeps its labels in the PDF's text layer, so a text extractor or
  an AI can still read what each column means.
- **`textDecoration: underline line_through`** draws both lines, as CSS
  `text-decoration-line` does (capability `style.textDecoration.combined`).
- **A `linked` flag in the layout box index** (the per-item positions the
  engine reports to the Designer), set only where the PDF will contain a
  clickable link (capability `inspect.boxes.linked`).
- **A `localeFacts` engine query** renders what a locale will print for a
  date, a number and an amount, through the same path a bound field takes
  (capability `locale.facts`).
- **New warnings.** `row_condition_scope_ignored` for a `scope:` a row
  condition ignores, `deprecated_syntax` for a form that is being removed,
  and `grid_row_overflow` / `grid_span_overflow`, whose arguments are
  numbers only, so a translated message has no English left in it.
- **The key catalog says what every key means.** Every key in the
  machine-readable catalog carries a `description`, and a key that takes a
  fixed list of values has each value described.

#### CLI, MCP and SDKs

- **`shojiku formats`** lists the display variants each field type can take
  for a template and locale, with what each renders; `--probe` previews a
  pattern before you author it.
- **The MCP server serves the syntax reference.** `list_reference` and
  `get_reference` (or `resources/read` on `shojiku://reference/<page>`)
  return a reference page's markdown together with a JSON Schema fragment
  for the keys it documents, and `#<key>` narrows to one key (capability
  `mcp.reference`). An agent set up with `docker pull` plus `claude mcp add`
  has no copy of the repository, and can now read the reference anyway.
- **`format_catalog`**, a new MCP tool, lists the format spellings each
  field type accepts, as the CLI and the Designer do, with or without a
  template.

#### Site and documentation

- **A Features page on the site** (`/features`, `/ja/features`) covers
  document kinds, layout, typesetting, data binding, fonts, output and
  signing, with each area's limits beside what it can do.
- **What 1.0 will freeze is written down** in `docs/architecture.md`: the
  interfaces 1.0 promises to hold still, the rules each may change under,
  and what it will not promise, such as identical rendered bytes across
  versions (determinism means the same version and inputs give the same
  bytes).

### Changed

#### Changes that affect existing templates

- **`mergeEmptyCells` merges the way a spreadsheet does.** An empty cell
  joins the nearest cell with a value on its left; in `[A][ ][B]` it is A
  that now spans the empty column. A leading empty cell stays a separate
  cell, and an all-empty row keeps every column. A section heading meant to
  span the row now goes in the first column; a template that puts it in the
  last column draws that row as separate cells, with the lines between
  columns, until the heading is moved.
- **A table's `verticalAlign` set on a row or on the table reaches its
  cells.** Set on `row.style`, on a conditional rule, on the banded row
  (`row.alternateStyle`) or on the table's own `style`, it used to be
  ignored. A body cell now looks in this order and takes the first value it
  finds: its column, a matching rule, the banded row, `row.style`, the
  table; it centres only when none sets one (capability
  `table.style.verticalAlign`).
- **A template mapping key must be a string.** A key written as a number,
  `true`, `null` or a collection is refused with a parse error. A style or
  format named `5:` used to be read as the name `5`; write `"5":` instead
  (see Security for the case inside an item).

#### Designer

- **100% zoom is the printed size**, 96 pixels per inch as in Google Docs or
  a PDF viewer. The old 100% showed the page at one and a half times that; a
  document still opens fitted to the window.
- **The preview is drawn at the screen's real resolution**, so small text on
  a Retina display is as sharp as the interface around it.
- **The interface reads in a clearer order.** The property panel opens on
  what you came for, with **When to show** and long explanations behind a
  `?`; a dialog has one filled main button and is titled after the label
  that opened it; labels that open something end in "…"; layer-tree labels
  wrap to show the bound field; every colour is named in a 36-colour picker;
  steppers sit flush against their field and name that field to a screen
  reader; and buttons that showed a typed ▲, ▼ or grip now draw icons.
- **Layout warnings print readable numbers** (13.3pt rather than
  13.299999999999999pt), and the overflow, row, vertical-text,
  child-overflow and layout-settings warnings are reworded in plain terms in
  English, Japanese, and Simplified and Traditional Chinese.
- **The locale picker offers only locales the engine can resolve**, and
  explains a pick with the engine's own output.
- **The template-size readout shows both amounts**: the template's size
  against the Designer's adjustable limit ("12 KB / 2 MB").
- **A downloaded PDF keeps the document's name**, Japanese or Chinese
  characters included; 「領収書」 used to arrive as `template.pdf`.

#### CLI, MCP and SDKs

- **`get_reference` and `get_example` return embedded `resource` parts**
  rather than one escaped JSON string; a client that parsed the old text
  part as JSON needs to read the parts instead. `resources/list` reports a
  reference page's real size.
- **A key an item does not take is reported at the item**
  (`sections.body.items[3]`) by `validate`, the CLI, the MCP tools and the
  SDKs, with the key as a separate `key` value; it used to point at the
  whole page body.
- **A format-catalog probe list is capped at 16** everywhere: the CLI's
  `--probe`, the MCP `format_catalog` tool and the WebAssembly engine the
  Designer uses.

#### Docker image

- **The runtime base is `gcr.io/distroless/base-nossl-debian12`** instead of
  `cc-debian12`. Nothing in the image links OpenSSL — the one TLS client,
  the CLI's font download, is rustls — so `libssl3` is gone and its
  advisories with it; the image adds only `libgcc_s.so.1`, which the
  binaries need.

#### Site

- **The site lives at [shojiku.kengos.jp](https://shojiku.kengos.jp)**, and
  every package's homepage points there; `shojiku.pages.dev` keeps working,
  since v0.2.0's metadata still names it. Page titles name their subject and
  end in the product's name and a one-line description, in each language.
- **`docs/engine/features.md` is no longer a page of the site's reference.**
  It records why the engine is built as it is rather than how to author
  anything; it stays in the repository, and `llms.txt` points at it.
- **The committed SBOMs describe the latest release,** refreshed as part of
  each release. Each is generated from a lockfile alone and records that
  lockfile's sha256.

### Deprecated

Each of these is removed in 0.4.0. From now on a template form or a diagnostic
code is deprecated one release before it is removed: before 1.0 it is removed
in the next minor release, and from 1.0 in the next major one. Two cases go
further. A code replaced by more specific codes may stop being emitted in the
release that deprecates it, as `grid_cell_overflow` does below. A fix for a
hostile-input hole may refuse a form at once, with no deprecation release,
and is listed under Security; in this release that is a mapping key that is
not a string.

- **`page.margin` as a `[top, right, bottom, left]` array.** It still
  applies, with a `deprecated_syntax` warning in `validate`, the CLI, the
  MCP server, the Designer and the SDKs (capability
  `diagnostics.deprecated_syntax`). Write the map `{ top, right, bottom,
  left }`, or one number for all four sides. The Designer rewrites the array
  on the first margin edit.
- **The diagnostic codes `horizontal_overflow` and
  `vertical_style_ignored`.** Nothing emits either, but both stay in the
  code registry until 0.4.0; a host that translates or matches on them can
  drop them.
- **The diagnostic code `grid_cell_overflow`.** Nothing emits it from 0.3.0,
  because `grid_row_overflow` and `grid_span_overflow` now report the two
  conditions it covered; it stays in the code registry until 0.4.0. A host
  that matches on it has to match those two from 0.3.0 on.

### Fixed

#### Engine

- **Header and footer tables are checked and drawn like body ones.** Their
  data, columns, row conditions and cells are now checked and report
  `unknown_data_key` and `missing_data`, and their image columns load
  instead of warning `missing_asset`. A column's or header group's `label`
  is now checked wherever the table sits.
- **A locale pack's own date format is reachable by its name.** `format:
  date` on a datetime field under ja-JP now prints the pack's
  `2026年11月3日(火)`, not the plain default.
- **A checkbox or ellipse reading a `scope: document` flag inside a repeat**
  no longer reports a false undeclared-key error.
- **A very long date pattern renders in linear time**; it used to be
  quadratic in the pattern's length.

#### Designer

- **Inserts land where they draw.** Items inserted or dragged into a header
  or footer appear where the band prints (a footer item at its foot); and
  inserting into a container in a band joins the container's layout. Where a
  saved block, a Grid or Cards would never draw, its Insert row is disabled
  and says why; a saved block that would land half-drawn (a table in a
  repeating cell) is refused.
- **Group into a container** no longer moves, narrows or resizes the item,
  including one sized in percent, and is not offered where the result could
  not be preserved or would not draw.
- **Panel fields show what the document holds.** A value the panel refuses
  or adjusts is replaced in the field by the value the document actually
  kept, sample values included; a typed line break stays where you put it
  and is saved as a block literal; a field you only clicked into adds no
  undo step.
- **Panel fields that broke the document are gone.** A line or page break no
  longer has a placement tab, a line no longer offers named styles, a
  `repeat` no longer offers a box, and a line placed in a band no longer
  writes a `box:`.
- **Thin lines can be selected on the canvas**, a canvas multi-selection no
  longer survives a selection made elsewhere, and selecting an item whose
  YAML alias expands past the Designer's reading limit no longer crashes the
  Designer.
- **Tooltips stay readable**: nine were cut at a panel edge and two had
  never been visible; each now hangs off the side that fits.
- **In the dark theme**, unset colour fields, swatches, resize handles and
  the condition value field are visible again.
- **A template that fails to load** offers a way back to the template list.
- **Restoring a draft** of a bundled template keeps its data-item edits.
- **A YAML comment above a list's first entry** moves with that entry when
  the entry is reordered.
- **IME conversion** no longer inserts a line break on Enter, and leaving
  the text field by switching tabs keeps the edit.
- **The hosted Designer ships each font's license beside it** (`OFL.txt`,
  `BIZ_UD_Gothic_OFL.txt`, the IPA Font License Agreement); a font pack
  without one now fails the build.

#### Packages and docs

- **The npm package's exported `VERSION`** matches the package; in 0.2.0 it
  said `0.1.0`.
- **The Java deploy recipe** asks for the current release; it still named
  0.1.0 after 0.2.0 shipped.
- **The diagnostics reference** explains nine codes whose descriptions a
  malformed Markdown table dropped, and the reference's key and diagnostics
  tables are now generated against the parser and the code registry.
- **`docs/designer-mount.md`** says the Designer can rename and delete data
  items, what each changes, and that the template and definitions saves are
  separate requests.
- **The security page and `SECURITY.md`** now say that cargo-deny ignores
  one advisory, the unmaintained notice below; they used to say it ignored
  none.
- **`SECURITY.md` and the site's technology page** say where the one
  network path is: layout, rendering, signing and verifying carry
  no network code, and the CLI fills its font cache from an allowlisted
  host, checked by sha256 and turned off with `--offline`. They used to say
  Shojiku had no network code at all.

### Security

- **Hostile input is refused earlier.** A template, params, definitions file
  or pack over 16 MB is refused before it is parsed, and nesting past the
  caps (32 levels of containers, 16 of a definitions schema) is checked
  before the document is built — a deep chain used to run the reading thread
  out of stack and end the whole process, SDK and MCP server included. YAML
  alias amplification is not covered by either bound and remains a
  documented exposure of the YAML parser. A pack read from disk (a locale
  pack or a font-pack manifest) is read only when it is a regular file, and
  never past the 16 MB cap: a manifest linked to `/dev/zero` or to a named
  pipe used to be read without end or to block the read. An oversize pack
  file is now reported as a read error that names the cap.
- **The MCP server reads a `*Path` argument only when it names a regular
  file, and never past 16 MB.** `templatePath`, `paramsPath` and
  `definitionsPath` (on every tool that takes them, `format_catalog`
  included) used to be read whole with no size check: a path to
  `/dev/zero` ran the server out of memory, and a path to a named pipe
  blocked the stdio server for every later request. Such a path is now
  refused with a tool error that names it, and a file over the 16 MB input
  cap — the same limit inline text already meets at the parse — is refused
  with an error that names the cap, without being read past it.
- **A template mapping key must be a string.** Inside an item, a numeric
  key (`5:`) was silently read as one of the item's fields by its position,
  which let a chain get past the nesting check; any non-string key is now a
  parse error, in an item or anywhere else. It is refused at once rather
  than deprecated first, the exception the deprecation policy makes for
  security fixes (see Deprecated).
- **rustls 0.23.46** for the CLI's font download (authoring time only).
  It clears RUSTSEC-2026-0285, a TLS 1.3 handshake message accepted at the
  wrong encryption level, and four advisories against 0.23.45:
  RUSTSEC-2026-0346 (session `Debug` output exposing TLS secrets),
  RUSTSEC-2026-0347 (data sent to the outer server after an ECH rejection),
  RUSTSEC-2026-0348 (certificate decompression allocating up to 1 GiB before
  authentication) and RUSTSEC-2026-0349 (an unauthenticated ServerHello
  downgrading later connections to classical key exchange). Rendering,
  signing and verifying open no connection.
- **rustls-webpki 0.103.16** under that same download. It clears
  RUSTSEC-2026-0382, a certificate chain that could be accepted through a
  distrusted intermediate. Rendering, signing and verifying open no
  connection.
- **libssl is gone from the Docker image** (see Changed), which clears six
  OpenSSL advisories; a later advisory against libssl cannot apply to the
  image.
- **Two findings are accepted, with the reason written beside each.**
  cargo-deny ignores RUSTSEC-2024-0449, an *unmaintained* notice for
  unsafe-libyaml under `serde_yaml`, not a vulnerability; it is dropped when
  the engine moves off `serde_yaml`. The image scan accepts DLA-4792-1, a
  tzdata refresh the runtime never reads, until 2026-12-31, when it is
  reported again.
- **The high npm advisories on build tooling are cleared**:
  `source-map-js` 1.2.2 in the Designer's, the npm package's and the
  site's lockfiles, and `@vue/server-renderer` 3.5.43 in the site's. Both
  are build and test tooling; no published package depends on either.
- **The committed SBOMs list the dependencies and nothing else.** They used
  to pick up lockfile copies under `target/` — 1,757 components where the
  lockfile lists 254.

### For contributors

- `make` targets read scope-first with one name each (`engine:lint`,
  `sdk:ruby:verify`), quiet by default with `V=1` for raw output; the
  Makefile is split into `mk/<scope>.mk`, and `make make:check` refuses a
  target named in the tree that does not exist.
- Tracked Claude Code hooks under `.claude/hooks/` refuse a piped gate,
  `make -n`, commits with signing turned off, attribution trailers, pushes
  to `main` and a local squash onto a remote ref; `make hooks:verify` gates
  them.
- Engine gates share three pooled cargo-target volumes across worktrees
  (`make clean:target` resets one); CI is unchanged.
- `docs/code-map/engine-structure.md` is generated (`make engine:map`).
- Test files are outside the line budget, and `docs/guidelines.md` says what
  the budget is for.
- `make skills:verify` checks the product skills' eval cases; `make
  skills:eval` runs them, with `ABLATION=1` for a without-skill run.
- The Designer's browser test runs on every pull request; the engine suites
  that read `docs/engine/` run on docs-only pull requests.
- `make engine:render` works again, and `make engine:preview` renders a PNG.
- A check refuses internal work-item codes anywhere in tracked text.

## [0.2.0] - 2026-08-08

### Added

- **The template reference now reads as a website.** The 33 pages under
  `docs/engine/` are rendered at
  [/reference/](https://shojiku.pages.dev/reference/) — one route each,
  with a sidebar that follows the WIRE's own shape (the top-level keys,
  the fifteen item types, the shared item keys, the layout modes, then
  `definitions.yml` and the cross-cutting concepts) instead of an
  alphabetical file list. The item order is the parser's own, taken from
  the key catalog rather than retyped, and a page that does not declare
  where it belongs fails the build instead of quietly vanishing from the
  tree.
  Each page carries a **live demo**: a small complete document, rendered
  by the engine in your own tab, that you can open and copy. Where the
  syntax a page documents is newer than the engine this site serves, the
  demo says so and shows the document as source rather than handing you a
  parse error — it starts rendering by itself at the next release.
  Nothing is restated. A page's prose is the repository file byte for
  byte, and a gate proves it after undoing the handful of link rewrites
  the web needs; the page tells you which file it renders and offers it
  for copying, so an AI agent can take the source rather than the HTML.
  `llms-full.txt` now carries the reference's authoring pages too, so an
  agent asking about `flex` gets it in one fetch instead of two. The one
  page it leaves out is `features.md`, which records why the engine is
  shaped as it is rather than how to author anything — a third of the
  payload for something a template author never reads. It is still on the
  site, and still offered for copying, like every other page.

- **Every feature page now states its limits.** All 31 pages gained a
  `Limitations` section, and where a diagnostic reports the restriction the
  entry names its code — so a claim about what the engine will not do can
  be checked against the diagnostics registry rather than believed. The
  cross-cutting version lives on the reference index as **Not supported
  yet**, which is where restrictions that used to be findable only on
  some other feature's page now are.

- **A machine-readable catalog of every authorable key.** The per-key
  facts of the wire — key name, type, the closed set of values a key
  accepts, which keys a shape requires, and the tagged union of item
  types — are now held once, as a JSON Schema document derived from the
  parser itself and committed at
  `engine/authoring/reference/catalog.schema.json` (81 named shapes).
  Until now those facts were retyped wherever they were needed, and
  nothing checked the copies against the parser.
  Deriving it from the parser is what makes it trustworthy: `make
  reference-check` regenerates and fails on any difference, so a key
  added without regenerating is a red gate rather than a quiet lie.
  The types whose parsing is hand-written carry hand-written schemas,
  each pinned by a test that feeds every form the schema declares
  through the real parser and one form it excludes — because a catalog
  that claims more than the engine accepts is worse than no catalog,
  and that is exactly what a naive derivation produced for `flexBasis`
  (which takes `content` or `0`, not any number).
  The document carries structure only. Per-key prose is authored
  separately, per locale, and lands with the surfaces that serve it.

- **Thai, wrapped where the words are.** Thai writes without spaces
  between words, so a wrapper looking for one finds nothing: a Thai
  paragraph used to arrive as a single unbreakable run and get cut at
  whatever character the line width reached — mid-word, and sometimes
  between a character and the vowel or tone mark that belongs to it.
  Thai runs are now segmented into words first (ICU4X's line segmenter,
  the same Unicode data a browser uses) and break at those boundaries
  instead. Where a single word is still wider than the line and has to
  be split, the break is held back so the cluster is not cut on either
  side: a non-spacing mark never opens a line, and a leading vowel
  (เ แ โ ใ ไ, written before the consonant it is pronounced after) never
  ends one.
  `lineBreak` does not switch this off — segmentation supplies break
  opportunities, `lineBreak` governs the prohibitions applied after
  them. Text in every other script tokenizes exactly as before, so no
  existing document's line breaking moves.
  The segmentation model has a cost the browser build pays: the wasm
  engine grows by about 316 KB gzipped (372 KB raw) for the ICU4X
  line-break data, unconditionally — there is no feature flag to leave
  Thai out.

- **A `th-TH` locale pack, dated in the Buddhist era.** Thai chrome —
  month and weekday names, the baht, `d MMM y` patterns — plus a
  `noto-sans-thai` font pack, so a Thai document renders glyphs rather
  than boxes. Dates print the year Thailand actually uses: 2026 CE comes
  out as 2569 BE, from the pack's own era table. Add `format: gregorian`
  to a date field for the Christian year instead; the bundled
  [Thai receipt](examples/business/receipt-th-th/) prints both in its
  footer. Making that possible needed one engine fix: an era's start
  date could not be written with a year before 1, which is exactly what
  the Buddhist era needs (`-542-01-01`).

- **Your own fonts, in one command.** Shojiku renders with fonts from
  packs and never scans the system, which kept output reproducible but
  meant a licensed corporate font had to be installed by hand: create the
  directory, run `sha256sum`, write a `manifest.yml` by hand, and get
  every field right or find out at the next render. `shojiku font add
  MyCorporate-Regular.ttf --family my-corporate --license Proprietary`
  now does all of it — the directory, the copied file, and the manifest
  with the digest already pinned. Run it again with `--weight bold` to
  add the bold face to the same family. It refuses rather than writing
  something the renderer would later reject: a file that is not a font, a
  face id the pack already uses, a name already taken by different bytes,
  a second licence in one pack, an existing manifest it cannot read — and
  a refusal writes nothing at all. Fonts whose embedding rights say no
  are refused too, naming `--embedding-attested` for the case where you
  hold a separate embedding licence; nothing is ever attested silently.
  Packs stay non-redistributable unless you say otherwise, which is
  usually what a licence requires.

  To render with one, `--font-pack my-corporate` on `render`, `preview`
  or `inspect` loads it alongside the locale's own fonts. That is the
  short way round: adding a pack to a built-in locale by hand means
  restating its entire font list, because a locale overlay replaces the
  list rather than adding to it. A pack named this way is tried first, so
  it can also stand in for a bundled font of the same id. Detectable as
  the `cli.font.add` capability key.

- **The MCP server now hands an agent something to read.** Registering
  `shojiku-mcp` used to give an AI four tools and nothing else: with only
  the Docker image there is no `docs/` and no skills on disk, so the only
  way to learn the template syntax was to write something and read the
  rejection. Two things change that. The server now answers `initialize`
  with a short `instructions` string — the three files, the
  validate → preview → inspect loop, and a reminder that the running
  engine is the authority on syntax rather than whatever the model
  remembers — which clients hand to the model before it starts. And the
  34 bundled examples became readable over the wire: `list_examples`
  gives every entry's title and what it exercises, and `get_example`
  returns that entry's `templates.yml`, `definitions.yml` and
  `params.json` together, since a template's bindings mean nothing
  without its definitions. The same documents are also MCP *resources*
  under `shojiku://example/<bucket>/<name>`, so clients that browse
  resources see them there. Nothing is truncated to fit: an entry too
  large to send whole — only the layout showcase, today — is refused with
  the per-file URIs to ask for instead, so a fragment can never be
  mistaken for a document. Detectable as the `mcp.examples` capability
  key.

- **Grid columns can size themselves to their contents.** A track list
  now takes `auto` beside `fr` and fixed lengths —
  `columns: ["auto", "1fr"]` gives a label column exactly the width its
  text needs and hands the rest to its neighbour. Only cells sitting in
  a single column set the width; if the content asks for more than the
  grid has, the `auto` columns scale down together and the text wraps
  inside them. `auto` in a *row* list means the auto row it always did,
  so a mixed list reads plainly.

- **An underline can now span a field whose width you don't know.** A
  `line`'s `from`/`to` accept the same length forms as everything else —
  `to: { x: "100%" }` reaches the right edge of whatever box the line
  sits in, and `em`/`rem`/`mm` work too. Until now endpoints were bare
  point numbers, which made a name-field rule under a flex child
  impossible to write: the field's real width is a share of the row,
  decided when the page is laid out, so there was no number to type.
  Nest the line in the field and it follows the field. Templates written
  before this are untouched — a bare number still means points, and it
  is still written back as a bare number.

- **Items that render off the paper now say so.** Three new warnings
  cover the cases that used to render silently: `sheet_overflow` when a
  header/footer or absolute-body item — a bare `line` included — runs
  past the edge of the sheet, `child_overflow` when a stacked or
  hand-positioned child runs past its container's content box (naming
  the child, not the container), and `grid_column_overflow` when a grid
  child is wider than the column track it sits in. Reaching into the
  page margins stays silent on purpose: a full-bleed background or a
  rule wider than the text column is a normal thing to want, so only ink
  that leaves the paper is reported.

  Each of the three carries **numbers only** — how far over, and what it
  had to fit in — so the Designer renders them in your language instead
  of passing an English sentence through. The Japanese, Traditional
  Chinese and Simplified Chinese wordings ship with them.

- **A list inside a repeat cell now knows what its entries are.** When a
  row of your data carries its own array — the contents of each parcel on
  a shipping label, say — that array is a data source like any other. Its
  fields are checked when you validate, so a typo in the entry template
  (`{tilte}`) is reported against the template instead of quietly
  printing nothing, and each entry now formats the way you declared it:
  currency, dates, `placeholder` for a blank, and `enum` display labels
  all apply, where before they silently did not one level in. Nothing
  about the file format changed — `definitions.yml` always accepted this
  shape, and the engine now reads all of it. The Designer keeps up: such
  an array appears in the field palette, badged with the group it
  belongs to (so two sources named 内容品 are told apart), its "used"
  count is correct, and the data-source picker offers it to a list
  inside that group's cell — picking it writes the row-relative key,
  with no scope escape, because that is what the engine reads. It used
  to be left out of the palette entirely.

- **A never-matching `equals` is now reported before you render.** A form
  mark or a table row-condition whose `equals` is a different kind of
  value than the field declares (`equals: 2` against a text field), or a
  value outside the field's declared `enum` (`equals: fier` against
  `[fire, flood]`), can never match anything — `validate` says so now,
  naming the field. The value you wrote is never echoed back.

- **Every overflow warning now speaks your language.** The remaining
  three cases that reported through `horizontal_overflow` — a flex row
  whose fixed children don't fit, a flow item past the region's right
  edge, and vertical text needing more columns than its box holds — each
  gained their own warning carrying numbers instead of a prewritten
  English sentence: `flex_row_overflow`, `flow_item_overflow` and
  `vertical_text_overflow`, with Japanese, Traditional Chinese and
  Simplified Chinese wordings.

  **`horizontal_overflow` is now emitted by nothing.** If you filter or
  branch on that code, move to the successor for the case you care about
  — the list above plus `sheet_overflow`, `child_overflow` and
  `grid_column_overflow` from the entry above. The code itself is not
  removed (codes are a frozen contract), so nothing breaks on the way
  in; it simply stops appearing.

- **You can now sign with a key that never enters your application.**
  When the private key lives in a cloud KMS, an HSM or a smartcard,
  signing splits into two calls: Shojiku hands out the bytes a signature
  has to cover, whatever holds the key signs them, and Shojiku writes
  the signature into the document. The C ABI gained
  `shojiku_sign_prepare` and `shojiku_sign_complete`, and the Ruby SDK
  gained `ExternalSigner`, which takes a block that does the signing —
  so the call site is `artifact.sign(provider)` exactly as before, and
  only the provider differs. Shojiku ships no KMS client of its own: the
  block is whichever client your application already uses. RSA PKCS#1
  v1.5 and ECDSA P-256 are supported, both over SHA-256, and the
  signature format is what AWS KMS and Google Cloud KMS return
  unchanged. The documents produced this way are byte-for-byte the ones
  the in-process signer produces from the same material.

  **All seven SDKs and the command line now offer it.** Python, .NET,
  Java and Node reach the seam through the shared library; PHP and Go
  drive two new CLI verbs, `shojiku sign-prepare` and
  `shojiku sign-complete`, which take a document, a certificate and an
  `--algorithm` and never take a key or a passphrase. `sign-prepare`
  prints what a signature must cover as JSON and carries the same object
  in the `--report` sidecar, so a shell script can do this as readily as
  an application can. In every SDK the provider is a class beside
  `LocalPem` — the call site does not change — and the value it hands
  your code is the CMS signed attributes, not the document digest.

- **A template can now say what the document IS, not just what it
  draws.** A new top-level `document:` block carries `title`,
  `description`, `keywords`, `language` and `authors`, and they land in
  the PDF's document properties — the panel a reader opens with ⌘D, the
  fields a search index reads, and the language a screen reader
  announces. Every value takes `{key}` interpolation like ordinary text,
  so an invoice can title itself after its own number. The Designer
  gained a matching **Document properties** section in the
  document-settings view, with the language offered as a pick rather
  than free text (the engine only accepts a proper language tag).
  Nothing here is drawn on the page, and PNG previews carry none of it —
  the format has no metadata channel, the same reason previews carry no
  links. There is deliberately no creation date: a timestamp would make
  the same inputs produce different bytes, and identical output is what
  signing rests on.
  The values are bounded, and a value that breaks a bound is left out of
  the PDF rather than truncated — with a warning saying so:
  `document_metadata_control_chars`, `document_metadata_too_long`,
  `invalid_document_language` and `too_many_document_entries` name what
  was dropped and why.

- **`composer require shojiku/shojiku` — all seven SDKs now install from a
  registry.** PHP was the only one you could not, and the reason was
  structural rather than unfinished work: Packagist reads `composer.json`
  from a repository root, while Shojiku keeps php's under `sdk/php`.
  Publishing now splits that directory into a derived repository Packagist
  tracks, carrying the real commit history and only the version tags this
  repository has already released — so it can never offer a version that
  was not shipped here. `0.1.0` is listed, backfilled from the tag that
  released it, so the package works for the version already out; being a
  faithful copy of what shipped, it predates the licence files and the
  homepage now pointing at the site; the 0.2.0 package carries both.

- **Table headers can now come from your data.** A column's `label` and
  the labels in `headerGroups` take `{key}` interpolation like ordinary
  text, resolved against the top-level params. They were the last
  authored strings the renderer drew verbatim, which meant a template
  serving more than one language had to hard-code its header row in one
  of them.

- **A warning when nesting asks for more re-flows than the engine will
  spend.** Deeply nested boxes that keep re-flowing each other now stop
  at a budget and report `reflow_budget_exhausted`; the innermost
  children keep their content size instead of looping further.

- **A recipe booklet, as an example and a skill.** The bundled examples
  gained `examples/lifestyle/recipe-booklet-en`, and
  `skills/shojiku-recipe-booklet` ships beside the other product skills
  (`npx skills add kengos/shojiku`), so an agent can be handed the whole
  booklet job. The site's new `/tips` page walks through it and lists
  the clients that can run it.

- **Four more presets in the Designer's catalog.** `invoice-en`,
  `restaurant-menu-us`, `certificate-en` and `certificate-ja` now open
  as starting points from the Designer, and the homepage's live block
  gained a flex example (`examples/dev/live-flex`) small enough to read
  whole.

- **Printing in a language the engine does not build in, written down.**
  The site's `/languages` page (both locales) covers picking a locale
  pack, adding a font pack, and where the engine stops and the pack
  takes over — the layer that was referenced all over the docs but
  specified nowhere.

### Changed

- The playground's YAML panel — the whole runnable file, as before — is
  now one disclosure away instead of sitting open beside the controls, so
  the rendered page leads and the source is there when you want it.

- **The MCP server is no longer published to crates.io.** `shojiku-mcp`
  now carries the bundled examples inside the binary, and those files
  live outside the crate's own directory — a crates.io package copies
  only what sits under the crate, so a published copy would be missing
  them and would not build. It stays available where the docs actually
  point you: the Docker image and the release binaries. The crates.io
  surface is unchanged for everyone else — `shojiku-cli` for the command
  line, `shojiku-authoring` for embedding — and `shojiku-mcp` 0.1.0 stays
  where it is.

- **Row children with no width now size to their content.** Until now a
  `direction: row` child without a `w` took an equal share of the row
  whatever it held, so a short label and a long paragraph came out the
  same width. Each child now starts at the width its own content wants
  and only what is left over is split by `flexGrow` — the way CSS sizes
  a flex row. If the contents together are wider than the row, the
  children give the excess back in proportion and the text re-wraps
  instead of running off the edge; `minWidth` and `maxWidth` hold a
  child at its bound while the others take up the slack.

  **This changes existing layouts.** Write `flexBasis: 0` together with
  `flexGrow: 1` on a child to put it back on the plain share it had
  before — that pair is CSS's `flex: 1`, which is exactly what the old
  behaviour was. Some kinds have no content width to measure (`rect`,
  `image`, `qr_code` and `ellipse` need an authored size anyway;
  vertical text, tables, `list` and `char_grid` are not measured) and
  keep the share unchanged.

- **Nothing grows unless you ask it to.** `flexGrow` now defaults to 0,
  as it does in CSS. Together with the change above that means a row
  child with no width sizes to its content and stays there, and the rest
  of the row is free space for `justifyContent` and auto margins to
  place. Every bundled example that relied on the old fill now writes
  `flexBasis: 0` + `flexGrow: 1`, which is the same edit an existing
  template needs.

- **`flexGrow` works in a column too.** A column's main axis is its
  height, so a child with no `h` in a container of a known height can
  take a share of what its siblings leave over — the same key, the same
  weights, the other axis. A column with no definite height has nothing
  to share, as in CSS. Unlike a row, a column never shrinks its children
  back: squeezing a width re-wraps text and keeps it readable, squeezing
  a height only clips.

- **`alignItems: stretch` now really stretches in a row.** It is the
  default, and until now it quietly behaved like `start`: a row child
  with no height kept its content height, so bordered or filled boxes
  side by side came out ragged. They now fill the row — its own height
  when it has one, otherwise the tallest child's. A `margin: { top:
  auto }` or `{ bottom: auto }` opts a child out, since an auto margin
  beats alignment.

- **`fr` grid rows now account for the content rows above them.** An
  `fr` row splits what is left of a definite height, and "what is left"
  used to mean only the fixed rows — an `auto` or implicit content row
  counted as nothing, so `rows: ["auto", "1fr"]` handed the `fr` row the
  whole grid and the two together claimed more space than there was. The
  auto rows are measured first now. A row-*spanning* child is still not
  counted; that one is genuinely circular, and it is written down on the
  grid page rather than left to be discovered.

- **A `minWidth` above a child's share no longer overflows its row.**
  The floor was applied, but its siblings kept the width they had
  already been given, so the row came out wider than its container by
  exactly the difference. Each round of the sizing now redistributes
  from the children's own bases, the way CSS specifies it, and both
  floors and ceilings settle inside the row.

- **A document that declares a locale now says so in the PDF itself.**
  When `document.language` is not set, it falls back to
  `defaults.locale`, so a template that already declares `ja-JP` gains a
  document language without authoring it twice. Existing PDFs change by
  exactly that one field (plus the XMP entry beside it); nothing on the
  page moves.

- **A font pack can no longer reach outside its own directory.** Two
  things could point somewhere they had no business pointing. A locale
  pack's `fonts.uses:` entry names a directory under your font search
  dir, and nothing checked what was in it — an entry like `../..`, or an
  absolute path, aimed the lookup wherever it liked. And a face's
  `file:` was checked only as text, so a symlink sitting inside the pack
  quietly read whatever it pointed at. Now a `uses:` entry must be a
  plain single path segment (letters, digits, `-`, `_`, at most 64
  characters) or the locale pack fails to parse; a face file must still
  resolve inside its pack once symlinks are followed; and a pack
  directory that is itself a symlink is refused. A face file that is
  simply *absent* is untouched — that is how a pinned pack travels
  without its bytes, and it still works exactly as before. If you were
  relying on a symlinked pack directory, name the real directory with
  `--font-dir` instead (it is repeatable). The Designer's font picker
  holds itself to the same rule, so it cannot offer you a font whose
  pack the engine would then refuse — no font in today's catalog is
  affected.
- **Error messages no longer replay a document's own bytes at you.**
  Anything the engine quotes back — a mistyped template key, a params
  value, a font-pack or locale id, a file path — is now stripped of
  control characters and clipped to a bounded length before it reaches
  you, with a `…` marking anything cut. Two things prompted this. A
  document could make an error run to thousands of characters, and, worse,
  it could smuggle a terminal escape sequence into one: a message printed
  to your terminal or shipped to your log aggregator could repaint the
  screen or forge a second log line. Bidirectional formatting characters
  go the same way — those change the order a message *displays* in without
  changing a byte of it, which defeats the whole point of quoting your key
  back to you. Zero-width joiners stay, since they carry meaning in real
  text. Values clip at 200 characters and whole messages at 400, with
  tighter limits where the value itself is short by nature — 64 for a
  locale id, 32 for a currency code. Every
  surface that prints an engine error now applies the same bound: the
  CLI's stderr, the `--report` sidecar, the C ABI status, the MCP error
  response, and the error the browser build throws. Diagnostics were
  already bounded and are unchanged, so anything reading `code` and
  `args` sees exactly what it saw before — only the human-readable
  message got shorter, and only when it was hostile to begin with.
  The Designer applies the same rule to its own editing errors, and now
  counts by character rather than by UTF-16 unit, so a clipped run of
  emoji or rare CJK is no longer cut mid-character.

- **A hostile value can no longer crowd the explanation out of an error.**
  A few diagnostics have no structure to render — they carry one prewritten
  sentence, like "asset `<path>`: unrecognized image format" — and that whole
  sentence lives in a single 200-character value. So a document with a
  10,000-character asset path filled the entire budget with its own path, and
  you got a wall of text without ever learning what was wrong with the image.
  A value quoted inside such a sentence now takes at most 80 of those 200
  characters, leaving the rest to the explanation, which therefore always
  survives beside it. The value is still shown and still ends in `…` when
  cut. The same limit applies where a diagnostic's *location* embeds a name
  the document chose, which nothing had been bounding.

- **Absurd font sizes and stroke widths now fall back with a warning
  instead of reaching the geometry.** `fontSize` and `lineHeight` accept
  up to 1000 each, and the `line` item's `style.width` joins the
  0..=1000 pt bound `borderWidth` already had. Past those, the value
  warns (`font_size_out_of_range`, `line_height_out_of_range`,
  `invalid_line_width`) and the engine draws at its default — 10 pt, 1.4
  and 1 pt respectively. The two font caps are a pair: their product is
  the tallest line box the engine will build, which is exactly the
  ±1,000,000 pt limit every other length already obeyed. `fontSize` was
  the one length that escaped it, so a huge finite size could drive the
  line-height and advance sums toward values no longer representable.
  Real documents are nowhere near — the largest font size in any bundled
  example is 46 pt — and an authored `width: 0` on a `line` is still
  legal and silent.

- **The homepage playground now runs a released engine, and says which
  one.** It used to run whatever was on `main`, so a visitor could try a
  fix in the browser and then install a package without it — the demo
  ran ahead of the product. The engine the site serves is now pinned to
  a published release and moves only when a release moves it, and the
  site states which version that is — read from the running binary's own
  report rather than written down beside it.

- **The concept page moved: `/why` is now `/concept`, in both locales.**
  The old URL is gone, not redirected — a static host has no redirect to
  offer — so update any bookmark. The 原稿用紙 example
  (`examples/typography/kokugo-print-ja`) was rebuilt as a
  reading-comprehension worksheet at the same time, which is what its
  gallery entry now shows.

### Fixed

- **The docs no longer contradict themselves about what is built and
  where keys live.** A comprehension audit of the documentation set
  found and fixed the places where following the text would mislead:
  the fonts page still told authors to set `locale:` in
  `definitions.yml`, which the engine now rejects as a parse error
  (it lives in the template's `defaults:` block); the table page's
  column key table omitted `type` and `fit`, the keys that make QR and
  image columns writable from the reference alone; the quickstart
  enumerated four MCP tools and then said "six" (`list_examples` /
  `get_example` are now named); and several pages still described the
  Designer as not publicly hosted and the signing/verify/MCP/WASM
  crates as future work — all of which shipped. Cross-references were
  added where a term was defined in one file and used in another
  (renderer ↔ layout-tree vocabulary, the pinned-face auto-fetch).

- **`llms.txt` lists the pages this site actually has.** Its table of
  contents had drifted from the site in both directions: the page about
  printing in a language the engine does not build in was missing
  entirely, and the template reference was listed at an address that
  returns a 404 — its markdown is generated, and what is served is one
  file per page under `/data/reference/`, which is where the reference
  section now points. An agent handed `llms.txt` no longer follows a dead
  link or misses a page. The build now refuses to produce a table of
  contents that disagrees with the pages beside it.

- **The dependency licence and advisory gate now sees every dependency.**
  `cargo deny` was running without `--all-features`, and in that mode it
  does not traverse an optional dependency that no enabled feature turns
  on — so a rejected licence could ride in unseen. This was not
  theoretical: the Node addon's N-API dependencies sit behind a
  non-default feature, are built into the addon the npm package ships,
  and had never been checked. Nothing in the tree turned out to violate
  the policy, so the fix is the gate rather than any dependency; what
  changed is that a future one cannot hide there.

- **A short date no longer prints the year twice.** `format: compact` on
  a Hindi or Filipino document rendered `14/3/20262026` instead of
  `14/3/2026`. CLDR spells short dates with a two-digit year (`yy`) and
  those packs carried its spelling verbatim, but the pattern grammar has
  no two-digit-year token — the longest match for `yy` is the year
  token twice. Both packs now spell the year in full. The missing token
  is a real gap and is still open; what is fixed is that no shipped pack
  authors a token the grammar does not have.

- **Chinese text no longer breaks in front of a closing quotation mark.**
  Line breaking knew the CJK brackets but not the quotation marks
  Chinese actually writes with, so `“…”` could wrap with the closing `”`
  stranded at the head of the next line, and `“` left dangling at the end
  of one — wrong in any Chinese document. Closing quotes `’ ” 〞 〟` are now held off a
  line start in every strictness mode, opening quotes `‘ “ 〝` off a line
  end, and the white bracket forms `〖〗〘〙〚〛` and the double-prime forms
  `〝〞〟` join the bracket classes they belong to. No character that
  Japanese kinsoku already classified changed class, and every bundled
  example still renders byte-identically — but a Japanese document that
  uses `‘’“”〝〞〟` does wrap differently now, which is the fix rather
  than a side effect. Latin text is untouched:
  the interpuncts `·`/`‧` and the em dash are deliberately left alone,
  because `·` separates fields in Latin documents (`address · tel · web`)
  and holding it back would pull a letter off the previous line. The
  classification follows the Unicode categories, with `‘’“”` split by
  initial/final category since Unicode's line-break class does not say
  which end of a quotation they sit at.

- **The .NET client accepts a template root written the way everyone
  writes one.** `new ShojikuClient(templates: "templates/")` failed every
  render with "the template resolves outside the template root", while
  the identical layout worked from Python, Ruby, Node and Java. The
  trailing separator was the whole cause: .NET's `Path.GetFullPath` keeps
  one where the other languages' `realpath` equivalents drop it, so the
  canonicalized root ended in `/` and could never match the parent
  directories the containment check walks. A relative root was never the
  problem — an absolute `/app/templates/` failed just as hard, and
  `templates` without the slash worked. The root is now canonicalized to
  one form, and all seven SDKs pin the accepted shapes — relative or
  absolute, with or without a trailing separator — so this cannot drift
  in one language again. Containment itself is unchanged and still
  refuses a symlink or a same-prefix sibling that leaves the root.

- **Every package page now links somewhere useful.** All seven SDKs and
  every published crate told their registry that the project's home was
  the GitHub repository, so none of them linked to the site at all. Each
  now points its homepage field at
  [shojiku.pages.dev](https://shojiku.pages.dev) and keeps GitHub as the
  separate source link. The READMEs had the worse problem: their links
  were written relative to the repository, so on every registry that
  renders a package README — npm, PyPI, NuGet, Packagist and
  pkg.go.dev — the template reference, the SDK policy and all three
  licences were dead links. They are absolute now.
- **Long text that splits across pages now redraws its whole box on
  every fragment.** Only the first piece of the decoration used to carry
  over, so a text with per-side `borderWidth`s kept its top border and
  lost the other three — and that survivor was then stretched to the
  fragment's height, painting a solid block of border colour over the
  text. Dashed and dotted sides disappeared entirely, and
  `borderStyle: double` lost its second stripe. Every side, stripe and
  dash now redraws at each fragment's own height (CSS
  `box-decoration-break: clone`), on both the horizontal split and the
  vertical-writing column split.
- **A `minHeight` taller than the text survives the split.** The
  reserved space and the `verticalAlign` offset distributing it were
  both dropped once the text paginated, so a bottom-aligned block
  jumped to the top of its fragment and the split output was only as
  tall as its lines. The slack above the content now leads the first
  fragment and the slack below it trails the last, so the fragments
  still sum to the reserved height.
- **The layout showcase's YAML samples now show their nesting.** Eight of its
  forty-four code panels were written with ordinary spaces, and the
  engine collapses whitespace at a line head the way CSS does, so those
  samples rendered flush left — every nested key sitting under its
  parent instead of inside it, which is exactly backwards for a sample
  whose subject is structure. They now use the no-break spaces the other
  panels already used. Documents you author are unaffected: the
  collapsing is deliberate and unchanged, and it is still U+00A0 that
  buys hard indentation. A new check refuses ordinary spaces and tabs
  alike in any bundled template — a tab collapses the same way, so an
  editor's auto-indent inside a block scalar is the same trap — since
  nothing about this was visible before: the render emitted no warning
  and the page simply looked wrong.

- **An SVG is now clipped to its own box under every `fit`.** With
  `contain` or `stretch`, paths reaching outside the image's `viewBox`
  used to paint wherever they landed — one sloppy or hostile SVG could
  draw over the rest of the page. Every placed SVG now clips to its
  content box; the committed example outputs moved by exactly that
  clipping.

- **The Designer keeps your binding across a content-mode switch.**
  Changing a text item between plain text and a bound field used to
  drop the binding on the floor. The pickers behind this moved to the
  house input row, the chip text field finally takes a caret, the
  property panel now says what a binding is instead of assuming you
  know, and three visual defects in those controls went with it.

- **The tutorial's coach mark points at controls that still exist.** It
  anchored to controls a later change had removed, and it measured its
  anchor once and never again, so it drifted when the layout moved. It
  now tracks the anchor, and the English and Japanese step copy were
  re-audited against the current chrome.

- **Site links into `/designer/` no longer 404.** The Designer is a
  separate app merged into the deployed output, and VitePress's client
  router intercepted the links and served its own not-found page; all
  six now force a full page load.

### Security

- **The four npm advisories on the homepage's build tooling are
  cleared.** All sat on `site/pnpm-lock.yaml`, in dependencies the site
  never ships to a visitor — vite 5.4.21 (CVE-2026-53571, high, plus
  CVE-2026-53632 and CVE-2026-39365) and the esbuild 0.21.5 under it
  (GHSA-67mh-4wv8-2f99), both reached only through VitePress. Both are
  transitive, so no update could touch them while VitePress's own range
  was satisfied; the same override mechanism the gui already uses now
  pins them past the advisories (vite 6.4.3, esbuild 0.25.12), and the
  site builds and tests green on the result. Nothing about the published
  pages changes.

## [0.1.0] - 2026-08-02

First release: a deterministic PDF document engine for business
paperwork. A document is two YAML files (template + field catalog) plus
JSON data, and the same input renders byte-identical PDFs from the CLI,
Docker, every SDK and browser WASM.

- **Layout** — containers with `%`/flex/grid, data-driven tables with
  repeating headers and pagination, n-up imposition, vertical writing
  with ruby and kinsoku, character grids (原稿用紙, 〒 entry cells), form
  marks, QR codes, links, images.
- **Locale packs** — ja-JP and en-US built in; zh-TW, zh-CN, hi-IN and
  fil-PH shipped as data, so one template renders many locales at the
  same geometry.
- **Tooling** — `validate` / `preview` / `inspect` with machine-readable
  diagnostics, an MCP server, and the browser Designer.
- **Signing** — PDF incremental-update signing and a verifier that
  reports what it did *not* check.
- **SDKs** — Python, Ruby, Node, .NET, Java, Go and PHP, all against one
  frozen lifecycle contract.

[Unreleased]: https://github.com/kengos/shojiku/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/kengos/shojiku/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/kengos/shojiku/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/kengos/shojiku/releases/tag/v0.1.0
