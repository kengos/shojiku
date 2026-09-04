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
trimming, `literal()` coercing a numeric `equals`); a landed/refused signal
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

- `panel/gridStructure.ts` — pure grid column/row plans: `gridColumnsPlan`
  (re-chunk row-major children + ONE `setScalar box.columns` count),
  `gridRowsPlan` (child-list only; implicit auto rows), `gridRowCount`;
  `{ops, drops}` where `drops` flags content-bearing removals (the
  panel's confirm gate).

The container-layout model is a READ/WRITE pair; the write side depends on
the read side, never the reverse.

- `panel/layoutModel.ts` — what the DOCUMENT says about a container:
  `containerLayoutFor(read, path)` (mode/gap/align/column-count/per-child
  `ChildSlot`s from the DOCUMENT alone, never the box index),
  `parentContainerOf` (direct parent only), `containerKindLabel`, and the
  `ITEMS_SUFFIX` the write side appends through.
- `panel/layoutOps.ts` — what a control AUTHORS: the value-parsing
  `gapOp`/`gapStepOp`/`ratioOp` (each refuses (null) rather than
  authoring what the engine would warn on or discard) beside
  `directionOp`/`alignItemsOp`/`addSlotOp`, which always author (typed
  enums, an always-valid append); the alignment vocabulary
  `ALIGN_VALUES`/`AlignValue`; the ingress caps
  `MAX_FLEX_GROW`/`MAX_GAP_PT`.

The child-layout surface is a shell + one module per control cluster.

- `panel/LayoutSection.tsx` — the shell: the gap stepper every mode
  shows, the direction `Segmented` + add-slot only a NON-grid container
  shows, and the per-mode branch that picks a cluster.
- `panel/GridSteppers.tsx` — the grid column/row cluster over `gridStructure`
  plans, with the content-drop confirm Modal. Its non-commits — an emptied
  field, a non-finite count, a typed count that rounds to the current one, and
  a typed shrink the confirm then CANCELS — all reseed the stepper, because the
  blur reseeds unconditionally. It used to carry a partial `seed` nonce of its
  own that bumped only on the confirm path; that was the precedent the shared
  mechanism generalized, and it is gone.
- `panel/AlignRow.tsx` — the alignment icon row (a re-pick of the active
  value authors nothing).
- `panel/RatioRow.tsx` — the row-mode ratio inputs + the fixed-width chip for a
  width-authoring child. Each weight input is its own `RatioInput` component
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
  the same shell for the parent: select-parent jump + hover canvas
  highlight.

## Placement tab — the char_grid grid

`char_grid` is in `CONTENT_TAB_TYPES` and deliberately NOT in
`STYLED_TYPES`/`BORDERABLE_TYPES`: its `borderWidth` is the GRID RULING
width (`0` turns the ruling off), a different property under the same
spelling, so the border cluster's per-side model must not reach it.

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
  sibling component, not more lines here — see below. It also mounts the
  shared `StyleNamesPicker` at its foot: that is the SAME documented
  exception the ruling colour rides (a char_grid has no decoration tab, and
  `styleNames` is where its `fontSize`/`borderWidth`/`textAlign` resolve
  from), so the section carries one exception rather than two. `styleNames`
  is threaded in as a prop because `BoxSection.tsx` sits at the
  executable-line cap and this file has headroom.
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
  **Two keys the bundled genkoyoshi templates author are still unreachable
  from the panel**, and neither has a control anywhere: `style.color` — the
  CHARACTERS' ink, a different property from the ruling colour beside it —
  and `style.fontFamily`. `TypographyFields` is `isText`-gated and this type
  gets no decoration tab, so `PanelColorField` never mounts for it, and
  `toolbarModel` returns `null` for any type outside `BORDERABLE_TYPES`, so
  the format toolbar is not a fallback either. The one path that IS open is
  indirect: a named style carrying either key can be ticked from the
  `StyleNamesPicker` below. Direct fields for both are queued, not forgotten.
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
  keywords, and `panel/anchorTargets.ts`, which reads the placed ids out of the box
  index so the list is exactly what the engine can resolve (an id with no
  placement would only produce `anchor_unknown_target`). Attaching
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
  (the `line.anchor` rule). Targets come from `anchorTargets` unchanged.
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
  `repeat_flow`) — and has exactly one consumer, `ItemPanel`'s tab gate,
  because a placement tab over any of them authors a `deny_unknown_fields`
  parse error. A drift-guard test pins it to the enum. And the ONE home for
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
  `stepValueOp`/`styleNamesOp`/`toggleStyleName`/`switchContentOps`
  (+ `textAsBinding`/`bindingAsText`: the two modes both express "this item
  IS that field", so the switch CARRIES the binding across — a text of one
  expression becomes that data key with its format, a data key becomes
  `{key}` text. Only mixed text (`{customer.name} 様`) has to be dropped,
  and `ContentSection` keeps it for the way back).
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
  OPT-IN per site because the WIRE decides. NINE fields carry it (box
  coordinates, corner radius, column width in BOTH the form and the
  sheet, per-side margins, flex/grid gap, char-grid cell size + line gap,
  and `fontSize` on both style surfaces); several deliberately do NOT, each
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
  `pointer-events-none` and cannot be hovered. Eight sites reach it
  through the shared fields' `unitHint` prop; the NINTH,
  `TableColumnCells`'s `ColumnWidthCell`, renders its own input and its own
  `UnitBadge`, so a sweep for the `unit=` PROP does not see it — it was
  missed exactly that way, and it writes the same `lengthOp(path,
  ['width'])` as the column form. A widget-shaped sweep missed it a SECOND
  time over the reseed nonce, for the same reason: both sheet cells now carry
  their own `useReseedKey`, because their caller keys them by a value that a
  normalising commit does not move. Its text is deliberately
  TERSE (`mm, cm, in too`): measured in the real app, a centred `TipBubble`
  on a LEFT-column panel field has 123px before the panel column's
  `overflow-y: auto` clips it, and a sentence needed 325px — it was the
  only truncating tooltip in the Designer. The bubble sits beside the `pt`
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
  over `CheckboxList`. Lifted out of `StyleSection` so a type with no
  decoration tab can mount it (char_grid does, on its placement tab)
  without a second copy. Options are the registry's names UNION the ones
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
  own. Neither a table COLUMN, a header GROUP nor a header/footer BAND is
  an item, but selecting one (a canvas click on a cell, a layer-tree click
  on a band) hands over its structural path, so this routes to the
  form for what was actually clicked and falls through to the unsupported
  card when the path resolves to none of them. A sibling router to
  `PropertyPanel`, not a section: the sections all take `ItemPanelProps`,
  and a cell has no `ItemView` to build one from. The BAND arm is tried
  first — an exact two-segment string match, no document read.
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
  even the bundled presets that author a band could not change either.
