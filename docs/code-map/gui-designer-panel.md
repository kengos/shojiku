# Code map — gui/designer — property panel + diagnostics

> AI-only, token-dense. Index + repo-wide conventions: [CLAUDE.md](../../CLAUDE.md).
> Read this BEFORE searching or editing the covered dirs; update it in the
> same PR whenever files/modules/boundaries here change.
> Area index + neighbors: [gui-designer.md](gui-designer.md). Granularity:
> file role + key exports + load-bearing contracts.

Covers `panel/`, `diagnostics/`. Shell + tree: [gui-designer.md](gui-designer.md).

Panel-wide postures: pure models never throw — hostile/unreadable nodes
degrade to unset/empty (and hostile list entries still yield rows so
indices stay true); every edit dispatches named designer-core ops (a
multi-part edit is ONE `applyAll` = one undo step); enum vocabularies are
copied from the engine wire (drift-guard tests, never guessed from CSS);
free-text/number inputs are uncontrolled, commit-on-blur with a
changed-guard, keyed by value. **A field whose commit can fail to MOVE that
value additionally carries a reseed nonce** (`useReseedKey`), bumped after
every committing blur — otherwise the entry the commit did not take stays on
screen over a document that never changed. The rule is deliberately not
"reseed on refusal": the widgets ask nothing about how the commit went,
because a commit can LAND and still leave the value alone. A CLAMP does
exactly that (a negative gap to 0, an over-cap pen width), and so does
NORMALISATION (`lengthOp` running `40.0` through `Number`, `metaListOp`
trimming, `equalsLiteral` coercing a numeric `equals`); a landed/refused signal
strands the entry in every one of those cases. `OpResult.ok` and the revision
counter are wrong twice over, since `applyAll([])` reports ok and bumps the
revision for a commit that authored nothing. The only guard is the CHANGED
guard: an unchanged blur reseeds nothing, so a tab-through never remounts.
**The nonce is NOT ambient**: it comes with `StepperField` / `TextField` /
`SeededField`, and a hand-rolled input must wire `useReseedKey` itself. Most of
the ones under `panel/` say so at their own entry below, but that is not a
census in either direction: some entries are silent about it, callers outside
`panel/` are described in the sibling maps, and nothing checks a list or a
count. Grep `useReseedKey(` when you need the real set. Inputs whose builder authors
the typed string VERBATIM need none — the value moves with the entry, which is
why `ComboField`, `contentParts` and `IterableSourceSection` carry no nonce.
With ONE exception to the commit-on-blur posture itself, the static-text chip
editor: besides reporting its in-progress edit so the canvas can render it
before commit (which authors nothing — see `ContentSection` below), it also
commits on UNMOUNT, which no other panel field does. Leaving that field is not
always a blur: a tab switch or a selection change removes it while it still
holds focus, and the browser fires no blur for that, so without the unmount
path the reader's typing was discarded (`gui-designer-chrome.md` carries the
mechanism); capability gates are "undefined = show"
(the bundled engine has the feature), never version sniffs.

## Placement tab — placement + container layout

- `panel/gridStructure.ts` — pure grid column/row plans over the grid's CELLS
  (the flex items; a positioned child or a `line` is never moved, counted or
  dropped), in FILL order (`panel/gridLines.ts`: `relineOps` pads/trims every
  line, `resizeLinesOps` adds/drops whole lines — a column change is the first
  across-then-down and the second down-then-across, a row change the reverse):
  `gridColumnsPlan` (`box.columns` keeps its form — a count is rewritten, a
  track LIST gains copies of its last track or loses trailing ones),
  `gridRowsPlan` (an authored `box.rows` follows — a count is rewritten, a
  longer list trimmed), `gridRowCount`; `{ops, drops}` where `drops` flags
  content-bearing removals (the panel's confirm gate). The grid read they share
  (cells, fill order — through `readContainerNode`, so a frame grid steps
  too) is `panel/gridState.ts`. A grid with a SPANNING cell is
  never re-chunked: the panel withholds the steppers there (`GridSection`).
- `panel/gridTracks.ts` — the column-width / row-height model: `readTracks`
  (absent / a count / a list of `Track` = `auto` | `fr` | `fixed`, an
  unclassifiable entry shown as fixed with its text verbatim; `null` for a
  hostile value), `trackFormOp` (count ↔ list ↔ absent; a count becomes equal
  `1fr` columns or `auto` rows), `trackKindOps`/`trackValueOps` (ONE entry
  replaced in place by removeItem+insertItem — never a whole-list rewrite;
  ingress: an fr weight in [0, `MAX_FLEX_GROW`], a fixed length non-negative
  and ≤ `MAX_TRACK_PT` when absolute, a relative `%`/`em`/`rem` passed
  through), `trackListResizeOps`, `trackCount`.

The container-layout model is a READ/WRITE pair; the write side depends on
the read side, never the reverse.

- `panel/containerNode.ts` — `readContainerNode`, the ONE container
  classification (mode, `box`, child list, which frame it is, or `null` for a
  non-container / hostile `box.type` / unreadable subtree) that the view, the
  multi-key edits and the grid count plans (`gridState`) all read: a repeat
  `cell:` or a repeat_flow `item:` frame counts as a container (`holdsLayout`
  via `frameOf`), a table column's `cell:` does not.
- `panel/layoutModel.ts` — what the DOCUMENT says about a container, over
  `readContainerNode`: `parentContainerOf` (a frame is a parent too), `containerLayoutFor(read,
  path)` (mode/gap/align/justify/height — a repeat cell's slot height counts
  as definite —/column-count/track-list flag/
  split-by-ratio state/per-child `ChildSlot`s from the DOCUMENT alone, never
  the box index; an unset grow weight reads EMPTY, since the engine's default
  depends on whether it can measure the child), `inBasisPopulation` (the flex
  items without a `w` — the children the split-by-ratio checkbox reads and
  writes), `parentContainerOf`
  (direct parent only), `containerKindLabel`, `MAX_GRID_TRACKS`, and the
  `ITEMS_SUFFIX` the write side appends through.
- `panel/layoutOps.ts` — what a control AUTHORS, one key at a time: the
  value-parsing `gapOp`/`gapStepOp` (one ingress rule for `gap` and a grid's
  `columnGap`/`rowGap`, `GapKey`)/`ratioOp` (each refuses (null) rather than
  authoring what the engine would warn on or discard) beside
  `directionOp`/`alignItemsOp`/`justifyContentOp`/`addSlotOp`, which always
  author (typed enums, an always-valid append); the engine vocabularies
  `ALIGN_VALUES`/`JUSTIFY_VALUES` (pinned to the engine enums by
  `layoutWire.test.ts`); the ingress caps `MAX_FLEX_GROW`/`MAX_GAP_PT`.
- `panel/flexParticipants.ts` — which children the engine lays out by flex/grid
  (`isFlexItem`: a `FLEX_ITEM_TYPES` type with no `x`/`y` — never a `line`,
  `page_number`, `page_break` or repeat, several of which have no `box` on the
  wire, so a flex key on one is a parse error) and the grid column each would
  ask for (`trackFor`: its `w`, its weight as `"<n>fr"`, `"1fr"` for a kind the
  engine cannot measure (`UNMEASURED_TYPES`, or `spans` text), else `"auto"`).
  Both sets pinned to the engine source by `layoutWire.test.ts`.
- `panel/layoutModeOps.ts` — the edits that change SEVERAL keys as one batch
  (one undo): `modeSwitchOps` (row / stack / grid, never deleting or
  reordering a child — a row becomes a one-row grid with a column per flex item
  sized by `trackFor`, so it keeps its look, when the host passes
  `trackList` (`grid.fr` + `grid.auto`), else an equal column COUNT, which does
  not; a stack becomes a one-column grid and its horizontal alignment does not
  carry over; a grid going back drops the grid-only keys and the children's
  spans and carries the main-axis per-axis gap into `gap`; a span on a `rect`
  whose box would empty stays, since the pruned box would not parse) and
  `basisOps` (the split-by-ratio toggle over the flex items without a `w`:
  `flexBasis: 0` plus a weight of 1 where none is authored, because the engine
  weighs an unset grow on a zero basis as 0). Both refuse (`null`) over
  `MAX_BATCH_OPS` rather than doing part.

The child-layout surface is a shell + one module per control cluster.

- `panel/LayoutSection.tsx` — the shell: the arrangement `Segmented`
  (row / stack / grid, every mode; an option disabled with its reason as the
  tip when the engine lacks `box.grid` or the batch is refused), then a row's
  or a stack's gap stepper or a grid's `GridSection`, the per-mode clusters,
  and the add-slot only a NON-grid container shows. Takes the host
  `capabilities` (absent = the bundled engine).
- `panel/GridSection.tsx` — the grid half: count steppers, column widths and
  row heights (`GridTrackEditor` per axis, over `readTracks` of the layout
  view's `box`; an absent `columns` reads as one column, a hostile one gets no
  column controls; while any cell spans more than one cell the count steppers
  are replaced by a note naming the child fields that bring them back), then
  `GridGapFields`.
- `panel/GridTrackEditor.tsx` — one axis: a form `Segmented` (columns: equal
  count / per column; rows additionally all-fit-content = no key), the list
  form's `GridTrackRow`s (kind `Select` + a value input for fr / fixed; a kind
  the engine lacks — `grid.fr` / `grid.auto` — is left out unless it is the
  entry's own), and for rows: 「すべて同じ高さ」 disabled with the reason when the
  container has no `h` (the engine drops equal rows there with `percent_of_auto`),
  plus a note when shares or an authored equal count meet no `h`.
- `panel/GridGapFields.tsx` — a grid's `columnGap`/`rowGap` (the shared `gap`
  as placeholder and step base) and the fill-order `Segmented`
  (`gridFillOrderOp`: `column` writes `box.direction`, `row` removes it).
- `panel/GridSpanFields.tsx` — a grid child's `columnSpan`/`rowSpan` steppers
  (`spanOp`: clamped to the column count / 64 FIRST, then 1 removes the key and
  an unchanged value authors nothing), hosted under the
  parent card by `GridSpanSection` only for a flex item in a grid parent
  behind `grid.span`.
- `panel/JustifySelect.tsx` — the distribution dropdown (`justifyContent`):
  a row and a stack always, a grid only over a column-track LIST
  (`offersJustify`); the first three choices named for the main axis; an
  out-of-vocabulary authored value kept as a verbatim option; a note under it
  in a stack with no height of its own.
- `panel/GridSteppers.tsx` — the grid column/row cluster over `gridStructure`
  plans, with the content-drop confirm Modal. Its non-commits — an emptied
  field, a non-finite count, a typed count that rounds to the current one, and
  a typed shrink the confirm then CANCELS — all reseed the stepper, because the
  blur reseeds unconditionally. It used to carry a partial `seed` nonce of its
  own that bumped only on the confirm path; that was the precedent the shared
  mechanism generalized, and it is gone.
- `panel/AlignRow.tsx` — the alignment icon row, its words and glyphs
  following the CROSS axis (`alignChoices`: vertical for a row and a grid,
  horizontal for a stack; `baseline` in a row only, behind
  `box.alignItems.baseline`). A re-pick of the active value authors nothing.
- `panel/BasisCheck.tsx` — the row-only split-by-ratio checkbox (checked /
  mixed / unchecked / disabled when every child has its own width), behind
  `box.flexBasis`; one batch through `basisOps`.
- `panel/RatioRow.tsx` — the ratio inputs of a row (width) or a stack
  (height), one per flex item (the shell passes only those) + the fixed-size
  chip for a child authoring that axis; an unset
  weight is an empty input whose placeholder is "auto" in a row and `0` in a
  stack (what the engine does with it there). Each weight input is its own `RatioInput` component
  so its reseed hook has a fixed home (the slot list is variable-length). Its
  weights stay hand-rolled rather than going through `StepperField`, and the
  reason is the ROW: a ratio is read as `2 : 3 : 1`, so each weight is a bare
  `w-10` box between colons under one shared label, where the stepper renders a
  labelled full-width block with a ▲▼ column beside it. A one-off by design,
  not drift. (It is not the only numeric input outside the stepper — the column
  sheet's width cell, `PointField`'s line coordinates, `NumericComboField` and
  the toolbar's font size are each hand-rolled or stepper-less for their own
  stated reason.)
- `panel/ParentContainerCard.tsx` — the parent-first tinted card hosting
  the same shell for the parent (capabilities threaded through): select-parent
  jump + hover canvas highlight, titled by the frame's own name when the parent
  is a repeat cell / card frame; given the selected child's path it also hosts
  that child's grid spans just below the card (`GridSpanSection`).

## Placement tab — the n-up repeat grid

A `repeat` has no `box:`, so its placement tab carries its SHEET instead
(`panelTabs.placementBody` → `repeatGrid`); its content tab is the shared
`IterableSourceSection`.

- `panel/repeatGrid.ts` — the pure read/write model. `readRepeatGrid` (hostile
  shapes and a throwing read degrade to the engine defaults; an unknown
  `direction` is not echoed as selected; `breakBefore` other than `auto` reads
  as "starts on a new page", non-`true` `cutMarks` as off). Counts are OPTIONAL
  on the wire (default 1), so unlike `charGrid`'s an emptied count CLEARS its
  key; `gridCountOp`/`gridCountStepOp` refuse a non-integer, `< 1`, or a value
  whose product with the OTHER axis as authored passes `MAX_CELLS_PER_SHEET`
  (64 — `MAX_IMPOSITION_PER_PAGE`, pinned by a drift guard reading
  `imposition.rs`); a step starts from the EFFECTIVE value, so unset ▲ gives 2.
  `gridGapOp`/`gridGapStepOp` (per-axis, through `relativeGapOp`, which the
  cards' `gap` field shares; unit-kept, empty clears; the
  container gap's ingress rule widened by one member — a `%` gap is legal on
  this wire — so a negative authors 0, garbage or past `MAX_GAP_PT` authors
  nothing, and ▼ lands on 0), `fillOrderOp` /
  `newPageOp` / `cutMarksOp` never author a default (row order, `page`,
  `false` all REMOVE the key). The `gap` shorthand is read, not edited: it is
  what an unset axis gap falls back to, and an axis edit wins over it exactly
  as the engine reads it.
- `panel/RepeatSection.tsx` — the 「grid on each page」 section over
  `ItemPanelProps`: columns/rows (count steppers, placeholder `1`; at the cap
  ▲ stays enabled and does nothing — `canStep` governs both buttons, and
  disabling it would take away the ▼ that still works; the hint names the
  cap), column/row gap (length steppers by the canvas grid step, placeholder = the `gap`
  shorthand or `0`), the fill-order `Segmented`, and two checkboxes gated on
  their capabilities — "Start on a new page" (`repeat.breakBefore`) and "Draw
  cut marks" (`repeat.cutMarks`). The grid itself needs only `repeat`.

## Placement tab — the char_grid grid

`char_grid` is in `CONTENT_TAB_TYPES` and `STYLED_TYPES` but deliberately
NOT in `BORDERABLE_TYPES`: its `borderWidth` is the GRID RULING width (`0`
turns the ruling off), a different property under the same spelling, so the
border cluster's per-side model must not reach it. Its decoration tab carries
the glyphs' text keys, the fill and the opacity (`ItemDecorationSections`);
the ruling stays here with the grid.

- `panel/charGrid.ts` — the pure read/write model. `readCharGrid` (a
  non-map `grid`, a container where a scalar belongs, or a throwing read
  all degrade to unset; an unknown `writingMode` is NOT echoed back as
  selected). `countOp`/`countStepOp`/`countSteppable` are NOT the shared
  `numberOp`: `CharGridSpec.chars_per_line`/`.lines` are REQUIRED,
  non-`Option` `usize`, so "empty clears the key" would author a template
  the engine cannot parse — empty, non-integer, `< 1` and past
  `MAX_GRID_COUNT` (4096, the layout cell cap) all author NOTHING, and
  the step guard exists because `Number('')` is `0`, not `NaN`.
  `gridLengthOp` keeps the optional keys' clear-on-empty (clearing
  `cellSize` is what returns it to the derived size); `writingModeOp`
  never authors the engine default.
- `panel/CharGridSection.tsx` — the 「manuscript grid」 section, rendered
  in the PLACEMENT tab under the box fields (that is where an author goes
  to change how big the thing is, and for a char_grid `box.w` is not the
  control that does it). Counts step by one whole cell, never by the
  canvas grid; lengths step by the canvas grid. No field is a bare empty
  box — an unset cell side shows `auto` (derived), an unset gap shows `0`
  (the wire default). Capability-gated on `char_grid`. The INK half is a
  sibling component, not more lines here — see below. Its named-style
  picker used to sit at this section's foot, when the type had no
  decoration tab; it now lives in the decoration tab's Styles section like
  every other type's, so the item has one picker.
