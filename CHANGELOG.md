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
