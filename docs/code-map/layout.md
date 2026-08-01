# Code map — engine/layout-box, engine/layout

> AI-only, token-dense. Index + repo-wide conventions: [CLAUDE.md](../../CLAUDE.md).
> Read this BEFORE searching or editing the covered dirs; update it in the
> same PR whenever files/modules/boundaries here change. Granularity: file
> role + load-bearing contracts. Behavior/spec detail (defaults, caps,
> diagnostics, CSS semantics) lives in `docs/engine/` (layout-model.md +
> the feature pages), not here.

## engine/layout-box — pure box-model math (no fonts/params/assets)

- `lib.rs` — `Basis`: the `%` bases + em/rem font bases.
- `resolve.rs` — guarded resolution (`resolve_x`/`resolve_y`/`resolve_edges`,
  the `MAX_RESOLVED_PT` cap) + `clamp_size` (min>max>size CSS-order clamp).
- `resolved.rs` — `ResolvedBox`: one `OptBox` resolved (margins/padding/
  border-box, `margin_auto` flags, `w_or_fill`/`content_*`/`clamp_h` helpers);
  deliberately y-less — vertical placement is the walk's job.
- `flex.rs` — flex distribution math, axis-generic pure fns
  (`main_spacing`/`cross_offset`/`auto_share`/`equal_share`/`grow_shares`).
- `grid.rs` — track math (`equal_track`/`track_offsets`).

Wire types stay in core; content measurement stays in layout.

## engine/layout/src — positioning

- `engine.rs` — module root: shared engine state; the
  `LayoutInput`/`LayoutOutput` `{ document, boxes, margin, diagnostics }`
  wire; `Ctx` (the `inherited` style cascade, the `scope` data axis, the
  `path` segment stack joined by `current_path()`, the once-per-key warning
  ledgers — all parked by `begin_measure` — and `page_margin`, the resolved
  page margins the cut marks read). `Atom` lives here; `Basis` re-exported.
  **`enter_item`/`leave_item` are the ONLY way the path stack moves**: the
  pair pushes a segment and, on the way out, stamps that address onto every
  diagnostic the node emitted without one (`Diagnostics::set_missing_paths`).
  Inner nodes leave first, so the deepest wins and a diagnostic that named
  its own location keeps it — which is how free functions, the flow
  paginator and `shojiku-layout-box` get located without a `Ctx`. A
  diagnostic raised before any descent stays unlocated (document scope).
- `engine/assemble.rs` — `layout()` itself: cascade root, page basis
  (margin box; degenerate axes fall back), body walk, then per-page
  header+body+footer assembly in sheet coordinates. Re-exported so
  `engine::layout` is unchanged. Spec: `docs/engine/layout-model.md`.
- `engine/path.rs` — `placed_box(path, id, rb, w, h)`: the ONE
  structural-path placement builder every atom calls (id-less items
  included).
- `engine/translate.rs` — whole-item y/x shifts, recursing into clip groups.
- `engine/resolve.rs` — thin `Ctx` bridges to layout-box; color/font/border
  sanity guards; `resolved_chain` (the font-resolution funnel); the layered
  `resolve_style` (engine default ← inherited ← named styles in listed
  order ← inline).
- `engine/flow.rs` — flow/absolute item walks; `engine/flow/layouter.rs` —
  `FlowLayouter`, the paginating cursor (page breaks, the `MAX_PAGES`
  runaway cap, atom placement = vertical fit + horizontal-overflow check).
- `engine/band.rs` — header/footer + `page_number` (vertical_rl routes to
  `vertical_text_block`).
- `engine/decoration.rs` — box decoration shared by text blocks/containers/
  repeat cells/images/table frames: `push_decoration` (uniform border stays
  ONE `RectShape`; returns the `Corners` painted so `overflow: hidden`
  clips to the same box; per-side/`double` emit edge-centered bands via the
  pure `push_side_borders`); `decoration/dash.rs` (`dash_pattern`, the pure
  keyword→interval table, floored); `decoration/radius.rs`
  (`corner_radius`/`resolve_corners` — `borderRadius` → `Corners`, per-axis
  `%`, hostile values → square; `warn_radius_ignored` shared reporter).
