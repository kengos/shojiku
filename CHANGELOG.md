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

### Changed

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

### Fixed

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

[Unreleased]: https://github.com/kengos/shojiku/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/kengos/shojiku/releases/tag/v0.1.0
