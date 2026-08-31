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

- **The document-settings panel now explains a locale pick with the engine's
  own output.** It used to carry its own table of per-locale example strings —
  a date, a grouped number, an amount — copied from the locale packs by hand
  and kept honest by a test. Those examples are now rendered by the engine
  through the same path a bound field takes, so they cannot drift from what the
  page prints, and a locale the preview is not running can still be described.
  A new `localeFacts` query answers it, reported by the capability key
  `locale.facts`; an engine without it leaves the panel explaining nothing
  rather than guessing. A locale pack is now fetched once per locale rather
  than once per settings edit, so editing an unrelated document default no
  longer re-downloads it — and a brief network failure can no longer leave
  the panel silent afterwards.

- **A manuscript-paper item can now be given a named style, and told whether to
  read ruby notation.** Neither had a control: `styleNames` decides where the
  item's font size, ruling width and cell alignment come from, and its only
  picker lived on a tab this item type does not get. The ruby switch sits with
  the content it interprets, and says what turning it on means — while it is off,
  `《》` and `［＃…］` print as the characters they are, and turning it on makes
  those marks meaningful in data bound from params too.

- **A colour field now says which colour is in it without being opened.** The
  swatch alone told you the field existed, not what was set, so a reader who
  cannot tell two swatches apart had to open the palette every time. The name and
  the code sit beside the chip. This ships on the text colour, the fill colour
  and the manuscript-grid ruling colour; the border pen, the line stroke, the
  table band rows, the named-style form, the defaults page and the format
  toolbar follow.

- Manuscript paper still has no control of its own for the characters' ink
  colour or their font family, which is a narrower gap than before rather than
  a new one: both can now be applied through a named style from the panel.

- **The manuscript-grid controls explain themselves.** Ruling width, ruby size,
  line-break rules and styles each carry a `?` with a two-sentence explanation in
  the reader's language — what an unset ruling draws, what the line-break rule
  moves, which named style wins when two are applied. `Cell size` deliberately
  has none: the name already says it.

- **A manuscript-paper item's ruling, ruby size and line-break rules can now be
  edited.** The bundled genkoyoshi templates set a ruling colour that nothing in
  the Designer could change, and the ruling width, the ruby size and the
  line-break rule had no control at all — the only way to reach any of them was
  to edit the file by hand. The width and the ruby size are pickable from a menu
  as well as typed, and each numeric choice shows what it does: a rule drawn at
  that width, text set at that size. Turning the ruling off is one of those
  choices rather than a number to guess — leaving the width unset draws the
  standard 0.5pt ruling, and choosing "no ruling" draws none.

- **The Designer's colour picker now names every colour, and says which one you
  are pointing at.** The palette is laid out as hue columns against darkness
  rows, with the hue named above each column and the step beside each row, and a
  line under the grid reads out the colour under the pointer — or under the
  keyboard focus — by name and by code. Picking a colour no longer depends on
  being able to tell it from the one beside it. The palette also grew from
  twelve colours to thirty-six; the previous twelve are all still in it, at the
  same values, so nothing an existing template authored has moved.


- **A line break typed into the Designer's text field now stays where you put
  it.** Pressing Enter at the end of a value inserted the break, but the caret
  could not rest after it, so the next thing you typed landed back on the line
  you were trying to leave: `line1` Enter `line2` came out as `line1line2`.
  Enter is now left to the browser, whose own line handling has no such
  trouble, and the editor reads back whatever line structure it produces.
- **A multi-line value is saved as a block literal.** The same field used to be
  written one of two ways depending on what happened to be inside it: an
  ordinary address became a plain YAML scalar whose blank lines WERE the line
  breaks, while one interpolation or one colon made it a `|-` block. Deleting
  what looked like a stray blank line in the first form silently joined two
  lines together. Every multi-line value now takes the block form, where the
  breaks are visible as breaks. Values a block literal cannot spell — one
  carrying a carriage return — still fall back to a quoted form.

- **The Designer offers a date field's locale variants, and says which ones
  drop the time.** The format picker on a binding listed a fixed set of
  spellings the editor carried in its own table, so a locale pack's own
  vocabulary — 和暦 on a Japanese date field — could be typed but never
  chosen; it was already offered on the document-defaults picker, which reads
  the engine's catalog. That picker now reads the same catalog, so a pack
  shipped after the editor was built is pickable without an editor change.
  A datetime field also resolves date-only patterns, which are honoured
  silently and simply stop showing the time; those rows now carry a
  「時刻なし」 mark, and the engine reports the fact by rendering each variant
  at two times of day rather than keeping a list of which spellings mean what.

- **The Designer can now add a header or footer to a document that has
  none.** Every blank start ships without either, and nothing in the editor
  ever created one — so the page-number row sat greyed out with no way to
  satisfy it, and the tutorial's footer chapter asked you to select a footer
  its practice document did not have. Insert now carries a Header and a
  Footer row, and the Structure tab lists the missing band as a row saying it
  has nothing in it; either one creates the band and selects it, in a single
  step you can undo. A band that already exists is simply selected, so the
  rows never grey out or disappear.
- **A header or footer's height and which pages it prints on are editable.**
  Selecting the band opens a form for its two properties — every page, the
  first page only, everything but the first page, or the last page only, plus
  the band height. Neither could be changed anywhere in the editor before,
  not even in the bundled templates that ship with a band.

