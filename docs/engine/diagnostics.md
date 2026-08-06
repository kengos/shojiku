# Diagnostics reference

Everything the engine wants to tell a human, a GUI, or an AI flows
through structured diagnostics:

```json
{ "severity": "warning", "code": "invalid_font_size", "category": "layout",
  "message": "fontSize -5 is not a positive finite number; using 10",
  "path": "sections.body.items[2]",
  "args": { "value": -5, "default": 10 },
  "origin": "layout/src/engine/resolve.rs:126" }
```

with severity `error` | `warning` | `info`. The engine **degrades, it
does not panic**: hostile or wrong input produces a diagnostic and a
defined fallback. `shojiku validate` reports the static set;
`render`/`inspect`/`preview` add the layout-time set.

The fields separate concerns so a localizing consumer (the React GUI's
ICU catalog) can render its own message and the engine never translates:

- **`code`** — a stable machine-readable identifier and the catalog key.
  Codes and their per-code **arg keys are an append-only frozen contract**:
  new codes are added, existing ones are never renamed or repurposed.
- **`args`** — typed interpolation data (`String | Number | Bool`,
  serialized as bare JSON scalars); a consumer formats its own localized
  message from these. String args are control-character-stripped and
  length-clipped (untrusted echo). Omitted when empty.
- **`message`** — the English default rendering of `code`'s template
  filled with `args`; a fallback for AI/CLI/dev, not the translation.
- **`category`** — a coarse, **re-categorizable** domain (`parse` |
  `data` | `style` | `layout` | `font` | `asset` | `format` | `limits`).
  Not part of the frozen contract; the emitting module is never folded
  into `code`.
- **`path`** — **always a structural address in the template**
  (`sections.body.items[2]`, `….cell.items[0]`, `….columns[1]`,
  `….headerGroups[0]`), in the
  same grammar as the `inspect` box index, so a consumer can select the
  offending node. Engine-synthesized structure only: a data key rides in
  `args.key`, never here. Layout-stage diagnostics carry the innermost
  item being laid out — including `page_overflow`, which names the item
  that ran the page count away. Only what is raised before the walk
  descends into anything carries no path (`page_margin_too_large`,
  `orientation_ignored`). A once-per-key warning (an unknown
  `fontFamily`, a repeated formatter degradation) names the FIRST item
  that triggered it. Capability key: `diagnostics.layout.path`.
- **`origin`** — the engine source location (`file:line`) that emitted
  it. Non-contract, free to churn, and safe to strip from untrusted
  output; a GUI hides it, AI reads it to investigate. Omitted when absent.

Duplicate diagnostics sharing a `(code, path, message)` are collapsed at
the output boundary (a warning re-emitted for one item across a measure
and a render pass), keeping the first occurrence.

## Parse errors

Malformed YAML/JSON, non-finite numbers (`.nan`/`.inf`), unknown keys
anywhere in the template (**every wire struct rejects them** — a typo'd
key is never a silent no-op), negative padding, `padding: auto`,
shorthand edge strings, invalid page sizes, and unknown enum values are
**structural parse failures**: the template is rejected outright, so
none of the codes below apply. `shojiku validate` surfaces the failure
as a single diagnostic instead of an opaque error so a GUI can render it
inline:

| Code | Severity | Meaning |
| --- | --- | --- |
| `parse_error` | error | a structural parse failure, with `args` `what` (which artifact) + `path` (the field path, e.g. `sections.body`) + `detail` (the underlying message) + `line`/`column` when known. An error inside an internally-tagged item (`Body`/`Item`) truncates the path to the enum boundary and omits `line`/`column`, so the location is never over-promised |
| `non_finite_number` | error | a `.nan`/`.inf`/overflowing number anywhere in the artifact (`args` `what`) |

## Validation (static, `shojiku validate`)