- `engine/atoms.rs` — rect/image/line atoms (rect routes through
  `push_decoration`); margins fold into every atom via
  `with_vertical_margin`, so flow/absolute/container placement space them
  identically.
- `engine/cell.rs` — the ONE slot-filling, data-scoped cell shared by
  `repeat` and table `cell:` columns: `layout_cell_slot(cell, CellSlot,
  Scope) → CellFill` (definite or auto-height slot); also
  `begin_measure`/`end_measure` — parks diags AND the warning ledgers so a
  measure pass is silent without eating the render pass's warnings.
- `engine/container.rs` — container box + cascade push/restore +
  `absolute_child_atom`; `clip_children` (`overflow: hidden` wraps children
  in a `Clip`).
- `engine/flex.rs` — `layout_box_children`, the shared container/cell
  child-walk: children with no authored `box.x`/`box.y` are flex items
  (column default, `direction: row` side-by-side), others stay absolute;
  `Atom.rb` carries each child's `ResolvedBox` so offsets never re-resolve.
  `engine/flex/offsets.rs` (row pre-pass + column/row cross math);
  `engine/flex/baseline.rs` (`alignItems: baseline` via first-text
  baselines).
- `engine/link.rs` — `link:`: `resolve_link` (scope-aware interpolation) +
  `check_link_url` (scheme allowlist + length/control gates) — layout is
  the trust boundary; renderers emit what the tree carries.
- `engine/qr.rs` — `type: qr_code`: layout-time qrcodegen encode →
  RLE-merged module `RectShape`s; scope-aware content, so per-element in
  cells.
- `engine/list.rs` — `type: list`: scope-aware array → one line/entry,
  per-entry ellipsis, overflow `{count}` line; routes `VerticalRl` to
  `engine/list/vertical.rs` (right→left columns, axis-swapped overflow
  column, shared `vcol` down-clamp).
- `engine/predicate.rs` — the shared `{ key, equals? }` truth table
  (`eval_predicate` → Apply|Skip|TypeMismatch|NotBool), `Ctx`-free; used by
  form marks AND table conditional row styles.
- `engine/marks.rs` (+ `marks/presence.rs` — `mark_drawn`, the
  binding→draw/skip evaluation, scope-aware) — `type: ellipse`/`checkbox`:
  box-reserving atoms whose geometry is params-independent (blank↔filled
  one-template invariant); `shape_paint` = the ONE unified-Style→uniform-
  paint reduction shared with the text mark; emits `LayoutItem::Path`.
- `engine/grid.rs` — static grid (`box.type: grid`): column tracks + fill
  order + auto/explicit row heights + spans; `engine/grid/tracks.rs`
  (track resolution + `fr` leftover via `grow_shares`);
  `engine/grid/span.rs` (`Occupancy` + pure fill-order placement).
- `engine/repeat.rs` — imposition/n-up: `place_repeat` tiles a data array
  into a rigid columns×rows grid, paginating; `breakBefore: auto` starts
  at the flow cursor with a shorter first page; emits per-page box-index
  fragments via `Fragments`. `repeat/pages.rs` (the PURE page math:
  `first_page_rows`/`GridPages::locate`/`page_rows`/`page_top`);
  `repeat/marks.rs` (cut marks / registration marks: pure `cut_marks` geometry +
  `Ctx::place_cut_marks`); `repeat/cell.rs` (`layout_cell` — the repeat
  face of the shared cell, always-definite slot).
- `engine/repeat_flow.rs` — flow repeat: one element-scoped auto-height
  card per element, stacked and paginating card-by-card; emits `Fragments`.
