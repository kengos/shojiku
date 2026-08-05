# Code map — engine/core, engine/diagnostics

> AI-only, token-dense. Index + repo-wide conventions: [CLAUDE.md](../../CLAUDE.md).
> Read this BEFORE searching or editing the covered dirs; update it in the
> same PR whenever files/modules/boundaries here change. Granularity: file
> role + load-bearing contracts. Key lists, defaults, caps, and diagnostics
> live in `docs/engine/` (the reference), not here.

## engine/core — untrusted-input parsing/validation

**Wire discipline** (every file below follows it): every wire struct
`deny_unknown_fields`; unset never serializes; defaulted scalars are
`Option`+skip+accessor (effective defaults live in accessor methods, never
injected at parse). The template model splits along CSS lines.

### Template model

- `template.rs` — structural root: `Template`/`Sections`/`Band`/`Body`/
  `Item` + `parse_template` + `Version` (number|string round-trip) +
  `defaults: TemplateDefaults` + the named-style registry
  `Template.styles`; re-exports submodules so `shojiku_core::X` paths stay
  stable.
- `template/items.rs` — the leaf items: `TextItem` (incl. `mark`,
  `bindings` — ONE map per item serving its `text`/`link.url` AND its
  spans), `RectItem` (unified `Style`, no default stroke), `LineItem`,
  `ImageItem`, `PageNumberItem`, `QrCodeItem`, `ListItem` (per-entry
  `text` template + `overflowText`), `PageBreakItem`.
- `template/imposition.rs` — `Item::Container` (nesting, depth cap) +
  `Item::Repeat` (imposition/n-up: data + `breakBefore` + `cutMarks` +
  `GridSpec` + `cell`; the gap accessors fold the CSS `gap` shorthand).
- `template/repeat_flow.rs` — `Item::RepeatFlow` (flow repeat: one
  auto-height card per array element).
- `template/char_grid.rs` — `CharGridItem` (genkoyoshi): `CharGridSpec`,
  writing-mode/kinsoku/markup enums, `rubySize`, `bindings`.
- `template/table.rs` — `TableItem` (boxed; geometry-only `box`,
  `headerGroups`, `mergeEmptyCells`, `keepTogether`);
  `template/table/column.rs` (`Column`: width, `type` text|qr_code|image,
  content = `data` binding XOR `cell: ContainerItem` sub-template);
  `template/table/row.rs` (`RowSpec`: heights, zebra `alternateStyle`,
  `conditionalStyles: Vec<RowConditionalStyle>` — the form-mark predicate
  read row-relative, capped).
- `template/binding.rs` — `Binding { key, format, placeholder, scope }` +
  `BindingScope` Element|Document (the explicit escape out of a cell's
  element scope) + `Bindings` (the named-declaration map).
- `template/spans.rs` — `Span` (rich fragment; `spans` wins over
  `text`/`data`). `template/ruby.rs` — `RubyPair` (verbatim
  template-authored readings; distinct from the aozora parser in
  `ruby.rs`). `template/link.rs` — `Link` (`{ url }`, `{key}`
  interpolation). `template/document.rs` — `DocumentMeta` (the root
  `document:` block: title/description/keywords/language/authors, each
  `{key}`-interpolable; `MAX_DOCUMENT_ENTRIES` per list; no
  `creationDate` — determinism). `template/marks.rs` — form marks: `EllipseItem` /
  `CheckboxItem` (unified `Style` like `rect`), `MarkBinding`
  `{ key, equals?, scope }` (presence predicate; `EqualsValue` =
  scalar-only `serde_json::Value` newtype), `TextMark` (text-anchored
  circled-text overlay). `template/formats.rs` — presentation defaults:
  `TemplateDefaults { locale, currency, style, formats }`,
  `FormatDefaults` (typed per-type), `FormatRef`/`NamedFormat`.

### Geometry / style / length