- **Items can be dragged into a different parent in the Designer.** Until now
  both the canvas and the layer tree could only reorder an item among its own
  siblings, so moving something into or out of a container meant deleting it
  and building it again. Now a canvas drag lands in whatever container is under
  the pointer — it outlines while you hover it, with the insertion line drawn
  inside — and a layer-tree drag lands wherever the drop line sits, which you
  aim by moving left or right as well as up and down, one indent step per
  nesting level. The flow body, flex containers, the absolute body and the
  header/footer bands can all receive an item; a grid container and a
  repeating cell template cannot, and neither can a destination where the item
  would not lay out at all (a page number outside a band, for example), so the
  drop is refused rather than leaving the item somewhere it would silently
  vanish. Moving into a container drops the item's `x`/`y` — the container
  decides its position from then on, and the canvas says so before you let go;
  moving into a band or an absolute body writes them from where you dropped it.
  The whole move is one undo step, and the item keeps its own comments and
  YAML anchors — a move that would leave an anchor defined after something
  that refers to it is refused instead, since that document could not be
  saved.

- **A place to say what a date looks like, and to name a format once.** The
  engine has accepted document-wide format defaults (`defaults.formats`) and a
  named `formats:` registry since v0.2, but the Designer had no way to author
  either — you edited the YAML by hand or set the format on every field. The
  document settings view gains a display-formats section covering both: pick
  how dates, times and money look throughout the document, and register a
  pattern under a name so a field can just say `format: closing`.

  Every sample on that screen comes from the engine rather than from a table
  the editor keeps by hand. A picker row shows what the variant actually
  renders; an unset row shows what happens if you leave it alone; a pattern
  you are typing is previewed line by line as you type it, and each token you
  can insert shows its own output — so you press 「火曜日」 rather than
  remember that `EEEE` spells a weekday, typing the literal 年 / 月 / 日
  between presses. Number, percentage and quantity have no variants to choose
  from yet, so they show what they render and offer no control rather than a
  menu whose every entry would be refused.

  Renaming or deleting a registered format rewrites every place that names it
  — bound fields and the per-type defaults alike — in a single step you can
  undo in one go, and refuses the whole operation rather than half-doing it
  when the document is too large to walk safely.

  New: the `shojiku formats` command answers the same question outside the
  Designer — which display variants each field type can take for a given
  template and locale, and what each one renders. `--probe date:'yyyy年M月d日'`
  previews a pattern before you author it.

- **An AI agent can ask the same question.** That vocabulary reached the
  command line and the Designer but not the MCP server, so an agent authoring
  through it guessed a `format:` spelling and learned from the warning. The
  server gains a `format_catalog` tool answering the same question — every
  pickable spelling per field type, where it comes from, what
  this engine renders for it, and a preview of a pattern you have not authored
  yet. Every argument is optional: with no template at all it answers the
  locale's own vocabulary, which is what you need before there is a document
  to pass it. A template that does not parse still gets an answer, with the
  parse error beside it, so an empty registry half is never left unexplained.

- A table's header row can be drawn invisibly with
  `header: { visuallyHidden: true }`. Nothing about the row is painted — no
  label text, no band fill, no grid ruling — but the column labels stay in the
  PDF's text layer, so anything reading the file (a text extractor, a search
  index, an AI) can still tell what each column means while a person reads the
  cells. The row keeps its height, and a `headerGroups` row hides with it.

- **Manuscript-paper items are editable in the Designer.** A `char_grid`
  previously had no content surface and no way to change its grid, so a
  manuscript-paper template opened from the gallery could not be rebound,
  retyped, or resized. It now carries a content tab (the bound field or static
  text) and a 「manuscript grid」 section on the placement tab — cells per line,
  lines, cell size, line gap, cell gap and the writing direction. The section
  also says the thing that was costing people the most time: the drawn size
  comes from the CELLS, not from the width field above it, and clearing the cell
  size derives it from the item's width instead.
- **A gear on each data field opens the data-item editor already on that
  field.** Previously the only gear was on the tab header, so finding a field's
  sample text meant hunting for it a second time in the editor's own list.

### Changed

- **A dialog now carries the name of the thing you clicked to open it.** Ten
  pairs disagreed: *Container…* opened "Insert a container", *Download as
  PDF…* opened "PDF preview", *Edit data fields…* opened a screen titled
  "Data fields" — the same words as the sidebar tab beside it — and both
  *Save selection as block…* and *Save as block…* opened one modal that could
  not be named after either. The two block labels are now the same label, the
  style-update dialog names the style it is about to overwrite, and the rest
  take the wording of the row that opened them. In every language, not only
  English.

- **The Help menu's *Tutorial* row now reads *Tutorial…*.** The ellipsis is the
  promise that a row will ask you something rather than act — the launcher asks
  which chapter to start from. Its two neighbours, *Keyboard shortcuts* and
  *Glossary*, only show you something and stay bare.

- **The Japanese tutorial quotes menu labels without their trailing ellipsis**,
  as the English one always has: 「挿入」→「コンテナ」 rather than
  「挿入」→「コンテナ…」. The ellipsis belongs to the button you press, not to
  the name of it in a sentence about it.

- **A footer placed before the first render lands on the page on Letter.**
  Positioning an item in a band used the last render to find the bottom of the
  page, and fell back to a fixed number when nothing had rendered yet — the
  number being A4's, which every A4 template got right by coincidence and every
  Letter one got wrong by half an inch, putting the item off the paper where it
  simply did not appear. The page size and margins the document itself declares
  are used now, so the answer is exact before anything has rendered; when they
  cannot be resolved the item goes to the top of the band rather than to a
  guessed position.

