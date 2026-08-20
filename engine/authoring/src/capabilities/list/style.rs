//! Capability keys — style properties and the styled wire surface.
//!
//! The `style:` property surface plus the wire features authored
//! alongside it (spans, links, tables, fonts, formats, defaults).
//!
//! One slice of the `CAPABILITIES` registry (composed in `super`);
//! keys stay in append-only wire order — never reorder or remove one.

pub(super) const KEYS: &[&str] = &[
    // Styles.
    "styles",
    "styleNames",
    "style.fontWeight",
    "style.fontStyle",
    "style.letterSpacing",
    "style.lineBreak",
    // lineBreak gained `strict` and `loose` (CSS `line-break` values):
    // strict also holds small kana / `ー` / `〜゠` off a line start,
    // loose frees centered punctuation, inseparables, and iteration
    // marks. This SAME key signals that `normal` was realigned to CSS
    // (small kana may now start a line under `normal`); documents
    // wanting the old behavior set `lineBreak: strict`. Older engines
    // parse-reject the new variants.
    "style.lineBreak.strict_loose",
    // half-width punctuation: style.textSpacingTrim = space_all (default, no trim) |
    // normal (trim adjacent fullwidth-punctuation pairs) | trim_start
    // (also trims a line-head opening bracket). Engine-synthesized after
    // shaping, so it works on every bundled face. Inherited; older engines
    // parse-reject the key.
    "style.textSpacingTrim",
    // hanging punctuation: style.hangingPunctuation = none (default) | allow_end
    // (a line-terminating comma / full stop hangs past the edge instead of
    // wrapping) | force_end (also hangs a fitting trailing comma out of the
    // alignment width). Plain text blocks in v1. Inherited; older engines
    // parse-reject the key.
    "style.hangingPunctuation",
    "style.backgroundColor",
    // Box decoration: backgroundColor honored on container/repeat-cell/
    // image boxes (not only text-drawing items).
    "style.backgroundColor.box",
    // Box decoration: style.borderWidth / style.borderColor on every box.
    "style.border",
    // Overflow policy: style.textOverflow = visible | shrink | ellipsis.
    "style.textOverflow",
    // style.textOverflow gained `clip` (pixel clip at the box edge).
    "style.textOverflow.clip",
    // style.overflow = visible | hidden on container-like boxes; the
    // layout tree gains a clip node both renderers honor.
    "style.overflow",
    "style.verticalAlign",
    // style.textDecoration = none | underline | line_through, per the
    // face's own metrics; drawn by both backends.
    "style.textDecoration",
    // style.opacity (0..=1 paint alpha on text/decoration/background/
    // border; also on rect/line item styles).
    "style.opacity",
    // Vertical writing: style.writingMode = horizontal_tb (default) |
    // vertical_rl turns a text item into a vertical-writing block (columns right→left).
    "style.writingMode",
    // Character orientation in a vertical line: style.textOrientation =
    // mixed (default; Latin rotated 90°) | upright.
    "style.textOrientation",
    // tate-chu-yoko: style.textCombineUpright = none | { digits: 2..=4 } — runs
    // of up to N consecutive ASCII digits share one upright cell of a
    // vertical column (plain text blocks AND vertical char_grid cells).
    // Older engines reject the key at parse.
    "style.textCombineUpright",
    // The `all` keyword on the same key: the whole styled scope (meant
    // for a short span) combines into one upright cell. Also marks
    // tate-chu-yoko honored per rich span and in vertical lists, and ruby
    // honored on every text surface (horizontal/vertical × plain/spans)
    // with ruby-aware flow pagination. Older engines parse-reject `all`
    // and warn `ruby_unsupported` outside vertical plain blocks.
    "style.textCombineUpright.all",
    // writingMode: vertical_rl is honored on more surfaces than a plain
    // text item: rich `spans`, `list`, table text cells, and
    // `page_number` all render vertically (a text `mark:` circled-text remains
    // the one warned fallback). Older engines warn
    // `vertical_text_unsupported` on spans/list instead.
    "style.writingMode.surfaces",
    // `version:` accepts bare numbers as well as strings, and
    // round-trips the authored form.
    "template.version.scalar",
    // Inline rich text — `spans:` on the text item (per-span
    // style/styleNames + text/data), per-run tree output on a shared
    // baseline grid. v1 overflow: visible/clip honored, shrink/ellipsis
    // warn and overflow.
    "text.spans",
    // `link: { url }` on text/image items and rich spans (URL takes
    // `{key}` interpolation; http/https/mailto/tel only), emitted as PDF
    // link annotations; older engines reject the key at parse.
    "link.url",
    // Table full spec: Length column widths (incl. unsized equal
    // share), fixed row heights (activating cell textOverflow),
    // table/row/alternate style layers (grid border, fills, zebra),
    // whole-table keep-together, and table/column entries in the box
    // index.
    "table.column.width.length",
    "table.row.height",
    "table.style",
    "table.keepTogether",
    "table.boxes",
    // Data-driven row layers: `row.conditionalStyles` entries whose
    // `when: { key, equals? }` predicate reads the ROW element, applied
    // over the base and zebra layers. Older engines reject the key.
    "table.row.conditionalStyles",
    // repeat / repeat_flow items emit their own per-page box-index
    // fragments (border == content) whenever at least one cell/card
    // lands, so the Designer can address the repeat item itself — not
    // only its cells/cards. Older engines emit only the child boxes.
    "repeat.boxes",
    // Per-side borders — borderWidth/borderColor take a
    // { top/right/bottom/left } map; new borderStyle key (solid|double).
    // On tables the map form draws a per-fragment outer frame.
    "style.border.sides",
    "style.borderStyle",
    // borderStyle gained the two patterned keywords: `dashed` (three
    // stroke widths on, three off) and `dotted` (one and one). They ride
    // the layout tree's dash pattern, so a per-side map can mix them with
    // solid/double sides. Older engines parse-reject the keywords.
    "style.borderStyle.dashed_dotted",
    // style.borderRadius — one length rounding the border box's corners,
    // honored on a uniformly-bordered box (solid/dashed/dotted) and its
    // backgroundColor fill; `%` resolves per axis like CSS, so 50% is a
    // circle on a square and a pill on an oblong. A per-side/double
    // border, a table, or a form mark warns `border_radius_ignored`.
    // `overflow: hidden` clips to the rounded box.
    "style.borderRadius",
    // The `line` item's own style gained `style:`, sharing the border
    // keyword set (solid | dashed | dotted | double) — the cut-here-line
    // staple. Older engines parse-reject the key.
    "line.style",
    // Spanning: grid children columnSpan/rowSpan; table headerGroups
    // (spanning group row) + mergeEmptyCells (empty runs merge right).
    "grid.span",
    "table.headerGroups",
    "table.mergeEmptyCells",
    // `header.visuallyHidden`: the header row (and its spanning group row)
    // paints nothing while its labels stay in the PDF's text layer. Older
    // engines parse-reject the key (`TableHeaderSpec` is deny_unknown_fields).
    "table.header.visuallyHidden",
    // Non-text columns: column `type: qr_code | image` (per-element
    // cell assets, `dyn:<array>[<i>].<key>`, policy-gated + capped).
    "table.column.type",
    // `box` on a table — geometry for horizontal placement in the
    // flow body and one bounded (non-paginating) block in containers /
    // absolute bodies / bands / grid cells.
    "table.box",
    // A manifest face may carry `url:` — a fetch HINT for a host filling its
    // cache when the file is absent; `sha256` stays the guarantee. The engine
    // still never fetches (the CLI does, `--offline` opts out). Older engines
    // parse-reject the key, so manifest GENERATORS gate on this.
    "fonts.face.url",
    // Builtin CLDR-generated locale packs (ja-JP, en-US — the list
    // rides `EngineInfo.builtinLocales`); older engines need a file.
    // Every OTHER locale is a `packs/locale/<id>.yml` the host loads —
    // the whole pack, since it has no builtin to merge over (a file for
    // an id that IS builtin is a per-key overlay instead). Shipped packs
    // are not a capability: they are data the host supplies, so this key
    // stays about the builtins.
    "locale.builtin",
    // Wareki — era tables in the locale pack + the `G`/`y` pattern
    // tokens; builtin ja-JP ships a `wareki` date/datetime variant.
    "format.wareki",
    // The CLDR-subset pattern grammar — '…' literal quoting and
    // the MMM/MMMM/EEEE/a/h/hh/GG tokens (inventory is append-only).
    "format.patterns.cldr",
    // Currency named variants default (bare) | symbol | name,
    // precision from the embedded CLDR fractions table.
    "format.currency.variants",
    // Quantity units are semantic keys (definitions `unit: item`)
    // mapped to plural-aware display words in the locale pack.
    "format.units.semantic",
    // Template presentation defaults — `defaults.style` (cascade
    // root, the rem root follows it) + `defaults.formats` per-type picks.
    "template.defaults",
    // The `formats:` named registry (date/datetime patterns).
    "template.formats",
    // Document locale + currency in the `defaults:` block
    // (`defaults.locale`, `defaults.currency`) — the presentation home
    // that replaced the top-level `definitions.locale`/`currency` keys.
    // TemplateDefaults denies unknown fields, so older engines reject
    // the keys.
    "template.defaults.document",
    // The `document:` block — title / description / keywords / language /
    // authors, each `{key}` interpolable, written to the PDF `/Info`
    // dictionary and the XMP packet. PDF-only (PNG has no metadata
    // channel); `Template` denies unknown fields, so older engines reject
    // the key outright.
    "template.document.metadata",
    // The definitions `image` field type — declares an image reference
    // (bundled path / data URI / inline SVG) so the Designer can offer an
    // upload widget and validation confirms the bound key exists.
    "definitions.field.image",
    // The block-level style knobs apply on vertical (writingMode:
    // vertical_rl) text with the axes swapped: textOverflow
    // clip/shrink/ellipsis against the box WIDTH, verticalAlign as the
    // CSS-logical column-stack shift, hangingPunctuation past the column
    // bottom, textDecoration as a side band (underline right — JLREQ
    // side-line), textSpacingTrim in the vertical arrangement — and a flow
    // vertical block paginates at column boundaries. Older engines warn
    // `vertical_style_ignored` and place as one unit.
    "style.writingMode.block_styles",
    // A `symbol`/`name` format pick on a plain NUMBER value coerces it
    // to the currency type with that variant (the code rides the
    // `defaults.currency` chain) — money display without definitions.
    // Older engines warn `unknown_format_variant` and render the bare
    // number.
    "format.currency.coerce",
    // A locale pack may declare CLDR digit-group SIZES —
    // `number.groupSize` + `number.secondaryGroupSize` — so Indian
    // locales render `1,23,45,678` (`#,##,##0`) instead of uniform 3s.
    // Absent keys mean uniform `groupSize` grouping; older engines
    // ignore both and group in fixed 3s.
    "format.number.groupSizes",
    // A `headerGroups` entry's own `backgroundColor` / border paints over
    // the group row's band, so each group can be filled independently
    // (its text properties always applied). Older engines drop both
    // silently and the band's fill shows through.
    "table.headerGroups.style.fill",
    // `verticalAlign` authored on the header row, on a `headerGroups`
    // entry, or on a column (for its own label cell) is honored instead of
    // being overwritten by the table's `middle` default — the column's
    // value winning over the header's, as `textAlign` already does for
    // labels. Older engines center every header/group label regardless.
    "table.header.style.verticalAlign",
    // The format CATALOG query: the pickable display variants per field
    // type with an engine-rendered sample of each (against fixed exemplar
    // values), plus previews of patterns the document does not carry yet.
    // An editor gates its format pickers on this rather than shipping its
    // own sample table; older engines expose no such query, so a consumer
    // falls back to offering wire spellings with no sample.
    "format.catalog",
];
