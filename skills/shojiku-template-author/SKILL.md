---
name: shojiku-template-author
description: Author Shojiku templates (definitions.yml / params.json / templates.yml) from natural-language requirements, driving the engine's validate → preview loop until the rendered pages are correct. Use when creating or reworking a template for the Shojiku PDF engine.
---

# Shojiku Template Author

> **Audience: AI agents only.** This page is written as instructions
> *to* an AI agent authoring templates. If you are a human (PM,
> designer, engineer), you don't follow these steps yourself — you give
> your document requirements to an AI agent (e.g. Claude Code) and it
> runs this playbook. The human-readable syntax reference is
> [docs/engine/](../../docs/engine/README.md).

You turn document requirements into the three-file set the Shojiku
engine consumes, and you iterate against the **engine's own output** —
the engine is the only source of rendering truth. Never reason from a
mental PDF model, never use another PDF library, never read the
engine's source code: the template reference (`docs/engine/README.md`,
one page per feature) plus the engine's diagnostics and previews are
your whole contract.

## The three files

| File | Role | Owner |
|---|---|---|
| `definitions.yml` | data dictionary (validation + GUI/AI) | engineer↔author seam |
| `params.json` | runtime data — **data only, never geometry** | calling app |
| `templates.yml` | ALL layout/geometry/styling | you |

## definitions.yml schema (cheat sheet — the normative page is [definitions.md](../../docs/engine/definitions.md))

```yaml
version: "0.2.0"        # optional
# NOTE: document `locale`/`currency` are NOT definitions.yml keys — they
# live in the template's `defaults:` block (docs/engine/defaults.md).
type: object            # REQUIRED root — an OpenAPI-style schema
required: [profile]     # optional required top-level keys
properties:             # nesting mirrors the params JSON exactly
  profile:
    type: object        # a top-level object = a palette field group
    title: 基本情報      # optional (was `label` in the retired v1 form)
    properties:
      name:             # binding key = the dotted path (profile.name)
        type: string    # string|number|integer|boolean|object|array
        title: 氏名      # optional; also: example (sample value),
                        # enum, minLength/maxLength, minimum/maximum,
                        # displayFormat (default display variant),
                        # displayFormats: [{id, label}], currency,
                        # precision, unit: item (a SEMANTIC key —
                        # display words live in the locale pack),
                        # placeholder, recommendedStyle
      joined_on:
        type: string
        format: date    # semantic types are type+format pairs:
                        # date-time/date/image on string;
                        # currency/percentage/quantity on number/integer.
                        # Unknown format values are generation hints.
  items:                # type: array = a table/repeat/list data source;
    type: array         # the template binds data: { key: items }
    minItems: 1         # optional row-count constraints
    items:
      type: object
      properties:
        quantity:       # row keys are RELATIVE to one element
          type: integer
          format: quantity
```

**Trap**: unknown keys in `definitions.yml` are parse errors (like
templates), located to the field path and YAML line — including the
retired v1 `groups:` list form, which errors with a migration hint. If
a definitions file ends up with no properties, every template binding
fails with `unknown_data_key`; validation flags the upstream cause once
as `empty_definitions`. If EVERY key errors at once, suspect the
definitions file's structure, not the template.

**Trap**: supplying BOTH definitions and params turns on params-vs-schema
validation (`params_*` warnings: required/type/range/enum/unknown keys).
The Shojiku repo's bundled-example gate (`make examples` — repo
contributors only; irrelevant when authoring outside the repo) is
WARNING-clean — so a bundled example's schema
must cover every params key it ships and declare list-like row values
truthfully (`type: array`, not a scalar lie). Blank variants are safe:
`null`/`""` values skip the schema checks (the placeholder domain).

**Trap**: in a definitions-backed example, `table` / `repeat` /
`repeat_flow` data keys ARE validated against `definitions.yml` (an
undeclared key + its sub-fields → `unknown_data_key`), but a `list`
data key is NOT — so adding a table to a showcase needs its array
property declared, while a list over the same data would render without
one. Declare the property when you add the table, or `make examples`
reddens on the first render.

## Wire gotchas the reference doesn't make obvious

- `page.size`: named presets `A3`/`A4`/`A5`, `B4`/`B5` (JIS),
  `Letter`/`Legal`/`Tabloid`, or custom `{ w: "420mm", h: "297mm" }`.
  Physical units (`mm`/`cm`/`in`/`pt`) are strings; bare numbers are pt.
- `page.margin`: a **bare number is pt** and units-as-one-value
  (`margin: 15mm`) is rejected — for units use the per-side map
  `{ top: "15mm", right: "15mm", bottom: "15mm", left: "15mm" }`.
