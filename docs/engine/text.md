---
reference:
  group: item
  keys: [text]
  shapes: [Span, TextMark, RubyPair]
  summary: "Static, interpolated, or bound text — inline spans, ruby, wrapping, and overflow."
---

# `type: text`

A text item draws static, interpolated, or bound text. Content comes
from `text` (static, with `{key}` / `{key:format}` interpolation),
`data` (a single bound value), or `spans` (inline rich text, below) —
exactly one should be set. None set warns `empty_text_item`; with both
`text` and `data` set, **`data` wins** and `text` is ignored (no
diagnostic); a non-empty `spans` wins over both (warns
`span_content_conflict`).

## Syntax

```yaml
- type: text
  id: subtotal_label            # optional; adds an id alias to the inspect box (every item is path-addressed)
  box: { x: 0, y: 0, w: "50%", h: 16, padding: 2 }
  text: "小計 {amount.subtotal:currency}"   # static + interpolation…
  # data: { key: order.note }               # …or a single bound value
  styleNames: [amount]
  style: { fontSize: 9, textAlign: right, textOverflow: ellipsis }
```

<!-- rf:table:start text#syntax (generated — edit the catalog or reference/tables.yml, then `make reference:generate`) -->
| Key | Type | Description |
| --- | --- | --- |
| `text` | string | Static content with `{key}` / `{key:format}` interpolation ([data-binding.md](data-binding.md)); `{{` escapes a literal `{`. |
| `data` | `{ key, format? }` | A single bound params value, formatted per the [format rules](data-binding.md). |
| `bindings` | map of name → `{ key, format?, placeholder?, scope? }` | Named declarations for this item's `{name}` interpolations — the option set the bare `{key}` grammar cannot carry, incl. a key outside `[A-Za-z0-9_.]` ([data-binding.md](data-binding.md#named-binding-declarations)). |
| `spans` | list | Inline rich text (below): styled fragments drawn as one wrapped block. |
| `ruby` | list of `{ base, text }` | Readings (furigana) — verbatim strings matched in order against the drawn text, drawn above the base runs (horizontal; § Ruby below) or beside them (vertical; [vertical_text.md](vertical_text.md) § Ruby). Plain and `spans` blocks alike. |
| `rubySize` | [length](length.md) | Ruby reading font size; unset = half the item's font size. |
| `box` | map | See [box.md](box.md). `h` omitted = auto height (grows with the wrapped text); `w` omitted = fill. |
| `style` / `styleNames` | | Full property set — see [style.md](style.md). |
<!-- rf:table:end -->

## Inline rich text (`spans`)

Word-level bold / color / decoration inside one block: `spans` is a list
of fragments, each with the same `text`-or-`data` content rule as the
item and its own `style` / `styleNames` layered **on top of the block's
computed style** (named styles in listed order, then the inline style).
Fragments concatenate in order with no separator; wrapping runs over the
joined text, so a Latin word crossing a span boundary still wraps as one
word and kinsoku moves characters across span edges.

```yaml
- type: text
  box: { w: "60%" }
  style: { fontSize: 12 }            # the block style spans layer on
  spans:
    - text: "合計 "
    - data: { key: total, format: currency }
      style: { fontWeight: bold, color: "#c00000", fontSize: 16 }
    - text: "(税込)"
      styleNames: [muted]
```

Only the text-run properties apply per span: `fontSize`, `fontFamily`,
`fontWeight`, `fontStyle`, `letterSpacing`, `color`, `textDecoration`
(a block-level `textDecoration` propagates to spans that don't set
their own, CSS-style). Anything else authored on a span's inline
`style` warns `ignored_span_style` and does nothing — alignment,
overflow, decoration-of-the-box, and `lineHeight` stay block-level.

Mixed sizes share one **uniform line grid**: the largest span size
drives the block's line height and the deepest ascent one shared
baseline, so lines form a baseline grid (per-line line boxes are a
recorded follow-up). Overflow on a rich block honors `visible` and
`clip`; `shrink` / `ellipsis` warn `span_overflow_unsupported` and
behave like `visible` for now. Long rich flow text paginates like plain
text. A text item takes at most 256 spans (`too_many_spans`; extra
spans are dropped).