- `geometry.rs` — positioning core, non-inherited; the *page* half
  (`PageSize` presets | custom `{w,h}`, `PageSpec`/`Orientation`;
  `dimensions_pt()` swaps a NAMED size on landscape, no-op + warn flag for
  custom sizes). `geometry/box_model.rs` — `BoxSpec`/`OptBox` (margin/
  padding, flex keys, min/max bounds, `flexGrow`, `columnSpan`/`rowSpan`)/
  `PointSpec` (`{ x, y }`, the `line` endpoint — both axes are full
  `Length`s, so a bare number is still pt and `"100%"` reaches the edge
  of whatever box the line sits in; only `LineItem` uses it).
  `geometry/page_margin.rs` — `PageMargin` (bare | per-side |
  legacy array, authored form round-trips; the margin box is the
  coordinate origin). `geometry/flex.rs` — flex wire enums (`BoxType`/
  `FlexDirection`/`AlignItems` incl. baseline/`JustifyContent`).
  `geometry/grid.rs` — `TrackSpec` = count | track list + gaps;
  `geometry/grid/track.rs` — `GridTrack` Fixed|Fr (`fr` is a
  grid-track-only unit, NOT a `Length`; hand-written de/serialize).
- `edges.rs` — `EdgeSpec`: bare number or per-side map; margin sides also
  take `auto`; `%`-of-parent-*width* for all edges; only authored keys
  serialize.
- `style.rs` — painting core: unified `Style`, every field `Option`
  (unset = inherit), CSS camelCase names; border scalar-or-per-side-map
  visitors in `style/border.rs`. `style/enums.rs` — the keyword enums
  (re-exported). `style/shapes.rs` — non-cascading `LineStyle` (the one
  shape off the unified `Style`). `style/inert.rs` — the context-inert
  key lists (`ignored_span_keys`/`ignored_shape_keys`).
  `style/writing.rs` — vertical-writing vocabulary: `WritingMode`
  (canonical home; char_grid re-uses it), `TextOrientation`,
  `TextCombineUpright` (tate-chu-yoko; `active()` → the layout/tree carrier
  `TextCombine`). The inherited-vs-not split per property is documented in
  `docs/engine/style.md`.
- `length.rs` — `Length`: pt/%/physical (authored form kept for
  round-trip)/em/rem (`FontRel` bases; `resolve(basis, font)` is total);
  rejects non-finite.

### Definitions / params / interpolation

- `definitions.rs` — the OpenAPI-schema definitions wire, isomorphic to
  the params JSON: `Definitions` root object schema; `parse_definitions` =
  checked parse + shape walk + a migration-hint error for the retired v1
  `groups:` form. `definitions/schema.rs` — `Schema` (recursive node:
  `type` + `format` (open vocabulary; `Schema::mapped()` maps known
  `(type, format)` → `FieldType`) + JSON-Schema constraints + authoring
  keys incl. `displayFormat(s)`/`placeholder`); `EnumEntry` = bare
  scalar | `LabeledEnumValue` `{value, label}` (hand deserialize: any
  MAPPING is read as the labeled form strictly, so a pair-key typo is a
  parse error, never a silently-kept object member; per-entry authored
  form round-trips); `FieldType::as_str` (the diagnostics spelling,
  round-trips `from_name`); depth/node/enum caps.
  `definitions/shape.rs` — the post-parse walk enforcing caps +
  structural-key checks as Located errors (incl. labeled entries need a
  scalar `value`).
- `parse.rs` — two-pass typed parse shared by template/definitions:
  pass 1 `Value` + `ensure_finite`, pass 2 `serde_path_to_error` →
  `CoreError::Located` (path + line/column). **serde_yaml's own
  ~128-frame recursion limit bounds tree depth into a clean parse error,
  which is what keeps every downstream recursive walk stack-safe — stated
  at `validate/collect.rs::check_container_depth`, pinned by a model
  test; do not re-file "unbounded walk recursion" as a hardening item.**
  Internally-tagged enums truncate the error path to the enum boundary
  (see `docs/agents/gotchas/rust-engine.md`).
- `params.rs` — params parse + `resolve_path` dotted lookup + `is_blank`
  (the shared absent/null/`""` predicate placeholders key off).
- `catalog.rs` — the schema tree flattens to dotted-key lookup tables
  (`scalars` + `arrays`, the latter of `ArrayGroup { fields, row_arrays,
  element }`) with `FieldSpec` — the compatibility keystone that let
  validate/formatter never learn the wire moved. A row's own array child
  registers as an `ArrayGroup` of its OWN under the joined path
  (`orders.items`) besides staying in its parent's `row_arrays`, so a
  nested source is as addressable as a top-level one; `resolve_array_path`
  is the row-relative→full join every consumer routes through.
  `ArrayElement` = `Object` | `Scalar(FieldSpec)` | `Undeclared` — the
  distinction a check needs before claiming anything about an element.
  `catalog/flatten.rs` holds the walk, which carries no depth argument:
  `MAX_SCHEMA_DEPTH` is enforced at parse and bounds it (pinned by
  `nesting_at_the_parse_cap_flattens`). `FieldSpec.enum_labels` = the
  declared `(value, label)` pairs in authored order, populated for
  plain-text fields only (other types warn
  `definitions_enum_labels_ignored` in the validate quality walk and get
  an empty list); `FieldSpec.enum_values` = every declared member's value
  for EVERY type, which is what a template-side `equals` is checked
  against; lookup equality = `check_enum` membership equality.