- **An item placed in a header or footer no longer gets a fixed height.**
  A band insert authored a 14pt-tall box, which is shorter than the line the
  blank templates' own default text draws (10.5pt) — so the first page number
  you added to a footer warned that the text did not fit, on every document
  that starts blank. Text-shaped items now size to their text, the way they
  already do in the body; rectangles, QR codes and images keep the size they
  come with, since those need one.

- **Each document section has its own mark in the Structure tab.** The
  header, body and footer shared one icon, which said only "a section" —
  the same thing the label beside it already said. They now share a page
  outline with the band drawn where that section actually prints.

- **A single enormous document is now refused instead of parsed.** Templates,
  params, definitions and locale packs had no size limit at all: hand one of
  them a 500 MB file and the engine would read it — twice, since a located
  parse error needs a second pass over the source. Anything over 16 MB is now
  refused before it is parsed at all — a host still reads the file, but the
  engine no longer builds a document out of it — with an error saying how big
  it was and what the limit is, and nothing of the file quoted back. That covers every door a host
  can reach: the three document doors, both arms of the locale-pack door, and
  all four places a font-pack manifest is parsed — including the one a browser
  hands straight to `addFontPack`. 16 MB is twice the
  Designer's documented template ceiling, so no real document comes near it;
  the MCP server keeps its own, much tighter inline limit. Everything under
  the limit behaves exactly as before. This is a bound on the cost of a large
  document, and not a fix for YAML alias amplification: that limit belongs to
  the YAML parser and scales with the input, so it stays a known exposure —
  written down in the engine rather than implied away.

- **Three things the Designer could do but never said it could.** A layer-tree
  row has been draggable into another group since cross-parent moves shipped,
  and nothing on screen said so — one walkthrough found the gesture by
  accident. The tree now carries a line saying what a row does, with a `?`
  explaining that dragging sideways is what changes which group an item belongs
  to, and the keyboard equivalent (Alt+↑ / Alt+↓) has joined the shortcuts
  list. Any length field accepts `25mm` where it shows points, which was
  documented in exactly one sentence beside the corner-radius control; the
  nine fields where that is true now say so on hover — and the three where it
  is NOT stay quiet, because a plain number, a number-only input and a ratio
  do not take a unit however similar they look. The glossary explains the full
  set, including the ones a hover bubble has no room for. And the language switch, previously a grey globe beside an
  equally grey theme icon — both walkthroughs reached for it and opened the
  theme menu — now shows the current language in its own name and comes first.

- **Designer buttons now say which one is the main action, and which labels
  open something.** A dialog's confirming button — Insert, Create, Save,
  Register, Propose edits, and the confirm on the save/export review — is
  filled, its cancel sits beside it as a plain outlined button, and there is
  exactly one filled button per dialog. Seven dialog footers previously drew
  their confirming action as an outlined button — five of them merely a size
  larger than the cancel beside it, one with no cancel at all — so nothing on
  those screens said where to go; four others painted the same fill by hand, which drifted from the shared
  one. Editing chrome — the toolbar, the property
  panel, the menubar, the layer tree — deliberately stays unfilled, because
  those are peers rather than one main action; the empty canvas keeps its
  filled *Add text*, which is the only thing on the page at that moment.
  Separately, **File ▸ Save and File ▸ Export now read `Save…` and `Export…`**:
  both open the review pane before anything is written, and the trailing
  ellipsis is the long-standing convention for a label that opens something
  rather than acting at once. The review pane's own confirm still reads
  `Save` / `Export`, because pressing it does act. One section heading that
  had picked up the same ellipsis in English and Filipino — while reading as
  an ordinary heading in the other four languages — has lost it. No template,
  parameter or produced file changes.
- **Every `make` gate reads scope-first, and each job has exactly one name.**
  The commands that check your work were spelled verb-first (`lint:engine`,
  `verify:sdk:ruby`) and most of them had a second, verbose twin one
  punctuation mark away (`gui-lint` beside `lint:gui`) — so the grid did not
  read down a column, and the two spellings of one job were easy to pick
  wrong. They are now `engine:lint`, `sdk:ruby:verify`, `gui:lint`: scope
  first, outside-in, colons all the way. Verbosity became a flag rather than a
  name — every gate prints one PASS/FAIL line by default, and `V=1`
  (`make gui:verify V=1`) gives the raw output while you debug. The old
  spellings are gone rather than aliased, and `make help` is the full
  inventory. Contributors and CI both move with them; nothing about the
  published packages changes.
- **The 1900-line Makefile is split one file per scope** — `mk/engine.mk`,
  `mk/gui.mk`, `mk/site.mk`, `mk/sdk.mk`, `mk/docker.mk`, `mk/proof.mk` — with
  the root file keeping the shared machinery and the gates that belong to no
  single scope. A new gate, `make make:check`, keeps it that way: it refuses a
  target filed under the wrong scope, and — the reason it exists — any
  tracked file naming a `make` target that does not exist, a CI matrix's
  interpolated name included.

