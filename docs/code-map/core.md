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
  stable. `template/kind.rs` — `ItemKind` (the 15 `type:` values,
  `ALL`, `as_str`) + `Item::kind()`: the kind without the payload, which the
  fact tables key on and a walk that only needs to know the kind can match.
- `template/sections.rs` — `Sections::item_lists`: each present
  section's top-level items with its path prefix (header, body, footer),
  and `Body::items` (a flow or absolute body's top-level items).
  The one place a walk learns where items live — validate's walks and
  `engine/image`'s preparation walks start here (all but
  `validate/box_keys.rs`, which needs the body's flow/absolute kind), so
  none covers the body and forgets the bands layout also draws.
- `template/children.rs` — `Item::child_lists`: the boxes of items an
  item nests, as `ChildList { holder, container, array_key }` — the
  `ContainerItem` itself (its own `styleNames` as well as its `items`),
  which of the four holds it (`ChildHolder`: a `container`, a `repeat`
  cell, a `repeat_flow` card, a table column's `cell:`), and the array a
  data-scoped box is placed for (`None` = the parent's scope).
  `ChildList::box_path` / `items_path` give the box's and its list's
  template paths. The match spells every leaf kind out, so a new nesting
  kind must declare its boxes here. The descent step every item-tree walk
  in `validate` and `engine/image`'s preparation takes (see
  `validate/collect.rs` below).
- `template/items.rs` — the drawn leaves: `TextItem` (incl. `mark`,
  `bindings` — ONE map per item serving its `text`/`link.url` AND its
  spans), `RectItem` (unified `Style`, no default stroke), `LineItem`,
  `ImageItem` (+ `ImageFit`); re-exports the split-out file below so
  `shojiku_core::X` paths are unchanged.
  `template/items/generated.rs` — the leaves the ENGINE fills in rather than
  the author drawing: `QrCodeItem` (+ `EcLevel`), `ListItem` (per-entry
  `text` template + `overflowText`), `PageNumberItem`, `PageBreakItem`. Split
  purely for the line budget when every item struct gained `visible:`.
- `template/visibility.rs` — `VisibleBinding { key, equals?, scope?,
  collapse? }`, the `visible:` key EVERY item struct carries. The predicate
  is the mark's, re-declared rather than `#[serde(flatten)]`-ed (flatten
  silently disables `deny_unknown_fields`, which would let a misspelled key
  through); `collapse()` picks between reserve-the-box and remove-it.
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
  padding, flex keys, min/max bounds, `flexGrow`, `columnSpan`/`rowSpan`).
  `geometry/point_spec.rs` — `PointSpec`, the `line` endpoint (only
  `LineItem` uses it): a two-arm enum, `Xy { x, y }` (both axes full
  `Length`s, so a bare number is pt and `"100%"` reaches the edge of
  whatever box the line sits in) or `Anchor(AnchorPoint { item, edge,
  offset })`. HAND `Deserialize` over an all-optional
  `deny_unknown_fields` helper, because serde's untagged path would stop
  naming the offending key; per-variant `Serialize` keeps both authored
  forms byte-exact. `schema/point.rs` states the two arms rather than
  forwarding the permissive helper.
  `geometry/page_margin.rs` — `PageMargin` (bare | per-side, authored
  form round-trips; the removed positional array is refused with a
  migration hint; the margin box is the coordinate origin). `geometry/flex.rs` — flex wire enums (`BoxType`/
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
  (re-exported). `style/decoration.rs` — `TextDecoration`'s hand-written
  serde: one keyword or `underline line_through` (either order, canonical on
  write) + `underline()`/`line_through()`. `style/shapes.rs` — non-cascading `LineStyle` (the one
  shape off the unified `Style`). `style/inert.rs` — the context-inert
  keys, `Style::ignored_on(Surface)` (+ `ignored_span_keys`), derived from
  `facts::painted_by` minus what layout reports itself (a form mark's
  `borderRadius`). `style/key.rs` —
  `StyleKey` (one variant per `Style` field, `ALL` in field order, `as_str`
  = the wire name) + `Style::is_set`; a test holds the key set equal to the
  fields the wire writes, so a field without a key reds.
  `style/writing.rs` — vertical-writing vocabulary: `WritingMode`
  (canonical home; char_grid re-uses it), `TextOrientation`,
  `TextCombineUpright` (tate-chu-yoko; `active()` → the layout/tree carrier
  `TextCombine`). The inherited-vs-not split per property is documented in
  `docs/engine/style.md`.
- `facts.rs` + `facts/` — the engine's per-key facts about the style
  wire, each an exhaustive `match` over `StyleKey`: `inherits` (the 14/10
  CSS split the layout cascade applies), `initial` (the document-root value;
  `line_initial` for the `line` item's `LineStyle`; `surface_initial` for
  the surfaces that start a key elsewhere — a form mark's 1pt outline, a
  table's and a char_grid's 0.5pt ruling, a table's middle-aligned cells,
  and `Initial::FromSurface` for a char_grid's cell-relative glyph size;
  `LIST_OVERFLOW_TEXT`, a list's `+{count}` overflow line, read by layout's
  horizontal and vertical list and by the catalog),
  `range` → `ScalarRange` (the guard bounds and fallbacks, on the RESOLVED
  pt for the two lengths; `LINE_WIDTH`, and `OPACITY` shared with the line
  stroke), and `facts/paint.rs` — `painted_by` → the `Surface`s
  (`Item(ItemKind)`, `Span`, `Mark`, `Document` = `defaults.style`) that
  paint with a key on their own `style:`, read from the layout consumers;
  `takes` adds what inherits into held content (`holds_content`: container,
  table, document). A table's own layers (column, row, header) are not
  covered yet. Read by layout's guards (`sane.rs` takes every bound and
  fallback from the range consts; the mark outline, grid ruling and table
  cell alignment defaults from `MARK_STROKE_PT` / `GRID_STROKE_PT` /
  `TABLE_CELL_VERTICAL_ALIGN`), by `style/inert.rs`, and by the key catalog
  (`engine/authoring` `reference/facts.rs`); `facts/tests.rs` holds each
  form mark's row on its own and every initial value against the parser,
  and `shojiku-layout`'s `style/tests/facts.rs` holds the inheritance and
  initial rows against `ComputedStyle`.
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
  `definitions/shape.rs` — `check_depth`, the `MAX_SCHEMA_DEPTH` walk over
  the pass-1 tree that `parse::typed` runs BEFORE the typed parse (the
  typed `Schema` recursion is what it protects; same Located path + message,
  same pre-order: `items`, then `properties` in key order), plus the
  post-parse walk enforcing the node/enum caps + structural-key checks as
  Located errors (incl. labeled entries need a scalar `value`).