- `interpolate.rs` — `{{key}}` strings: `parse_segments`/`Segment` +
  `is_valid_interpolation_name` (the ONE charset statement, shared with
  declaration names) + `scan_suspect_keys` (the looks-like-a-key-but-
  cannot-parse scan).
- `ruby.rs` — the aozora markup parser (`parse_aozora_ruby`, linear,
  never-panics; flushes plain at each newline). Submodules: `ruby/note.rs`
  (bounded `［＃…］` note scan), `ruby/grammar.rs` (note-body classify:
  large-writing/placement/unknown), `ruby/placement.rs` (`LinePlacement`),
  `ruby/warning.rs` (append-only English fallbacks), `ruby/reading.rs`
  (the `《…》` machinery; base = max trailing kanji run).

### Validation

- `validate.rs` — orchestration root (definitions present → schema-quality
  walk; + params → params-vs-schema checks).
- `validate/schema.rs` — params-vs-schema validation (`required`,
  type/range/length/enum — membership matches each `EnumEntry`'s VALUE,
  `params_unknown_key` — the unknown subtree is NOT entered, the
  hostile-recursion guard; blank values skip checks; locations in the
  `key` arg, never `path`; values never echoed) + the definitions
  quality walk (`definitions_format_ignored`,
  `definitions_enum_labels_ignored` — labeled entries on a non-text
  field).
- `validate/document.rs` — the `document:` block: the two list caps plus
  the same interpolation-key and suspect-key checks the drawn strings
  get, addressed `document.<key>` / `document.<key>[n]`. Catalog-free —
  it runs with or without definitions.
- `validate/bindings.rs` — scalar/interpolated keys incl. per-span and
  `link.url`; `BindingCtx`; the shared `walk_text` skips segments whose
  name the item declares. `validate/bindings/decl.rs` — the `bindings:`
  declaration checks (name charset, per-declaration routing through
  `DeclCtx`, `unused_binding`, shadowing, the suspect-key sweep);
  `decl/surfaces.rs` — the pure item-shape half (which map an item
  carries, which strings it interpolates); `validate/bindings/cell.rs` —
  cell/card/`cell:`-column bindings, array-scoped; `scope: document`
  routes to the scalar check so the escape keeps full checking;
  `validate/bindings/entry.rs` — a `list`'s ENTRY scope, one level
  further in: its source key (a `scope: document` one names an array, so
  it is checked against the declared SOURCES, not the scalars) plus every
  per-entry `text:` segment and element-scoped declaration against the
  bound array's `items:` fields. Silent for an `Undeclared` element.
- `validate/marks.rs` — form-mark checks (content conflicts, boolean-ness,
  data keys; `TextItem.mark` walked the same way).
- `validate/equals.rs` — what a declarative `{ key, equals? }` binding can
  be checked against BEFORE any params exist, shared by marks and table
  row conditions so the two cannot drift: `EqualsTarget` (a leaf, or an
  array source carrying its element spec — the multi-select form),
  `reads_as_boolean` (only a boolean LEAF does), and `equals_fault` =
  wrong scalar kind | outside the declared `enum`. Literals are never
  echoed.
- `validate/tables.rs` — table checks: bound array group, per-column
  content shape, row-relative keys, `cell:` sub-template bindings, and the
  `conditionalStyles` predicates.
- `validate/collect.rs` — table/image walks + the `RepeatRef` walk
  normalizing repeat+repeat_flow + depth cap + generic `walk_sections`.
  **Every walk here descends into a table column's `cell:` — and so do
  the three walks that keep their OWN recursion: `validate/marks.rs`,
  `validate/styles.rs`, and `engine/image`'s cell walk. A new
  cell-bearing key must be added to each.**