- `engine/char_grid.rs` — `type: char_grid` (genkoyoshi): `GridPrep`
  resolution, sheet counting, flow places full sheets; bands/absolute/
  containers draw ONE sheet. Submodules: `geom.rs` (pure cell/block →
  page-coordinate math, writing-mode aware), `clamp.rs` (`clamp_markup` —
  large-writing scale/placement clamps), `markup.rs` (`markup: aozora` parse →
  segments + diagnostics), `cells.rs` (pure cell assignment: school
  kinsoku via `cells/place.rs`, tate-chu-yoko via `cells/combine.rs`
  (`CombinedDigits`), sheet breaks, `Indent`; `cells/span.rs` — large-writing n×n
  block placement; `cells/align.rs` — post-assignment end-shift),
  `glyph.rs` (`CellFrame` + per-cell placement incl. vertical one-cell
  columns), `sheet.rs` (per-sheet atom: stroked cell rects + shared
  `TextBlock`s), `ruby.rs` (readings along base runs, scale-aware,
  vertical readings ride the GSUB `vert` path).
- `engine/table.rs` — table root: `place_table` flow pagination, repeating
  headers, table-level `keepTogether`, and the shared `Fragments`
  (`engine/fragments.rs`: per-page item box-index rects used by table/
  repeat/repeat_flow). Submodules: `table/geom.rs` (column widths/row
  heights/`cellPadding` guards), `table/rows.rs` (`Cell`/`CellContent`
  dispatch + `CellPath` — where a cell's CONTENT is authored, ONE address
  per cell serving BOTH the diagnostics descent and the box-index path
  (`segment()`): `Column(n)` → `columns[n]`, `Group(n)` → a
  `headerGroups` cell's own `headerGroups[n]`, and `Synthesized` (the
  uncovered trailing header cell, the all-empty collapse) → no segment,
  so no box and diagnostics stay on the table. The row passes that
  descend per cell (`measure`, `row_atom`'s draw loop) share
  `segment()`; prepare's binding resolve descends into `columns[{col}]`
  itself — and `row_atom`; vertical text cells fill via
  `vertical_text_block`), `table/rows/measure.rs` (`measure_row`: auto-row
  height, measuring via `column_extent` — the untrimmed upper bound so a
  measured row never re-wraps), `table/rows/prepare.rs`
  (one `Rc`-shared row element feeds every `cell:` column's `Scope`),
  `table/rows/cell.rs` (`cell:` columns:
  `measure_cell`/`cell_container` — the cell fills the column rectangle;
  `cellPadding` does not inset it),
  `table/span.rs` (spanning header groups + `merge_empty`),
  `table/content.rs` (`cell_qr`/`cell_image`), `table/style.rs`
  (grid-border fold, zebra, `cell_valign`/`label_valign` — the authored
  fold that tells "unset" from "resolved to the initial value";
  `style/conditional.rs` —
  `apply_row_conditions` overlaid after zebra, warned once per entry),
  `table/atom.rs` (bounded non-paginating table atom for container/
  absolute/band/grid-cell contexts).

### Text subsystem (`engine/text*`)

- `engine/text.rs` — the text atom: routes `spans` to rich, applies `ruby`
  to every finished surface; shared `align_x`/`valign_offset`; re-exports
  `decoration_spec` (the ONE metric→`DecorationSpec` home) and the `vcol`
  helpers.
- `text/resolve.rs` — the ONE binding choke point: `resolve_content`/
  `resolve_binding` shared by text `data:`/interpolation, spans, qr_code,
  char_grid, table columns, list entries. Takes the OWNING item's
  `&Bindings` explicitly (never `Ctx` state); a declared name resolves
  with the declaration's key/scope/placeholder (inline `:format`
  overrides); `placeholder` suppresses missing-data warns for blank
  values.
- `text/block.rs` — wrapped+aligned plain block: border-box padding,
  overflow-policy dispatch, min/max height clamp; `block/lines.rs` (plain
  line placement, hanging-aware); `block/glyphs.rs` (missing-glyph scan);
  `text/height.rs` (definite-height overflow bookkeeping shared
  plain+rich); `text/overflow.rs` (policy math: `fit_font_size` bisection,
  measured-`…` clamp, line-end-kinsoku-aware).
- `text/paginate.rs` — flow text pagination: auto-height flow text splits
  at line boundaries table-style; `split_parts` = the consuming end of the
  block/rich items-assembly contract; `RubyCarry` re-anchors fragment ruby.
  `text/paginate/vertical.rs` — column pagination for vertical blocks
  (whole-column fragments re-anchored per page).