- **Flex row widths**: children without `box.w` split the leftover
  equally — that is the idiom for "N columns". A fixed-width row that
  exceeds its parent warns `horizontal_overflow`; so does a column or
  hand-positioned child past its container's content box, and a band /
  absolute-body item past the edge of the SHEET. Reaching into the page
  margins stays silent by design (the full-bleed escape hatch), so the
  preview is still the only check for "did I mean to bleed into the
  margin".
- **An underline under a flex child**: `line`'s `from`/`to` take full
  lengths, so nest the line INSIDE the field and write
  `to: { x: "100%" }` — the field's width is a row share nobody can type
  as a pt value. A line is never itself a flex item (no box to size); it
  always resolves against its parent's content box, so `padding` insets
  it.
- **Showcase code panels indent with NON-BREAKING spaces (U+00A0), not
  ordinary spaces.** A `text: |-` block scalar strips the common leading
  indent, and the text layer then drops the remaining ordinary leading
  spaces, so a code sample written with real spaces renders **flush
  left** — no diagnostic, `make examples` stays green, only the preview
  shows it. Indent every level of a code panel with NBSP (2 per level);
  grep the showcase for `\xa0` to copy the idiom. A `cell:`/nested block
  in a panel needs the same treatment as any other level.
- Mixed styles inside one line (label + value) use `spans:` on a text
  item (per-span `style`/`styleNames`, `text` or `data`) — see
  [text.md](../../docs/engine/text.md).
- Parse errors from the engine can lack a location (e.g.
  ``missing field `id` ``): match the named field against the schemas
  above / the reference page of whatever you just edited.
- Multi-line text: `\n` splits paragraphs (each wraps independently) —
  author it with YAML block scalars (`|`/`|-`). Wrapping drops leading
  ASCII spaces, so hard indentation (code samples) needs no-break
  spaces (U+00A0); a literal `{key}`-shaped string needs the `{{`
  escape or validation flags it as an unknown binding.
- Tables: no explicit body cell spanning (colspan) — but a section-heading
  row ("学歴", "以上") is expressible from the DATA: tag the row
  (`kind: heading`) and style it with `row.conditionalStyles`
  (`when: { key: kind, equals: heading }` — the form-mark predicate, read
  relative to the row), optionally with `mergeEmptyCells: true` so the
  empty cells merge into one full-width banner. Table grid stroke is one
  width — no thick-outer/thin-inner.
- **`table` takes a `box`** — in the flow body it still paginates
  (`box` only narrows/centers it horizontally); in a container / absolute
  body / band it renders as one **bounded** block (no pagination, and
  `repeatHeader`/`autoPageBreak`/`keepTogether` warn
  `table_pagination_key_ignored`). Two tables CAN now sit side by side —
  each a `direction: row` container child — the A3 two-page-spread
  pattern. A
  table inside a cell — `repeat`/`repeat_flow` or a `cell:` column — is
  still unsupported (`table_in_cell`).
- **A table column takes `cell:` instead of `data:`** — a per-row
  sub-template of freely placed items, with the CELL's top-left as the
  origin and bindings scoped to the row. `data` and `cell` are exclusive
  and one is required (`column_content_conflict` /
  `column_content_missing`); `cellPadding` does NOT inset a container
  cell — use `cell.box.padding`. An auto row is as tall as its tallest
  cell; a fixed `row.height` clips per the cell's `overflow`.
  **`cell:` (and a `repeat`/`repeat_flow` cell) is a container by
  POSITION, so it takes NO `type: container` key** — it already knows
  what it is; only a container in an `items:` list needs the tag. Adding
  one is a parse error whose message points at the WRONG NODE: the body
  is an untagged enum, so serde reports the last variant's failure —
  ``unknown field `type` … at `sections.body` `` — while the real
  offender is the cell twenty lines down. Any parse error naming
  `sections.body` and listing body keys (`id`/`box`/`styleNames`/
  `style`/`items`) means "something inside the body failed"; bisect the
  items rather than reading the reported path.
  **The per-element sub-template is spelled differently per item**:
  `repeat` and a table column take **`cell:`**, `repeat_flow` takes
  **`item:`**. Writing `cell:` on a `repeat_flow` is a parse error whose
  message DOES list the valid keys (`id`, `data`, `gap`, `item`) — read
  the key list in the error rather than assuming the shape is shared.