- `panel/charGridInk.ts` — the ruling / ruby / kinsoku model, split from
  `charGrid.ts` because it reads a different place on the wire: the ruling
  is a STYLE property (`style.borderWidth` / `style.borderColor`) a named
  style can also supply, not part of the item's `grid` map. Written against
  three engine facts, each read from the source and each deciding what an op
  may author: `push_grid_rects` takes `grid_border.unwrap_or(0.5)` and
  returns early on `width <= 0.0`, so an ABSENT key is a 0.5pt ruling and an
  explicit `0` is none; the width is a scalar or a per-side map's TOP side and
  own-before-named by key PRESENCE — the SAME rule a form mark's outline
  follows, so it lives in `uniformBorder.ts` (see the form-marks section) and
  this file only calls it; and `authored()` consults `styleNames`
  (later name wins) then the item's own style and NOTHING below — no
  defaults, no inheritance — so a control here must not badge an effective
  value from anywhere else. An over-cap width (`MAX_STROKE_WIDTH_PT` 1000)
  authors nothing rather than a value the engine answers with a diagnostic
  and ignores. **Empty CLEARS the width**: an absent key IS the documented
  default, so clearing returns the ruling to it, and without that an
  authored width could never be undone except by retyping `0.5`.
- `panel/CharGridInkFields.tsx` — those four controls. The width and the
  ruby size are `NumericComboField`s whose rows carry a SAMPLE (a rule at
  that width, text at that size) and a NOTE, which is how `0` becomes a
  labelled "no ruling" choice instead of a magic number an author has to
  know to type. The width's `''` row and the ruby size's `auto` row carry
  DIFFERENT notes even though both remove the key — they mean different
  values (0.5pt vs 0.4 of the cell), and one string for both said 「既定」
  against 「自動」 with nothing to say what the default was. The ruling
  colour is the shared `ColorSwatchPicker` plus `ui/SwatchValueLabel`,
  which is what says WHICH colour is set while the popover is closed.
  The CHARACTERS' ink (`style.color`, a different property from the ruling
  colour here) and their face/weight/size are on the decoration tab's Text
  section (`CHAR_GRID_GLYPH_KEYS`), not in this cluster. The format toolbar
  still offers nothing for this type (`readToolbar` keys off
  `BORDERABLE_TYPES`).
- `panel/NumericComboField.tsx` — type a value, or open the ▼ and pick a
  common one; the word-processor font-size box, shaped like `FormatPicker`.
  NOT a `StepperField` with a menu: stepping walks a value you already have,
  while this reaches one you cannot spell — a field has either, never both.
  Typing commits on blur, a row commits on click, both through one callback,
  and neither commits when the value did not change. Enter commits by
  blurring and is guarded on `isComposing`, or an IME confirming a
  conversion would write a half-composed value. The input reseeds on every
  commit so a value the model REFUSED does not linger as though accepted.
  The caller owns what empty means, because that differs per key.

## Decoration tab — borders + fill

The border cluster is five pure modules; the write side depends on the
read side, never the reverse.

- `panel/borderSides.ts` — a value given PER SIDE: `SIDES` (the engine's
  map order), `Side`/`SideMap`, and the primitives every border module
  builds on (`uniform`/`allBlank`/`allEqual`/`sameSides`/`sparseMap`/
  `withSide`). No-import leaf.
- `panel/borderTypes.ts` — what a border IS: `BORDER_STYLE_VALUES`
  (drift-guarded against `engine/core/src/style/border.rs`),
  `PATTERNED_BORDER_STYLES` (the capability-gated subset an older engine
  parse-rejects), `BORDERABLE_TYPES` (which excludes the THREE insertable
  types whose stroke is not a border box — `line` and the two form
  marks, each with its own editor), the editor-local `Pen`, the
  resolved `BorderProp`/`BorderView`/`RadiusView`, `MAX_STROKE_WIDTH`
  (the engine's shared 0..=1000 pt bound over BOTH stroke widths —
  `borderWidth` and the `line` item's `style.width`).
  The vocabulary the panel, the toolbar and the line editor share.
- `panel/borderModel.ts` — what the DOCUMENT says: the non-inherited
  cascade (own > named styles; hostile registry names own-property
  guarded) + the scalar-or-per-side parse. `readBorder` (effective
  per-side state + origin + the below-own cascade), `hasAnyBorder`, and
  the cascade primitives `borderRadius` reuses.
- `panel/borderOps.ts` — what an edge click or preset AUTHORS:
  `edgeOps` (an edge exactly matching the pen clears; anything else
  takes it) / `presetOps` (all-sides / none) over a wire layer that writes the
  item's OWN keys in the SIMPLEST form — all-equal → scalar, partial →
  a non-blank-sides-only map, own-already-a-map → per-side leaf ops, so
  untouched sides stay byte-exact; an all-blank WIDTH over an inherited
  border authors an explicit `0` override.
- `panel/borderRadius.ts` — the `borderRadius` property end to end: one
  authored length through the same cascade (`readRadius`), and
  `radiusOps` keeping the authored form (`50%` round-trips; clearing a
  style-supplied radius authors an explicit `0`).
- `panel/lineModel.ts` — pure model for the `line` item's own stroke
  (`readLineStyle`/`lineStyleOps`; removes rather than authors engine
  defaults; non-numeric width refused, over-cap width clamped to
  `MAX_STROKE_WIDTH` like the border pen).
- `panel/LineStyleEditor.tsx` — the line cluster for a `line` item
  (width/colour/keyword picker, capability-gated) — reached from both
  line inserts, the plain rule and the cut-here-line scaffold.
- `panel/linePoints.ts` + `panel/LinePointsEditor.tsx` + `panel/PointField.tsx`
  — the line's
  GEOMETRY, which is its `from`/`to` endpoints rather than a box (a
  `box:` key on a line is an engine parse error, and
  `canvas/manipulate` refuses to drag one, so these four fields are the
  ONLY way to move a line). `readLinePoints` shows a value only if it
  could write it back; `linePointOps` mirrors the engine's own length
  grammar (bare number = pt, else a `%`/`pt`/`mm`/`cm`/`in`/`em`/`rem`
  suffix) and REFUSES anything outside it — a coordinate endpoint's two
  axes are both required on the wire, so there is no key-removal state
  and an empty entry writes nothing — `PointField` takes that rejected entry
  back off the screen by reseeding after every committing blur, which is also
  why it does not consult the apply result: that reports ok and bumps the
  revision for `[]`. The ANCHORED arm
  (`{ item, edge? }`, capability `line.anchor`) is rendered from the WIRE
  — `isAnchored` reads whether the endpoint carries `item`, never a UI
  mode flag, so an externally-authored document displays honestly — and
  `lineArmOps` switches arms in ONE transactional op list (one undo step,
  never the mixed shape the engine rejects), dropping only the keys the
  document actually carries because removing an absent key refuses the
  whole batch. Both anchored values PICK from closed sets — the five edge
  keywords, and the document's items through `panel/AnchorTargetSelect.tsx`
  (shared with the ellipse; an unnamed target is named in the same batch).
  The attach control renders whenever `line.anchor` is on, DISABLED with its
  reason when nothing can be named. An endpoint's `item` is read and written
  under the name field's own rule (`ids/idEdit` `isIdText`), exact and never
  trimmed, so a name in any script reads back and re-picks. Attaching
  picks its target in the same action: switching first would write
  `item: ''` and the line would vanish before the user chose anything.
- `panel/BorderEditor.tsx` — the Excel-style border editor shared by the
  decoration tab + toolbar popover; keyed by path at each host so the pen
  resets on selection change. The SHELL only: pen state, the
  `style.border.sides` / `style.borderRadius` gates, the all-sides/none
  presets, and the ONE `applyAll` per action (one undo step). Its
  clusters:
  - `panel/BorderDiagram.tsx` — the 96×64 paper diagram: per-edge SVG
    painting the effective line (real dash pattern, a second offset
    stroke for `double`, a faint dotted placeholder when off) + the four
    hit buttons (a 10% wash on hover — the edges ARE the control, and a
    5% one was invisible on paper this light). The paper is a FIXED tint
    (`#f0eee9`) rather than a token, for the reason `styles.css` gives
    for the canvas grid and margin guide: it previews an engine-rendered
    page, which is white in either scheme, so an authored colour must
    read against white here exactly as it will there. It is a step down
    from the near-white it was, and wears the hairline `border-border`
    ring every other control does — at `#fcfcfa` it was indistinguishable
    from light chrome and the brightest object in the panel in dark. It also
    casts the page's own `--sj-paper-shadow`, so it says "sheet" by depth
    rather than by brightness: a fresh reader shown both schemes called the
    same box too loud in dark and hard to find at all in light.
    It also carries the named-style/table notes and the `?` holding the
    WHOLE explanation — that an edge is clickable, and that the order is
    pen-then-edges. There is no always-visible hint line (it was folded in
    to give a cramped panel its line back), so this popover is the only
    place the edge-click affordance is stated. It lives HERE rather than
    at the section heading so all three hosts of the editor carry it —
    decoration tab, canvas context menu, format toolbar. It reports WHICH
    edge was clicked (`onEdge`); it knows nothing about ops.
  - `panel/BorderPen.tsx` — the pen row (width stepper / colour /
    line-style select) and the two line-style capability gates. Editor
    state only — nothing here writes the document. All three columns are
    top-aligned and take the SAME `FIELD_LABEL`: the row used to bottom-align
    them while only the stepper carried its own `mb-2`, and only the stepper's
    label went through the shared class, so the three labels sat on different
    baselines (pinned by a test).
  - `panel/BorderRadiusField.tsx` — the corner-rounding field: commits
    through `radiusOps` (authored unit preserved) and steps only on a
    bare numeral or an empty field. It takes the FULL row and carries
    `border.radiusHint` behind the stepper's `?`; as a paragraph beside a
    `w-32` field the sentence wrapped to four lines and orphaned its own
    list of accepted units. The BODY is the same `border.radiusHint` string —
    the wording did not change — behind a `help.borderRadius.title` the
    trigger needs so its accessible name differs from the field's own label
    one element away (repeat it and a by-name query matches two elements,
    and a screen reader says the words twice).

## The hyperlink (`link: { url }`)

The wire carries `link` on THREE structs — `TextItem`, `ImageItem` and `Span` —
so on the panel's vocabulary it is TWO item types plus a rich-text fragment.
All three now have a surface: the item-level pair through `LinkField.tsx`, the
fragment through `SpansSection.tsx`'s per-fragment field. `qr_code` and
`char_grid` are separate structs and take none. `render-png` still paints no
annotation, so the preview itself shows nothing — but the box index now carries
a per-placement `linked` flag, which the canvas overlay draws as a chain badge
beside the item's ink (`canvas/linkBadge.ts` + `OverlayShapes`'
`LinkBadgeLayer`). So the canvas answers "which ITEMS carry a link"; these
fields remain the only place the URL itself is readable, and the only surface
that answers it per FRAGMENT.