- `panel/PropertyPanel.tsx` — the thin router: item → `ItemPanel`,
  anything with no `type:` of its own → `CellPanel` (which picks
  `ColumnForm` / `GroupForm` / the unsupported card),
  none/ghost → `NoSelectionCard`; the origin jump wires through
  Designer's `navigateDefaults`.
- `panel/NoSelectionCard.tsx` — the panel with nothing selected: the sentence
  that says what to do next, the document's page and margin, and the
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
- `panel/ItemPanel.tsx` — the content/decoration/placement tab SHELL only
  (`applicableTabs`; only applicable tabs render; active tab clamped on
  type change). `VisibilitySection` renders OUTSIDE the tabs — it applies to
  every type, so it must not appear and disappear as the reader changes tab —
  and BELOW them, after the tab bodies (or after a single-tab body, or alone
  for a type with no tabs). **The placement tab is withheld from BOX-LESS types**
  (`itemView.ts`'s `NO_BOX_WIRE_TYPES` — `line`, `page_break` and BOTH
  repeaters; all four wire structs are `deny_unknown_fields` and take no
  `box:`, so offering the fields authored a parse error. It reads the wire
  set rather than the narrower canvas one, which is what left `repeat` with
  a placement tab as its ONLY tab). `line` therefore renders its stroke
  editor PLUS a placement tab whose body is the ENDPOINT editor rather
  than the box fields (`POINT_PLACED_TYPES`), while `page_break` and `repeat`
  have NO applicable tab. What those two get instead is deliberately
  different: `page_break` earns a one-line note above the presence binding
  (`pageBreakNoteKey` — `panel.pageBreak.note`, or `panel.pageBreak.noteFirst`
  at index 0, where the engine COLLAPSES the break and the general sentence
  would promise an effect the file does not have), because its empty panel is
  the whole item; `repeat` gets no note at all, because its wire carries a data
  source, a cell and a grid that have no surface yet, and any "that is all"
  sentence would be false. The `panel.noEditable` placeholder is rarer than
  both: it appears only when even `visible:` is unavailable (an engine without
  `item.visible`), so against a current engine a tab-less item never shows
  it. The two
  FORM MARKS (`MARK_TYPES`) take ALL THREE: they are boxed, their
  presence is content, and their outline is decoration — reached through
  `STYLED_TYPES` (which is `BORDERABLE_TYPES` plus `line` plus the marks)
  rather than through the border set, because their editors differ. Tab
  bodies live beside it: `ContentSection.tsx` (per-type
  routing + the text/data pair; image/page-number surfaces in
  `contentParts.tsx`, the bound-mode half in `contentBound.tsx`
  (`BoundContent` — the data-key picker plus the two options that ride a
  binding, `format` and `placeholder`. Both live on the BINDING
  (`data.format`/`data.placeholder`), not at the item root, so every
  data-bound type takes them — a `char_grid` included, whose `data:` is the
  same `Binding` and whose content resolves through the same
  `resolve_content`)), `StyleSection.tsx`
  (+`StyleTabFields.tsx`),
  `BoxSection.tsx` (+`boxFields.tsx`, +`CharGridSection.tsx`); shared prop contract in
  `itemPanelProps.ts` (`ItemPanelProps` + `hasCapability`); shared
  helpers in `panelHelpers.tsx` (`HelpfulHeading` over the `HelpTopic`
  vocabulary — `content`/`style`/`placement`/`placementChild`, each value
  also the catalog SEGMENT `help.<topic>.title`/`.body`, so a topic is two
  strings rather than another branch; `FieldHelp` over the parallel
  `FieldHelpTopic` vocabulary — `rulingWidth`/`rubySize`/`kinsoku`/
  `styleNames` — for the `?` on ONE field rather than a section heading,
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
    from the document alone and `pinOps`/`unpinOps` write back exactly
    the `box.x`/`box.y` keys it reads as `pinned` (x+y in one batch;
    unpin removes only present keys), while `resolvePlacement` turns
    LAST-GOOD inspect boxes into display/pin values (displays stay
    stable across a render cycle; `geometry.fresh` gates only the PIN
    action) over `childMarginInset` (the engine ADDS a child margin when
    placing, so the pin math subtracts it; `%`/garbage margins disable
    the toggle). A pinnable
    child gets the auto⇄fixed `ui/Segmented` (native-radio segmented
    control); unset w/h seed resolved sizes into dimmed steppers.
  - The decoration tab covers every `BORDERABLE_TYPES` item: typography
    steppers (text only) + the fill-and-border cluster (fill swatch +
    `BorderEditor` + text-color swatch). The two OTHER decorated families
    reach their own editors instead — a `line`'s `LineStyleEditor` and a
    form mark's `ShapeStyleEditor` — because neither strokes a border
    box. A **table** is the exception on the
    fill: the engine paints no `style.backgroundColor` on one (asserted in
    `engine/layout/tests/e2e/table/style.rs`), so the swatch is withheld
    unless the document already carries one — in which case the table-style
    section below reports it as ineffective and offers to clear it, rather
    than hiding a key the panel could then never remove. Each unset style field carries
    a `panel/OriginBadge.tsx` effective-value hint (resolved value +
    origin default/style/inherited + a to-document-settings jump; the engine-floor
    origin shows no jump).
- `panel/TableColumnsSection.tsx` — the columns section for a selected
  table: source rebinding via the array-group picker, then per-column
  label / ▲▼ reorder / delete / label-only add — each ONE op over
  `panel/columnsModel.ts` (`readColumnsView` — whose row carries the column's
  own `style.textAlign` for the sheet's comparison row —
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
  is passed no groups: layout skips one nested in a cell, so a
  row-relative offer there would author a source that never draws.
- `panel/ColumnBindingFields.tsx` — the binding pair a column earns
  (`FieldPicker` for `data.key`; `FormatPicker` once a key is picked,
  its options type-resolved through the row options), shared by the
  columns section and `ColumnForm`. A `cell:` column gets neither — the
  two guards are this component's whole contract.
- `panel/IterableSourceSection.tsx` — `repeat_flow`/`list` source
  rebinding (+ a list's per-entry `text:` template): every scaffolded
  kind stays editable.
- `panel/ColumnForm.tsx` — the single-column form a canvas click on a
  `…columns[n]` cell opens: label/binding/format/width (scope via
  `bindingScopeFor`), then the column's OWN cell style — the same
  `TableBandFields` at `columns[n].style`, over `cascadeContext(read, path,
  floor)` (a column has a path, so its row band and table come for free), which
  is how a money column becomes right-aligned. It says so: a column's `textAlign`/`verticalAlign` also wins
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
  the covered columns via `formatList` (impact scope before the edit).
The table's BAND styling is a shell + two pure modules + a data module, ordered
the way the engine layers the bands (grid → header → body base → zebra → the
conditional rules the next section owns).

- `panel/tableStyleModel.ts` (pure, READ) — `readBand` (one band's four
  properties out of whatever sits at `<owner>.style`; a non-map band or style
  degrades to unset) and `readTableStyle` → `{header, headerFill, row, zebra,
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
- `panel/TableStyleSection.tsx` — the shell. It takes a `TableStyleContext
  {path, controller, capabilities}` of its OWN rather than `ItemPanelProps`,
  and assumes nothing about the panel's ~255px column: appearance editing is
  expected to move into a modal sheet, and a test mounts the section standalone
  so that move stays a change of render site. Capability-gated on `table.style`,
  with a SECOND gate nested inside it: the 「hide the header row」 checkbox needs
  `table.header.visuallyHidden`, which an older engine parse-rejects outright.
- `panel/HiddenHeaderField.tsx` — TWO exports, because one idea has two
  ends: `HiddenHeaderToggle`, the 「hide the header row on the page」 checkbox,
  which `TableStyleSection` renders TOP-LEVEL beside the zebra switch (its
  peer — both are table-level decisions, and Excel puts this one at the top),
  and `HiddenHeaderNote`, the note that keeps the header band honest, which
  stays INSIDE the disclosure beside the band fields it names. The CHECKBOX is
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
- `panel/TableBandFields.tsx` — the four controls one styled band carries
  (alignment, background, text colour, bold), rendered for the header band, the
  body band and (from `ColumnForm`) one column's cells: the same four `Style`
  properties, only the caller's key path differs (`{ctx, path, keys}`). Every
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
  `#ededed` is a grey nobody authored. FOUR hosts render it: the header band,
  the body band, a column's cells (`ColumnForm`) and one row-condition rule
  (`RuleControls`). Exports `AlignSegment` for the ONE place that needs the
  alignment control alone — the column sheet's per-column row
  (`TableColumnCells`).
- `panel/RowConditions.tsx` — the table's row-conditional-styles section
  (decoration tab, `table.row.conditionalStyles`-gated): the rule list shell —
  add, remove, open-one-at-a-time, and the repoint reconciliation (a
  stale `equals` is dropped in the SAME batch when the new field reads
  as boolean). The section never evaluates a predicate; how many rows a
  rule hits is the engine's answer via the canvas preview. Parts:
  `RuleCard.tsx` (one rule's card — the always-visible summary line read
  from the WIRE (`hasEquals`), remove/expand buttons, and the chips or
  the body), `ruleStyleChips.tsx` (the collapsed card's
  applied-style chips; colours as swatch dots — the strip is LABELLED as what
  the rule ADDS and says so outright when it adds nothing, because the opened
  card answers the different question of what the matching ROWS render, and an
  unlabelled empty strip beside a card showing checked controls read as a
  contradiction. "Adds nothing" is a claim, and this panel models FOUR of
  `Style`'s two dozen properties — so the sentence is decided from the WIRE
  (`styleKeyCount` + `styleNameCount` on `RowConditionRow`), never from whether
  any chip was produced. The three ways a rule adds something without earning
  one of the four: `styleNames`; `fontWeight: normal`, which the Designer
  itself authors on an un-tick over a bold band (hence the RAW `fontWeight`
  rather than a `bold` boolean); and the ~20 unmodelled properties, which earn
  a counted remainder chip), `RuleControls.tsx` (the
  expanded body: a row-scope `FieldPicker` + value control, then the SHARED
  `TableBandFields` at the rule entry's `style.*` over `ruleContext` — a rule is
  one more layer over the body band, so it gets the same four controls, the same
  cascade-effective display and the same minimal-wire ops rather than a fourth
  copy of any of them; `styleNames` reported, not edited). It takes the entry
  PATH, not its index: the caller rendered the rule from the list it read, so no
  range guard is re-proved here — which is why the dedicated rule-style op
  builder is gone. `ruleInputs.tsx`
  (its leaf inputs — the value control is enum select / nothing (clean
  boolean) / free entry, plus the labeled swatch row, which takes an optional
  origin hint). The free-entry arm is its own `EqualsInput` carrying a
  `useReseedKey`: the commit never refuses, but `literal()` coerces a numeric
  field's entry through `Number`, so ` 40.0 ` over an `equals: 40` rule
  authors 40 and the value in the key does not move.
- `panel/rowConditionsModel.ts` (pure, READ) — `readRawEntries`/
  `readRowConditions`/`valueFormFor`; a hostile entry still yields a row
  so indices stay true, and a hostile display string is truncated.
  `panel/rowConditionOps.ts` (pure, WRITE) — the op builders. The wire
  is a SEQUENCE, so an edit addresses ONE entry by `[n]` in the PATH and
  touches only its own leaf (a rule the user never opened must not move
  in the diff); the FIRST rule seeds the list with `putValue`. Numeric
  fields get NUMBER literals — the engine predicate is type-strict.
- `panel/VisibilitySection.tsx` — an item's `visible:` presence binding,
  rendered OUTSIDE the content/decoration/placement tabs because it applies to
  every item type and is none of those concerns — and BELOW them, because it is
  the RARE, advanced one: heading the panel, it opened a rectangle's editor on a
  titled block with a two-sentence paragraph and a full-width button, above the
  background and border controls anyone opened the panel for. UNSET it is one
  row (title + the same paragraph behind a `?` + the button); AUTHORED it keeps
  the full card, in the same place. The tree's `if` badge is what announces a
  conditional item at a glance, so the panel need not shout it from the top. It is also what gives
  `page_break` an editing surface at all (the wire takes only `id` and
  `visible:`), which is what a conditional page break is. Gated on the
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
  `useColumnHeaderDrag.ts` (the header reorder machine),
  `TableColumnCells.tsx` (the cell parts incl. the sample row over
  `displaySample`, and `ColumnAlignRow` — the alignment row itself, which lives
  there because the sheet file is the grid layout and nothing else),
  `ColumnSheetBindingRows.tsx` (the data-key and format rows — the only two
  whose cell is conditional on the column's KIND: a `cell:` column's content
  is a sub-template, so it has no binding and no format, and both show a
  muted placeholder there rather than an empty grid cell),
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
    seeds re-expressed in one shared display unit), `sizeLabel` and
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
  two used to OVERLAP, listing a locale size twice; orientation; live
  proportional thumbnail); embeds
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
  `INHERITED_STYLE_FIELDS` (drift-guarded subset), `CURRENCY_SUGGESTIONS`,
  root-addressed `defaults.*` op builders).
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
  degrade to no-op.
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