| Code | Severity | Meaning |
| --- | --- | --- |
| `unknown_data_key` | error | a binding key is not in definitions (scalar, column, cell, or card scope) |
| `empty_definitions` | warning | definitions was supplied but declares no properties; every binding will read as `unknown_data_key` (check the file's top-level structure) |
| `unknown_format` | error | a format variant not declared for the field |
| `not_an_array` | error | a table/repeat/list source key is not an array property |
| `interpolation_key_charset` | warning | a `{…}` that looks like an intended key uses characters outside `[A-Za-z0-9_.]`, so it prints its own braces; declare a name under `bindings:` to reach the key |
| `unused_binding` | warning | a `bindings:` declaration that no string in the item references |
| `binding_shadows_key` | warning | a declared name that also resolved at the ambient scope, redirected by the declaration (which wins); attaching options to the same key is silent |
| `invalid_binding_name` | warning | a `bindings:` name outside the reference charset, so no `{name}` could reach it |
| `definitions_format_ignored` | warning | a known semantic `format` (`currency`, `date-time`, …) sits on a base type it does not apply to; the base type is used |
| `definitions_enum_labels_ignored` | warning | a labeled `enum` member (`{ value, label }`) on a field that is not plain text; its values render unlabeled |
| `params_missing_required` | warning | a schema-`required` key is absent or `null` in params |
| `params_type_mismatch` | warning | a params value's JSON type differs from the declared schema type (`integer` rejects fractional numbers) |
| `params_out_of_range` | warning | a number violates the schema's `minimum`/`maximum` |
| `params_length_out_of_range` | warning | a string violates `minLength`/`maxLength` (characters), or an array `minItems`/`maxItems` |
| `params_enum_mismatch` | warning | a params value is not one of the schema's declared `enum` values |
| `params_unknown_key` | warning | a params key is not declared in definitions (the unknown subtree is not entered); location rides the `key` arg, never `path` |
| `image_source_conflict` / `image_source_missing` | error | both / neither of `src`+`data` on an image |
| `column_content_conflict` / `column_content_missing` | error | both / neither of `data`+`cell` on a table column (`type`/`fit` beside `cell` conflict too); `cell` wins the render — see [table.md](table.md) |
| `undefined_style_name` | warning | `styleNames` references a name not in `styles:` |
| `too_many_styles` / `too_many_style_names` | warning | registry > 256 / name list > 16; extras ignored |
| `span_content_conflict` | warning | `spans` beside `text`/`data` (spans win), or a span with both `text` and `data` (data wins) |
| `empty_span` | warning | a span with neither `text` nor `data`; renders nothing |
| `empty_ruby_entry` | warning | a `ruby` entry with an empty `base` or `text`; entry skipped |
| `ruby_entry_too_long` | warning | a `ruby` entry whose `base` or `text` exceeds 64 characters; entry skipped |
| `too_many_spans` | warning | over the 256-span cap; extras dropped |
| `too_many_ruby_entries` | warning | over the 256 `ruby`-entries cap; only the first 256 apply |
| `ignored_span_style` | warning | span-inert style keys on a span's inline `style` |
| `shape_style_ignored` | warning | inert (text/box) keys on a shape item's (`rect`/`ellipse`/`checkbox`/`mark`) inline `style` |
| `shape_border_sides_ignored` | warning | per-side `borderWidth` on `ellipse`/`checkbox`/`mark` reduced to the top side |
| `layout_key_on_leaf` | warning | flex/grid keys on a non-container box |
| `grid_key_ignored` | warning | grid keys without `box.type: grid` |
| `table_pagination_key_ignored` | warning | pagination keys (`keepTogether`, `emptyBehavior` …) on a non-flow (bounded) table |
| `ignored_column_key` | warning | `fit` on a non-image table column |
| `mark_content_conflict` | warning | checkbox sets both `checked` and `data` (`data` wins) |
| `mark_binding_not_boolean` | warning | an `equals`-less mark binding targets a non-boolean field |
| `row_condition_not_boolean` | warning | an `equals`-less `row.conditionalStyles` entry targets a non-boolean field |
| `reserved_format_name` | warning | a `formats:` registry entry shadows a builtin variant name; ignored |
| `too_many_formats` | warning | `formats:` registry over the 256-entry cap; extras ignored |
| `too_many_row_conditions` | warning | a table's `row.conditionalStyles` over the 16-entry cap; extras ignored |
| `too_many_bindings` | warning | an item's `bindings:` over the 256-entry cap; advisory only — every declaration still resolves |
| `too_many_document_entries` | warning | `document.keywords` / `document.authors` over the 64-entry cap; only the first 64 are written |
| `container_depth_exceeded` | error | nesting > 32 (also enforced independently at layout) |

## Layout — geometry & resolution

| Code | Severity | Meaning |
| --- | --- | --- |
| `length_out_of_range` | warning | resolved length exceeds ±1e6 pt; default used |
| `percent_of_auto` | warning | `%` against an auto-height parent; value dropped |
| `page_margin_too_large` | warning | margins consume a page axis; that axis falls back to 0 |
| `orientation_ignored` | warning | `orientation: landscape` on a custom `{ w, h }` page size is ignored; express the orientation in the dimensions |
| `container_depth_exceeded` | error | nesting > 32; subtree skipped |
| `container_overflow` | warning | content taller than a definite-`h` content box; suppressed by `overflow: hidden` |
| `section_overflow` | warning | an unsplittable item is taller than the flow region |
| `horizontal_overflow` | warning | **RETIRED — emitted by nothing.** It carried a whole English sentence in one free-text `detail` arg, which a translating consumer could only pass through. Every reason it covered now has its own number-carrying code (the five below). The entry remains because codes and arg keys are append-only |
| `flow_item_overflow` | warning | a definite-width flow item reaches `over` pt past the right edge of the `avail` pt flow region and renders off-sheet |
| `flex_row_overflow` | warning | a row's fixed children + gaps need `needed` pt but the parent content box is only `avail` pt wide; unsized children shrink instead and never warn, and `overflow: hidden` suppresses it |
| `vertical_text_overflow` | warning | a vertical text block needs `columns` columns (`needed` pt) but its box is `avail` pt wide. The flow paginator reads this code's PRESENCE as "a policy already resolved this block's overflow", so it places whole instead of paginating its columns |
| `sheet_overflow` | warning | a band / absolute-body item (a `line`'s endpoints included) reaches `over` pt past the right edge of the **sheet** and renders off-paper. The bound is the paper, not the margin box: reaching into the margins is a deliberate escape hatch, so only ink that leaves the sheet warns. Filling items never warn |
| `child_overflow` | warning | a column or `x`/`y`-positioned box child overflows its parent's `avail` pt content box by `over` pt. States the magnitude, never a side — cross-axis alignment runs after the check, and `alignItems: center`/`end` push the excess LEFT. Suppressed under `overflow: hidden`; a ROW child is reported once, by the row-level `flex_row_overflow` |
| `grid_column_overflow` | warning | a grid child (`child` pt) is wider than the `track` pt run of `span` column tracks it sits in, so it spills over its neighbour (an `auto` column sizes to its content; a fixed or `fr` one does not) |
| `page_overflow` | error | layout exceeded 500 pages; output truncated |
| `grid_tracks_clamped` | warning | grid `columns`/`rows` outside 1..=64 tracks; clamped |
| `grid_cell_overflow` | warning | grid child TALLER than its explicit row track; the `extent` arg says `row track` or `spanned rows` (auto rows grow instead of warning). The width axis is `grid_column_overflow` above |
| `imposition_grid_clamped` | warning | `repeat` grid over 64 cells/page (or a zero axis); clamped |
| `char_grid_clamped` | warning | `char_grid` outside 1..=4096 cells/sheet; clamped |
| `char_grid_markup_clamped` | warning | an aozora note asks for more cells than the grid holds (a large-writing scale > `min(columns, lines)`, an indent/raise past the line); clamped |
| `invalid_cell_size` | warning | `char_grid` cell size not positive and finite; item skipped |
| `vertical_text_unsupported` | warning | `writingMode: vertical_rl` reached a text `mark:` (the circled-text overlay), whose glyph-band overlay is horizontal-only; the mark is skipped. Rich `spans` / `list` / table cells / `page_number` now render vertically. See [vertical_text.md](vertical_text.md) |
| `vertical_style_ignored` | warning | registered but no longer emitted: the block-level knobs (`textOverflow`, `textDecoration`, `verticalAlign`, `textSpacingTrim`, `hangingPunctuation`) now apply on vertical blocks ([vertical_text.md](vertical_text.md)); the code stays for the append-only GUI catalog contract |

## Layout — placement rules

| Code | Meaning |
| --- | --- |
| `table_in_cell` | `table` inside a `repeat` cell / `repeat_flow` card / a table column's `cell:`; skipped (everywhere else a table places as a bounded block — see [table.md](table.md)) |
| `repeat_in_absolute_body` / `repeat_in_band` / `repeat_in_container` | `repeat` outside a flow body; skipped |
| `repeat_flow_in_absolute_body` / `repeat_flow_in_band` / `repeat_flow_in_container` | `repeat_flow` outside a flow body; skipped |
| `page_break_in_absolute_body` / `page_break_in_band` / `page_break_in_container` | `page_break` outside a flow body; skipped |
| `page_number_in_body` / `page_number_in_container` | `page_number` outside a band; skipped |
| `grid_span_clamped` | warning | `columnSpan`/`rowSpan` beyond the axis; clamped |
| `span_outside_grid` | warning | span keys on a child of a non-grid box; inert |
| `grid_fr_no_basis` | warning | `fr` row tracks in an auto-height container; sized as auto rows |
| `reflow_budget_exhausted` | warning | too many nested boxes needing a second placement (auto-height `stretch` rows, `flexGrow` columns, `fr`-over-auto grids); the innermost children keep their content size |
| `cut_marks_clipped` | warning | `cutMarks` have no room outside the grid on a sheet side; those ticks are omitted |
| `header_group_span_clamped` | warning | `headerGroups` spans exceed the table's columns |

## Layout — content & data

| Code | Meaning |
| --- | --- |
| `missing_data` (warning) / `not_an_array` (error) | params problems at a bound key; `missing_data` is suppressed when a binding/field `placeholder` covers a blank value (data-binding.md) |
| `format_error` | value cannot render as the requested type; suppressed for a blank value covered by a `placeholder`, but NOT for a present-but-invalid one |
| `empty_text_item` / `empty_qr_code_item` / `empty_image_item` / `empty_char_grid_item` | neither `text`/`src` nor `data` set |
| `char_grid_overflow` | content past a band/absolute `char_grid`'s single sheet; dropped |
| `ruby_markup_invalid` | malformed aozora markup (unclosed `《`, empty reading, no base, over-cap, dangling `\|`; a large-writing note whose `「…」` target is not just before it or asks for a scale < 2; a placement note off a line head or a second one on a line); rendered literally |
| `aozora_note_ignored` | a `［＃…］` aozora note the engine does not act on (not a sheet break, a large-writing, or a placement note); rendered literally |
| `ruby_overflow` | a reading overflows its base run even at the 4pt floor |
| `ruby_base_not_found` | a `ruby` entry's `base` never occurs in the drawn text; reading skipped |
| `rect_missing_size` / `image_missing_size` / `qr_missing_size` | required `box.w`/`box.h` absent |
| `text_overflow` | wrapped text exceeds a definite `h` (`textOverflow: visible`, or `shrink` at its 4pt floor) |
| `span_overflow_unsupported` | `textOverflow: shrink`/`ellipsis` on a rich (`spans:`) block; falls back to `visible` |
| `unknown_font_family` | `fontFamily` matches no loaded family; the default face is used (warns once per family) |
| `missing_glyph` | characters the font cannot map (tofu); deduped per block |
| `unknown_format_variant` | a picked format variant exists nowhere; the default form rendered (deduped) |
| `unknown_currency` | a currency code without display data; the code itself used as symbol/name |
| `unknown_unit` | a semantic unit key missing from the locale pack; rendered verbatim |
| `format_pattern_ignored` | an inline `format: { pattern }` on a non-dated type; the default form rendered |
| `mark_missing_size` | a form mark without a positive `box.w`/`box.h` (a checkbox may omit them — it auto-sizes; an `ellipse` may not); skipped |
| `mark_equals_type_mismatch` | a mark's params value type differs from its `equals` literal; not drawn. Also raised at validate when the DECLARED field type differs, which no params value can satisfy |
| `mark_equals_not_declared` | a mark's `equals` literal is outside the field's declared `enum`, so the mark can never be drawn |
| `mark_value_not_bool` | an `equals`-less mark binding's value is not a boolean; not drawn |
| `row_condition_type_mismatch` | a row's value type differs from a `conditionalStyles` entry's `equals`; the layer is not applied. Also raised at validate against the DECLARED field type |
| `row_condition_equals_not_declared` | a `conditionalStyles` entry's `equals` literal is outside the field's declared `enum`, so the layer can never apply |
| `row_condition_value_not_bool` | a row's value is not a boolean under an `equals`-less `conditionalStyles` entry; the layer is not applied |
| `qr_content_too_long` / `qr_module_too_small` | QR content over 1 KiB (skipped) / modules under 1 pt (drawn) |
| `unsupported_link_scheme` / `link_url_too_long` / `empty_link_url` | resolved `link.url` outside http/https/mailto/tel (or control chars) / over 2048 bytes / empty — the link is dropped, the item still renders |
| `document_metadata_control_chars` / `document_metadata_too_long` / `invalid_document_language` | a resolved `document:` value carries control characters / is over its byte cap (2048, or 64 for `language`) / is not a `[A-Za-z0-9-]` language tag — that field is not written to the PDF and is NOT replaced by its fallback |
| `table_too_wide` | sized columns exceed the flow width |
| `row_overflow` | a row overflows with `autoPageBreak: false` |
| `invalid_column_width` / `invalid_row_height` / `invalid_cell_padding` | negative table geometry; clamped to 0 / treated as auto |

## Layout — style guards (hostile values)

| Code | Fallback |
| --- | --- |
| `invalid_font_size` | 10 pt |
| `font_size_out_of_range` | 10 pt (cap 1000 pt) |
| `invalid_line_height` | 1.4 |
| `line_height_out_of_range` | 1.4 (cap 1000×) |
| `invalid_letter_spacing` | 0 (magnitude cap ±1000 pt) |
| `invalid_flex_grow` | 0 (negative / non-finite `flexGrow`) |
| `invalid_border_width` | no border (cap 0..=1000 pt) |
| `invalid_line_width` | 1 pt, the `line` wire default (cap 0..=1000 pt) |
| `invalid_border_radius` | square corners (a negative or non-finite radius) |
| `border_radius_ignored` | square corners (a per-side/`double` border, a `table`, or a form mark cannot round) |
| `invalid_opacity` | opaque (out-of-range / non-finite `opacity`; never invisible) |
| `invalid_color` | default color (echo snippet-capped) |

## Assets (`prepare_assets`)

| Code | Meaning |
| --- | --- |
| `missing_asset` / `assets_root_missing` / `asset_traversal` | bundled path absent / no assets root / path escapes the root |
| `invalid_image_asset` (error) / `invalid_image_data` (warning) | undecodable static asset / dynamic data |
| `remote_asset_unsupported` | remote URL source; the render path has no network I/O |
| `dynamic_image_denied` | params-bound image blocked by the asset policy |
| `svg_unsupported` | SVG constructs outside the subset parser |
| `cell_image_assets_capped` | per-element cell images (table columns + repeat/repeat_flow cells) over the shared 1000-load cap; the rest are skipped |

## See also

- [layout-model.md](layout-model.md) — the resolve caps that emit the geometry codes
- Each feature page lists the codes it can emit.