- `panel/linkModel.ts` — the READ side plus the two pure predicates.
  `LINK_TYPES` (`text`/`image`) and `LINK_CAPABILITY` (`link.url` — an older
  engine parse-REJECTS the key, so the field is capability-gated the way
  `VisibilitySection` is). `readLinkUrl` degrades a hostile `link` to `''`
  (`Link.url` is required, so `link: {}` is a parse error rather than a link
  the panel is hiding). `linkUrlProblem` mirrors
  `engine/layout/src/engine/link.rs::check_link_url` — trim, the 2048-**BYTE**
  cap, Cc control characters, the `http`/`https`/`mailto`/`tel` allowlist under
  ASCII-only case folding — with ONE branch that is not in the engine and is
  the load-bearing one: **a URL containing `{` is always passed through**,
  because `resolve_link` interpolates before it gates and all TEN bundled
  examples that author a link interpolate it, none carrying a scheme of its
  own (the eleventh `link: { url:` in `examples/` is a literal inside the
  showcase's code panel, not an authored link).
  `linkWire.test.ts` derives the allowlist, the cap, the gate ORDER and the
  carrier set from the Rust rather than restating them.
  `spliceAt` normalises an input's `number | null` selection bounds.
- `panel/linkOps.ts` — the WRITE side. `linkWireOps` has no presence flag and
  does not need one: the changed-check runs first, so the `removeKey` arm is
  reached only when the CURRENT url is non-empty, which can only have come from
  a `link.url` the document carries — a presence flag beside that guard would
  have an arm nothing can reach. `linkCommitOps` pairs that write with
  `text/declCommit`'s shared `declarationBatch`, handing it `linkSurfaceNames`
  (the item's `text:` + spans) — NOT `otherSurfaceNames`, which returns the URL
  being edited and omits the text.
- `panel/LinkUrlField.tsx` — the control ITSELF, shared by both surfaces. It
  does NOT use the shared `TextField`: clicking the insert menu is a blur, and
  `TextField` would commit the half-typed URL and remount the input, destroying
  the caret the insertion needs. So the commit decision asks WHERE focus went
  first (into the field's own menu row = not a commit), the `text/TextEditor`
  shape — and it lives on the WRAPPER, never the input: focus moving input →
  button is correctly not a commit, but then the input never blurs again, and a
  handler on it would strand the typed value for good. The input element is
  STATE rather than a ref, so the menu renders only once it exists and the pick
  handler closes over something non-null. A refused URL authors nothing and says
  why; an empty batch is never dispatched, because `applyAll([])` reports ok and
  bumps the revision. `id`, `label`, `insertLabel` and `otherNames` are all
  per-HOST, because two of these on one surface must answer to different
  accessible names and carry different DOM ids.
- `panel/LinkField.tsx` — the ITEM-level host of that control, rendered from
  `ItemPanel`'s content tab as a SIBLING of `ContentSection` (that section
  routes by early return, so an `image` never reaches its bottom). What is left
  here is the two gates and the `linkSurfaceNames` wiring.

## Inline rich text (`spans:`)

`spans` takes PRECEDENCE over `text`/`data` when non-empty
(`engine/core/src/template/items.rs`), so the content tab's text/data pair was
editing a key the engine ignores for such an item — and authoring one makes the
document report `span_content_conflict`. `ContentSection` therefore routes a
`text` item with `view.hasSpans` to its own section instead, keyed by path so
the selected fragment resets with the selection.

- `panel/spansModel.ts` — the READ side. `narrowSpans` degrades every hostile
  shape (non-array `spans`, a non-map entry, a non-string `text`/`url`, a
  non-map `link`) to "unset" rather than throwing. The one thing that does NOT
  degrade is `SpanView.index`: it is the WIRE position the write addresses, so
  a skipped entry leaves a GAP rather than renumbering its neighbours — and the
  gap is load-bearing on the write side too, since a plan then has fewer entries
  than the sequence has elements (`panel/spanOps` counts positions in wire slots
  for exactly this reason). It also carries `styleNames` and the `metrics`, the
  panel's half of a fragment's style.
  `MAX_SPANS` mirrors the engine constant and is pinned by reading
  `engine/core/src/template/spans.rs`; it bounds the DISPLAY only.
- `panel/spanWire.ts` — one fragment's MARKS as wire keys. A mark that is OFF
  authors a REMOVAL, not the engine's explicit `normal`/`none` keyword (minimal
  wire), and every removal is presence-guarded — `removeKey` on an absent key
  fails and `applyAll` then discards the whole batch. `inheritedKeys` narrows
  the `styleNames`/`link` a split copies onto the new half.
- `panel/spanOps.ts` — a run plan → ONE batch, and the ORDER is the whole
  subtlety: updates first (they address original indices), then removals
  DESCENDING, then inserts ASCENDING against a SIMULATED sequence. The
  simulation is what makes a malformed entry harmless: it is invisible to the
  plan and very much present in the file.
- `panel/spanLinkOps.ts` — the WRITE side, composed from the two existing
  halves rather than branching either, because they address DIFFERENT nodes:
  the `link:` write lands on `<item>.spans[i]` and the declarations it may
  reference live in the ITEM's `bindings:`. `clearIgnoredContentOps` is the
  presence-GUARDED removal of the `text:`/`data:` such an item still carries —
  unguarded, a `removeKey` for an absent key returns `key_not_found` and
  `applyAll` discards the whole batch silently.
- `panel/SpansSection.tsx` — master-detail: a row per fragment (its content, and
  a link mark for the ones that carry one) over ONE `LinkUrlField` for the
  selected row. Not a field per fragment: the largest bundled example holds
  eighteen, and N fields would be N controls answering to one accessible name
  in a ~255px column.
  A fragment's TEXT and its four MARKS are NOT edited here — those are the FLOW
  surface's (`text/SpansFlowEditor`, on the canvas), where a selection can point
  at them. What is left is everything a selection cannot point at, and
  `panel/SpanInspector.tsx` is that: the METRIC style keys, `styleNames:`, and a
  bound fragment's `data.key` (atomic in the flow — deletable, not retypable).
- `panel/SpanInspector.tsx` — the per-fragment inspector described above. Its
  metric list is `spansModel`'s `SPAN_METRIC_KEYS` intersected with
  `styleFieldSpecs`'s registry, by FILTER rather than lookup-or-throw: the first
  cut threw at module scope for a key the registry lacks and took 29 unrelated
  suites down at import time. `letterSpacing` is the key in question — the
  engine allows it per span, the panel's registry carries no entry for it, so it
  is unauthorable at the ITEM level too and a fragment does not get a control
  its own block lacks. Every commit is changed-checked, because `applyPanelOp`
  takes `Op | null` precisely so the caller decides whether a write is owed.
- The declaration name set is the THIRD member of the family in
  `text/declModel.ts` (`spanLinkSurfaceNames`), and neither sibling is usable:
  each omits one of the item's own two surfaces and each includes the span URL
  being edited. It is uncapped, unlike the display list above.

## The two form marks (`ellipse` / `checkbox`)

Their surfaces are split the way the wire is: the PRESENCE is content (the
engine says so — "a mark's *presence* is content"), the outline is decoration,
and the anchor is placement. All three are their own modules rather than
arms of the existing ones, because a mark's paint is not a border box and its
presence is not a text binding.

- `panel/markModel.ts` — the READ side of `data:` / `checked:`. `data:` is the
  SAME `{ key, equals?, scope? }` predicate `visible:` uses (`visibility.rs`
  says so: "no second grammar"), so `valueFormFor` is re-exported rather than
  restated. Unlike `readVisible` it never returns `null` — every mark HAS a
  presence, so the section always has something true to show; a non-map `data`
  reads as the STATIC form, since there is no row to edit and the engine's
  parse error is the honest report. `hasChecked` is separate from `checked`
  because an absent key and an authored `false` are different documents and
  the ops must not remove one that is not there; `conflict` reports a document
  carrying BOTH (the wire calls them mutually exclusive, the engine warns and
  `data:` wins).
- `panel/markOps.ts` — the WRITE side. Every mode switch drops the other key in
  the SAME batch, so the document is never in the shape the wire forbids and it
  is one undo step; unset never serializes (unticking REMOVES `checked` rather
  than writing `false`); an unchanged pick returns `[]`, so re-picking authors
  nothing and mints no undo step. `repointMarkOps` reconciles a stale `equals`
  and the scope into the same batch, exactly as `visibilityOps` does.
- `panel/MarkSection.tsx` — the content tab for both types: ONE control with
  three states for a checkbox and two for an ellipse (the difference is only
  that a checkbox's static form can be ticked), plus the shared `FieldPicker` /
  `ValueControl` for the bound arm. Takes the house `props` + `chips` shape
  (`BoundContent`/`ImageContent`), so `ContentSection`'s route is one element.
- `panel/uniformBorder.ts` — how the ENGINE reads a UNIFORM border, shared by
  the two surfaces that stroke one closed path instead of four bands: a form
  mark's outline (`Ctx::shape_paint`) and a `char_grid`'s ruling
  (`push_grid_rects`). `topSide` (a scalar outright, else a per-side map's TOP
  side — reading through the generic cascade would flatten a map to unset and
  report a set stroke as blank) + `resolveUniform` (own value of ANY shape wins
  by key PRESENCE, then the named styles, later name winning; nothing below).
  The DEFAULT an absent key means differs per surface — 0.5 pt for a ruling,
  1 pt for a mark — so each caller states its own. Extracted from
  `charGridInk.ts`, which now imports it.
- `panel/shapeStyle.ts` + `panel/ShapeStyleEditor.tsx` — a mark's own paint:
  one outline width, one outline colour, one fill. NOT the border cluster, and
  the reason is the engine rather than taste — THREE of the four things
  `BorderEditor` authors do not reach a shape. Two warn: a per-side map reduces
  to its top side (`shape_border_sides_ignored`) and `borderRadius` is answered
  with `border_radius_ignored` ("a form mark"). The third, `borderStyle`, is
  SILENTLY inert — `shape_paint` never reads `border_styles`, `PathShape` has no
  dash field, and `ignored_shape_keys` does not list it — which is why the
  editor offers no line-style picker and why an already-authored one gets no
  diagnostic. So the model writes SCALARS only, and a negative test pins that
  neither warning-producing key can ever be authored. Empty
  CLEARS the width, because an absent key IS the documented 1 pt default (the
  `charGridInk` rule, different constant); `0` stays its own value, which is
  what turns the outline off; a refused entry authors nothing and the field
  reseeds. The width is written as the PARSED number — `BorderWidth` has no
  `visit_str`, so a string there is a serde type error rather than a
  diagnostic the engine degrades past.
- `panel/ellipseAnchor.ts` + `panel/EllipseAnchorField.tsx` — the `anchor:`
  that turns a free-floating oval into "circle this answer". Attaching PICKS
  its target in the same action (switching first would write `anchor: ''`,
  which resolves to no item and the oval would vanish before the user chose
  anything) and DROPS `box.x`/`box.y` in the same batch — the engine stops
  reading them, and `canvas/manipulate` already refuses to drag an anchored
  ellipse for that reason. Only the coordinates the document carries are
  dropped: removing an absent key refuses the whole batch. `anchorHidesCoords`
  is what `BoxSection` consults to withhold the two coordinate fields, and it
  is deliberately NOT capability-gated — `EllipseItem` is
  `deny_unknown_fields`, so an engine that does not know `anchor:` REJECTS the
  document rather than ignoring the key. The capability (`ellipse.anchor`)
  gates the OFFER to attach and never the reading of a file that already is
  (the `line.anchor` rule). Targets come from `AnchorTargetSelect`, as the
  line's do; the row stays visible and disabled with its reason when the
  document has no item an oval can circle.
- `panel/useAnchorTargets.ts` + `panel/AnchorTargetSelect.tsx` — the ONE
  target list both anchor pickers render. The hook reads the document's id
  namespace (`ids/idIndex`, memoized on `revision`) and `ids/anchorTargets`'
  candidates for the picking item — never the preview's box index, so the list
  needs no render and includes unnamed items. The select keys options by PATH
  (`p:<path>`; an authored value outside the list is a verbatim `v:<id>`
  option, display-clipped by `anchorLabel`, value exact), groups them by
  section once there is more than one, shows the prompt only while nothing is
  chosen, marks a verbatim value NO holder carries with `panel.anchor.missing`
  (never on a partial namespace, which cannot prove it), and hands the caller
  `pickTarget`'s `{id, ops}` — the naming ops run first in the caller's one
  batch. Option TEXT is `panel/anchorOptions.ts` (`optionTexts`): the layer
  tree's label with the kind (`label (kind)`, the LABEL clipped, never the
  kind), else the kind alone, and options that would read the same numbered in
  document order (`panel.anchor.ordinal`).
- `panel/AutoNamedNote.tsx` — `useAutoNamed` + `AutoNamedNote`: after a pick
  that NAMED its target, a one-line `role="status"` note gives the name, shown
  only while that slot (the ellipse's anchor, a line end) still names it and
  only for the item it was picked on — an undo, a re-pick, or selecting another
  item forgets it (reset during render on a path change), so coming back does
  not bring it back.
- `panel/BoxAxisGrid.tsx` — the four box fields and which of them the placement
  kind makes read-only, split out of `BoxSection.tsx` when the anchor control
  pushed it past the per-file budget. Carries the `noCoords` case (withhold x
  and y entirely — an anchored ellipse's position is not its box) and the
  `flat` case (authored-only, no resolved seeding).

## Panel model + field widgets

- `panel/itemView.ts` — the READ side: `readItemView` → `ItemView`
  (incl. `dataScope`, `pageFormat`), `display`/`record` narrowings,
  `registryNames`, `BOX_AXES`, `imageSourceSummary` (format + KiB — the
  raw `src` never reaches a field). Also the ONE home for the two BOXLESS
  sets, which answer different questions and are deliberately different
  sizes. **`BOXLESS_TYPES`** (`line`/`page_break`) is the CANVAS/placement
  set: `placementModel`'s classifier, `canvas/manipulate`'s `noBox` refusal
  and `insert/bandPlacement`'s band-placement branch read it. It stays at two
  because its `noBox` arm short-circuits before the reorder classification, so
  admitting the repeaters would take canvas drag-reordering away from two
  types that have it in a flow body. **`NO_BOX_WIRE_TYPES`** is the WIRE truth
  — all four `Item` variants that omit `box_` (`line`, `page_break`, `repeat`,
  `repeat_flow`) — and has exactly one consumer, `panelTabs`' tab gate,
  because a placement tab over any of them authors a `deny_unknown_fields`
  parse error. A drift-guard test pins it to the enum. Its mirror,
  **`REQUIRED_BOX_WIRE_TYPES`** (`rect`: the one `box_` without a serde
  default), is read by `insert/wrap`, which must not delete a box it emptied;
  the same `noBoxWire.test.ts` pins it. **`STYLE_NAMES_WIRE_TYPES`** is the
  other wire gate: the 11 `Item` variants whose struct takes `styleNames`,
  read by `StyleSection` before it mounts the named-style picker — a `line`
  has a decoration tab and no such key, and one tick there stopped the whole
  document parsing. `styleNamesWire.test.ts` derives it from the structs
  through the same `testkit/engineWire.ts`. And the ONE home for
  **`MARK_TYPES`**
  (`ellipse`/`checkbox` — the two form marks): they share a wire family,
  a presence predicate, and a paint rule that is emphatically NOT the
  border box's, so `ItemPanel`'s content and decoration gates, the
  content router, the decoration tab and `bandPlaced`'s full-width
  exemption all read this instead of spelling the pair out.
- `panel/styleFieldSpecs.ts` — the style keys the panel edits, as data
  (`STYLE_FIELDS`: widget kind + enum options copied from
  `engine/core/src/style/enums.rs`). A no-import leaf shared by item
  panel / defaults / registry / capture / format toolbar.
- `panel/formatModel.ts` — `formatOptions`: registry names first, then
  **the catalog's own variants for the bound type** (`catalogVariants`),
  then the closed builtin spellings per display type (localized labels);
  own-property-guarded; currency variants capability-gated. **Every
  SAMPLE comes from the engine's format catalog** — the hand-written
  table this module used to own is gone, because a sample the GUI
  computed could drift from what the page shows. The catalog is now a
  NAME source too, for the pack/builtin half only: a locale pack's own
  vocabulary (`wareki` on a ja date binding) was previously unreachable
  from an item panel, because a curated table here cannot know what a
  pack declares. Registry rows are excluded from that union on purpose —
  for those the catalog stays a pure FILTER over the document's list, so
  it can still never add a row for an entry the document does not
  declare. `default` is left out of the union (the empty state already
  means "no pick"). `FormatOption.dropsTime` rides through from the
  catalog. A row the catalog did NOT describe reports false, with one
  knowable exception the criterion depends on: the curated `date` override on
  a `datetime` field re-types the value to a date, which has no time, so it is
  marked without asking anyone (`overrideDropsTime`). Where the bound type is
  unresolved nothing knows a time exists to lose, and the mark stays off. **The
  registry half is
  type-filtered through that same catalog** (`pickableRegistry`): a
  `formats:` entry declares a KIND, and the engine lists it under a type
  only where the two agree, so a date pattern is no longer offered on a
  money field (where the pick warns) or on a text one, where a field with no
  declared `enum` labels ignores it SILENTLY — that arm has no variants of its
  own (a labelled field does warn). The DOCUMENT's list is
  what gets walked and the catalog only says yes or no, so a catalog can
  never add a name the document does not declare; `origin` is read too, so
  a `formats:` entry legally spelled `symbol` shows on a CURRENCY binding as
  the builtin row it really is there (`money.rs` matches that name without
  consulting the registry), while on a date binding the same entry is the
  registry reference it really is there. Two states have nothing to filter
  with and keep the full list: no catalog, and an unresolved field type (types
  come from `definitions`, so a document without them resolves none).
  Typing stays open either way — the picker's input is free text, so
  narrowing what is OFFERED never rewrites what is AUTHORED. Also
  `variantOptions` (a `defaults.formats` row's vocabulary — the catalog's
  own list for that type, MINUS `default`, which the picker's leading
  clear-the-key row already offers), `isFixedType` (the engine's answer to
  "does this type have a real choice") and `variantSamples`. The engine
  stays the validator. A TEXT field offers NO builtin either (naming
  `date` on one overrides the type and the engine then fails to parse the
  value as a date — that is an error, not a format), so wherever the engine
  answered its picker is empty and the spelling is typed; with no catalog it
  still lists the document's names, as the paragraph above says.
- `panel/formatCatalogReads.ts` — the catalog lookups `formatOptions` needs,
  split out of `formatModel.ts` for the line budget. NOT a shared seam, and
  the entry says so because the name invites the assumption: every export has
  exactly one caller. The document-defaults side (`variantOptions` /
  `isFixedType` / `variantSamples`) reads the catalog with its own inline
  `types.find(…)` and cannot route through here without importing
  `FormatOption` back and making the pair circular. `sampleFor` (a
  spelling that names a TYPE is an override, so its sample is that type's
  own `default` rendering; anything else is a variant OF the bound type),
  `resolvedType` (the `symbol`/`name`-on-a-number coercion, mirrored from
  `format.rs`), `pickableRegistry` (the document's list, FILTERED by the
  catalog), `catalogVariants` (the catalog's pack/builtin variants as a
  NAME source, registry rows and `default` excluded) and `originOf`. Every
  lookup walks real ARRAYS — a spelling can be a document-derived registry
  name, so `constructor`/`__proto__` must never resolve to an inherited
  value.
- `panel/formatLabels.ts` — pure: wire spelling → chrome-catalog key for
  the KNOWN variants, and origin → group-heading key. A closed
  own-property-guarded table, never an interpolated
  `format.label.${spelling}`: a registry name is document-derived. A
  spelling the table does not carry displays as its BARE WIRE SPELLING
  (user decision), which is how a newer locale pack's variant and every
  author-defined name are shown.
- `panel/FormatOptionList.tsx` — the rows inside a format picker's
  popover, shared by the binding-level picker and the defaults rows. Its
  one job beyond rendering is the ORIGIN GROUPING: a heading above each
  run of options, so a document's own `formats:` entry is visibly a
  different KIND from a locale variant (only the former breaks on
  rename). Headings appear only where the origin CHANGES and only when
  the engine answered, so a single-origin list stays flat. A row whose
  variant the engine marks `dropsTime` carries the date-only chip
  (`format.dropsTime`) in the panel's existing neutral badge idiom: the
  pick is honoured and warns about nothing, the sample shows the RESULT
  but not that anything was lost, and the picker is the last place the
  loss can be read.
- `panel/StringListField.tsx` — the metadata list rows. Each row is its own
  `ListEntryInput` so the reseed hook has a fixed home (the rows are a
  variable-length map): `metaListOp` TRIMS, so `"  alpaca  "` over `alpaca`
  authors the same list and only the nonce can clear the padding.
- `panel/useReseedKey.ts` — `[key, reseed]` for an uncontrolled
  commit-on-blur input: the committed value plus a reseed nonce, with the
  nonce LEADING so `<nonce>#<value>` has an unambiguous split point (a
  trailing counter lets `("20#1", 0)` and `("20", 1)` collide and silently skip
  a reseed). Read the panel-wide posture above for when a field bumps it.
- `panel/model.ts` — the WRITE side: `applyPanelOp` (the shared dispatch
  guard) + op builders `lengthOp`/`numberOp`/`plainTextOp` (item-scoped
  or root-addressed)/`bindingKeyOp`/`bindingPickOps` (a document pick
  authors `data.scope: document` — the only spelling the GUI writes; a
  row pick clears it only when present)/`formatOp`/`placeholderOp`/
  `stepValueOp`/`switchContentOps`
  (+ `textAsBinding`/`bindingAsText`: the two modes both express "this item
  IS that field", so the switch CARRIES the binding across — a text of one
  expression becomes that data key with its format, a data key becomes
  `{key}` text. Only mixed text (`{customer.name} 様`) has to be dropped,
  and `ContentSection` keeps it for the way back).
- `panel/styleNamesOps.ts` — the `styleNames` LIST edits every named-style
  checklist authors and the toolbar's style picker toggles: `styleNamesOp(path,
  names, keys = ['styleNames'])` (an empty list REMOVES the key; `keys` names a
  table band's slot — `header`/`row` `styleNames`, `row.alternateStyleNames` —
  which are map keys under the table, not paths) and `toggleStyleName`. Split
  from `model.ts` as its own concern: a list of references, not a leaf.
- `panel/fields.tsx` — the base widgets: `Field` (label wrapper),
  **`SideButtonField`** (a control BESIDE a button — the pickers' ▼: label by
  `htmlFor` not by wrapping, the outer block owns the bottom margin so none
  lands inside the row, and `items-stretch` gives the button the input's
  height. The house shape, `StepperField`'s ▲▼ row; the button itself wears
  `PICKER_TOGGLE_FLUSH` — `PICKER_TOGGLE` plus the squared left corners and
  `border-l-0` that make it flush, paired with a `rounded-r-none` input.
  **The flush pair is its OWN constant, and that is the point**: flushness
  belongs to the PAIRING, not to the toggle. `PICKER_TOGGLE` has a fourth call
  site with no input beside it (`FormatDefaultRow`'s row ▼, alone in a `gap-2`
  row of text spans), and baking the flush classes into the shared constant drew
  that one as a three-sided open box — green through every gate, since nothing
  in the repo reads CSS. `DefaultsFormatFields.test.tsx` pins it detached.
  **The panel's one rule for a button beside an input, stated in `fields.tsx`
  and pinned from both sides: a button that is PART of the control is flush; a
  button that ACTS ON THE ROW is detached.** `StringListField`'s trash is the
  second kind and keeps its `gap-1` — a destructive row action welded to an
  input reads as belonging to it, which is what makes it easy to press by
  mistake), **`FieldGroup`** (the same row WITHOUT the `<label>` — a `<label>`
  forwards every click inside it to its implicit control, and a
  contenteditable is not labelable, so the text field's label reached
  past the editor to the insert-a-field button beside it: clicking the
  text pressed that button instead of placing a caret),
  `TextField`, `UnitBadge` + `unitIsImplicit`/`badgeText` (the implicit
  `pt` badge shows only while the text is a bare numeral) and
  `showsUnitHint` — whether the field invites ANOTHER unit, which is
  OPT-IN per site because the WIRE decides. Among the fields that carry it:
  box coordinates, corner radius, column width in BOTH the form and the
  sheet, per-side page margins, flex/grid gap, char-grid cell size + line gap,
  `fontSize` on both style surfaces, the padding/margin sides, the size bounds,
  and letter spacing (whose bubble names `em`, not `cm`: its own
  `panel.field.letterSpacing.units`); several deliberately do NOT, each
  for its own reason — a band's height and the two custom PAGE dimensions
  among them (the page cluster states its unit in the `<select>` one cell
  away), and three whose reason is worth spelling out: the border PEN's width is `borderWidth`, `number (pt)` in the
  wire and dropped by its own commit guard; the UNIFORM margin cannot hold
  `25mm` because the WIRE refuses it there (`uniformMarginOp` takes a bare
  numeral, and a unit under `page.margin` is an engine parse error) — the field
  is an ordinary text input like every other stepper, so nothing in the browser
  stops the typing; and a unitless ratio (`lineHeight`) has no badge to hang it
  on. The
  bubble rides the input's WRAPPER, not the badge — the badge is
  `pointer-events-none` and cannot be hovered. Every site but one reaches it
  through the shared fields' `unitHint` prop;
  `TableTextCells`'s `ColumnWidthCell` renders its own input and its own
  `UnitBadge`, so a sweep for the `unit=` PROP does not see it — it was
  missed exactly that way, and it writes the same `lengthOp(path,
  ['width'])` as the column form. A widget-shaped sweep missed it a SECOND
  time over the reseed nonce, for the same reason: both sheet cells now carry
  their own `useReseedKey`, because their caller keys them by a value that a
  normalising commit does not move. Its text is deliberately
  TERSE (`mm, cm, in too`): a sentence needed 325px and a bubble is bounded at
  `max-w-64` (256px), so it was the only truncating tooltip in the Designer.
  The figure this used to cite — 123px of usable width on a LEFT-column field,
  before the panel column's `overflow-y: auto` cut the rest — is no longer the
  bound: a bubble now anchors to the side that fits, so the width available to
  it is its own cap rather than its distance to the nearest clipping edge.
  The TERSENESS still stands on the cap, and on the bubble's job. The bubble sits beside the `pt`
  badge, so naming alternatives is its whole job; `em`, `rem`, `%` and the
  caveats (`%` resolves against a different axis per field and drops with
  `percent_of_auto` under an auto-height parent) live in the glossary's
  `units` term and in `border.radiusHint`, which have room for them.
- `panel/stepperNames.test.ts` — the node-env source GATE over the stepper
  labels, in the shape `ui/chromeConvention` set. The ▲▼ accessible name is
  built FROM the field's label (`stepper.increment` takes `{field}`), which
  makes the label an a11y surface: it must be catalog text, never a document
  value. The rule the walker enforces is "a `t(…)` call, or a bare parameter the
  component was handed" — the second covers `BoxAxisField`'s `label` and
  `CustomSizeFields`' `dimension(field, label)`, whose own call sites pass
  `t(…)`. Carries a positive control, because a sweep asserting an EMPTY list
  passes when the matcher accepts everything.
- `panel/StepperField.tsx` — length/number input + ▲▼, the numeric primitive
  both the property panel and the document-settings page reach for (one step op
  per click = one undo step; the column sits FLUSH against the input — no gap,
  the input's right corners squared, the column pulled back a pixel so the pair
  shares ONE border — because a spinner separated from its field reads as two
  controls, which is what macOS/HIG and the gdoc numeric box both avoid; a commit-on-blur changed-guard that reseeds the input
  from the document after every committing blur, so anything the commit did
  not take is snapped back; the nonce rides the INNER input, never this component,
  because remounting the widget between the ▲'s mousedown and mouseup
  destroys the button mid-click; optional `tag`
  suffix badge with explicit htmlFor/id association; no key-repeat — an
  op remounts the panel body). **Each button NAMES its field** —
  `stepper.increment`/`.decrement` take a `{field}` ICU arg fed the label —
  because one view renders several steppers (the placement tab maps x/y/w/h;
  page setup in custom mode renders three) and a bare "Increase" repeated
  leaves a screen reader with identical controls. Two OPT-IN slots: `help`, a
  `?` rendered as a SIBLING of the label (nested in the `<label>` it would join
  the input's accessible name and hand its clicks to the input) — the slot
  `NumericComboField` already had, so the panel has ONE shape for "this field
  needs a sentence"; and `inputMode`, withheld by default because most call
  sites take length strings a decimal keypad cannot type, passed only where the
  WIRE refuses units (the three page-setup numerals). `stepHint` is the bubble shown while
  `canStep` is FALSE, and the CALLER owns the string: only it knows which
  unsteppable state the field is in (a relative unit, empty, garbage, a
  count below 1), so a message naming `%`/`em` would be a lie over the
  others. The bubble rides the ▲▼ COLUMN, not the buttons — a disabled
  button is an unreliable hover target.
- `panel/SeededField.tsx` — the document-settings style field whose
  UNSET state reads as unset (empty box, engine fallback as
  PLACEHOLDER; empty commits nothing, clearing an authored value does).
- `panel/choiceFields.tsx` — the choice widgets: `SelectField` +
  `CheckboxList` (controlled, commit-on-CHANGE) vs `ComboField`
  (free-text + datalist, uncontrolled commit-on-blur). `CheckboxList`
  names its `<fieldset>` by `aria-label` rather than leaving it to the
  legend: a fieldset is otherwise named by its legend's whole SUBTREE, so
  the optional `help` node it renders there would fold its own accessible
  name into the group's.
- `panel/StyleNamesPicker.tsx` — the named-style multi-select, as one leaf
  over `CheckboxList`, mounted by the decoration tab's Styles section
  (`ItemDecorationSections`) and nowhere else for a non-table item. Options are the registry's names UNION the ones
  the item already carries, so a name deleted from the registry still
  renders ticked and can be removed; a plain OWN-VALUE read, with no
  cascade and no origin badge, because `authored()` looks nowhere else.
- `panel/charGridMarkup.ts` + `panel/CharGridMarkupField.tsx` — the
  content-interpretation switch (`markup: aozora`), on the CONTENT tab
  because it decides what the bound text MEANS. `Markup` has exactly one
  variant and the item holds it as an `Option`, so "off" is key ABSENCE and
  the control is a toggle, never a three-state select; an unrecognised
  markup value reads as OFF rather than as a half-on toggle whose off path
  would delete a key the document meant. The component carries BOTH its
  gates (the item type and `char_grid.markup.aozora`) so `ContentSection`,
  nine executable lines under the cap, grows by an import and a mount.
- `panel/pickerModel.ts` — pure binding-picker model: `bindingScopeFor`
  (the enclosing row scope; unparseable → document scope),
  `pickerOptions` (rows with live sample values via `sampleValueFor`,
  own-property-guarded), `filterOptions` (plain includes, never a
  RegExp), `scopeAuthorable` (the ONE home for the `binding.scope`
  capability — gates OFFERING/AUTHORING, never reading).
- `panel/FieldPicker.tsx` — the `data.key` editor: the closed control
  (free entry + a FLUSH ▼ toggle), the offer derivation and what a pick
  COMMITS. `panel/BoundFieldLine.tsx` is the line UNDER it — split out when the
  file hit the line budget — carrying `BoundField`: the document-scope badge
  when the binding carries one, and the bound key's name / localized type /
  live sample (the popover row's three facts shown WITHOUT opening it, absent
  for a key no offer matches). The badge moved there from between the input and
  the ▼: those two are one control now and share one border, and a rounded
  accent pill can be flush against neither. Row-scoped pickers split
  row/document sections (free entry never re-scopes). `panel/PickerPopover.tsx` — the open popover, shared
  with the chip editor's field menus (`text/FieldMenuButton`) so the two
  surfaces cannot drift into two looks: search, the three offer states,
  the rows (label / key / localized type / sample / document badge) and
  the optional `onCreateField` tail (workshop mode, document scope only;
  the chip menus pass none). A pick hands back the OPTION, not just its
  key — every consumer needs the row's label/sample anyway.
- `panel/FormatPicker.tsx` — the `data.format` editor: free entry +
  popover of `formatOptions` rendered through `FormatOptionList`; shown
  only once a data key is picked.

## The router + per-item tabs

- `panel/CellPanel.tsx` — the panel for a selection with no `type:` of its
  own. Neither a table COLUMN, a header GROUP, a header/footer BAND nor a
  sub-template FRAME (a grid's `cell:`, a card's `item:`, a column's
  `cell:`) is an item, but selecting one (a canvas click on a cell, a
  layer-tree click on a band) hands over its structural path, so this
  routes to the form for what was actually clicked and falls through to
  the unsupported card when the path resolves to none of them. A sibling router to
  `PropertyPanel`, not a section: the sections all take `ItemPanelProps`,
  and a cell has no `ItemView` to build one from. The BAND arm is tried
  first — an exact two-segment string match, no document read.
- `panel/frameModel.ts` (pure) — `frameOf(read, path)`: which of the three
  sub-template frames a path is — `cell` (`…items[n].cell` under a
  `repeat`), `card` (`…items[n].item` under a `repeat_flow`),
  `columnCell` (`…columns[n].cell`) — with the owner to jump back to. The
  owner's TYPE decides, not the key's spelling (a `cell:` under a container
  is not a frame); non-maps and a throwing read answer `null`.
- `panel/FrameForm.tsx` — `CellPanel`'s frame arm: a heading by kind, the
  "every cell/card/row uses this frame" line, a column cell's note (the
  lines between cells are the table's; `cellPadding` does not reach a
  container cell), then the ordinary path-generic fields pointed at the
  frame — `EdgeFields` (padding, `FRAME_PADDING_RULES`), the fill
  `PanelColorField` (`style.backgroundColor`), `BorderEditor`
  (`style.border`), `OverflowField` (`style.overflow`, which a repeat cell
  and a card honour) and `OpacityField` — and the jump back to the owner.
  Padding, overflow and opacity are each capability-gated; the frame's NAME
  (`ItemIdField`, first) is not — the engine reads a frame's `id` everywhere.
  A repeat cell or a card then gets `FrameLayoutSection.tsx`: its size
  (`BoxAxisField` w/h with an "Auto" placeholder and an always-visible line
  saying what empty means for that kind — shown whatever the arrangement; a
  hostile `box.type` withholds only the layout controls) and the container
  `LayoutSection` pointed at the frame path; a column cell gets neither (the
  table sizes it).
- `panel/styleSurfaces.ts` (pure; imports only `hasCapability`) — the type→control table of the
  text-and-box keys, one `Set` per key, each citing the layout code that honours
  it: `TEXT_SURFACE_TYPES` (text/page_number/list), `TEXT_INHERIT_TYPES`
  (container — its text keys only reach its children), `LETTER_SPACING_TYPES`
  (the text surfaces + container + table — the table's text section mounts
  `TextLookFields` for it, since every cell inherits it), `VALIGN_TYPES`,
  `TEXT_OVERFLOW_TYPES`, `DECORATION_LINE_TYPES`, `OVERFLOW_TYPES`,
  `OPACITY_TYPES` (+`OPACITY_DECORATION_ONLY`: a QR code and a container fade
  only their own fill and border), `PADDING_TYPES` (rect and the marks inset
  nothing), `CHAR_GRID_GLYPH_KEYS`, plus `textHelpKey`/`overflowKeyOf`/
  `fillTitleKey`/`openingSection`/`opacityOffered`.
  `styleSurfaces.test.ts` pins the rows against the engine matrix.
- `panel/ItemDecorationSections.tsx` — builds the section list above; bodies are
  `ItemTextFields` (`TypographyFields` — restricted by `only` for a char_grid —
  + text colour + `TextLookFields`), `OverflowField` (`OverflowFields.tsx`:
  `textOverflow` on a text surface, `overflow` on a container or frame; `clip`
  behind `style.textOverflow.clip`), `FillBorderFields` (+`hasFillBorder`: a
  char_grid takes the fill alone), `OpacityField`, `StyleNamesPicker`.
- `panel/itemTextSections.tsx` — the text half of that list, split out:
  `textSections(props, ctx, i18n)` → the 「Text」 section and, after it,
  `item.typesetting` (from `TypesettingSection`), each only when the type gets
  it; also the `ItemSection` shape the builder lists.
- `panel/typesettingModel.ts` (pure) — the six typesetting `Style` keys
  (`writingMode`, `textOrientation`, `textCombineUpright`, `lineBreak`,
  `textSpacingTrim`, `hangingPunctuation`) as data: which types' layout reads
  which key (text/page_number/table/container all six, a list the vertical
  three, horizontal `spans` no `hangingPunctuation`; char_grid, shapes and media
  none — each cited to `engine/layout/src/engine/`), the per-key and per-option
  capability gates (`style.writingMode.surfaces` past a plain text block,
  `.all` for tate-chu-yoko in a list or spans, `strict_loose`), the
  `textCombineUpright` codec (`combineToken`: `{ digits: N }` ↔ `digitsN`;
  absent is unset, and any other PRESENT shape the engine cannot parse is
  `UNREADABLE_COMBINE`, so the row stays visible and its 「not set」 row can
  remove it) and `typesettingOp` (one
  `putValue` per pick, so the map ↔ keyword switch is one op; `''` removes;
  unchanged is `null`).
- `panel/TypesettingSection.tsx` — `typesettingParts(props, i18n)` → the
  section's summary, `?` and body (or `null` when the type gets no key): one
  inherited-select per key (own value, `withAuthored`, `OriginBadge` with the
  option LABEL via its `valueLabel`), ONE visibility predicate — a key shows
  when the item authors it, or when it is offered and honoured in the mode the
  item reads now (so the vertical-only pair while horizontal, and hanging
  punctuation in horizontal spans, never hide an authored value) — and a note
  when a
  circled (`mark:`) text is vertical — the engine skips the circle there. The
  unreadable 縦中横 row's own label names the 「not set」 row (composed from
  its label key, brackets dropped); the origin line keeps the short label. Both
  decoration tabs wrap it in their own `PanelSection` (`item.typesetting`,
  `table.typesetting`).
- `panel/TextLookFields.tsx` — letter spacing (stepper, `letterSpacingOp`),
  the decoration lines (`DecorationChecks.tsx`: an Underline and a
  Strikethrough checkbox over the one `textDecoration` key, read from the
  EFFECTIVE value; `decorationToggleOp` removes an own key the cascade makes
  redundant and writes `none` to switch off a named style's line; exclusive
  without `style.textDecoration.combined`) and vertical alignment (select),
  each gated by type AND
  capability; `withAuthored` keeps a legal out-of-set authored value visible as
  itself (the closed-control-over-open-vocabulary rule), shared by the overflow
  selects. `letterSpacing` and the six typesetting keys are resolved through
  the cascade as INHERITED keys (`toolbar/effective` names them beside the
  defaults editor's inherited set, which does not offer them).
- `panel/textLookOps.ts` (pure) — `letterSpacingOp` (signed, units but no `%`,
  ±`MAX_LETTER_SPACING_PT`), `opacityPercent`/`opacityOp` (the field shows a
  percentage of the 0..1 alpha; a commit that would author the value already
  carried is `null`, so a converted view is never written back untouched),
  `steppedOpacity`, and the ▲▼ op builders.
- `panel/edgeModel.ts` (pure) + `panel/edgeOps.ts` (pure) — `box.padding` /
  `box.margin` as an all-sides number plus four verbatim sides (`readEdge` →
  none/uniform/perSide/other), and what a field authors: a leaf op on one side
  of a map (siblings byte-exact), a ONE-batch `putValue` expanding the
  all-sides number into a map, the all-sides number over any form; empty clears
  a side, the last side clears the key. `EdgeRules` carries the two
  differences: a margin may be negative, and `auto` only on the sides
  `edgeRules.ts` offers — `autoSides(placement)`: flow body left/right, an
  unpinned container child every side, else none; `horizontalOnly`: a
  flow-body table uses left/right only.
- `panel/EdgeFields.tsx` — the editor: an all-sides stepper (withheld for a
  flow-body table) and a 2×2 of sides; an `auto`-capable side is a
  `NumericComboField` with an **Auto** row, an authored `auto` the placement
  cannot use is shown with a line NAMING the side(s) that count as 0 (one may
  be a side not shown, a flow table's top). Sides and size bounds step in their
  own absolute unit (`edgeModel.steppedLength` over `canvas/lengths.stepLength`,
  shared with `sizeLimits`); a relative one gets the `stepper.relativeUnit` hint.
- `panel/SpacingSections.tsx` — the placement tab's **Spacing** (padding on
  `PADDING_TYPES`, margin) and **Size limits** (`sizeLimits.ts`: four
  non-negative lengths, empty clears, ▲▼ by the canvas grid; a flow-body table
  gets width bounds only) sections, gated on `box.padding`/`box.margin`/
  `box.minmax`, mounted by `BoxSection` in both its arms.
- `panel/bandModel.ts` (pure) — one section band's two properties:
  `BAND_REPEATS` (the engine's four `Repeat` modes, snake_case, in
  declaration order), `readBandView` (own-property reads; a non-map band,
  a wrong-typed value or an inherited entry degrades to unset, and an
  UNKNOWN authored mode is reported verbatim rather than normalized away),
  `effectiveRepeat` (an absent `repeat:` means the engine's `every_page`),
  `bandRepeatOp` (null — no op, no undo step — when the pick is the mode
  already on screen, INCLUDING an unset band's implicit default, or is
  outside the closed set) and `bandHeightOp` (`numberOp`: `Band.height` is
  a plain number, so no unit strings).
- `panel/BandForm.tsx` — the form itself: the repeat select (a document's
  unknown mode keeps its own option) + a `StepperField` height in pt. The
  ONLY surface that edits a band's `repeat`/`height`; before it existed
  even the bundled presets that author a band could not change either. Ends
  with `BandDelete.tsx`: one `removeKey ['sections', band]` (one undo brings
  the band back whole) and the selection cleared — at once for an empty band,
  behind a Modal stating the item count otherwise. The band's own button, not
  the Delete key: every list-entry delete path is unchanged.
- `panel/bodyModel.ts` (pure) — the flowing body: `bodyMode`,
  `toAbsoluteOps` (fresh geometry required; drops the flow-only `gap`/`box`
  an absolute body refuses, pins each boxed child at its page-1 border rect
  − margin origin − its own margin, rebases each unanchored line, and
  DELETES the children that start after page 1 — an absolute body draws
  every item on its one page, so they would land on top of page 1; it
  COUNTS everything that changes for the confirm (`AbsoluteLoss`): those
  deletions, children that continue past page 1, children the preview did
  not draw (hidden under the sample data — kept, at the top of page 1),
  `repeat`/`repeat_flow`/`page_break`, and the tables whose
  `TABLE_PAGINATION_KEYS` it removes — they act only on a table directly in
  a flowing body). `'tooMany'` over `MAX_BATCH_OPS`, `null` without fresh
  geometry.
- `panel/bodyFlow.ts` (pure) — `toFlowOps`, the way back: stable
  top-to-bottom reorder by y then x via `moveItem`, each `y` dropped unless
  it would empty a required box, each line rebased to its top endpoint, and
  a region from `bodyRegion.topRegion` so the topmost child keeps its `y`
  instead of landing under a header band. `'tooMany'` over the cap.
- `panel/bodyLines.ts` (pure) — a `line` in the switch: its `from`/`to` are
  cursor-relative in a flow and margin-relative in an absolute body, so the
  switch rebases them (`linePinOps` by the preview's placed box, `lineFlowOps`
  by the top endpoint); an anchored line is absolutely placed in both and is
  left alone; `%`/em endpoints cannot be rebased and are counted.
- `panel/bodyRegion.ts` (pure) — the body region is a WHOLE `BoxSpec` on the
  wire (x/y/w/h all required; a partial one is a parse error): `regionOps`
  completes a one-axis field edit with the whole-margin-box values
  (`REGION_DEFAULTS` 0/0/100%/100%) and removes the region once every axis
  is back at them; `topRegion` is the switch-back region — from the topmost
  child's `y` down to the footer band (the engine does not keep a flow out
  of the bands), `null` without an exact page height.
- `panel/BodyForm.tsx` — what `sections.body` opens (routed by
  `PropertyPanel` before the item arm, so the body never shows the name
  field — a body takes no `id:`): the flow / fixed-position `Segmented` (the
  other option disabled with a reason — no fresh preview yet, or too many
  items for one batch; a confirm listing only the changes that happen), the mode's hint, and for a flowing
  body `BodyRegionFields.tsx` (`gap` through `relativeGapOp`, the region's
  x/y/w/h through `BoxAxisField` with `complete` = `regionOps`, w/h
  placeholders `100%`, a hint saying empty = inside the margins).
- `panel/PropertyPanel.tsx` — the thin router: the body → `BodyForm`, item → `ItemPanel`,
  anything with no `type:` of its own — and any table column, whose `type:`
  names its KIND, not an item's → `CellPanel` (which picks
  `BandForm` / `ColumnForm` / `GroupForm` / `FrameForm` / the unsupported
  card),
  none/ghost (`readSubject` null) → `NoSelectionCard`; the origin jump wires through
  Designer's `navigateDefaults`.
- `panel/NoSelectionCard.tsx` — the panel when the document is the subject
  (still filed under the historical `NoSelectionCard` name and
  `panel.noSelection.*` keys): the sentence naming its subject (the whole
  document — what the tree's root row marks too, never "nothing"; it claims
  nothing about what the card shows, so it holds when both facts are withheld,
  and nothing about items existing), the document's page and margin, and the
  open-document-settings CTA. `documentGlance(read)` is the pure half — both
  facts come from the readers `PageSetup` already uses (`readPageView` +
  `pageSummary`, `readMarginView`), so there is no second walk of the document,
  and each DECLINES rather than guesses: `pageSummary` is null for a size this
  build cannot name, and the margin is withheld for any wire form whose single
  value would be an invention (a scalar the reader normalises to the 25pt
  default is exactly that). A read that throws degrades to both null and the
  card disappears; a per-side value is carried verbatim in CSS order and
  `clip`ped. It deliberately does not fill the column — an empty state orients
  and offers, it does not pad.
- `panel/panelTabs.ts` — the panel's type→surface TABLE, framework-free:
  `PanelTab`, `applicableTabs` (content / decoration / placement, fixed
  order), `placementBody(type)` (`box` | `points` for `line` | `repeatGrid`
  for `repeat`) and `tabLessNoteKey(path)`. **The placement tab is withheld
  from BOX-LESS types** (`itemView.ts`'s `NO_BOX_WIRE_TYPES` — `line`,
  `page_break` and BOTH repeaters; all four wire structs are
  `deny_unknown_fields` and take no `box:`, so offering the box fields
  authored a parse error) UNLESS the type has its own placement editor:
  `line` gets its ENDPOINTS, `repeat` its GRID (`RepeatSection`, below).
  `repeat_flow` gets only its content tab (the data source). Exactly one wire
  type ends up with NO tab — `page_break`, which takes only `id` and
  `visible:` — and the suite walks the engine's `Item` enum to keep that true,
  which is what lets `ItemPanel` render the tab-less branch's note
  unconditionally.
- `panel/ItemPanel.tsx` — the content/decoration/placement tab SHELL only
  (renders `panelTabs`' answer; active tab clamped on type change).
  `VisibilitySection` renders OUTSIDE the tabs — it applies to every type, so
  it must not appear and disappear as the reader changes tab — and BELOW
  them, after the tab bodies (or after a single-tab body, or after the name
  field alone for the tab-less `page_break`). The page break earns a one-line note above the
  presence binding (`tabLessNoteKey` — `panel.pageBreak.note`, or
  `panel.pageBreak.noteFirst` at index 0, where the engine COLLAPSES the break
  and the general sentence would promise an effect the file does not have),
  because its empty panel is the whole item. The NAME field (`ItemIdField`,
  below) sits with `VisibilitySection` for the same reason — every type
  carries an `id` — and is never capability-gated, so no type's panel is ever
  empty (the old `panel.noEditable` placeholder was retired with it). The two
  FORM MARKS (`MARK_TYPES`) take ALL THREE: they are boxed, their
  presence is content, and their outline is decoration — reached through
  `STYLED_TYPES` (which is `BORDERABLE_TYPES` plus `line`, the marks and
  `char_grid`)
  rather than through the border set, because their editors differ. Tab
  bodies live beside it. The CONTENT tab is two siblings, not one — the
  section plus `LinkField.tsx`, which self-gates on `LINK_TYPES` — because
  `ContentSection` routes by early return and an `image` never reaches its
  bottom, so a field added INSIDE it would appear for `text` and silently not
  for the other carrier. `ContentSection.tsx` (per-type
  routing ONLY — the plain-text surface is `contentText.tsx`
  (`TextContentField`), split out when the rich-text route left the router
  carrying more body than routing; image/page-number surfaces in
  `contentParts.tsx` (the image's fit through the shared `FitField`), the bound-mode half in `contentBound.tsx`
  (`BoundContent` — the data-key picker plus the two options that ride a
  binding, `format` and `placeholder`. Both live on the BINDING
  (`data.format`/`data.placeholder`), not at the item root, so every
  data-bound type takes them — a `char_grid` included, whose `data:` is the
  same `Binding` and whose content resolves through the same
  `resolve_content`)), `StyleSection.tsx` (a router: a table to
  `TableDecorationSections`, anything else to `ItemDecorationSections`),
  `BoxSection.tsx` (+`boxFields.tsx`, +`CharGridSection.tsx`,
  +`SpacingSections.tsx`), or a type's own
  placement editor (`LinePointsEditor`, `RepeatSection`); shared prop contract in
  `itemPanelProps.ts` (`ItemPanelProps` + `hasCapability`); shared
  helpers in `panelHelpers.tsx` (`HelpfulHeading` over the `HelpTopic`
  vocabulary — `content`/`spans`/`style`/`placement`/`placementChild`, each value
  also the catalog SEGMENT `help.<topic>.title`/`.body`, so a topic is two
  strings rather than another branch; `FieldHelp` over the parallel
  `FieldHelpTopic` vocabulary — `rulingWidth`/`rubySize`/`kinsoku`/
  `styleNames`/`link` — for the `?` on ONE field rather than a section heading,
  attached on the criterion that the field's NAME does not let a reader
  with little IT background infer what it does (`Cell size` is excluded
  by that criterion, not by oversight); `chipsFor`,
  `documentScopeCreateField`, `scopePickerProps`) — no section imports
  another for a helper.
  - The static-text content field is the shared `text/TextEditor` chip
    editor over the SAME `text/chipContext.ts` context the canvas
    overlay uses; commit = `text/declModel` `commitOps` via `applyAll`.
    Its `onDraft` runs through that SAME `commitOps`, handing the ops up
    as `onTextDraft` (→ `usePreviewSession.setDraftOps`), so what the
    canvas shows while typing cannot drift from what blur will write — a
    staged chip's declaration included. Nothing is authored: the ops are
    applied to a throwaway document (`preview/draftTemplate`).
  - The placement tab composes PARENT-FIRST (`ParentContainerCard`, then the
    item's own placement, then a container's own `LayoutSection`). Its
    heading is a `HelpfulHeading` in BOTH arms (plain and classified), but
    WHICH FRAME it names follows the placement kind: `x`/`y` are an offset
    from the PARENT BOX ORIGIN (`docs/engine/box.md`), which is the margin
    box only for a band / absolute-body child and for a flow child's x —
    those get `placement` (the rectangle `canvas/marginGuide` outlines is
    literally where their numbers start, and the SHEET is what warns).
    A container child and a sub-template item measure from their container
    and are bounded by `child_overflow`, so they get `placementChild`,
    which names the container and explicitly disowns the drawn rectangle.
    One topic for all four would re-create the very misconception the guide
    exists to remove, one nesting level down. It is
    placement-mode-aware via a pure pair split by SOURCE OF TRUTH —
    `panel/placementModel.ts` reads/authors the DOCUMENT (so it stays
    correct when a render fails) and `panel/placementGeometry.ts` needs
    the render: `placementFor` classifies pinnable/flow/coordinate/plain
    from the document alone — a repeating sub-template is `plain`, asked
    through `tree/subTemplate`'s NARROW `insideSubTemplate` (the panel's one
    reach into `tree/`; the frame itself needs no widening here because it
    has no trailing index, so `ownerPathOf` answers `null` for it) — and
    `pinOps`/`unpinOps` write back exactly
    the `box.x`/`box.y` keys it reads as `pinned` (x+y in one batch;
    unpin removes only present keys), while `resolvePlacement` turns
    LAST-GOOD inspect boxes into display/pin values (displays stay
    stable across a render cycle; `geometry.fresh` gates only the PIN
    action) over `childMarginInset` (the engine ADDS a child margin when
    placing, so the pin math subtracts it; `%`/garbage margins disable
    the toggle). A pinnable
    child gets the auto⇄fixed `ui/Segmented` (native-radio segmented
    control); unset w/h seed resolved sizes into dimmed steppers.
  - The decoration tab of a non-table item is collapsible sections
    (`ItemDecorationSections`, `PanelSection` + the `item.*` `SectionId`s): Text,
    Overflow, Fill and border (or the item's own stroke editor — a `line`'s
    `LineStyleEditor`, a form mark's `ShapeStyleEditor`, neither of which
    strokes a border box), Opacity, Styles; the first section starts open, except that a
    container opens on its fill, not on the text it only hands down, a
    section with no control this type honours is not rendered, and each shows
    a closed summary (`itemSectionSummaries`). WHICH type gets which control is
    `styleSurfaces.ts`, read from the layout source. A **table** leaves it
    altogether: `StyleSection` routes it
    to `TableDecorationSections` (the collapsible sections below). The fill is
    still the exception there: the engine paints no `style.backgroundColor` on
    a table (asserted in `engine/layout/tests/e2e/table/style.rs`), so the
    swatch is withheld unless the document already carries one — in which case
    it sits in the table-style section under the banner reporting it as
    ineffective and offering to clear it (`IneffectiveFillBanner`, rendered with
    or without `table.style`, so the section exists whenever a fill does),
    rather than hiding a key the panel could then never remove. Each unset style field carries
    a `panel/OriginBadge.tsx` effective-value hint (resolved value — or its
    option label, through `valueLabel` — + origin default/style/inherited + a
    to-document-settings jump; the engine-floor origin shows no jump).
- `panel/TableColumnsSection.tsx` — the body of the 「Columns」 section for a
  selected table (no heading of its own): source rebinding via the array-group
  picker, then per-column label / ▲▼ reorder / delete / a plain-text kind
  label on a non-text column (switching is the column form's), then label-only add
  beside the column-sheet opener — each ONE op over
  `panel/columnsModel.ts` (`readColumnsView` — whose row carries the column's
  own `style.textAlign` for the sheet's comparison row, its `kind`, `fit` and
  `data.placeholder` —
  `columnPathInfo`/`addColumnOp`/`removeColumnOp`/`moveColumnOp`, plus
  **`readSelectionView`**: the view the FORMAT TOOLBAR resolves a selection
  through. `readItemView` requires a string `type`, which a column carries only
  when its author spelled the default out — so the toolbar used to appear for
  `type: text` columns and vanish for the ones the scaffold emits, the same
  column either way. A column's default type IS `text`, supplied here (spread +
  literal key, so a document `__proto__` stays inert data); a column that is not
  a map still gets nothing, since the op layer would refuse the write). Because
  the view reads as a `text` item, the column's bar carries the full text control
  set — typography, the style picker (`styleNames` is a real column key) and the
  item border control — not only the alignment the change was motivated by;
  A column authoring `type: qr_code`/`image` reads as THAT item here, so its
  bar is the image/QR one (fill, style picker, border) while `ColumnForm`
  offers fill and the header-label alignment — the two surfaces differ
  deliberately by what each owns.
  `toolbar/cascade.ts` supplies the layers that make those values TRUE for a cell
  (`row.style` over the table's own style, mirroring the engine's
  `resolve_row_style`), which a `container`-only ancestor walk did not.
- `panel/sourceScope.ts` — the source-picker wiring shared by the table
  section and `IterableSourceSection` (props + a commit callback, not a
  pure model): `sourceOptions` (the TOP-LEVEL array groups as picker
  options), `rowSourceOptions` (the arrays the enclosing row itself
  carries, keyed row-relatively) + `sourceScopeProps` — inside a row
  scope the row's own arrays stay element-scoped offers while the
  top-level ones move to the document section and author
  `scope: document`, since only those need the escape. A `repeat_flow`
  or `repeat` is passed no groups: both are flow-body-only and layout skips
  one nested in a cell, so a row-relative offer there would author a source
  that never draws.
- `panel/ColumnBindingFields.tsx` — the binding pair a column earns
  (`FieldPicker` for `data.key`; `FormatPicker` once a key is picked,
  its options type-resolved through the row options), shared by the
  columns section and `ColumnForm`. A `cell:` column gets neither, and an
  image column no format (the engine ignores one there) — those guards are
  this component's whole contract.
- `panel/columnKinds.ts` (pure) — what a column RENDERS (`ColumnKind`:
  `text` / `qr_code` / `image` / `cell`; `columnKindOf`, `cell` winning over
  `type` as layout draws it, hostile shapes reading as text) and
  `offeredKinds` — `table.column.type` / `table.column.cell` plus the kind the
  column already has. `panel/columnKindOps.ts` (pure) — `kindSwitchOps`, ONE
  batch per switch: between bound kinds only `type` moves, plus `fit` when
  leaving image (the key the engine warns on); `format`/`placeholder` stay,
  hidden on an image column. Into a `cell:`, the binding moves into one item
  (`carryBinding`: the wire's four keys, own strings only) — a QR code or
  image item with a 100%×100% box, since a box-less one draws nothing — in a
  frame from `panel/carriedCellFrame.ts` (pure): `box.padding` = the table's
  `cellPadding` (4 when unset) and `box.justifyContent` = the column's
  effective vertical alignment through `tableValignIn`, the two things a
  container cell does not get from the table; out of
  one, `cellSummary` (top-level count + types, the first bound item
  depth-first, bounded in depth and nodes) lends its binding back. Removals
  are emitted only for keys present (`removeKey` fails on an absent key).
- `panel/useColumnKindSwitch.tsx` — the one door both column surfaces switch
  through: applies the batch, or holds a switch OUT of a `cell:` that has
  items behind a `ui/Modal` naming the column, the item count and kinds
  (`tree/labels` `kindName`), what carries, and the platform's undo key
  (`help/shortcutsModel`). `panel/ColumnContentFields.tsx` — `ColumnForm`'s
  content block: the kind picker — a `ui/Select`, not segments, since four kind
  names do not fit the panel in every locale (absent when only text is
  offered; a per-kind hint in the description channel, as a Headless `Field` +
  `Description`), `ColumnBindingFields`, the
  blank-row placeholder on a BOUND text/QR column (`binding.placeholder`; a
  placeholder without a key would be a binding the engine refuses), and
  `FitField` on an image column. `panel/FitField.tsx` — the `fit` picker an
  image item and an image column share: `ui/Select` options naming each
  `ImageFit` mode by its result with a drawn glyph, the default row clearing
  the key, `cover`/`none` behind `image.fit.cover_none`.
- `panel/IterableSourceSection.tsx` — `repeat_flow`/`repeat`/`list` source
  rebinding (+ a list's per-entry `text:` template): every scaffolded
  kind stays editable. For the cards and the grid it also offers the jump
  INTO the per-element frame (`frame` + `onSelectPath`, computed by
  `ContentSection` through `frameOf`; none for a `list` or a frame the
  document does not carry as a map), and a kind-specific `footer` after the
  binding — a `repeat_flow`'s `CardGapField.tsx` (its own top-level `gap`, the
  n-up sheet's `relativeGapOp` ingress: `%` allowed, a negative 0, garbage
  refused, empty removes).
- `panel/ColumnForm.tsx` — the single-column form a canvas click on a
  `…columns[n]` cell opens (a `cell:` column adds the jump into its
  `…cell` frame): label, the content block (`ColumnContentFields`), the
  column's NAME (`ItemIdField` — a column `id` is one box-index placement per
  cell and a host asset policy's key for its dynamic images), width
  (scope via `bindingScopeFor`), then the column's OWN cell style — the same
  `TableBandFields` at `columns[n].style`, over `cascadeContext(read, path,
  floor)` (a column has a path, so its row band and table come for free), which
  is how a money column becomes right-aligned. On a QR code or image column
  the band drops its type controls (`BandFieldsHost.typography: false` —
  nothing there carries text) and the hint says the content is centred. It says so: a column's `textAlign`/`verticalAlign` also wins
  for that column's own header LABEL over the header row's
  ([table.md](../engine/table.md)).
- `panel/groupModel.ts` — pure model for table `headerGroups` editing
  (columnsModel's sibling): `readGroupsView` (hostile-tolerant
  `{label, span}` rows, indices true), `groupPathInfo` (trailing
  `.headerGroups[n]` recognizer), `groupCoverage` (which columns a group
  sits over — the engine's floor-at-1 + clamp accumulation mirrored, so
  the panel reports what the render draws; `null` = dropped group), and
  `spanOp` (NUMBER literal at the group's own path; refuses
  empty/0/non-integer/out-of-range rather than clearing a required key).
- `panel/GroupForm.tsx` — the single-group form a canvas click on a
  `…headerGroups[n]` cell opens: label (blur-commit) + span
  (`StepperField` stepping from the RESOLVED coverage) + a hint naming
  the covered columns via `formatList` (impact scope before the edit),
  and a remove button (`removeHeaderGroupOp`) whose selection travels the
  way the Delete key's does, to the table once the last group is gone (the
  Delete key itself routes a group through the same `removeHeaderGroupOp`, so
  both leave the same file). Under
  it, as the button's description, a notice that the LATER groups move left —
  shown only when there are later groups and this one covers columns, since a
  group has no start column of its own.
  Between the hint and the button sits the group's 「書式」 part,
  `panel/GroupStyleFields.tsx` (`GroupStyleContext`, gated on
  `table.headerGroups.style.fill`): `TableBandFields` at the group's own
  `style.*` over `bandContext(tableCtx, group)` — a group resolves over the
  TABLE, not the header band (`engine/layout/src/engine/table/span.rs`) — with
  vertical alignment (a group honours it) and an unset fill shown as the
  engine's `#ededed` — the group row's band resolves from an EMPTY style, so the
  header band's fill never reaches it — then its `styleNames` via
  `AdvancedStyles`. The form's
  host inputs (`fontFamilies`, `capabilities`, `floor`) arrive as one `host`
  bundle threaded from `CellPanel`.
  Adding a group lives in the table's settings section below — there is no
  group to select before the first exists.

A selected table's two tabs are COLLAPSIBLE SECTIONS (Google Docs' 「Table
properties」 shape), not the flat tabs every other type gets:

- `panel/PanelSection.tsx` — one section: `<h3><button aria-expanded>` (chevron
  rotated when closed, title, and — only while CLOSED — a two-line-clamped
  summary) with the section's one `HelpHint` as a SIBLING of the toggle (no
  nested buttons; its accessible name is `panel.section.helpLabel`, its bubble's
  lead line the title). The toggle's accessible NAME is the title alone
  (`aria-labelledby`); the summary is its DESCRIPTION (`aria-describedby`) — it
  always resolves and can carry document text. A closed body is not rendered.
  Takes a `SectionId`.