- `text/rich.rs` — rich `spans` blocks: uniform line grid, same atom shape
  as block.rs so pagination needs no changes; `rich/resolve.rs` (per-span
  cascade, `MAX_SPANS` guard), `rich/lines.rs` (piece→`TextRun`
  positioning).
- `text/vblock.rs` — vertical-writing plain block (`writing_mode == VerticalRl`):
  right→left columns, width-axis overflow policies, per-column side-band
  decoration, `textSpacingTrim`, tate-chu-yoko via `text_combine`.
- `text/vcol.rs` — shared vertical-writing column geometry (vblock/vrich/list/table
  cells): `column_extent` (shaped, `RunOptions`-aware so measure == draw),
  `along_offset`/`column_left`/`stack_shift`, `vertical_decoration_spec`,
  `clamp_column_down`/`trim_to` (line-end-kinsoku- and tate-chu-yoko-aware down-clamp).
- `text/voverflow.rs` — vertical `textOverflow` policy math.
- `text/vrich.rs` — vertical-writing rich spans (`vertical_rich_atom`): axes-swapped
  `TextRun`s, per-run side-band decoration.
- `text/mark.rs` — text-anchored circled-text overlay (paint-only).
- `text/metrics.rs` — inspect text metrics: per-line baseline + cap/em
  band on a text item's `PlacedBox`; pure per-column and per-fragment
  variants reused by the paginator.