## Shaping (kerning, ligatures)

Text is **shaped** with HarfBuzz (harfrust) — you author plain strings
and the engine applies the font's OpenType layout automatically:

- **Kerning** tightens pairs like `AV` or `To.` (the glyphs move closer;
  no markup needed).
- **Standard ligatures** collapse sequences like `fi`/`ffi` into one
  glyph. Text extraction (copy-paste / search in the PDF) still yields
  the original characters — the ligature maps back to its whole cluster.
- Setting a non-zero **`letterSpacing`** turns optional ligatures back
  off (matching CSS), so tracked text stays letter-by-letter.

Shaping is invisible in the authoring surface (there is nothing to turn
on) and identical across the PDF and PNG backends — the engine decides
every glyph and advance once, and both renderers draw the same result.
Measurement and drawing share the shaped result, so a line's reserved
width always equals its drawn width.

## Wrapping & line breaking

Text wraps greedily at the content-box width (border-box `w` minus
horizontal padding), honoring `letterSpacing` in measurement so reserved
and drawn widths cannot disagree. `lineBreak` (a CSS `line-break`
subset, inherited) selects the kinsoku strictness:

| Value | Held off a line start (line-start kinsoku) |
| --- | --- |
| `normal` (default) | closing brackets, closing quotes `’”`, commas/full stops `、。，．`, centered punctuation `・：；！？`, inseparables `‥…`, iteration marks `々` — but small kana (`っ`, `ゃ` …), `ー`, and `〜` **may** start a line |
| `strict` | everything `normal` holds, **plus** small kana, `ー`, and the CJK hyphens `〜゠` |
| `loose` | only closing brackets, closing quotes, and commas/full stops; centered punctuation, inseparables, iteration marks, small kana, and `ー` may all start a line |
| `anywhere` | no kinsoku — break between any two characters |

Line-end kinsoku (an opening bracket or opening quote never ends a line)
applies the same way in `normal`/`strict`/`loose`; only `anywhere` drops
it. Prohibited characters are pushed off line edges by push-out (moving
the preceding character down).

### The character sets

Japanese and Chinese share one set — the classification is per character,
not per language.

| Class | Characters | Held |
| --- | --- | --- |
| Closing brackets | `）］｝〕〉》」』】｣` `〗〙〛` `〞〟` | off a line start, every mode |
| Closing quotes | `’ ”` | off a line start, every mode |
| Commas / full stops | `、。，．｡､` | off a line start, every mode |
| Centered punctuation, inseparables | `・：；･！？‼⁇⁈⁉` `‥…` | off a line start in `normal`/`strict` |
| Iteration marks | `々ゝゞヽヾ` | off a line start in `normal`/`strict` |
| Small kana, prolonged sound mark | `ぁぃぅぇぉっゃゅょゎ` `ァィゥェォッャュョヮ` `ー` | off a line start in `strict` only |
| CJK hyphens | `〜゠` | off a line start in `strict` only |
| Opening brackets | `（［｛〔〈《「『【｢` `〖〘〚` `〝` | off a line **end**, every mode |
| Opening quotes | `‘ “` | off a line **end**, every mode |

Which end a character belongs to comes from its Unicode category. Most of
the set is unambiguous: `Ps` opens and `Pe` closes, which is why `〝〞〟`
sit with the brackets — they are named "quotation mark" but categorized
`Ps`/`Pe`, so they behave as structural open/close forms.

`‘’“”` are the exception. Unicode files them under one line-break class
(QU) that does not say which end of a quotation they sit at, so the split
follows their category instead — `Pi` (initial) opens, `Pf` (final)
closes. That is what Chinese practice asks for: a closing quote never
heads a line, an opening quote never ends one.

**Deliberately not classified**, so a break stays legal on both sides:

| Character | Why |
| --- | --- |
| `·` U+00B7 (interpunct) | Unicode class AI — it means different things in different languages, and Latin text uses it as a field separator (`address · tel · web`), where holding it back would drag a letter off the previous line. |
| `‧` U+2027 | Class BA — a break *opportunity*, not a prohibition. |
| `—` U+2014 | Class B2 — a break opportunity on both sides. A doubled `——` (and `……`) already stays whole anyway: a run of non-CJK characters wraps as one unit unless a segmenter finds boundaries inside it, and none of these is Thai (§ Thai below). |
| `‐ –` U+2010, U+2013 | Class HH (hyphens), whose rule is conditional on the *preceding* character's class — context a per-character test cannot see. |
| `％ ￥` | The PO/PR classes are unmodelled for the same context-dependence. |
| `﹁﹂﹃﹄` U+FE41–FE44 | Nothing authors these: the engine maps `「」『』` onto them at shape time, *after* wrapping, so the wrapper only ever sees the canonical forms — which are classified above. |

> **Migration.** `normal` follows CSS: small kana and `ー` may begin a
> line. Earlier engines held them back under `normal`; to keep that
> behavior, set `lineBreak: strict` (once, on `defaults.style` for the
> whole document).

### Thai

Thai writes without spaces between words, so there is nothing for a
greedy wrapper to break on: an entire Thai paragraph arrives as one
unbreakable run and would be split per character at whatever position
the line width happened to reach — inside words, and between a
character and the vowel or tone mark that belongs to it.

Thai runs are therefore segmented into words first (ICU4X's line
segmenter, the same Unicode data a browser uses), and those word
boundaries become the break opportunities a space would otherwise
provide. Three consequences worth knowing:

- **A script change is not itself a break opportunity.** `abcไทย` stays
  one unit — UAX #14 puts a Latin letter and the Thai word glued to it
  in the same class. A Latin prefix does not suppress the Thai word
  boundaries further along, though: `abcภาษาไทย` still breaks between
  `ภาษา` and `ไทย`.
- **`lineBreak` does not switch it off.** Segmentation creates break
  *opportunities*; `lineBreak` governs the kinsoku *prohibitions*
  applied afterwards. Thai wraps at word boundaries under every value,
  exactly as a Latin sentence keeps wrapping at its spaces.
- **A cluster is not cut on either side.** Where a single Thai word is
  wider than the whole line and has to be broken per character, the break
  is held back so a non-spacing mark never opens a line, and a leading
  vowel (เ แ โ ใ ไ, written before the consonant it is pronounced after)
  never ends one. The vowels written IN LINE — `ะ`, `า`, `ำ` — take a
  break on either side like any other letter, because they are ordinary
  advancing characters. This guard is the last-resort path only; a break
  the segmenter itself offers is already at a word boundary.

Nothing else changes: text in any other script tokenizes exactly as
before, so no existing document's line breaking moves.

A `\n` in the text splits it into **paragraphs**: each paragraph wraps
independently and starts on a new line (YAML block scalars `|`/`|-` are
the natural way to author multi-line text). Wrapping trims spaces at
line edges, so leading ASCII spaces do not survive as indentation —
for hard indentation (e.g. code samples), use no-break spaces (U+00A0)
instead; and remember `{{` when the sample text itself contains a
literal `{key}`-shaped string
([data-binding.md](data-binding.md)). `examples/dev/layout-showcase`'s code
panels use both.

Characters no face in the resolved fallback chain can map draw as the
`.notdef` box and warn `missing_glyph` once per block (a rich block's
spans share one bounded warning).

## JP micro-typography (`textSpacingTrim`, `hangingPunctuation`)

Two inherited knobs refine Japanese punctuation spacing. Both default to
a no-op, so existing documents are unaffected; set them on
`defaults.style` to apply document-wide.

**Half-width punctuation — `textSpacingTrim`** trims the internal space a fullwidth
punctuation glyph carries in half its em box:

| value | effect |
| --- | --- |
| `space_all` (default) | no trimming — every punctuation keeps its full em |
| `normal` | trims the space **between two adjacent** fullwidth punctuation glyphs (`」「` → the pair tightens to one em; `、」` drops the comma's trailing half) |
| `trim_start` | everything `normal` does, **plus** a fullwidth opening bracket at a line head is pulled to the margin |

It is **engine-synthesized after shaping** — no bundled face carries the
OpenType `chws` feature, so the trim is computed from the glyph advances
and is deterministic across faces. The measured line width shrinks
accordingly, so alignment and the `inspect` line metrics stay honest.
v1 is a subset: trimming happens only between two adjacent punctuation
(and at a line head for `trim_start`); punctuation-before-ideograph
spacing, line-end trimming, and per-font `chws` tables are not modelled.
It applies wherever text is laid out through the shared text block —
plain **text** items, **table cells**, and header/footer **bands** — and
to **rich** (`spans`) blocks; it does **not** apply to `list` entries or
`char_grid` cells.

**Hanging punctuation — `hangingPunctuation`** lets a line-terminating comma or full
stop (`、。，．`) hang past the end edge instead of wrapping:

| value | effect |
| --- | --- |
| `none` (default) | no hanging — a trailing comma wraps (and kinsoku push-out applies) |
| `allow_end` | a comma that would wrap instead hangs on the line, keeping the line count down |
| `force_end` | also excludes a *fitting* trailing comma from the alignment width, so it hangs into the margin under center / right alignment |

The hung character is **excluded from the alignment width but kept in the
reported (inked) line width**, so a GUI overlay measured from `inspect`
does not lie. A line hangs **at most one character** (standard hanging),
and a comma may hang only when removing it leaves a legal line start — a
comma glued to a closing bracket (the `…。」` closing-quote pattern) is
pushed out whole by kinsoku instead, so hanging never exposes a new
line-start violation. When hanging is active, kinsoku leaves exactly those
hangable commas for the hang pass to pull up (each pass runs once, so they
always terminate). Hanging applies to plain text blocks (text items, table
cells, bands); horizontal rich (`spans`) blocks are trimmed but not hung
in v1 — vertical columns hang on both paths
([vertical_text.md](vertical_text.md)) — and `ellipsis` clamping drops
any hang.

## Overflow (`textOverflow`, definite `h` only)

Auto-height boxes grow to fit; the policies act only when the box has a
**definite `h`** and the wrapped text overflows. With a policy set, the
block reserves the *authored* height, so flow siblings stay put.

| Value | Behavior |
| --- | --- |
| `visible` (default) | Draw everything, warn `text_overflow`, grow the reserved block. |
| `shrink` | Bisect the font size down (24 fixed steps, 4 pt floor) until the wrapped text fits; `lineHeight` scales along. At the floor the warning stays and the block grows like `visible`. Thinreports `fit`. |
| `ellipsis` | Clamp to the fitting lines and end the last with `…`, measured with the same face/size/letterSpacing, never after a line-end-kinsoku character; degrades to a bare `…` when nothing fits. Thinreports `truncate`. |
| `clip` | Keep every line, reserve exactly the authored height, and cut the drawn text at the border-box edge — a partial line stays partially visible. Suppresses the warning. |

## Ruby (`ruby: [{ base, text }]`)

Template-authored readings drawn **above** their base runs — the
horizontal counterpart of [vertical ruby](vertical_text.md) (same
matching, same caps, same shrink rules):

```yaml
- type: text
  text: "吾輩は猫である"
  box: { w: 200 }
  rubySize: 6                       # optional; default = half the font size
  ruby:
    - { base: 吾輩, text: わがはい }
  style: { lineHeight: 1.8 }
```

- Entries apply **in listed order, non-overlapping** against the DRAWN
  text; an unmatched base warns `ruby_base_not_found` and later entries
  still apply.
- Each reading is centered over its base run's shaped extent, its
  bottom touching the run's **em band top**, shrunk linearly to the
  run's width with a 4pt readability floor (`ruby_overflow` past it),
  and split proportionally when the base wraps across lines. On a
  `spans` block the reading sits above ITS base run's own em band (a
  small span's band starts below the shared baseline's top).