- **What 1.0 will freeze is written down.** The README has warned that this is
  pre-1.0 software since the first release, and the one thing it never said was
  what changes when that warning goes away. The architecture doc now names the
  surfaces 1.0 promises to hold still — the authored wire (templates, params,
  definitions), the diagnostics registry, capability keys, the C ABI, the CLI
  contract the SDKs script, the SDK lifecycle contract, the MCP tool surface and
  the WASM boundary the browser calls — each with the rule it may change under,
  and the meaning that gives major, minor and patch from then on. It is equally explicit about what 1.0 will not
  promise, which is the half that gets assumed: rendered bytes are not
  identical between versions (determinism means same version, same inputs, same
  bytes, and a 1.x may still fix a layout bug), the Rust crate APIs stay
  unfrozen, the Designer versions on its own, and a wrong locale pattern
  remains a bug to correct. None of this declares 1.0 — it writes the promise
  down before it is made, so it can be argued with while that is still cheap.
  The features page said in both languages that the same input renders identical
  bytes "at any time", which is the reading this now rules out; it says "on the
  same engine version" instead.

### Fixed

- **The restore-points dialog no longer shows two filled buttons at once.**
  Arming a saved point's restore left the standing *Save point* button filled
  beside the confirm's own filled *Restore*, so at the moment the dialog was
  asking whether to replace your current work, two controls were competing for
  the eye and neither was clearly the answer. While a restore is armed, the
  capture button now steps down to an outlined one — it still works, it just
  stops shouting — and takes its emphasis back when you cancel or restore.

- **The format pickers show their engine-rendered samples again, and the date
  pattern editor has its token buttons back.** In the standalone app the
  Designer was running without the engine's format catalog entirely: every
  picker offered bare wire spellings with no example beside them, a locale
  pack's own date variants (Japanese `wareki` among them) could not be reached
  from a binding's panel at all, and the pattern field under 文書設定 →
  表示形式 showed neither the token buttons nor the live preview line for any
  input. The catalog was reaching the browser correctly; the app's font-loading
  transport wrapper simply listed the engine calls it passed on and had never
  been told about this one. It now passes on everything it does not itself
  handle, so an engine call added later is far less likely to be dropped the
  same way.

- **A pattern field that cannot preview says so, instead of asking for a
  pattern that is already typed.** When the editor gets no answer from the
  engine it showed “Press a token above, or type a pattern.” — with no tokens
  above and typing changing nothing. That state now has its own line.

- **A colour field that is not set is now visible in dark mode.** It was drawn
  as a plain square in the page colour with a hairline border, both of which sit
  at about 1.2 contrast against the dark panel — invisible, and indistinguishable
  from a colour too dark to make out. It now carries a chequerboard and an
  outline that reads against either theme. This is the state every colour field
  starts in, so it affected all of them: fills, text colours, table bands, rule
  chips, line stroke colours, the named-style form, the border pen and the
  document defaults.
- **The colour palette no longer opens off the edge of the window.** A colour
  control low in the property panel, or near its right edge, opened a palette
  that ran past the bottom or the side of the window with no way to scroll to
  it. It now opens upward or leftward when there is not room the other way.

- **The layer tree and the breadcrumb no longer squash a multi-line value into
  one line.** A three-line address showed as its lines joined by single
  spaces, which read as a typo with nothing to say the label had been
  shortened. A row now shows the first line followed by a `⏎…` marker.
- **A line break the browser made for you is no longer swallowed on save.**
  When a native undo, dictation, or an IME left the field's lines wrapped in
  their own elements rather than separated by plain breaks, saving joined them
  back together — the field showed three lines and the file kept one, and
  nothing reported it.
- **A locale pack's own date format is reachable by the name it was given.**
  A `format:` pick that happens to be spelled like a field type — `date` is
  both — was read as re-typing the field before anything looked at the locale
  pack, so a pack's `datetimeFormats.date` could never be selected under its
  own name. On a Japanese document that meant picking 「日付のみ」 on a datetime
  field rendered `2026/11/03(火)`, the plain date default, instead of the
  pack's `2026年11月3日(火)`; the label promised one thing and the page showed
  another, with no warning anywhere. A pick on a date or datetime field now
  consults the locale pack and the document's `formats:` registry first, and
  only a name neither of them declares changes the field's type. **Documents
  affected**: any that picks `format: date` on a datetime field under a pack
  whose `datetimeFormats.date` differs from its `dateFormats.default` — of the
  seven packs that ships, only ja-JP does, which is why this went unnoticed.

- **The property panel tells a keyboard user where a table band's formatting
  came from.** The little "from document defaults" bubble on a band's
  alignment, colour and bold controls only ever appeared on hover, so it was
  invisible to anyone not using a mouse — and on two of the three it appeared
  only when you hovered the LABEL, not the control the value belongs to.
  Pointing anywhere in the row now shows it, and each control carries the
  origin as its description, so a screen reader reads it too.

- **A row condition no longer looks like it does nothing.** A rule that sets no
  formatting of its own showed an empty strip while its opened card showed Bold
  and Center ticked — both true, since the card shows what the matching rows
  actually render, but nothing said so. The strip now names itself as what the
  rule ADDS, and says outright when a rule adds nothing — counting every way a
  rule can add something, including a named style, an explicit "not bold", and
  the formatting properties the panel does not draw a control for.

- **「Hide the header row on the page」 has moved out from under 「Detailed
  formatting」** and sits beside the banded-rows switch, where a table-level
  setting is looked for. The note explaining that the header band's fields stop
  being drawn stays with those fields, inside the disclosure.