- `panel/sectionOpenState.tsx` — `SectionOpenProvider` + `useSectionOpen(id,
  defaultOpen)`: Designer-local UI state (never in the template, never
  persisted). The provider is mounted in `Designer.tsx` because the tab bodies
  UNMOUNT on a tab switch (Headless UI `TabPanel`) and `PropertyPanel` swaps its
  body per selection branch, so section-local state would die on a tab switch
  alone; with no provider a section keeps state of its own. `SectionId` is a
  closed union.
- `panel/TableContentSections.tsx` — the content tab: 「Columns」 (open at
  first), 「Rows and cells」, 「When the table crosses a page」 (absent when
  `pageMode` is `null`), 「Blanks」, 「Header groups」 (`table.headerGroups`).
- `panel/TableDecorationSections.tsx` — the decoration tab, in the engine's
  layer order: 「Table style」 (open at first; `table.style`, or an ineffective
  fill to show), 「文字（表全体）」/"Text (whole table)" (`panel/TableTextSection.tsx`, `table.style`-gated: the
  band controls at the table's OWN `style.*` over `cascadeContext` — what every
  cell inherits — minus the background and the vertical alignment, which the
  engine ignores on a table's own style; summary `textSummary`), the
  typesetting section (`table.typesetting`, `TypesettingSection` — the six keys
  every cell inherits), 「Border」 (`style.border`; the `BorderEditor` with `isTable`,
  whose own `?` and table note serve the section, so its heading has none),
  「Header row format」/「Body row format」 (`table.style`), 「Conditional
  formatting」 (`TableConditionsSection` in `RowConditions.tsx`, which owns its
  own `PanelSection` and gate, `table.row.conditionalStyles`), 「Named styles」.
  The flat tab's 「Style」 heading is not rendered for a table. The body band's
  `?` composes the 「Table style」 title key into its sentence (`{section}`)
  rather than retyping it.
- `panel/tableContentSummaries.ts` / `panel/tableDecorationSummaries.ts` (pure) —
  the closed-section summaries, over the SAME read models the bodies render from,
  with ONE deliberate extra wire read (`borderWidthRaw`, below): lengths as `lengthText` (bare number → pt, else
  verbatim), parts joined by `panel.tableSection.sep`; bands report AUTHORED
  values (plus the band's named styles by name); the border names grid (one
  number, default 0.5pt when unset) vs outer frame by the RAW wire FORM
  (`borderWidthRaw` — a per-side map is a frame even with four equal sides, which
  the parsed side map cannot tell; a hostile shape gets no summary line). `helpText` joins a section's `?` lines,
  dropping empty ones, so a control's line is passed only while that control is
  on screen (the column-sheet line: the host passed `onOpenColumnSheet`; row and
  header heights: `table.row.height`; keep-together: flow + capability; merge,
  hide-header: capability; the table-style text only when `table.style` is there
  at all); EVERY line that explains one control goes through `controlHelp`, which
  leads it with the control's OWN label key via `panel.tableSection.helpLine`, so
  help and label cannot drift. The Border section is the one without a `?` of its
  own (the border editor carries one).

The table's ROW and PAGE settings are sections of the content tab, under the
columns, over a pure read model and a pure op module:

- `panel/tableSettingsModel.ts` (pure, READ) — `readTableSettings`: the row
  mode (`fixed` exactly when `row.height` is present), the three heights and
  `cellPadding` as verbatim text, `emptyBehavior`, and the four switches read
  STRICTLY against the engine defaults (`autoPageBreak`/`repeatHeader` on unless
  a real `false`, `keepTogether`/`mergeEmptyCells` off unless a real `true`).
  Own-key reads; a hostile table degrades to the defaults. Carries the engine
  defaults it mirrors (`DEFAULT_ROW_MIN_HEIGHT` 24, `DEFAULT_CELL_PADDING` 4).
- `panel/tableSettingsOps.ts` (pure, WRITE) — every builder returns `null` for
  an entry the wire should not get. `rowLengthOp`/`rowLengthStepOp` (absolute
  lengths only, `MAX_ROW_HEIGHT_PT`, no negative, no 0 for a fixed height),
  `rowModeOps` (fixed seeds `row.height` from the authored minimum and drops
  `row.minHeight` in the same batch; auto removes `row.height`),
  `cellPaddingOp`/`cellPaddingStepOp` (the all-sides rule of `edgeModel`, steps
  from 4), `emptyBehaviorOp` and `flagToggleOp` (back to the default REMOVES the
  key), `uncoveredColumns`/`addHeaderGroupOp` (a new group spans every column
  still uncovered, via `groupCoverage`) and `removeHeaderGroupOp` (the last group
  takes the `headerGroups` key with it).
- `panel/TableSettingsSection.tsx` — two section BODIES over one
  `TableSettingsContext` (path, controller, capabilities, `onSelectPath`), the
  context every table-settings body takes: `TableRowsBody` (the row heights
  above, then cell padding) and `TableEmptyBody` (the empty-data select and the
  merge switch, `table.mergeEmptyCells`). No heading, no `?` on a switch — the
  section around each body carries both.
- `panel/TableRowHeights.tsx` — the auto⇄fixed `ui/Segmented` and the height
  fields, behind `table.row.height` — deliberately coarse: the key names the
  FIXED heights, but `row.minHeight` and `header.height` shipped in the same
  engine release, so no engine has `table` without it. An empty header height
  steps from the body rows' floor. An authored `%`/`em` height is shown
  verbatim with the ▲▼ disabled and the field's own hint
  (`panel.tableSettings.relativeHeight` — not the shared `stepper.relativeUnit`,
  whose "type it instead" this field would refuse); `applyRowMode` is the mode
  pick, exported so its re-pick guard is pinned below the UI.
- `panel/TablePageFields.tsx` — `pageMode`: `flow` when the table sits DIRECTLY
  in the flow body (`insertTargetOwner` on its parent list), `bounded`
  elsewhere, `null` when the panel cannot tell (no list entry, or a parent read
  that throws — `insertTargetOwner` would answer `container` there, and the note
  would assert a render fact nobody established). `TablePageFields` is the page
  section's body and takes that answer: `flow` gets the three page switches
  (`keepTogether` also needs `table.keepTogether`), `bounded` the note; on `null`
  `TableContentSections` renders no page section at all.
- `panel/TableGroupList.tsx` — the 「Header groups」 section's body: one row per
  group (label, or 「unnamed」, + the RESOLVED coverage via `groupCoverage`, so a
  crowded-out group says 0 columns) that selects `…headerGroups[n]`, then the add
  button (`table.headerGroups` gates the whole section), which selects the new
  group, with its disabled reason. Removing a group lives on `GroupForm`; it is
  not gated, since it only ever takes the key away.

The table's BAND styling is section bodies + two pure modules + a data module, ordered
the way the engine layers the bands (grid → header → body base → zebra → the
conditional rules the next section owns).

- `panel/tableStyleModel.ts` (pure, READ) — `readBand` (one band's eight
  properties — alignment, fill, colour, weight, family, size, italic, vertical
  alignment — out of whatever sits at `<owner>.style`, the table's own `style` too;
  a bare numeric size reads as its numeral; a non-map band or style degrades to
  unset) and `readTableStyle` → `{header, headerFill, row, zebra,
  ineffectiveFill, hiddenHeader}` (`hiddenHeader` reads `=== true`, so a
  document putting `"true"`/`1`/`{}` there cannot light the control up). `headerFill` is packaged as the same `EffectiveValue` the
  item style fields use, so an UNSET header fill renders through the shared
  `OriginBadge` as the engine floor `#ededed` rather than as a blank swatch;
  `TABLE_HEADER_FILL` mirrors `engine/layout/src/engine/table.rs` and a
  drift-guard test reads that file. Colours are reported VERBATIM — the render
  site decides what may become CSS.
- `panel/tableStyleOps.ts` (pure, WRITE) — `bandStyleOp` (one leaf
  `setScalar`/`removeKey` at `header.style.*` / `row.style.*` /
  `row.alternateStyle.*`, over `plainTextOp` so "empty clears" has one home),
  `zebraToggleOp` (takes the CURRENT value, not a desired on/off — the
  checkbox's state is derived from that value, so a boolean would create a
  can't-happen leg; it is therefore total), `clearIneffectiveFillOp`, and
  `hiddenHeaderToggleOp` + `HIDDEN_HEADER_CAPABILITY`
  (`table.header.visuallyHidden`) — the toggle takes the CURRENT value for the
  same reason `zebraToggleOp` does, and unticking REMOVES the key rather than
  writing `false`. Removing
  the last band property prunes the emptied maps, so a band edited and cleared
  round-trips byte-identical (pinned over a real `Editor`).
- `panel/tableStylePresets.ts` — Excel's table-style gallery as six looks over
  a FIXED owned key set (header fill/colour/weight, zebra fill, grid width).
  Applying one authors what it declares and REMOVES the owned keys it does not,
  in one batch; anything outside that set (a hand-set alignment, a row colour)
  is never touched. `matchPreset` derives the active entry from the WIRE each
  render, so the gallery holds no selection state. Lookup is a `Map`, never a
  plain-object index — a preset id is a string from a click handler, and a
  `Record` lookup would answer `constructor` with an inherited function.
- `panel/TableStyleSection.tsx` — the 「Table style」 body over a
  `TableStyleContext {path, controller, capabilities, floor, fontFamilies}` of
  its OWN rather than `ItemPanelProps`: `IneffectiveFillBanner` (its own export,
  since it renders whether or not `table.style` is declared) and `TableStyleBody`
  (miniature, gallery, the zebra switch with — only while banded — the stripe
  colour swatch at `row.alternateStyle.backgroundColor`, the hide-header switch).
  `panel/TableBandBody.tsx` is the two band sections' body over the same
  context (`band: 'header'` — the hidden-header note + the header band's fields,
  vertical alignment behind `table.header.style.verticalAlign` — or `'row'`,
  vertical alignment behind `table.style.verticalAlign`), each followed by its `AdvancedStyles` (the body band's
  with the even rows' `alternateStyleNames` list beside its own). It assumes
  nothing about the panel's ~255px column: appearance editing is expected to
  move into a modal sheet, and a test mounts the bodies standalone so that move
  stays a change of render site. The caller gates them on `table.style`; the
  hide-header switch nests its own gate (`table.header.visuallyHidden`, which an
  older engine parse-rejects outright). `gridWidthOf` (the preset-owned grid
  width, `custom` for a per-side map) lives in `tableStyleModel.ts`, where the
  summary reads it too.
- `panel/HiddenHeaderField.tsx` — TWO exports, because one idea has two
  ends: `HiddenHeaderToggle`, the 「hide the header row on the page」 checkbox,
  which `TableStyleBody` renders TOP-LEVEL beside the zebra switch (its
  peer — both are table-level decisions, and Excel puts this one at the top),
  and `HiddenHeaderNote`, the note that keeps the header band honest, which
  stays in the header-row section beside the band fields it names. What the
  switch means is the table-style section's `?`, not one of its own. The CHECKBOX is
  capability-gated
  (`table.header.visuallyHidden`; an older engine parse-rejects the key), the
  NOTE is gated on the authored value instead — a document can carry the key
  against an engine that would not offer it. The fields stay editable: the
  engine paints none of them while the row is hidden, but disabling would hide
  values the document really carries.
- `panel/TableStyleGallery.tsx` — the two pictures: `TableMiniature` (the live
  banding — it takes `hiddenHeader` and draws the header row ink-free but
  full-height, because a miniature that kept painting the band would contradict
  the checkbox directly above it) and `TableStyleGallery` (the thumbnails). FIGURES, not renders — the
  canvas carries the real engine preview — drawn over a fixed paper-white ground
  in BOTH schemes, because the page they depict is paper.
- `panel/bandCascade.ts` (pure) — the cascade CONTEXT of a table's bands.
  `header`/`row` are map keys under the table item, not indices, so there is no
  path to hand `cascadeContext`: `bandContext(tableCtx, owner)` composes it
  instead — the band's own `style`/`styleNames` as the item, the TABLE pushed in
  as the innermost ancestor, which is the engine's own arrangement
  (`engine/layout/src/engine/table/atom.rs` sets the inherited context to the
  table's computed style around both the header atom and every row atom).
  `readBandCascades(read, tablePath, floor?)` reads both bands in one pass;
  `ruleContext(tableCtx, rule)` is TWO applications of `bandContext` — a
  row-condition rule is one more layer over the body band, which is literally
  what `apply_row_conditions` does, and `alternateStyle` is deliberately not in
  the stack (the zebra applies to every other row and the card shows one value);
  `bandInk(ctx)` is what the MINIATURE draws (effective, not authored);
  `tableValignIn(ctx)` resolves `verticalAlign` the engine's way — own, named,
  then each ancestor layer out to and including the first `type: table` one —
  the one non-inherited key this walk carries (the header LABEL row also clones
  its band's whole computed style, so other non-inherited keys ride along
  there) — and `TableBandFields` uses it only for a `'table'` `ValignHost`
  (`headerValignHost`/`bodyValignHost` map the engine's two keys; `'own'` is an
  engine with the header key alone, whose cells never fall back);
  `documentOrigin(eff)` is the badge predicate. A column needs none of this —
  it has a path, so `toolbar/cascade` already puts the row band and the table
  under it. `backgroundColor` travels none of these ANCESTOR layers (it does not
  inherit): a cell looks like it carries the row band's fill because the row
  band PAINTS beneath it, and the panel must not report paint order as a
  cascade. Two riders: a named style is not an ancestor, so a `styleNames`
  background is document-made and does earn its line; and a row-condition RULE
  genuinely does inherit the band's background (`apply_row_conditions` overlays
  onto the resolved row style), which this module does NOT express yet — the
  header note carries why.
- `panel/TableBandFields.tsx` — the controls one styled band carries, in Google's
  format-toolbar order: family + size (`panel/BandTypeFields.tsx`), bold, italic,
  text colour, background, horizontal alignment, vertical alignment — rendered
  for the header band, the body band, one column's cells (`ColumnForm`), one
  row-condition rule, one header group and the table's own 「文字（表全体）」 section: the
  same `Style` properties, only the caller's key path differs (`{ctx, path,
  keys}`). The HOST decides what the set includes through one `BandFieldsHost
  {fontFamilies, verticalAlign, fill}` bundle: vertical alignment only where it
  reaches the page (header band, a column and a group behind
  `TABLE_VALIGN_CAPABILITY`; the body band, a rule and the table's own section
  behind `TABLE_BODY_VALIGN_CAPABILITY` = `table.style.verticalAlign`) and no
  background on the table's own style (`BandFieldsHost.verticalAlign` is a
  `ValignHost`: `false` / `'own'` / `'table'`). Where the engine declares the
  body key its value is `bandCascade`'s `tableValignIn`, not the plain
  cascade: a cell falls back through the table
  layers under it out to the table (never past it), so a column over a `top`
  band shows `top` and re-picking `middle` authors it. The
  shared parts — `AlignSegment`, `VAlignSegment` (unset = `middle`, via
  `alignWire`'s `fallback`), `BandToggle`, `HintLabel`, `OriginLine`,
  `floorHint` — live in `panel/bandFieldParts.tsx`. Every
  control shows its CASCADE-EFFECTIVE state — the toolbar's semantics, so a
  column whose row band is bold shows a CHECKED box — and therefore authors
  through `toolbar/wire`; a control rendering an inherited value over a raw
  set/clear either does nothing when clicked or makes the value jump. Origin is
  told twice over by weight: a value the DOCUMENT made (named style / ancestor /
  `defaults.style`) gets the shared `OriginBadge` LINE, a value the ENGINE floor
  made gets a hover bubble that is ALSO the control's `aria-describedby` target
  (the hover group is the whole FIELD, so pointing at the control shows it, and
  the origin is a DESCRIPTION rather than part of the name — a name is re-read
  on every visit, and these three always resolve), because
  `textAlign`/`color`/`fontWeight`
  always resolve and a line apiece would be permanent chrome saying nothing. The
  header band's floor FILL is the deliberate exception and keeps its line —
  `#ededed` is a grey nobody authored (a header group passes its band fill the
  same way). SIX hosts render it: the header band, the body band, a column's
  cells (`ColumnForm`), one row-condition rule (`RuleControls`), one header group
  (`GroupStyleFields`) and the table (`TableTextSection`). The column sheet's
  per-column row (`TableColumnCells`) takes `AlignSegment` alone from
  `bandFieldParts`.
- `panel/AdvancedStyles.tsx` — the 「名前付きスタイル」 disclosure under a band /
  rule / group, named after what it holds: its named-style checklist(s) (`StyleNamesPicker` with `keys` naming the
  wire slot), closed by default; while closed it SAYS how many named styles it
  holds (`panel.styleNamesToggle.count`, all its lists together), because a style in effect behind a closed
  door is the question a non-engineer cannot answer. Open state is local UI
  state. `namesAt(node, keys)` is the own-property, strings-only read.
- `panel/RowConditions.tsx` — the table's 「Conditional formatting」 section
  (`TableConditionsSection`, its own `PanelSection` + gate) in Google Sheets'
  conditional-format sidebar shape: `RowConditionsSection` shows either the rule
  LIST or ONE rule's view in its place. Its inputs: path, controller, floor,
  the raw entries, the row-scope `options`, and one `host {fontFamilies, params,
  dataKey}` bundle. Add appends a rule as ONE op and opens it; remove is on the
  list row. The section never evaluates a predicate — how many rows a rule hits
  is the canvas preview's answer. Parts:
  - `useOpenRule.ts` — the open rule, local UI state held as a WIRE index and
    kept on the same rule while the list changes under it, through
    `controller.subscribe`: an applied change is remapped exactly from its ops,
    an undo/redo (which reports none) from the list before and after
    (`openRuleRemap.ts`: `openAfterOps`, and `followOpenRule`, which follows
    only a recognisable shape — a permutation by value, one entry out or in by
    the index shift — because a value match alone would jump to another rule
    that equals the undone one). An index past the end shows the list.
  - `RuleList.tsx` — the LIST: the cards REVERSED (`ruleOrder.ts`: the engine
    applies entries in listed order and a later one wins, so the top card is the
    last entry — Sheets' "top wins" reading; only the list maps, the wire, the op
    builders and the open index stay in wire indices), the precedence note at 2+
    rules, add disabled at `MAX_ROW_CONDITIONS` (16, the engine's
    `MAX_ROW_CONDITIONAL_STYLES`, pinned by a source-reading drift test) with a
    reason line, and a "not applied" line on a hand-authored card past the cap.
    A reorder is ONE `moveItem` (`moveRuleOp`; up = wire +1), from a card's ↑/↓
    buttons — the focus follows the moved rule, to the other button when the
    move reached an end — or its grip's pointer drag (`useRuleDrag.ts`, over the shared
    `hooks/usePointerReorder.ts` machine: the layer tree's `dropIndexFor` in
    display positions; the drop line and the release both read `dragMoveOp`,
    which maps `moveOpFor` from display to wire).
  - `RuleCard.tsx` — one LIST row by DISPLAY position: the grip (`IconGrip`;
    it and ↑/↓ render only at 2+ rules), the sentence
    (`ruleSummary.ts`, shared with
    the view's heading: when … is …, is yes, is no — a boolean `equals: true`
    reads as yes), ↑/↓ (disabled at the ends), the remove button and the applied-style chips
    (`ruleStyleChips.tsx`: colours as swatch dots, LABELLED as what the rule
    ADDS, and saying outright when it adds nothing — decided from the WIRE
    (`styleKeyCount` + `styleNameCount`), never from whether a chip was produced;
    `fontWeight: normal` and the unmodelled properties earn chips of their own).
    Pressing the row opens the view.
  - `RuleControls.tsx` — one rule's VIEW: back button, the sentence, the
    row-scope `FieldPicker`, the value control, the format presets
    (`RulePresetGallery.tsx` over `rulePresets.ts`: Sheets' formatting-style
    samples as "Aa" TILES — pictures, not a text menu, whose names are the tiles'
    hover bubbles and accessible names; a preset authors its declared keys over
    a FIXED owned set (`backgroundColor`/`color`/`fontWeight`) and removes the
    owned keys it does not declare, in ONE `applyAll`; the active tile is
    `matchRulePreset` over the wire; `Map` lookup), the SHARED `TableBandFields`
    at the entry's `style.*` over `ruleContext` (vertical alignment only behind
    `TABLE_BODY_VALIGN_CAPABILITY`, via `host.verticalAlign`), the
    rule's `styleNames` in `AdvancedStyles`, and 「完了」. Every edit applies at
    once, so back and 「完了」 both only return to the list. It takes the entry
    PATH, not its index.
  - `ValueControl.tsx` (+ `ValueChips.tsx`) — the value control the picked field
    earns, SHARED by the rule, `VisibilitySection` and `MarkSection`: a boolean
    field → yes/no (`ui/Segmented`; yes = no `equals`, no = the boolean
    `false`), shown only while the wire's `equals` is absent or a boolean
    (`boolEquals`) — a quoted `"false"` or any other stale value keeps the
    free-entry arm so it stays visible and clearable; an enum → its values as
    chips (a select past `MAX_VALUE_CHIPS`); anything else → free entry with a
    `useReseedKey` (the commit normalises through `equalsLiteral`) plus the
    sample data's values as chips (`ruleValues.ts` `sampleValues`: bounded rows
    and chips, own-property walk via `pickerModel`'s `step`, strings and numbers
    only, a value too long to show whole SKIPPED rather than truncated).
  - `ruleInputs.tsx` — `SwatchRow`, the labelled colour row the band and rule
    editors compose.