- `text/ruby.rs` — ruby on every text surface: the shared matching
  skeleton `match_entries` (in-order, non-overlapping, capped needles) +
  pure locate/split/extent helpers; `ruby/cells.rs` (per-line `Cell`
  builders rebuilt with the SAME options layout measured), `ruby/vertical.rs`
  (readings as upright columns right of the base run, JLREQ; records
  anchors for pagination), `ruby/horizontal.rs` (readings above the base
  run's em band; the line box never grows).

### Wrapping and fonts

- `wrap.rs` — wrapping API + CJK break opportunities; plain and
  hanging-aware wrappers; `wrap_vertical` (same tokenize/kinsoku/hang
  engine measuring per-char *down*-advance; tate-chu-yoko groups measure as one
  cell). `wrap/rich.rs` — the styled-char engine `wrap_spans`/
  `wrap_spans_hung` (tokens cross span boundaries, per-char measurement
  via each span's chain); `wrap/rich/width.rs` (measurement half,
  tate-chu-yoko-aware); `wrap/rich/token.rs` (tokenizer; `textCombineUpright:
  all` runs are atomic); `wrap/kinsoku.rs` (the per-mode kinsoku prohibition
  sets — the single home shared by wrapper, ellipsis clamp, and hang
  pass); `wrap/hang.rs` (the hanging-punctuation post-pass `apply_hang`, at most one
  hung comma per line, shared `hangable` predicate).
- `font.rs` — `FontStore`: `resolve(family, weight, style) → ResolvedFace`
  (declaration-order variant selection, `real_bold`/`real_italic` flags so
  callers drop synthetics), `resolve_chain → ResolvedChain` (the locale
  fallback chain). `font/load.rs` — the constructors: `load_from_pack`
  (FS), `load_from_specs` (host fetch layer seam), `load_from_injected`
  (WASM/MCP bytes), `load_from_injected_subset` (lenient browser preview;
  returns skipped pack ids); all share the sha256/fsType verify in
  `font/verify.rs`. `font/face.rs` — `FontFace`: skrifa metrics, cached
  harfrust `ShaperData`, `glyph_path` outline extraction for PNG;
  `face/pen.rs` (outline→`PathCmd`, y-flip + quad→cubic),
  `face/metrics.rs` (vertical band metrics + hostile-value fallbacks),
  `face/decoration.rs` (underline/strikeout metrics + clamps).
- `font/shape.rs` — fallback-aware HarfBuzz shaping over a face chain:
  `shape_run`/`run_width`/`all_missing` take `RunOptions`
  `{ letter_spacing, trim, line_start, combine }` — the single
  measure/draw home both wrap and the renderers route through;
  `char_width` is the per-char break estimate. `shape/trim.rs` (half-width punctuation
  post-pass, engine-synthesized, deterministic across faces — the
  `is_open`/`is_close` class tables); `shape/itemize.rs` (same-face
  segmentation, first-covering-face rule); `shape/harf.rs` (the harfrust
  adapter; `shape_segment_vertical` = the top-to-bottom variant, GSUB
  `vert` auto-applied).
- `font/vertical.rs` — the vertical-writing arrangement, the ONE home both renderers
  call so vertical draw == measure: `orientation(c)` (full UAX#50),
  `down_advance` (the wrapper's break estimate), `arrange_vertical(…) →
  Vec<VGlyph>` (final cell-relative draw positions; renderers only
  translate/rotate/scale), `vertical_extent`. `vertical/shaped.rs` (the
  shaped arrangement: upright segments TTB, rotated segments horizontal;
  `degrade_chars` = the shaper-less per-char path); `shaped/combine.rs`
  (tate-chu-yoko combined cells, compress-never-stretch); `shaped/trim.rs`
  (vertical half-width punctuation, axes-swapped); `vertical/uax50.rs` (GENERATED by
  `scripts/gen-uax50.py` — regen via the script, never hand-edit);
  `vertical/forms.rs` (presentation-form + cell-offset tables: char_grid
  substitution AND the degrade path).

### Cross-cutting

- `style.rs` — `ComputedStyle` all-concrete (+ `rem_root`) + cascade
  primitives `base(inherited)`/`overlaid(&Style)`.
- `color.rs` — color parsing.
- `boxes.rs` + `boxes/text.rs` — the `BoxIndex`/`PlacedBox` sidecar:
  per-page border+content boxes for EVERY laid-out item (the GUI overlay
  surface via `inspect`; NOT part of the renderer contract).
  `PlacedBox.path` = the always-present structural address in the
  validate-diagnostic grammar; `id` = the optional authored alias;
  `PlacedBox.text` = the two-form (horizontal lines / vertical columns)
  metrics wire.
- `tree.rs` — **`LayoutDocument`: the ONLY layout↔renderer contract**.
  Text types in `tree/text.rs` (+ `tree/text/view.rs` — `RunView`/
  `line_runs`, the ONE runs view both renderers draw); corner/dash
  vocabulary in `tree/round.rs` (`Corners`, `Dash`, `rounded_rect_cmds` —
  the ONE rounded-rect path both renderers replay). Shapes carry
  radius/dash/opacity/link; `LayoutItem::Path` (form marks),
  `LayoutItem::Clip` (the one nested node, renderer recursion capped);
  `TextBlock` carries spacing/trim/synthetics/decoration/baseline/
  runs/fallback_ids/`vertical`/`text_combine` — layout decides, renderers
  execute.

### Near-e2e suite (`layout/tests/e2e/`, one binary)

Modules mirror the src module they target: `atoms`/`band`/`bindings/`
(carriers/scopes/precedence)/`char_grid/`/`container`/`flex/`/`flow`
(+`page_break`)/`grid`/`link/`/`repeat/`/`repeat_flow/`/`table/`
(geom/rows/style/boxes (+`boxes/groups` — the `headerGroups` box
addressing)/vertical)/`text` (+ overflow/paginate/glyphs/
decoration/rich/line_break/spacing_trim/hanging/ruby/ and the vertical
family: vertical, vertical_degrade, vertical_rich, vertical_knobs/,
vertical_combine/, vertical_ruby/, vertical_paginate/)/`style`/
`decoration/`/`qr`/`list/` (+vertical, vertical_combine)/`page_margin/`/
`page_orientation` — plus cross-cutting `format`/`defaults`/`limits`/
`units/`/`box_model/`/`min_max/`/`boxes`/`clip/`/`marks/`/`text_metrics`/
`diagnostic_paths/` (contexts/emitters/columns/hostile — every diagnostic
names its item; targets the `enter_item`/`leave_item` pair, not one src
module),
with `common.rs` fixtures.