- **A long data key in the field palette wraps instead of painting out of the
  row.** A key comes from your definitions file verbatim, so nothing bounded
  its width; the display label and the sample value beside it have always
  wrapped. A very long one is now shortened for display as well, so a single
  row cannot bury the rest of the list; dragging and picking still use the
  whole key.

- **A date pattern too long to preview now says so.** The engine declines to
  render a preview past a length limit, and the Designer showed the "press a
  token above, or type a pattern" prompt instead — to someone who had just
  typed several hundred characters.

- **Renaming a named format no longer rewrites places that were never
  referring to it.** `symbol`, `name`, `value` and `default` are built-in
  format names on other field types — `format: symbol` on a money field asks
  for ¥, not for a registry entry — but the Designer matched references by
  spelling alone. So registering a date format called `symbol` and then
  renaming it also rewrote every money field spelling it, and
  `defaults.formats.currency` with them, silently changing how amounts
  displayed; deleting the entry stripped those keys outright. The editor now
  decides what a reference IS from the field's declared type rather than from
  the word: a named format can only be reached from a date or datetime field,
  so nothing else is touched, and the "used in N places" count says how many
  places would really change. A name that shadows a locale's own variant is
  still a real reference on a date field and is still rewritten. Where the
  data dictionary cannot answer — no definitions loaded, or a key it does not
  declare — the old behaviour stands and the reference is rewritten, since a
  visible over-rewrite beats a name left dangling.

- **A rename now reaches formats written inside text.** `{issued:closing}` in
  a text item, a link URL, a QR code, a table header label or the document
  title picks a named format exactly as a field's `format:` does, and none of
  them were being rewritten — so a rename left those spots naming an entry
  that no longer existed, and the page fell back to the default form with a
  warning. They are rewritten now, in the same single undo step as everything
  else, and a delete strips the format from them rather than the text around
  it.

- **The Designer refuses to create or rename a format into one of those
  ambiguous names.** Nothing stopped you calling an entry `symbol` in the
  first place, which is what made the document able to say one word meaning
  two things. It now says so and writes nothing, so a new document never
  acquires the ambiguity. (The engine still accepts such a template; this is
  the editor declining to author one.)

- **"Used in 1 places" now reads "Used in 1 place".** The reference count
  shown on a named style and a named format had one wording for every number.
  It was easy to miss while counts were usually plural; the fix above makes a
  count of one common, so it is fixed here rather than filed. Languages
  without a plural distinction are unaffected.

- **A hidden table header no longer looks like a hole in the page.** A table
  can hide its header row — the labels stay in the PDF's text layer while
  nothing paints — and the Designer had no way to tell that strip apart from
  empty space, because the box index reported those cells exactly like painted
  ones. It now marks them the way it already marks an item hidden by its
  `visible:` condition, so the canvas draws its faint dashed outline over the
  header instead of leaving a gap the author cannot explain, on every page the
  header repeats on. The flag's meaning widened with it, from one cause to
  exactly two — and to two, not to a general rule about anything that
  reserves space without painting. An `opacity: 0` you wrote yourself is
  deliberately not one of them, because that is your own paint choice rather
  than the document's structure; nor is a mark whose data does not match,
  which holds its space on purpose so a blank form and a filled one lay out
  identically. Documents that trigger neither cause are unchanged, byte for
  byte.

- **Typing into the Designer's text field now shows on the page as you type.**
  The field wrote its edit to the document only when you left it, so the page
  beside it kept showing the old words — a newly placed item still reading
  "Text" while you typed a heading into the panel. Two people trying the
  Designer for the first time read that as the app being broken: one retyped
  the same heading several times, the other assumed nothing had saved. The page
  now re-renders from what is in the field, through the real engine, so what
  you see while typing is what the document will hold; nothing is written until
  you leave the field, so undo still takes back the whole edit in one step and
  saving or exporting mid-edit still writes the text you actually committed.
  A Japanese, Chinese or other composed entry updates the page when you confirm
  the conversion rather than mid-conversion.

  While you are converting Japanese or Chinese text, pressing Enter to accept the
  conversion no longer inserts a line break into the field instead — the editor
  now stands aside for the whole conversion, as every other field in the app
  already did.

  Leaving the field a way that is not a click elsewhere now keeps your text too:
  switching the panel's tab, or selecting something else, used to throw the
  edit away because the field was removed from the page before it could be
  written.

- **A PDF downloaded from the Designer keeps the name you gave the document.**
  The download name was reduced to ASCII letters and digits before it reached
  your filesystem, which is fine for `Invoice` and destroys a name written in
  Japanese, Chinese or Hindi: 「領収書」 arrived as `template.pdf`, and
  「白紙 (A4)」 as `a4.pdf` — the only part of the name that survived was the
  paper size. Names now keep their own script, and only what is genuinely
  unsafe in a file name is removed: control characters, the invisible
  formatting characters — among them the direction marks that can make a file
  appear to have a different extension than it has — path separators, and the
  punctuation Windows refuses. The two zero-width characters that carry meaning
  in Devanagari and in emoji are kept.
  A very long name is shortened to the 251 bytes a filesystem leaves for one
  name once `.pdf` is accounted for — by BYTES rather than by characters,
  because a 120-character Japanese title is around 360 of them and would
  otherwise produce a name that cannot be written. An English title of the
  same length is untouched, as it always was.

