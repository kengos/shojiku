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

- **Any item can now be shown or hidden by the data.** Add
  `visible: { key: status, equals: approved }` to a text block, an image,
  a table — anything — and it draws only when the params say so. An
  approved stamp that appears on approved orders and nowhere else, a
  paragraph that belongs only to one kind of customer, a page break that
  happens only for long documents: each is one key on the item that needs
  it, rather than a second template. The predicate is the one the form
  marks already use, unchanged — a plain value, a list to mean "any of
  these", or a bare key read as a yes/no — so there is nothing new to
  learn and a wrong literal is still reported before you render.
  By default a hidden item keeps its space, exactly as a blank form field
  does today, so a document does not reshuffle depending on the data.
  Adding `collapse: true` says the opposite: take the item out of the
  layout entirely and let everything after it close up, gaps and grid
  cells included. The two match CSS `visibility: hidden` and
  `display: none`, and hiding an item hides everything inside it.

- **The Designer tells you when text has landed on other text.** Change a
  document's page size and the parts pinned in points stay exactly where
  they were, while anything sized `100%` grows with the sheet — so a
  centred heading can drift across a block of details that never moved.
  Nothing was wrong with the document, so the engine reports nothing and
  the diagnostics panel said "no problems" while the two overlapped on
  screen. It now lists the items whose printed text collides, and
  clicking one selects it on the canvas. It reads the text the engine
  actually drew rather than the boxes it drew into: boxes routinely
  overlap in a perfectly good document — a full-width heading's box
  spans whatever is pinned inside it — so the boxes cannot tell a broken
  page from a working one, and the printed lines can. Deliberate overlaps
  stay quiet, since a stamp over a rule or a watermark behind a paragraph
  is not text meeting text.

- **A line's endpoints can be edited in the Designer.** A `line` is
  positioned by its two endpoints rather than a box, and nothing in the
  property panel could author them — so a line placed by the cut-here
  scaffold could be restyled but never moved. Its placement tab now
  carries the four endpoint fields. They take what the engine takes: a
  plain number is points, or write `100%` to reach the parent's edge. A
  value outside that is refused rather than written, since both
  endpoints are required and a rejected one would stop the document
  parsing.

### Fixed

- **A form mark reading a page-global flag no longer reports a false error.**
  A `data: { key: …, scope: document }` binding inside a repeated block is the
  documented way to let one top-level field tick a mark in every row — but
  checking it looked the key up among the row's own fields, found nothing, and
  reported it as an undeclared data key. The document rendered correctly the
  whole time; only the check was wrong, which is the worse way round, because
  it puts a red error on a file that has nothing wrong with it.

- **The Designer no longer offers layout fields on items that cannot take
  them.** A `line` draws between two points and a `page_break` carries
  nothing but an id — neither accepts a `box:` — but the property panel
  showed both a placement tab anyway, and typing a value into it wrote a
  key the engine rejects, breaking the document you were editing. A line
  now opens straight on its stroke controls, and a page break says
  plainly that it has nothing to edit.
- **A template that fails to open is no longer a dead end.** If the
  engine or a font pack could not be fetched, the Designer reported the
  failure on the loading panel and left you there with no way out but a
  page reload. The panel now carries a way back to the template list —
  during the wait as well as after a failure, so a load that is simply
  taking too long can be abandoned too. Backing out is final: an open
  that finishes afterwards no longer drags you into the editor you left.

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

[Unreleased]: https://github.com/kengos/shojiku/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/kengos/shojiku/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/kengos/shojiku/releases/tag/v0.1.0