- `panel/rowConditionsModel.ts` (pure, READ) — `readRawEntries`/
  `readRowConditions`/`valueFormFor`/`openedRule` (the open rule, `null` once
  an undo took it away); a hostile entry still yields a row
  so indices stay true, and a hostile display string is truncated.
  `panel/rowConditionOps.ts` (pure, WRITE) — the op builders. The wire
  is a SEQUENCE, so an edit addresses ONE entry by `[n]` in the PATH and
  touches only its own leaf (a rule the user never opened must not move
  in the diff); the FIRST rule seeds the list with `putValue`. The `equals`
  literal follows the FIELD's type through `panel/equalsLiteral.ts` — ONE home
  for the rule, `visibilityOps` and `markOps`: a number for a numeric field, the
  boolean for `true`/`false` on a boolean field, else the text — because the
  engine predicate is type-strict. The three read models carry `boolEquals`
  (whether `equals` is a boolean literal) for the yes/no control.
- `panel/ItemIdField.tsx` — the node's NAME (`id:`), rendered by `ItemPanel`
  beside `VisibilitySection` for every item type, by `ColumnForm` for a column
  and by `FrameForm` for a sub-template frame; keyed by path at each host so a
  refusal does not outlive the selection. NOT capability-gated: every engine
  reads `id` on every holder (`ids/idWire.test.ts` pins the structs). What an
  entry means is `ids/idEdit`'s answer over the whole namespace
  (`ids/idIndex`, memoized on `revision`): a name another node carries is
  refused NAMING that node (the layer tree's label, else its kind name); a
  rename carries every anchor that named the old id in ONE batch, and the
  field states how many BEFORE the edit; clearing a name anchors still use
  waits on `panel/IdClearConfirm.tsx` (a modal — the destructive-confirm
  placement rule), which removes the id only. Uncontrolled input reseeded by a
  value+nonce key on every committing blur; Enter blurs, IME-guarded. A
  non-string authored id is shown as written, read-only, never overwritten.
- `panel/VisibilitySection.tsx` — an item's `visible:` presence binding,
  rendered OUTSIDE the content/decoration/placement tabs because it applies to
  every item type and is none of those concerns — and BELOW them, because it is
  the RARE, advanced one: heading the panel, it opened a rectangle's editor on a
  titled block with a two-sentence paragraph and a full-width button, above the
  background and border controls anyone opened the panel for. UNSET it is one
  row (title + the same paragraph behind a `?` + the button); AUTHORED it keeps
  the full card, in the same place. The tree's `if` badge is what announces a
  conditional item at a glance, so the panel need not shout it from the top. With
  the name field (`ItemIdField`) it is `page_break`'s whole editing surface (the
  wire takes only `id` and `visible:`), and a conditional page break is what
  this key is for. Gated on the
  `item.visible` capability — an older engine parse-rejects the key. The
  field picker follows the item's OWN data scope, derived from its path by
  `bindingScopeFor` like every other row-scoped surface: inside a `repeat`
  cell it offers the bound element's fields, with the top-level ones as a
  labeled second section that writes `scope: document` **in the same op
  batch** when picked. Offering document fields at element scope would author
  a key resolving to nothing — the item then vanishes with no diagnostic, or
  reports an undeclared one.
  `panel/visibilityModel.ts` (pure, READ) — `readVisible` → the row, or
  `null` when the item authors none / authors a non-map; re-exports
  `valueFormFor` so the two presence surfaces cannot disagree about which
  field type earns which control. `panel/visibilityOps.ts` (pure, WRITE) —
  `visible:` is a MAP, so every edit is a leaf `setScalar`/`removeKey`;
  clearing `collapse` REMOVES the key (unset never serializes) and a repoint
  reconciles a stale `equals` AND the data scope in the same batch (one undo
  step). A `page_break` gets no collapse control at all: the engine always
  removes one whose predicate fails, so the choice has nothing to choose
  between and the default's copy would state the opposite.