- **A bundled example must round-trip through the Designer's document
  model byte-for-byte** (`gui/designer-core`'s `serialize(parse(src)) ===
  src` test over every `examples/**/templates.yml`). The form that bites
  a hand-authored block is the FLOW SEQUENCE: the canonical spelling has
  inner spaces — `[ a, b ]`, not `[a, b]` — which is also what the
  Designer writes. `make examples` stays green either way; only the gui
  gate catches it, so match the spacing of the neighbouring
  `styleNames: [ meta ]` lines when adding a list to an example.
- Custom `page.size` + `orientation` **double-swap** without warning: a
  landscape custom size (`w` > `h`) plus `orientation: landscape` flips
  the page back to portrait. With a custom size, omit `orientation`.
- Every gap — the flow body's `gap:` included — takes a full `Length`
  (bare pt number, `"5%"`, `"1em"`); `fontSize`/`letterSpacing` take
  length strings too (`em`/`rem`/`%` on fontSize; letterSpacing rejects
  `%`).
- **Document format defaults**: set once in the template —
  `defaults: { formats: { currency: symbol, date: wareki } }` — and
  every placement just binds the key. Currency variants: `default` =
  bare `9,000` (composes with literal 円/¥ text), `symbol` = `¥9,000`,
  `name` = `9,000円`. `symbol`/`name` also work as a placement pick on
  a PLAIN number field (`{subtotal:symbol}` → `¥9,800`) — the engine
  promotes the value to currency, so money display needs no
  definitions type. A `formats:` registry defines reusable named
  date/datetime patterns (`stamp: { type: date, pattern: "yyyy.MM.dd" }`);
  per-placement pattern strings do not exist — reference by name.
- **`format: quantity` prints the locale's COUNTER WORD, not a bare
  number** — under ja-JP a `6` renders `6点`. So a literal 点/個/行 in the
  surrounding text doubles it (`{count} 点` → `61点 点`), and a count that
  pairs with its own unit column (台 / 冊 / 枚 counters) renders the WRONG counter
  on every row. Use `format: quantity` for a standalone total; leave a
  count that has a unit beside it as a plain `type: integer`. Nothing
  warns — only the render shows it.
- **`format: date-time` wants full RFC 3339, offset included**:
  `2026-07-15T18:20:00` is rejected as `format_error`;
  `2026-07-15T18:20:00+09:00` passes. (`format: date` takes the bare
  `YYYY-MM-DD`.) The engine has no clock, so a print timestamp is a
  normal typed parameter the caller supplies — renders stay
  deterministic.
- **Size fixed-height text boxes from the font, not by eye**: the box
  must exceed `fontSize × lineHeight` (default lineHeight 1.4 — e.g.
  `fontSize: 15` needs `h > 21`), or `text_overflow`/
  `container_overflow` fires and descenders clip. Same for fixed table
  heights: `header.height`/`row.height` need
  `> fontSize × lineHeight + 2 × cellPadding` (e.g. `height: 18` with
  `cellPadding: 4` leaves only 10pt for a 12.6pt line).
  **Recompute when you COPY a sibling document's box** — the source
  height encodes ITS line count and lineHeight, so reusing it while
  changing either overflows: a 4-line box at `lineHeight: 1.7` needs
  64.6pt where the 2-line 1.6 original lived in 60.
- `textAlign` / `verticalAlign` are STYLE keys — writing them inside
  `box:` is a parse error (unknown key), and one wrong key kills the
  whole render.
- `rect` / `ellipse` / `checkbox` / text `mark` speak the unified
  `Style` (+ `styleNames`): fill is `backgroundColor` (`fillColor` is a
  parse error), and a **bare `rect` draws nothing** — author
  `borderWidth: 1` for an outline. Form marks keep a 1pt outline
  default. Only `line` keeps its own shape style (`width`/`color`;
  `styleNames:` on a line is a parse error). For a thin rule that
  should follow the mm-based layout, a flat `rect` (`h: "0.3mm"`,
  `backgroundColor`) beats `line` (whose `from`/`to` are pt-only
  numbers).
- `char_grid` works inside containers and `repeat`/`repeat_flow` cells
  (one sheet there — no pagination; element-scoped bindings in cells).
  Entry-box rows (〒 label + digit boxes + hyphen) are a flex row — see
  the snippet in [char_grid.md](../../docs/engine/char_grid.md); blank boxes are `text: ""` (omitting
  both `text` and `data` warns instead). Real postal rows keep the
  hyphen OUT of the boxes: a 3-cell grid + a plain `−` text + a 4-cell
  grid (an 8-cell grid with the hyphen inside reads wrong on paper).
- **A vertical `char_grid` takes `writingMode` as an ITEM key**, beside
  `grid:`/`markup:` — NOT in `style:`. The style property parses fine
  (it is a normal inherited text property) but the grid stays
  horizontal with no diagnostic; only the preview shows it.
- **`fontFamily` can only name faces from packs the active locale
  `uses:`** — en-US loads `noto-sans`/`noto-sans-mono` only, so kanji
  under `--lang en-US` degrades to `missing_glyph`. For a
  Latin-primary document that needs Japanese accents, keep the locale
  that carries the JP packs (ja-JP) and set `defaults.currency` for
  the money instead (every builtin pack embeds the same currency set,
  so `currency: USD` renders `$6` under ja-JP).
- **Engine SVG subset has no rounded corners**: a `rx`/`ry` on `<rect>`
  draws square and warns `svg_unsupported` — which reddens
  `make examples`. Author example assets without `rx` (and without
  `<text>`, which the subset also lacks).
- Since the same engine version, a fixed-width flex row that exceeds
  its parent and a definite-width flow item past the region edge warn
  `horizontal_overflow` — but absolute-body/band items past the page
  edge still render silently; keep previewing those.
- **Blank-form fields**: a `data:` binding (or its `definitions.yml`
  field) takes a `placeholder` — verbatim text drawn when the value is
  absent / `null` / `""`, so an intentionally-blank fillable form
  renders clean instead of emitting `missing_data`/`format_error`. The
  placement's `placeholder` wins over the field's; only the FIELD-level
  one reaches `{key}` interpolation segments (put the placeholder in
  `definitions.yml` for an inline `{birth_date:wareki}生（満{age}歳）`).
  It is never interpolated or formatted (a `{…}` inside stays literal),
  and a PRESENT-but-invalid value still warns (`placeholder` is for
  blank, not broken). This is how one form serves a blank ↔
  filled-sample pair
  (`examples/forms/rirekisho-ja`). String fields already blank cleanly (`""`);
  only typed (date/number/currency) fields need it.

## Optical adjustment (you place coordinates without seeing them)

You choose positions and sizes from YAML numbers, with no visual sense
of how they read. Human designers don't rely on perception either —
they apply **coded correction rules** for optical illusions. Apply these
so your first render is closer to right, and lean on the engine's
built-in corrections instead of re-deriving them:

- **Overshoot**: a circle/oval/triangle flush with a text cap band reads
  *smaller* than the text. It must extend **2–3% past** the band to look
  equal. The text-anchored `mark:` bakes this into its default clearance
  — prefer it over a hand-placed `ellipse`, which you'd have to
  pixel-tune (see [form_marks.md](../../docs/engine/form_marks.md)).
- **Optical center**: content centered in a box reads *low*. Nudge it
  **2–5% of the box height above** geometric center when you place
  something meant to look centered (the engine's `verticalAlign: middle`
  is geometric — compensate if it reads low in the preview).
- **Irradiation / expansion colors**: light-on-dark reads bolder and
  larger than the same shape dark-on-light. For a white-on-dark label,
  consider a slightly smaller size or lighter weight to match a
  dark-on-light sibling.
- **Helmholtz–Kohlrausch**: high-chroma colors read *brighter* than a
  gray of equal luminance. A luminance-only contrast check can pass while
  a saturated accent still reads louder than the heading — mute it.
- **Apparent area**: a circle needs a **larger diameter** than a square's
  side to read as the same size; a checkbox (square) and an ellipse
  mark (round)
  beside equal text are not the same authored size.

These are starting corrections, not a substitute for the preview loop —
still render and look. When a value looks deliberately "off" by a couple
percent, it may be an intentional optical correction; don't "fix" it back
to geometric purity without checking.

## Engine access — MCP first, CLI fallback (canonical command table)

The engine is the only source of rendering truth; you reach it two ways.
**This is the one canonical home for the command surface** — the
migrator/debugger skills reference this section, they never restate it.

- **Prefer the MCP surface when a `shojiku` MCP server is registered**
  (the AI-agent transport per the product story): call its tools
  directly, no shell. The tools and their arguments (paths are strings,
  relative to the server's working dir):

  | Tool | Required args | Optional args | Returns |
  |---|---|---|---|
  | `validate` | `templatePath` | `definitionsPath`, `paramsPath` | diagnostics JSON `{items:[…]}` |
  | `render_preview` | `templatePath`, `paramsPath` | `definitionsPath`, `lang`, `scale` (default 2.0), `page` (1-based), the asset knobs | one PNG per page, then diagnostics JSON |
  | `inspect_layout` | `templatePath`, `paramsPath` | `definitionsPath`, `lang`, the asset knobs | inspect envelope (engine info + layout tree + path-addressed boxes + margins), then diagnostics JSON |
  | `capabilities` | — | — | engine version + capability-key list |

  Every `<name>Path` argument has an inline twin — `definitions` /
  `template` / `params` carrying the source TEXT — for a client that
  shares no filesystem with the server. Pass one spelling per source
  (both is an invalid-params error) and keep an inline payload under
  512 KiB; prefer the path form when you have files, since an inline
  template resolves no bundled image `src:` unless the call also passes
  `assetsDir`. The **asset knobs** (`render_preview` / `inspect_layout`)
  mirror the CLI's asset flags: `assetsDir` (bundled-asset root),
  `assetMode` (`open` | `bundled-only`), `allowDynamicImage` /
  `denyDynamicImage` (item-id arrays, ≤256 entries).

- **Fall back to the CLI when no MCP server is available** (or you are
  driving Docker). Same four operations plus `render`; every template
  command takes `--templates` (note the plural); the rendering commands
  (`preview` / `inspect` / `render`) also require `--params`, while
  `validate` accepts it optionally (mirroring the MCP table) —
  `--definitions` is optional but recommended everywhere:

  ```bash
  # diagnostics as JSON — fix until clean
  shojiku validate --definitions definitions.yml --templates templates.yml --params params.json
  # one PNG per page (the {page} token is required in --output)
  shojiku preview --templates templates.yml --params params.json --output "preview-{page}.png" --scale 2
  # resolved geometry: layout tree + path-addressed boxes for every item
  shojiku inspect --templates templates.yml --params params.json
  # final PDF
  shojiku render --templates templates.yml --params params.json --output out.pdf
  ```

  Locale (`--lang <id>` / MCP `lang`) applies to the **rendering**
  commands — `preview`, `inspect`, `render` (and MCP `render_preview` /
  `inspect_layout`); `validate` takes NO locale (validation does not
  format). Builtin ids `ja-JP`/`en-US`, a bare `ja` picks its unique
  builtin, else it falls to `defaults.locale` then `ja-JP`. Under Docker
  the CLI finds `./packs/` from the working dir; otherwise point it with
  `--font-dir`/`--locale-dir` or `$SHOJIKU_FONT_DIR`/`$SHOJIKU_LOCALE_DIR`.

Both transports **bundle diagnostics into every response** — there is no
separate "get errors" call. A `render_preview`/`preview` that emits
warnings still produces pages; read the diagnostics part every time.

**Installed standalone** (e.g. via `npx skills add`, outside the Shojiku
repo): every relative `docs/…` and `examples/…` reference in these three
skills — the template reference, `docs/engine/diagnostics.md`,
`docs/architecture.md`, the bundled examples — resolves inside the
Shojiku repository, not in this install. When this skill lives in
another project, read them from a Shojiku checkout. If you have neither
a checkout nor the `shojiku`/`shojiku-mcp` binaries, obtain the Shojiku
repository first — its `docs/quickstart.md` covers building the CLI and
registering the MCP server; you cannot run the validate → preview loop
(and must not claim a template verified) without one of those binaries.

## The authoring loop

1. **Read the reference first**: `docs/engine/README.md` and every
   linked page relevant to the features you plan to use (standalone
   install: resolve those paths per the note ending § Engine access).
2. Write the three files.
3. **Validate** (`validate` tool / `shojiku validate`, see the command
   table above) — machine-readable diagnostics (JSON). Fix until clean.
   Diagnostics with the same code flooding every key share ONE root
   cause — fix the cause, not the instances.
4. **Preview** (`render_preview` tool / `shojiku preview`) and
   **actually view every page image yourself**. Validation cannot see
   horizontal overflow, clipped labels, or bad visual hierarchy — only
   the pixels can. Never declare a template done without having looked
   at every rendered page.
5. Iterate 2–4 until the pages are visually correct.

## Authoring log (required artifact)

Keep `AUTHORING.md` next to the files; per iteration record: what you
changed and why, the engine's response (diagnostics summary / what the
preview showed). Finish it with two sections:

- **Design notes** — decisions made on guesses, reference pages that were
  missing or ambiguous.
- **Gap report** — things you wanted to express but the engine
  cannot; unhelpful diagnostics. This feeds the engine roadmap.

## Self-consistency check (before declaring done)

Re-read your own notes and verify the wire matches every claim in them
(e.g. if you wrote "unsized children split equally", confirm those
children really have no `w:`). A note that says one thing while the
YAML does another is a known authoring failure mode.