- `validate/styles.rs` — named-style refs (spans, shapes, text mark,
  conditional-style entries included). `validate/shapes.rs` — inert keys
  on shape styles. `validate/spans.rs` — span shape + inert span keys.
  `validate/ruby.rs` — ruby entry caps/emptiness. `validate/formats.rs` —
  format-name checks + pattern-on-non-dated. `validate/box_keys.rs` —
  context-inert authoring keys (flex/grid keys on leaves, grid keys
  without `type: grid`, table pagination keys off-flow).
- `yaml_guard.rs` — rejects non-finite numbers; no size caps (string
  inputs must bound what they echo). `error.rs` — `CoreError` incl.
  `Located` (echoed path/message clipped; fields map into typed
  diagnostic args).

## engine/diagnostics — the structured-diagnostic type + registry

- `lib.rs` — `Diagnostic { severity, code, category, message, path?,
  args, origin? }` (builder API; severity/category/message derive from
  the registry; `origin` = `#[track_caller]`, non-contract);
  `Diagnostics::dedup()` collapses `(code, path, message)` duplicates at
  output boundaries (end of `validate()`/`layout()` + CLI post-extend);
  `Diagnostics::set_missing_paths(from, path)` back-fills the location of
  everything pushed since `from` that carries none — the hook a walk uses
  to locate diagnostics its emit sites could not (out-of-range `from` is a
  no-op, never a panic).
- `code.rs` — `DiagnosticCode`: the closed, append-only code registry —
  one `diagnostic_codes!` table maps each variant → wire string +
  severity + category + English `{arg}` template (`ALL`/`as_str`/
  `from_wire`). The complete code list: `docs/engine/diagnostics.md`.
- `category.rs` — `Category` (semantic domain). `arg.rs` — `ArgValue`
  String|Number|Bool (strings control-char-stripped + clipped;
  non-finite clamped). `render.rs` — single-pass `{name}` template
  substitution (arg values never re-scanned).
- `echo.rs` — **the workspace's ONE bounded-echo guard**, and the type
  that applies it structurally. `sanitize(s, max)` strips control
  characters (log/terminal-injection guard) AND the bidirectional
  formatting characters (the "Trojan Source" family — NOT control
  characters, so `char::is_control` misses every one of them; ZWJ/ZWNJ
  are deliberately kept because they carry meaning in real text), then
  clips by CHARACTER
  count — in that order, so a hostile string cannot pad itself to push
  an escape past the cap; `sanitize_marked` adds the `…` truncation
  marker (and must filter by the same predicate, or the marker lies). Caps: `MAX_ECHO` 200 (one echoed value — a field path, a pack
  id) and `MAX_MESSAGE` 400 (a whole assembled message at a host
  boundary), with a `const` assertion that the message cap is not the
  tighter of the two. `Echo` is the guard as a FIELD TYPE: an error
  variant declaring `Echo` instead of `String` cannot be constructed
  with unsanitized text, so the decision survives the next variant
  somebody adds. It `Deref`s to `str` and compares against `&str`, so
  it drops into code that held a `String`. `Echo::clipped_to(s, max)`
  is for values the DOMAIN bounds more tightly (a locale id at 64, a
  currency code at 32). **`Echo::inline`** is the third flavour: the
  cap for a value composed INTO a message that then occupies ONE arg
  (`MAX_INLINE_ECHO` 80, asserted at compile time to be at most half of
  `MAX_ECHO`). Without it the value eats the arg budget and the prose
  explaining the failure disappears — which is the moment a reader needs
  it. Prefer a value's own arg where the code's template allows one;
  `invalid_image_asset`/`invalid_image_data` are single-`{detail}` slots,
  which is why they clip instead. **`Diagnostic::with_path` does NOT
  sanitize** — nearly every path is engine-built from indices, but the two
  builders that interpolate a document-declared NAME (`formats.<name>`,
  `<path>.bindings.<name>`) apply `Echo::inline` themselves. Consumers: `CoreError`, `PackError`,
  `LangPackError`, `FontError`, `FetchError`/`TransportError`,
  `FsPackError`; the per-site caps in `format/money.rs`,
  `lang/era.rs`, `core/length.rs`, `layout/color.rs`; and every host
  echo boundary (CLI stderr + its diagnostics lines, the `--report`
  sidecar, the capi status wire, the MCP JSON-RPC error, the wasm
  thrown `Error.message`).
- `CoreError::to_diagnostic()` (in core) maps located parse errors →
  diagnostics.