- **The PDF preview says which page size it rendered.** Changing the page to
  B5 and previewing showed a correctly-sized B5 page while the document was
  still called "Blank (A4)" — the name carries the size by convention and does
  not follow the setting, so the only size stated on screen was the wrong one.
  The preview now names the page it actually rendered, dimensions included,
  beneath the preview itself.

- **Opening a blank template no longer logs a missing-file error.** The app
  asked every template for an optional `definitions.yml` and let the miss pass
  quietly — but the browser still recorded the failed request, so starting from
  a blank document, which is where a first-time user starts, opened with what
  looked like a broken build in the console. The app now asks only when the
  template actually ships one.

- **The Designer's format picker no longer offers a format the field cannot
  use.** A template's `formats:` entries were listed on every binding whatever
  it was bound to, so a date pattern turned up in the menu for a money field,
  and picking it printed the bare amount with a warning instead of the format
  you asked for. On a text field the same pick was quieter and worse: unless
  the field declares a set of choices, nothing happened at all and nothing said
  so. The menu now lists only the entries the engine will actually honour for
  that field's type, read from the same engine answer the document-settings
  pickers have read since they shipped. The box beside the menu is still free
  text, so a spelling the menu does not list can still be typed, and a format
  already written into a template is left exactly as it is.

- **A very long date pattern no longer slows a render to a crawl.** The
  pattern renderer copied the remaining pattern on every character it read,
  which made rendering quadratic in the pattern's length, so a template
  carrying a large pattern could stall a render. Patterns now match in place,
  and a pattern sent for preview is length-capped as well.

- **The npm package reported the wrong version.** `import { VERSION } from
  'shojiku'` returned `0.1.0` from the 0.2.0 package: the constant is written
  by hand in its own file and the 0.2.0 bump missed it, while
  `package.json` — the version npm itself serves — was correct. Only the
  exported constant was wrong, so nothing resolved or installed the wrong
  package; code that reports the SDK version in a log or a user agent did.

- **The java deploy recipe installed the previous release.**
  `examples/deploy/java/pom.xml` still asked Maven Central for 0.1.0 after
  0.2.0 shipped, so anyone starting from that recipe got the older engine.
  Its dotnet sibling was already correct.

- **Manuscript paper takes a display format and a blank-form placeholder
  again.** Both controls were withheld from a `char_grid` on the grounds that
  the item type does not carry those keys — but they are written on the
  BINDING (`data.format` / `data.placeholder`), which a `char_grid` carries
  and resolves exactly as a text item does. A template binding a placeholder
  for a blank manuscript sheet could not see or clear it in the Designer.
- **The manuscript grid's steppers no longer look available when they are
  not.** A cell size, line gap or cell gap written as `5%` or `0.4em` is legal
  and the engine resolves it, but the panel cannot step a relative unit by
  points — the arrows now grey out and say why, the same as the width field.
- **The manuscript-grid hint no longer contradicts itself.** It said the drawn
  size never comes from the width field, and then told the author to clear the
  cell size — which is precisely the state in which it does.
- **A hidden header row looks hidden in the table-style preview.** Ticking
  「hide the header row on the page」 left the little preview above it painting
  a full header band, and left the header fill, text colour and weight fields
  offered as though they still drew something. The preview now shows the row
  ink-free but full height, and the fields say they are not drawn while the
  row is hidden.
- **A data field's description no longer crowds the field palette.** It moves
  into the same `?` the data-item editor already uses for it, so a long
  description cannot push a row's usage badge out of view.
- **The steppers' "percent or em" explanation is only shown for percent and
  em.** It also fired on a value the panel simply could not read — `auto`, a
  stray space, a typo — telling the author their typo was a relative unit.

- **The width field says why its steppers are unavailable.** A width of `100%`
  or `2em` is a perfectly good value the engine resolves at layout, but not one
  the ▲▼ can step by points — and they simply went quiet, which read as the
  field breaking. They now carry a note explaining it.
- **The sample-value section no longer prints its own label twice.** The heading
  says 「sample value」 once; the editor under it is named after the field, the
  way an array field's rows always were. A `?` beside the heading explains what
  the data is for — a preview placeholder, not the value your documents will
  actually carry.
- **The bundled manuscript-paper examples name their field properly.** The ruby
  notation reference had been packed into the field's NAME, where it read as
  gibberish; it moved to the description, which the Designer already shows in
  its own right.

- **A table's style controls now show what the page actually does, not just what
  that one band spells out.** A column sitting in a bold row band showed an
  unchecked Bold box; a body row taking its colour from the document defaults
  showed no colour at all — the panel was contradicting the document. The
  heading-row, body-row and per-column style controls, and the column sheet's
  alignment row, now show the value the cell renders with, and say where it came
  from when the document is what set it. Clicking a value the band already
  supplies leaves the file alone instead of writing a key that changes nothing,
  and switching one off writes the override that actually turns it off. The
  Table style miniature follows the same values, so a colour a table inherits
  reaches the preview. A row-condition rule's own four controls behave the same
  way, since a rule is one more layer over the body row.

### Added

- **Tables can be styled in the Designer: a heading-row fill, banded rows, and
  per-column alignment.** A tinted heading row and striped body rows are how a
  business form is expected to look, and neither was reachable — the panel's
  fill and border controls only ever reached the element's own style. The table
  now has a *Table style* section on its Decoration tab: a live miniature of the
  banding, six one-click looks to pick from, a Banded rows checkbox, and — folded
  away, since most tables never need it — background, text colour, bold and
  alignment for the heading row and for the body rows separately. Picking a look
  is a single undo step and touches only the keys that look owns; anything you
  set by hand stays.