- `parse.rs` — two-pass typed parse shared by template/definitions:
  `read` (the `yaml` door below → `CoreError::from_yaml`), then the
  caller's `Bound` over the door's tree, then pass 2, the door's typed read
  of the source → `CoreError::Located` (path + line/column). **The door's
  depth bound (`MAX_DEPTH` = 120) keeps the walks over the pass-1 tree
  stack-safe. It does NOT bound the TYPED parse — the tagged-enum
  buffering is a second recursion, far deeper per level — which is what the
  `Bound` is for: `parse/nesting.rs` for a template, `definitions/shape.rs`
  `check_depth` for definitions. A new recursive wire type needs its own
  bound there, not a post-parse cap.** A non-string key — which the
  tagged-enum buffering would read as a field NUMBER (`5:` on a container =
  `items:`, slipping past nesting's `items:` count) — is the door's refusal,
  pinned in `template/tests/non_string_keys.rs` by a 61-deep `5:` chain on a
  2 MiB thread.
  `parse/trail.rs` — `Trail`: the path the template walks (nesting)
  carry as BORROWED segments, spelled only when one reports (the
  `yaml` door spells its refusal paths through it too). Formatting the path at every node copied the whole prefix per
  child — a long explicit key over a long sequence was quadratic inside
  the input cap; pinned by a 1 MiB key × 200k elements under a deadline.
  `parse/nesting.rs` — the template bound: counts nesting of `items:`
  SEQUENCES whatever the `type` beside them (every Item-in-Item passes through
  one; a superset of what the typed parse and `locate` descend), refusing past `MAX_CONTAINER_DEPTH`
  as `CoreError::ContainerDepth` → `container_depth_exceeded` with validation's
  own path (the nearest sequence element: the item, or the table column) —
  pinned against validate by a parity test over both bands, both body kinds,
  a container, a repeat cell, a repeat_flow item and a table column cell. A
  path of structural keys (each bare or with one numeric index) is kept whole
  (validation's is not clipped); any other path is echoed.
  Internally-tagged enums truncate the error path to the enum boundary;
  for a TEMPLATE, `parse/locate.rs` then follows serde's OWN first failure
  down the pass-1 tree, one buffered node at a time: the node at the
  reported path (`sections.body`, or a band's `items[i]`) is read as the
  variant struct its tag names (`parse/locate/variant.rs`: `FlowBody` /
  `AbsoluteBody`, one arm per `ItemKind`, from the node without `type:`,
  through `yaml::trace` — `yaml/strict.rs`, the tree read as serde's
  buffered re-read (`ContentDeserializer`) reads it where the door's read
  differs: `null` a unit value, `{}` a unit, `{}`/`[]` a unit struct, a
  non-negative integer unsigned — keeping the path as `serde_path_to_error`
  segments); when that read fails with the reported `Fault` at a path
  entering an `items:` element, the failure is inside that item and the
  same read is made on it. No candidate is compared, so a failure in a
  section's or container's own fields that an item repeats exactly stays
  theirs. It reports the deepest item reached, `key` (the item's own
  top-level key: the failure one map segment below the item and a
  `Fault::UnknownField` naming it; deeper keys such as `box.style` are not
  named) and no line/column (`CoreError::Located.key`); a failure in the
  body's own fields, or any disagreement between the strict read and
  serde's (an enum's wrong shape is worded differently), keeps serde's
  error or stops at the item last confirmed.
- `params.rs` — params parse (the door's tree → `serde_json`) +
  `resolve_path` dotted lookup + `is_blank`
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

### JSON Schema for the key catalog (`schema` feature, non-default)

- `schema.rs` — module root, compiled only under `#[cfg(feature =
  "schema")]`: the `SIDES` key order, `per_side_map` (the
  `{top/right/bottom/left}` closed-map shape all three border properties
  parse by hand), and `sub::<T>` (a `$ref` into `$defs`). Every wire type
  in this crate carries `#[cfg_attr(feature = "schema",
  derive(schemars::JsonSchema))]`; these files exist for the **types
  whose `Deserialize` is hand-written** (`TextDecoration` among them, in
  `schema/border.rs`), where the derive would describe
  the Rust shape instead of the accepted wire form. Living out of the wire
  files is what keeps `definitions/schema.rs`, `edges.rs` and
  `style/border.rs` under the 300-line budget.
  **A hand-written schema fails toward being too WIDE** (a `*Repr`
  delegate says "any number or string" where `flexBasis` takes `content`
  or `0`), which is the direction that misleads an agent — so each is
  pinned two-sidedly in `schema/tests/`: every declared form parses
  through the real `Deserialize`, and one excluded form does not. That
  pair never evaluates a string arm's `pattern`, so the length and track
  patterns get a third check (`strings_agree`): the pattern itself, run with
  `regex-lite` (a dev-dependency), must give the parser's answer on a list
  of strings both ways (`schema_narrower` lists where the catalog is
  deliberately narrower) — the patterns are anchored at both ends and use
  only classes every regex dialect reads alike (`[0-9]`, an explicit
  whitespace class, an escaped `-`), which `patterns_use_only_portable_classes`
  holds.
- `schema/length.rs` — `Length` (number | unit-suffixed string),
  `FlexBasis` (`content` | `0`), `GridTrack` (number | `auto` | `<n>fr` |
  length), `TrackSpec` (integer count | track sequence).
  `schema/edges.rs` — `EdgeValue`, `EdgeSpec` (number | `$ref`
  `EdgeMapRepr` — the one genuinely delegated arm), `PageMargin` (the
  two `EdgeSpec` forms), `PageSize` (8 names | `{w,h}`).
  `schema/border.rs` — `BorderWidth`/`BorderColor`/`BorderStyle` (scalar |
  per-side map) + `TextCombineUpright` (`none`/`all` | `{digits: 2..=4}`).
  `schema/value.rs` — `EqualsValue` (scalars only), `EnumEntry`
  (`LabeledEnumValue` | bare scalar).

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
- `validate/bindings.rs` — scalar/interpolated keys incl. per-span,
  `link.url` and a table's header labels (`columns[].label`,
  `headerGroups[].label`: top-level scope, as layout reads them);
  `BindingCtx`; the shared `walk_text` skips segments whose
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
- `validate/presence.rs` — the checks BOTH presence surfaces share: a form
  mark's `data:` and any item's `visible:` (content conflicts, boolean-ness,
  data keys; `TextItem.mark` walked the same way). The pre-params checks are
  identical for the two, so the walk is shared and only the DIAGNOSTIC CODES
  are a parameter (`FaultCodes`) — each message names what the fault costs
  ("mark not drawn" vs "item not shown"). The `visible:` hook runs for every
  item, ahead of the mark-specific arms.
- `validate/equals.rs` — what a declarative `{ key, equals? }` binding can
  be checked against BEFORE any params exist, shared by marks and table
  row conditions so the two cannot drift: `EqualsTarget` (a leaf, or an
  array source carrying its element spec — the multi-select form),
  `reads_as_boolean` (only a boolean LEAF does), and `equals_fault` =
  wrong scalar kind | outside the declared `enum`. Literals are never
  echoed.
- `validate/tables.rs` — table checks: bound array group, per-column
  content shape, row-relative keys, `cell:` sub-template bindings, and the
  `conditionalStyles` predicates (+ the `scope: document` a row
  condition ignores, warned without a catalog like the entry cap).
- `validate/collect.rs` — table/image walks + the `RepeatRef` walk
  normalizing repeat+repeat_flow + depth cap + generic `walk_sections`.
  Every walk (and `validate.rs`'s own per-section loops) starts from
  `Sections::item_lists` (`template/sections.rs`), so it covers the
  bands as well as the body.
  **The item-tree walks in `validate` and `engine/image` descend
  through `Item::child_lists` (`template/children.rs`)**; a walk that
  stops at containers filters on `ChildHolder::Container`, and a walk
  that treats some boxes differently decides on `ChildList::holder` /
  `array_key`. Layout's placement walks are separate. The depth cap
  reports an over-deep `cell:` column at `<item>.columns[<i>]`, one
  level above its box. An item list spelled anything but `items:` must
  still be taught to `parse/nesting.rs`, which counts only that
  spelling.
- `validate/styles.rs` — named-style refs (spans, shapes, text mark,
  conditional-style entries included). `validate/shapes.rs` — inert keys
  on shape styles, per surface (`Item::kind()` → `Style::ignored_on`).
  `validate/spans.rs` — span shape + inert span keys.
  `validate/ruby.rs` — ruby entry caps/emptiness. `validate/formats.rs` —
  format-name checks + pattern-on-non-dated. `validate/box_keys.rs` —
  context-inert authoring keys (flex/grid keys on leaves, grid keys
  without `type: grid`, table pagination keys off-flow).
- `error.rs` — `CoreError` incl.
  `Located` (echoed path/message clipped; fields map into typed
  diagnostic args) and `TooLarge` (numbers only, never any of the input;
  maps onto the existing `parse_error` code rather than minting one — a
  refused input never became a document). `from_yaml` is the ONE mapping of
  a door refusal onto the existing variants: `Syntax` → `Parse`,
  `NonFinite` → `NonFinite`, `TooLarge` → `TooLarge`, everything else
  (key, duplicate, depth, range, tag, typed read) → `Located` with the
  door's path and line/column; `in_item` is the re-located one.
- `yaml.rs` (+ `yaml/`) — **`shojiku_core::yaml`, the one YAML door**:
  core's template/definitions/params doors, the formatter's pack doors, the
  authoring reference readers and the mcp gallery/front-matter readers all
  read through it, and every YAML the engine writes (`PackManifest::to_yaml`,
  the round-trip tests) goes out through its `to_string` (`yaml/write.rs`;
  a `Serialize` failure is kind `Write`). The parser is serde-saphyr, and
  `yaml/parser.rs` holds its one configuration (strict booleans, `<<` an
  ordinary key, unknown tags refused, NaN and duplicate keys passed to the
  visitor, `MAX_ALIAS_EVENTS` = 100,000 replayed events per document, budgets
  at or above what 16 MiB holds) and the one `read` every read goes
  through. serde-saphyr appears nowhere else: `engine/clippy.toml` refuses
  its functions and types outside `yaml/{parser,write,error,fault}.rs` (each
  use there under an `#[expect(…, reason)]`), and `engine/deny.toml` bans it
  for any crate but `shojiku-core`. `MAX_INPUT_BYTES` (16 MiB, twice the Designer's
  8 MiB template ceiling) lives here. `parse(input) -> Document` reads into the engine's own `Value`
  (`yaml/value.rs`: Null/Bool/Int/UInt/Float/String/Sequence/Mapping as
  `Vec<(String, Value)>` in document order, `get`, `Serialize`) and makes
  every refusal DURING that one read, in `yaml/build.rs` (the `serde`
  visitor; `build/key.rs` the key visitor): size (`MAX_INPUT_BYTES`), depth
  (`MAX_DEPTH` = 120, counted here; the parser is set a few levels deeper
  so this bound is the one that fires), non-string key, duplicate key,
  non-finite number (`.nan`, and a number past `f64`, which reads as
  infinite; an integer past 64 bits reads as a float), local tag (`!name`,
  refused by the parser and reported as kind `Tag` with the path where the
  read stopped; standard `!!str` tags are the parser's to resolve, and
  `!!int abc` is its own refusal, kind `Syntax`), and aliases past
  `MAX_ALIAS_EVENTS` (the parser's refusal, kind `Syntax`). A path is
  gathered as the error unwinds and spelled through `parse/trail.rs`
  (root = `.`). The read recurses once per level: a document at
  `MAX_DEPTH` needs about 3 MiB of stack in a debug build, and
  `DEEP_DOCUMENT_STACK` (4 MiB) is the thread size tests read one on
  (`on_a_deep_document_stack` in-crate). An empty document reads as
  `Null`. `Document::typed` / `from_str` re-read the SOURCE
  with `serde_path_to_error` (parser scalar rules, line/column; the
  message leads with the path below the root, and `fault` keeps what serde
  failed on, read off the parser's error by `fault::of_parser`);
  `from_value` reads a subtree through `yaml/read.rs`'s `Deserializer` for
  `&Value` (strict: a scalar is the type it was read as, except that a
  `null` where a list or mapping is wanted reads as an empty one, as
  serde_yaml's `from_value` did — an overlay clears a table that way; path,
  no location; its error is `yaml/fault.rs`'s `TreeError`, which keeps what
  serde failed on as a `Fault` — unknown field, wrong type, … with the names
  serde gave — beside serde's own wording); the crate-private `trace`
  (`yaml/strict.rs`) is the same read the way serde re-reads a buffered
  enum (`null` a unit value, `{}` a unit, a non-negative integer unsigned),
  returning the failure's `Fault` and
  its path as segments (`Traced`), for the template parse's locate.
  `YamlError { kind: YamlErrorKind, path, line, column, message }`
  (`yaml/error.rs`, `#[non_exhaustive]`, Echo fields, plus the crate-private
  `fault`, set by both typed reads; the template parse compares the
  each buffered node's re-read from the tree with the typed parse's); `located_message()` renders a refusal as one string
  with its path and line/column after the message (a typed read's and a
  syntax error's message already carry theirs) — what every door with a
  one-string error uses.
  `tests/parse_positions/` (near-e2e) is the golden
  record of what the template/definitions/params doors report on
  broken documents — variant, path, key, line, column, message, or `ok`
  (params: with the JSON read, pinning scalar edges like `yes`, `017`,
  `<<`, `!!str`) — in one `expected.txt`, so the parser swap is read as
  that file's diff.

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
- `code.rs` — `DiagnosticCode`: the closed code registry (never renamed/
  repurposed; removal only after a deprecation release — architecture
  § Deprecation) —
  one `diagnostic_codes!` table maps each variant → wire string +
  severity + category + English `{arg}` template (`ALL`/`as_str`/
  `from_wire`); a deprecated row ends `deprecated(since, removed_in)`,
  read back as `deprecation()`, and a registry test fails once
  `CARGO_PKG_VERSION` reaches a listed `removed_in`. The complete code
  list: `docs/engine/diagnostics.md`.
- `deprecation.rs` — `Deprecation { since, removed_in }` + `is_due_at`
  (major.minor.patch, pre-release ignored so an rc is already due) — shared
  by the code registry and core's `DEPRECATED_FORMS` table.
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