- `panel/TableColumnSheet.tsx` — the same per-column editing transposed
  horizontally in a bottom `ui/Offcanvas.tsx` sheet (columns as strips;
  header drag-reorder or Alt+←/→, ONE `moveItem` each; reuses the same
  pickers/models as the vertical section). It carries ONE style row —
  alignment, via the shared `AlignSegment` — because comparing columns is what
  this transposed view is for; the rest of a column's styling lives in
  `ColumnForm`. The existing sample row renders under the pick, so the row above
  it is showing its own effect. Parts:
  `useColumnHeaderDrag.ts` (the header reorder over the shared
  `hooks/usePointerReorder.ts` machine — Escape and pointercancel cancel, and
  the drop line down the whole column strip is painted from the same
  `moveOpFor` the release commits, so it shows only where a drop moves),
  `TableColumnCells.tsx` (the cell parts incl. the sample row over
  `displaySample`, and `ColumnAlignRow` — the alignment row itself, which lives
  there because the sheet file is the grid layout and nothing else),
  `TableTextCells.tsx` (the two hand-rolled free-text cells, `ColumnLabelCell`
  and `ColumnWidthCell`, split out for the line budget),
  `ColumnSheetBindingRows.tsx` (the data-key and format rows — the only two
  whose cell is conditional on the column's KIND: a `cell:` column's content
  is a sub-template, so it has no binding and no format, and both show a
  muted placeholder there rather than an empty grid cell),
  `ColumnKindCell.tsx` (the 「列の種類」 row's cell — a `ui/Select` over
  `offeredKinds` through `useColumnKindSwitch`, plain text when nothing else
  is offered; `sheetShowsKinds` drops the row when no kind is authorable and
  every column is text),
  `columnSheetData.ts` (what the sheet READS — picker options, the per-column
  format rows, the sample value, and `alignFor(index)`, each column's
  cascade-effective `textAlign`, so the sheet and `ColumnForm` agree about the
  same key rather than the panel contradicting itself; no floor is threaded
  there, since the sheet shows no origin and the floor changes only an origin
  LABEL).