- **A table column can be aligned.** Right-aligning an amount column or centring
  a quantity column had no control anywhere, and whether the format toolbar
  responded to a selected column depended on whether the template happened to
  spell out a default the column did not need. Clicking a cell now opens the
  column's own style — alignment, background, text colour, bold — the column
  sheet gained an alignment row so columns can be lined up against each other,
  and the toolbar now works on every column rather than some of them. A column's
  alignment also applies to its own heading, which the panel now says.

- **The border editor explains the order it works in, and its controls line
  up again.** Setting a border is pen-then-edges — pick the width, colour and
  line type, then click the edges you want them on, the way a spreadsheet's
  border tool works — and clicking an edge that already matches the pen removes
  that edge. None of that was written down; a `?` now carries the whole
  explanation, in all three places the border editor appears, replacing the
  one-line hint that only described the click. The pen's three controls had also
  drifted out of alignment (their labels sat on different baselines and the
  width box was too narrow to show its own value beside the `pt` badge).

- **The Designer now outlines the page's margin box on the canvas, and the
  Layout tab explains it.** Coordinates are measured from the corner of the
  area inside the page margins, not from the paper corner — so an element you
  place at X 0, Y 0 lands a margin's width in from the edge, and nothing on
  screen said why. That rectangle is now drawn on every page (dashed, so it
  cannot be mistaken for something in your document) with its corner marked
  `0,0`, and the Layout tab carries a `?` that says where coordinates start and
  why placing something outside the margins is allowed and reported as fine —
  only content that leaves the paper is a problem. The glossary gained an entry
  for the margin box. A document with no margins at all shows no outline: there
  the margin box already is the sheet.

- **Right-clicking an element in the Designer now offers duplicate,
  delete and borders.** The menu previously carried only "group into a
  container" and "save as block", so the two most frequent actions on a
  selected element were reachable by keyboard or through the Edit menu
  but not where the pointer already was. Borders opens the same editor
  the format toolbar and the decoration tab use, at the click point. Rows
  that do not apply to what you clicked are absent rather than greyed
  out, and every one of them still has its keyboard and menu path — the
  menu is a shortcut, never the only way through.

- **The site has a Features page written for people.** What the engine
  can do was only readable as `docs/engine/features.md`, a 2,300-line
  development record that answers "why is it shaped this way" for
  contributors and AI agents. It was also rendered as a reference page,
  where a reader looking for "can it do vertical Japanese, and can it
  sign a PDF" had to mine it for the answer. The new `/features` page
  (and its `/ja` twin) walks through the document kinds, layout,
  typesetting, data binding, fonts, output and signing, with a link into
  the reference for each, and it states the limits as plainly as the
  capabilities.

### Changed

- **Colour swatches stay visible in both themes.** A black swatch disappeared
  into the dark chrome and a white or pale one disappeared into the light
  chrome. Every colour chip in the Designer — the toolbar's text colour and
  fill, the border pen, the document's default colour, and the new table
  controls — now draws a hairline outline chosen from the colour's own
  brightness, so the swatch reads as a swatch whichever theme you are in.