- **The line box never grows** (the engine's fixed-leading model, unlike
  CSS ruby): author `lineHeight` ≳ 1.5 so the reading band has room
  between lines — the FIRST line's reading extends above the block's
  border box (give the item a top margin or padding when that matters).
- A ruby'd auto-height flow item **paginates with its readings**: each
  fragment carries the readings of its own lines.
- Entry caps and skip rules are the vertical ones (256 entries; empty /
  over-64-chars skipped with `empty_ruby_entry` / `ruby_entry_too_long`).

## Pagination of long text

An **auto-height** text directly in a flow that is taller than the whole
flow region splits at line boundaries like table rows: it fills the
space left on the current page, then continues page by page. Decoration
and vertical padding/margins are **cloned** onto every fragment (CSS
`box-decoration-break: clone`) — the whole box, so per-side
`borderWidth`s, `borderStyle: double` and dashed sides each redraw
complete at the fragment's own height; an `id` yields one box-index
placement per fragment. Definite-`h` text never splits (that is
`textOverflow`'s domain).

A `minHeight` taller than the text reserves space that
[`verticalAlign`](style.md) distributes, and the fragments carry that
reservation between them: the slack above the content leads the FIRST
fragment (so `verticalAlign: bottom` keeps pushing the text down),
the slack below it trails the LAST. The fragment heights therefore still
sum to the reserved height. With no `minHeight` there is no slack and
every fragment is exactly its lines.

## Limitations

- Exactly one of `text`/`data`/`spans`. None set warns
  (`empty_text_item`), and `spans` beside the others wins
  (`span_content_conflict`).
- `textOverflow: shrink`/`ellipsis` needs a definite `h`, and does NOT work
  on a rich `spans` block — it falls back to visible
  (`span_overflow_unsupported`). Past the 4 pt shrink floor the text
  overflows and warns (`text_overflow`).
- 256 spans (`too_many_spans`) and 256 ruby entries
  (`too_many_ruby_entries`) per item. A ruby `base` that never occurs in the
  drawn text is skipped (`ruby_base_not_found`), an entry over 64 characters
  is skipped (`ruby_entry_too_long`), and a reading that overflows its base
  even at the 4 pt floor warns (`ruby_overflow`).
- Block-level style keys on a span are inert (`ignored_span_style`).
- No hyphenation, and no justified alignment: `textAlign` is `left`,
  `center` or `right`.

## Diagnostics

| Code | Meaning |
| --- | --- |
| `empty_text_item` | neither `text` nor `data` (nor `spans`) set |
| `text_overflow` | wrapped text exceeds a definite `h` (policy `visible`, or `shrink` at its floor) |
| `missing_glyph` | characters no chain face can map (tofu); deduped and bounded per block |
| `span_content_conflict` | `spans` beside `text`/`data` (spans win), or a span with both `text` and `data` (data wins) |
| `empty_span` | a span with neither `text` nor `data` (renders nothing) |
| `too_many_spans` | over the 256-span cap; extras dropped |
| `ignored_span_style` | span-inert keys on a span's inline `style` |
| `span_overflow_unsupported` | `shrink`/`ellipsis` on a rich block (falls back to `visible`) |
| `ruby_base_not_found` / `ruby_overflow` | ruby matching / shrink-floor problems — see § Ruby |
| `missing_data` / `unknown_data_key` / `format_error` | binding problems — see [data-binding.md](data-binding.md) |

Capability keys: `text`, `text.spans`,
`style.lineBreak.strict_loose` (the `strict`/`loose` values **and** the
CSS-aligned `normal`), `style.textSpacingTrim`,
`style.hangingPunctuation` — overflow: `style.textOverflow`,
`style.textOverflow.clip`.

## See also

- [link.md](link.md) — `link: { url }` on the item or per span
- [style.md](style.md) — the full property table
- [list.md](list.md) — one line per array entry with an overflow clamp
- [data-binding.md](data-binding.md) — `{key:format}` semantics