- `panel/DocumentSettingsPage.tsx` — the fullscreen document view
  (page/size/defaults/styles/locale/formats), opened by the whole-document
  tree row / File menu / origin jumps: the page shell — header, the
  three-column layout, which sections the rail LISTS, and the preview
  aside via `canvas/PageUnderlay`; a nonce-keyed `focus` selects a
  jumped-to section. Its parts:
  - `panel/DocSectionBody.tsx` — WHICH surface each section shows. Split
    from the page so the page owns navigation and this owns the
    section→component map; a section's own capability gate lives here,
    because the 表示形式 section has TWO gated halves and either alone is
    still worth opening.
  - `panel/docSections.ts` — pure section vocabulary: `DocSection` (also
    the jump-target type `hooks/useDocViews.ts` speaks), `SECTION_ORDER`,
    `SECTION_TITLE_KEYS`, and `sectionSummaries` (one line per rail row,
    each read through that section's OWN pure model, so a hostile
    document degrades exactly as that section does).
  - `panel/DocSectionRail.tsx` — the rail: the view's table of contents
    AND its navigation (`current`/`summaries`/`onSelect`, plus an
    optional `sections` the page narrows by capability — a gated-off
    section leaves no row rather than a row opening onto nothing).
  - `panel/documentMetaModel.ts` — the pure `document:` model
    (`readDocumentMetaView` — a hostile node reads all-empty and a
    non-scalar list entry is dropped rather than shown as uneditable
    text; `metaTextOp`/`metaListOp` root-addressed, `setStrings` for the
    two lists like `styleNames`; `replaceEntry`/`removeEntry`).
  - `panel/DocumentMetaFields.tsx` — the section itself: title /
    description / keywords / authors / language, gated on
    `template.document.metadata`. `language` is a ComboField over the
    known locale tags because the engine charset-gates the tag and drops
    anything else. Its list rows are `panel/StringListField.tsx` — one
    input per entry plus a TRAILING BLANK ROW that appends (no "add"
    button: a button would have to author the empty entry the engine
    drops), Enter→blur guarded on `isComposing`.
  - `panel/BaseTextPreview.tsx` — the base-text section's preview (a
    sample paragraph set in the document's base text, over the engine
    floor from `buildStyleFloor`) — shown INSTEAD of the page preview,
    because that section's subject is the text, not the page.

## Page setup + margins

- `panel/pageSizes.ts` — page-size reference data (the 8 engine named
  sizes, pinned by the wasm integration test) + pure dimension helpers
  (the GUI composes wire length strings, never parses one back).