- **The alignment field is called the same thing everywhere.** The row-condition
  editor, the new table controls and the Document settings → Defaults form all
  used to name it differently; they now share one label (English "Text
  alignment", 日本語「文字配置」), which changes the wording on the Defaults form
  in every language.

- **A table no longer offers a fill control that does nothing.** Setting a
  background on a table itself was never drawn on the page. The control is gone
  for tables; if a template already carries such a fill, the panel shows it,
  says it is not drawn, and offers to remove it.

- **The committed SBOMs now describe the latest release rather than the
  latest commit.** The CycloneDX inventories under `sbom/` are refreshed
  as part of each release, so between releases they can lag the
  lockfiles. Nothing about them became less checkable: each is generated
  from a lockfile and records that lockfile's sha256, so you can always
  tell exactly which dependency resolution an inventory describes — and
  the tech page now states the release cadence instead of implying the
  two are held together commit by commit. The old rule asked every commit
  to carry a matching inventory, which is stricter than what an SBOM is a
  statement about, and it made routine dependency updates fail on arrival
  for no reader's benefit.

- **`docs/engine/features.md` is no longer rendered on the site.** It
  stays exactly where it is in the repository, and every link to it keeps
  working; it is simply no longer one of the reference's routes, since it
  records development history rather than authorable syntax. Its raw copy
  under `/data/reference/` is gone with the route, and `llms.txt` now
  names the file under Repository truth so anyone who wants the decision
  log knows where it lives. (`llms-full.txt` never inlined it, and is
  unchanged.)

- **More warnings can now be fixed in one click, and a fix can offer a
  choice.** The diagnostics panel could only ever offer "remove the key
  that causes this", so the warnings people actually get stuck on had no
  button at all. Three kinds join it. An image that sets both `src` and
  `data` now offers two buttons — keep one or keep the other — because
  only you know which source is the real one; they are labelled by what
  SURVIVES, not by what gets dropped. A shape with no size (`rect`,
  `image`, `qr_code`, an ellipse or checkbox) can be given one, and only
  the dimension that is actually missing is written, so a rect you
  already gave a width to keeps it. And an item hanging off the right
  edge can be pulled back by exactly the amount the warning reports.
  A fix that writes a value says which value in its own label — you
  never press a button to find out what number it chose — and every one
  of them is still a single Undo away, as before.

- **An image on the clipboard can be pasted straight onto the page.** In
  the Designer, adding a screenshot or a logo meant saving it to a file
  first and then picking that file. Pressing ⌘V / Ctrl+V anywhere outside
  a text field now imports it through the same path as the file picker —
  same size limits, same notices, same single Undo step. Pasting inside a
  text field still pastes text, and a paste that carries no image is left
  alone, so the Insert menu's "paste data" flow is unaffected.

- **GIF and WebP images can now be placed.** The engine already drew
  both; the Designer accepted only PNG, JPEG and SVG. They are embedded
  exactly as supplied rather than re-encoded, so an animated GIF stays
  animated — which also means one over the size limit is refused rather
  than shrunk, since shrinking it would quietly change what it is.

- **A binding declaration nothing uses can be removed in one click.** The
  warning already said which declaration was orphaned; the diagnostics
  row now carries the same "Fix" button the other mechanical warnings
  have. Mostly of use on a document written by hand or by an AI — the
  Designer's own editing already cleans up after itself.

- **A data field placed in text can now be swapped for another one
  without retyping the sentence.** In the Designer, a `{customer.name}`
  chip could only be changed by deleting it and inserting a replacement
  from the field menu — fine for a bare placeholder, tedious for a line
  like "Dear {customer.name}, your order {order.code} shipped", where the
  wrong field is surrounded by wording you would rather not touch.
  Clicking a chip now selects it, and a control naming the field it
  stands for offers the same list of fields; picking one repoints the
  chip where it sits. Everything around it is left exactly as authored,
  including the chip's own display format — so a `{total:currency}`
  pointed at a different amount is still a currency. If the field being
  dropped needed a named binding to be reachable at all, that binding
  goes with it, and the replacement brings its own; both land in the
  single step that Undo reverses.

- **A line can now point at another item, and an oval can circle one.**
  Give a `line` endpoint `to: { item: total_box, edge: left }` instead of
  coordinates and it follows that item wherever the layout puts it —
  handy for leader lines and callouts, which used to need coordinates
  re-measured by hand every time the content above them changed. An
  `ellipse` gains `anchor: <id>`, which centres it on that item's text
  rather than on its box, so circling an answer no longer needs per-font
  tuning. Following CSS anchor positioning, an anchored item is drawn on
  the page its target landed on and paints over the content there. When
  the target cannot be found, nothing is drawn and a warning says which
  id was missing.

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

### Changed

- **The fix button reads 「修正」 in Japanese** (it said 「直す」). The
  Chinese catalogues already said 修正 for the same button, and the rest
  of the Japanese interface labels its buttons the same way.

- **Colour swatches announce a colour name instead of a hex code.** A
  screen reader read the fill and text-colour palettes as "#b91c1c";
  they now say "Red".

- **The page-size list stops offering the same size twice.** The common
  sizes for your locale were repeated in the full list below them, with
  nothing to tell the two entries apart.

- **Clearing a data field says what to do about it.** The message read
  "data key `` is not declared in definitions", echoing the empty key
  back; it now asks you to pick a field.

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
- **The published dependency inventories now describe the dependencies,
  and only those.** The CycloneDX SBOMs under `sbom/` are what a
  vulnerability scanner reads to decide what this project depends on.
  They were generated by scanning each component's whole DIRECTORY, so on
  a machine that had built the engine, syft also found the lockfile
  copies cargo leaves under `target/` and inventoried them as real
  dependencies — 1757 components where the lockfile lists 254. The
  inventory therefore depended on what the host had last compiled, which
  is the one thing an inventory may not do. They are now generated from
  the lockfile alone, and each records the sha256 of the lockfile it
  describes, so it is checkable which resolution it came from. A new
  check refuses a release whose committed inventory has fallen behind its
  lockfile, or a lockfile nobody has decided to inventory.

### Fixed

- **A number the Designer will not accept no longer stays in the box.**
  Typing something a field cannot take — a blank cells-per-line, a
  fractional column span, a page margin in the wrong form — was correctly
  refused, but the panel left the rejected text sitting there. The document
  still held the old value, the canvas still drew it, and nothing said the
  edit had been thrown away; the number on screen simply disagreed with the
  page for as long as you left it. Every such field now snaps back to the
  value that is actually in the document, so what you read is what the
  template says. This covers every commit-on-blur field in the property panel,
  document settings, page setup and the toolbar, and a rejected edit still
  authors nothing and still adds no undo step. It also covers the quieter
  version of the same problem: an entry the Designer ACCEPTS but rewrites — a
  negative gap clamped to zero, an oversized pen width, `40.0` where the column
  is already 40pt, a keyword typed with stray spaces — used to leave your
  version on screen while the document held the rewritten one. Now the field
  shows you what was actually kept.
- **The same fix reaches the data editor's sample values.** Clearing a
  date-and-time sample writes nothing — there is no blank value to store — and
  the box used to sit empty over a sample that was still there. Typing `100.0`
  into a number sample stored `100` while the box kept showing `100.0`. Both
  now show what was kept, and tabbing through a date-and-time field no longer
  rewrites the sample it just read.

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