- The pure page-setup model, split the way the styles registry is — what
  the surface READS from what an edit WRITES:
  - `panel/pageSetupModel.ts` — the READ side: `PageView`/`CustomDims`/
    `Orientation`, `readPageView` (named vs custom `{ w, h }`, mixed-unit
    seeds re-expressed in one shared display unit), `sizeLabel`,
    `orientedDimensions` (the line under the orientation select: a KNOWN
    named size's oriented dimensions, `null` for custom or an unknown name) and
    `pageSummary` — the size's NAME plus its dimensions, or `null` when
    this build cannot describe the page; the PDF preview shows it, and a
    reassurance surface may not guess.
  - `panel/pageSetupOps.ts` — the WRITE side, every key a literal path:
    `selectSizeOp` (named→custom clears orientation+size in one batch so
    no `orientation_ignored` lingers)/`orientationOp`/`customDimOp`/
    `customUnitOps`, plus the ▲▼ pair `canStepDimension`/`stepCustomDimOp` —
    which steps by one of the DISPLAYED unit (the numerals and the unit select
    share it, so a point-sized step would be invisible under `mm` and enormous
    under `in`) and re-authors through `customDimOp`, so the buttons cannot
    reach a value typing the same thing is refused for: ▼ on a `1` would give
    the non-positive `0`, and nothing is dispatched. A builder DECLINES with a null op or a dropped
    batch entry rather than authoring something the model would refuse.
- `panel/PageSetup.tsx` — the form (size select with a locale-preferred
  optgroup and an "other sizes" one holding what the first does not — the
  two used to OVERLAP, listing a locale size twice; orientation; the
  `orientedDimensions` line — deliberately NO drawn page outline, the engine
  preview column beside the form (wide windows only, `lg:`) is the picture);
  embeds
  `MarginEditor` and, in custom mode, `CustomSizeFields`.
- `panel/CustomSizeFields.tsx` — the custom `{ w, h }` + shared unit
  cluster. The two numerals are `StepperField`s, which is where the whole
  commit discipline now lives: keyed by value PLUS a reseed nonce, committing
  on blur ONLY when the value changed (the displayed numeral can be a
  unit-converted view of the wire, so a blur-through would rewrite what the
  user never touched) and reseeding from the document afterwards, so a
  `composeDimension` that authors nothing does not leave the entry on screen.
  They were raw `<input type="number">`s, which meant the BROWSER drew a
  spinner here while the rest of the panel drew the house one. They wear no
  unit badge — the unit is the `shrink-0` select one cell away — and the row is
  `items-start` so the three labels sit on one baseline. Both opt into
  `inputMode="decimal"`: `composeDimension` takes a BARE numeral, so a decimal
  keypad can type every value they accept — which is what a plain
  `<input type="number">` gave them before the stepper absorbed them.
- `panel/marginModel.ts` — pure page-margin model (`readMarginView`
  uniform/perSide/legacy-array; mode-switch ops seed all four sides;
  per-side values carried VERBATIM, no unit conversion). The uniform ▲▼ pair
  (`canStepUniformMargin`/`stepUniformMarginOp`) steps by a POINT and
  re-authors through `uniformMarginOp` rather than through the shared
  `stepValueOp` the item fields use: that one would author `-1` from a zero
  margin, a value this field refuses from the keyboard. ▼ at the floor
  dispatches nothing and the button stays enabled. (The comparison this entry
  used to draw — that a native `<input type="number" min="0">` behaves the same
  — is false: a native input CLAMPS to its minimum rather than going inert. The
  behaviour is deliberate; the reason given for it was not.)
- `panel/MarginEditor.tsx` — the mode select + uniform or per-side
  inputs; every control an `applyAll` batch. The uniform field is a
  `StepperField` carrying the unconditional `pt` badge (it was a raw
  `<input type="number">` with a hand-rolled label and badge) and, on the same
  bare-numeral rule, `inputMode="decimal"`; the per-side ones are `TextField`s,
  which is why only they take the unit invitation and NOT the numeric keypad.

## Document defaults + named styles

- `panel/defaultsModel.ts` — pure (`readDefaultsView`,
  `INHERITED_STYLE_FIELDS` (drift-guarded subset), `CURRENCY_SUGGESTIONS`
  — the 25 codes every shipped locale pack carries display data for, pinned
  to the packs' `currency:` tables and shared with the data-item editor's
  通貨 entry —, root-addressed `defaults.*` op builders).
- The pure `styles:` registry model, split by what each half can be
  refused BY. Every op is keyed by a literal `keys` path
  (`['styles', name, …]`), safe for hostile names.
  - `panel/stylePlan.ts` — what an operation RESULTS IN, shared by all
    six consumers across `panel/` and `styles/`: `StyleOpPlan`,
    `StyleOpRefusal`, `refuse`, and the exhaustive
    `REFUSAL_MESSAGE_KEY` (refusal → chrome catalog key).
  - `panel/stylesModel.ts` — what the registry IS and how it READS:
    `MAX_STYLES`, `StyleEntry`, `readStylesView` (empty-string name
    skipped — unaddressable), `dedupe` (the `styleNames` hygiene the
    capture model reuses).
  - `panel/styleRefOps.ts` — what a rename/delete does to REFERENCES:
    `renameStyleOps`/`deleteStyleOps` rewrite the registry key AND
    every `styleNames`/`alternateStyleNames` mention in ONE batch,
    refused WHOLE on truncated/unaddressable usage or an over-cap batch.
  - `panel/styleFieldOps.ts` — what a create/update writes to FIELDS
    (nothing here reads usage): `styleFieldOp` (per-kind dispatch),
    `createStyleWithFieldsOps`, `updateStyleFieldsOps` (changed fields
    only — untouched keys byte-intact, never a whole-map replace).
- `panel/StyleFieldInput.tsx` — the ONE style-field widget shared by
  item panel / defaults / registry (enum select, fontFamily datalist,
  free text; `seedMode` keeps the unset option + placeholder fallback).
- `panel/DocumentDefaults.tsx` — the shell over the two unrelated halves
  of `defaults:`: it gates each on the engine's capabilities and renders
  the half its REQUIRED `section` prop names (the document-settings view
  supplies the heading). A headed standalone stacked form for a host
  wanting both at once was removed — nothing ever rendered it.
  - `panel/DefaultsLocaleFields.tsx` — the document settings half:
    locale/currency combos, each with a what-this-pick-DOES line whose
    every value is the ENGINE's rendered sample, arriving as the `facts`
    prop (`hooks/useLocaleFacts`). Nothing here formats. Each line is
    gated on what IT needs: the locale line NAMES the default currency
    code, so a pack declaring none (reported as an empty code) loses that
    sentence while the amount line stays. `facts === null` — no answer
    yet, an engine without `locale.facts`, an unresolvable tag, a pack
    this host does not ship — claims nothing, without exception: the tag
    goes to the engine as authored. The picker offers the engine-RESOLVABLE
    set (the chrome registry's `engineLocale` values, deduped, plus
    `ENGINE_ONLY_LOCALES`), not the chrome tags, because `defaults.locale`
    is a render fallback and `en-GB` authored a document the engine refuses.
    When the pack that answered is not the tag on screen (`ja` → `ja-JP`,
    the engine's only aliasing) the panel names it (`defaults.localePack`). The picker's option list is
    the chrome registry plus `i18n/locales.ts` `ENGINE_ONLY_LOCALES`
    (engine-resolvable locales with no Designer chrome: `th-TH`).
  - `panel/DefaultsStyleFields.tsx` — the cascade-root half: one field
    renderer (color as `ColorSwatchPicker`, everything else
    `StyleFieldInput`; engine fallbacks as placeholders from
    `engineDefaults.ts` `ENGINE_STYLE_DEFAULTS`) in ONE arrangement,
    `DefaultsStyleSection` (the `STYLE_ROWS` grid, drift-guarded, with
    the intro line and the recommended body-size one-click hint).
- `panel/DefaultsFormatFields.tsx` — the 表示形式 section's per-type half
  (`defaults.formats`): one `panel/FormatDefaultRow.tsx` per type, live
  over `controller.read('defaults')`. A row has TWO shapes and the
  asymmetry is deliberate — `date`/`datetime`/`currency` get a picker
  (the dated pair also a pattern surface), while `number`/`percentage`/
  `quantity` show what they render and offer NO control, because the
  engine has no named variants for them in v1 and any pick would only
  warn. Which shape a type takes is the ENGINE's answer
  (`FormatTypeEntry.fixed`), never a list kept in step here. An unset row
  reads 「ロケール既定」 with the sample the engine actually produces.
- `panel/formatDefaultsModel.ts` — pure: `readFormatDefaultsView` (each
  slot as `unset` | `name` | `inline`; garbage reads as UNSET),
  `formatDefaultNameOp` (empty CLEARS — an absent name IS the locale
  default) and `formatDefaultPatternOp`. The pattern op returns **`null`
  on an empty pattern**: `InlineFormat.pattern` is a required wire field,
  so the panel's usual "empty clears the key" would author a template the
  ENGINE CANNOT PARSE — a failure no gate reports, because the op
  succeeds and the YAML stays valid. An inline slot is edited at its own
  `pattern` key (`setScalar`, so the map's comments survive); any other
  slot is replaced whole, which is how the untagged `FormatRef` union
  switches arms.
- `panel/PatternField.tsx` (+ `hooks/usePatternPreview.ts`) — writing a
  date/datetime pattern, built the other way round from a text field
  because picking is safe and typing is dangerous: the TOKENS come first
  as chips each showing THEIR OWN rendered output and inserting
  themselves at the caret, with the raw string under them (editable —
  user decision: read-only would strand every pattern an existing
  document holds). One probe call answers the whole surface (the pattern
  first, then one per token); nothing here formats. FOUR preview states, not
  two: a probe the engine REFUSED (a pattern past its length cap) comes back
  with an empty sample, so without its own branch it reads as "nothing typed
  yet" — the hook carries `refused` through and the field renders the house
  error `<output>` instead of the prompt. The fourth is `unavailable` — the
  probe could not ANSWER, by either of TWO routes the hook handles separately:
  an answer SHORTER than the probe list (what a transport with no
  `formatCatalog` produces, since `useFormatCatalog` swallows that to `[]`), and
  a REJECTED probe promise, which the `probe` prop can deliver because it is a
  host seam — each has its own leg and its own test. It renders as its own muted
  line, because with no chips on screen the prompt was telling an author to
  press buttons that are not there. Any refusal reads as too-long, which
  holds only while the probe list stays under the engine's `MAX_PROBES`
  (pinned by a test); the copy carries no number, so the cap has one home.
- `panel/formatSummary.ts` — pure: the 表示形式 rail row's one-liner. It
  NAMES the first set type rather than only counting, so the rail answers
  "is the date format set here?" without opening the section.
- `panel/styleLabels.ts` — pure: `styleOptionLabel` (wire spelling →
  localized wording; degrades to the spelling) + `unsetLabel`; pinned
  against every `STYLE_FIELDS` enum option.
- `panel/StylesManager.tsx` — the registry CRUD SECTION: the registry
  read, the one `run(plan)` gate every mutation passes through (a
  refusal surfaces a localized `<output>` and changes nothing, an
  accepted plan is one `applyAll`), and which `StyleForm` Modal is
  mounted (keyed by target so a switch reseeds the draft).
  `panel/StyleRow.tsx` is what ONE row offers: the face = the name in
  its OWN style (`styles/preview`) + usage count / edit invitation, the
  overflow `Menu`, and the active `RowMode` body (inline rename
  `RegistryNameForm` / two-step delete confirm) — its six callbacks
  arrive as one `StyleRowActions` bundle, and it decides nothing about
  the document.
- `panel/RegistryNameForm.tsx` — the inline rename form both registries'
  rows open. Shared because they rename identically; the operation
  differs in what it REWRITES, not in how the name is taken.
- `panel/FormatsManager.tsx` — the `formats:` registry CRUD section,
  mirroring `StylesManager` shape for shape so an author who has learnt
  one registry surface has learnt both: the registry read, the one
  `run(plan)` gate, and which `FormatForm` Modal is mounted.
  `panel/FormatRow.tsx` is one row — name, wire kind, what the engine
  RENDERS for it (falling back to the raw pattern with no catalog), the
  reference count, and the overflow menu.
- `panel/FormatForm.tsx` — the unified Create/Edit entry form over
  `ui/Modal`: local draft, then ONE `applyAll`. Create authors the whole
  entry as a single `putValue` (the wire's `type` and `pattern` are both
  required, so the registry never briefly holds an entry the engine
  refuses to parse); an edit writes only the CHANGED keys.
- `panel/StyleForm.tsx` — what the unified Create/Update style form
  COMMITS, over `ui/Modal`: local DRAFT, then ONE `applyAll`; live
  `stylePreview` chip. Its two leaves: `panel/StyleNameField.tsx` (the
  name row — create authors it IME-guarded, an existing name is
  read-only with the rename hint badge) and
  `panel/StyleFormFields.tsx` (the `STYLE_FORM_ROWS` layout
  (drift-guarded) + per-key widget routing; colors via
  `ColorSwatchPicker`).

## Diagnostics

- `diagnostics/DiagnosticsPanel.tsx` — localized rows; a `path`-carrying
  row is a button reusing selection to highlight on canvas; a
  mechanically-fixable row renders a sibling fix button →
  `onApplyFix(ops)` (one `applyAll`). It shows TWO kinds: the engine's
  `diagnostics`, and the GUI's own `advisories` below them. The empty
  state requires BOTH to be empty.
- `diagnostics/collisions.ts` — pure: which items' DRAWN TEXT lands on
  another item's, from the box index alone. `findTextCollisions(boxes)`
  compares each drawn line's own rectangle (`x‥x+width` ×
  `emTop‥emBottom`, and the axis-swapped `emLeft‥emRight` × `y‥y+height`
  for vertical writing), never the border box — a full-width heading's
  BOX legitimately spans items pinned inside it, so box overlap is
  normal in a correct document and carries no signal, while the drawn
  line separates the authored page size from a widened one. Abutting em
  bands do not count, and neither does a DEGENERATE line (the engine
  emits a zero-width `LineMetric` for a blank line inside a paragraph,
  where nothing is drawn) — hence the intersection-LENGTH form of the
  overlap test rather than four edge comparisons, which also makes an
  inverted rectangle fail safe.
  **Two items sharing a path are never compared, which is a structural
  blind spot worth knowing**: an item laid out repeatedly (a `repeat`
  cell child, one box per element) carries ONE path across every
  placement, so row 1's cell overrunning row 2's is invisible here —
  reporting it would read "`price` overlaps `price`". The same rule is
  what stops a wrapped paragraph colliding with its own stacked lines.
  Because those placements interleave on the page, the dedup key is
  order-NORMALIZED (JSON over the sorted pair — a separator character
  could be one an author put in a path) or the same pair reports twice.
  Bounded on three axes: lines per page (applied to the LINE LIST, since
  one item can wrap to arbitrarily many), pairs compared per document
  (the collision cap short-circuits only after a hit, so a long CLEAN
  document is the worst case), and collisions reported. Hostile /
  non-finite geometry degrades to no collision; pairs dedupe through a
  `Set`, never a plain-object table — the paths are document-derived.
  Known false positive: a stamp or watermark authored as a TEXT item
  over body text is text-against-text and will be reported.
- `diagnostics/AdvisoryRow.tsx` — one advisory row: its own filled-accent
  badge (a GUI reading, NOT an engine `code` — that namespace stays the
  engine's; deliberately not the `info` severity's outline, since the two
  kinds share one list) and a click selecting the first of the two items.
- The model's types and `findTextCollisions` are on the package's public
  surface (`exports/panels.ts`) beside `DiagnosticsPanelProps` — a host
  mounting the panel itself must be able to type the prop and build the
  list without reimplementing the rule.
- `diagnostics/fixModel.ts` — pure quick-fix registry: `fixFor(diag, read)`
  over a `Map` keyed by wire diagnostic code (a forged `code:'constructor'`
  must miss), returning the CANDIDATE resolutions — `{labelKey, labelArgs?,
  ops}[]` — or `null` when there are none (no dead button). One candidate is
  one button; `image_source_conflict` is the only code today with two, since
  only the author knows which source to keep. Hostile reads and stale paths
  degrade to no-op. `parse_error` is the one FATAL diagnostic it repairs — every other fixable
  code fires on a document that already parsed: when the engine
  names an unknown key on an item (`args.key`, with the item as `path`), the
  fix removes it — the only way back for a document the engine cannot parse,
  since the Designer has no source editor. `row_condition_scope_ignored`
  removes `when.scope` from the rule entry the diagnostic names — the only
  way to clear it without deleting the rule, since the rule editor
  deliberately never shows `scope`.
  - `diagnostics/fixWrites.ts` — the builders that WRITE a value rather than
    removing a key, split out because the obligation differs: a write puts a
    number the author never typed into the document, so the candidate carries
    that number and the button's label names it (nothing is authored that the
    label did not say). Covers the four missing-size codes (only the ABSENT
    dimension is written, at 100pt) and the overflow shrink (`box.w` minus the
    reported `over`). Every one returns `null` rather than computing on a
    non-finite arg, a percentage width, or a result that would be ≤ 0. **`unused_binding` is the one entry whose `diag.path` is not the
  node it edits** — the engine addresses the DECLARATION
  (`<item>.bindings.<name>`), so the item path is derived by stripping
  that suffix BY LENGTH using `args.name`, never by splitting at the last
  `.` (a binding name may legally contain dots).
