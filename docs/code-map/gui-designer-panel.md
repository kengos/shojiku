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
changed-guard, KEYED BY VALUE; capability gates are "undefined = show"
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
  plans, with the content-drop confirm Modal (a typed-then-cancelled
  shrink reseeds the uncontrolled stepper).
- `panel/AlignRow.tsx` — the alignment icon row (a re-pick of the active
  value authors nothing).
- `panel/RatioRow.tsx` — the row-mode ratio inputs + the fixed-width chip for a
  width-authoring child.
- `panel/ParentContainerCard.tsx` — the parent-first tinted card hosting
  the same shell for the parent: select-parent jump + hover canvas
  highlight.

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
  parse-rejects), `BORDERABLE_TYPES`, the editor-local `Pen`, the
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
  (width/colour/keyword picker, capability-gated) — exists because the
  cut-here-line scaffold can CREATE a line.
- `panel/linePoints.ts` + `panel/LinePointsEditor.tsx` — the line's
  GEOMETRY, which is its `from`/`to` endpoints rather than a box (a
  `box:` key on a line is an engine parse error, and
  `canvas/manipulate` refuses to drag one, so these four fields are the
  ONLY way to move a line). `readLinePoints` shows a value only if it
  could write it back; `linePointOps` mirrors the engine's own length
  grammar (bare number = pt, else a `%`/`pt`/`mm`/`cm`/`in`/`em`/`rem`
  suffix) and REFUSES anything outside it — a coordinate endpoint's two
  axes are both required on the wire, so there is no key-removal state
  and an empty entry writes nothing. The ANCHORED arm
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
    hit buttons + the named-style/table notes, and the `?` carrying the
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
    bare numeral or an empty field.

## Panel model + field widgets

- `panel/itemView.ts` — the READ side: `readItemView` → `ItemView`
  (incl. `dataScope`, `pageFormat`), `display`/`record` narrowings,
  `registryNames`, `BOX_AXES`, `imageSourceSummary` (format + KiB — the
  raw `src` never reaches a field). Also the ONE home for **`BOXLESS_TYPES`**
  (`line`/`page_break` — the types whose wire struct takes no `box:` at
  all): `ItemPanel`'s tab gate, `placementModel`'s classifier and
  `canvas/manipulate`'s `noBox` refusal all consult this set instead of
  each keeping their own type list.
- `panel/styleFieldSpecs.ts` — the style keys the panel edits, as data
  (`STYLE_FIELDS`: widget kind + enum options copied from
  `engine/core/src/style/enums.rs`). A no-import leaf shared by item
  panel / defaults / registry / capture / format toolbar.
- `panel/formatModel.ts` — `formatOptions`: registry names first, then
  the closed builtin spellings per display type (localized labels +
  `FORMAT_SAMPLES`); own-property-guarded; currency variants
  capability-gated. The engine stays the validator. A TEXT field offers
  NO builtin (naming `date` on one overrides the type and the engine
  then fails to parse the value as a date — that is an error, not a
  format); its registry names still show, and typing stays open.
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
  `PICKER_TOGGLE`), **`FieldGroup`** (the same row WITHOUT the `<label>` — a `<label>`
  forwards every click inside it to its implicit control, and a
  contenteditable is not labelable, so the text field's label reached
  past the editor to the insert-a-field button beside it: clicking the
  text pressed that button instead of placing a caret),
  `TextField`, `UnitBadge` + `unitIsImplicit`/`badgeText` (the implicit
  `pt` badge shows only while the text is a bare numeral).
- `panel/StepperField.tsx` — length/number input + ▲▼ (one step op per
  click = one undo step; commit-on-blur changed-guard; optional `tag`
  suffix badge with explicit htmlFor/id association; no key-repeat — an
  op remounts the panel body).
- `panel/SeededField.tsx` — the document-settings style field whose
  UNSET state reads as unset (empty box, engine fallback as
  PLACEHOLDER; empty commits nothing, clearing an authored value does).
- `panel/choiceFields.tsx` — the choice widgets: `SelectField` +
  `CheckboxList` (controlled, commit-on-CHANGE) vs `ComboField`
  (free-text + datalist, uncontrolled commit-on-blur).
- `panel/pickerModel.ts` — pure binding-picker model: `bindingScopeFor`
  (the enclosing row scope; unparseable → document scope),
  `pickerOptions` (rows with live sample values via `sampleValueFor`,
  own-property-guarded), `filterOptions` (plain includes, never a
  RegExp), `scopeAuthorable` (the ONE home for the `binding.scope`
  capability — gates OFFERING/AUTHORING, never reading).
- `panel/FieldPicker.tsx` — the `data.key` editor: the closed control
  (free entry, scope badge, toggle, and `BoundField` — the bound key's
  name / localized type / live sample, the popover row's three facts
  shown WITHOUT opening it, absent for a key no offer matches), the
  offer derivation and what a pick COMMITS; row-scoped pickers split row/document sections (free entry
  never re-scopes). `panel/PickerPopover.tsx` — the open popover, shared
  with the chip editor's field menus (`text/FieldMenuButton`) so the two
  surfaces cannot drift into two looks: search, the three offer states,
  the rows (label / key / localized type / sample / document badge) and
  the optional `onCreateField` tail (workshop mode, document scope only;
  the chip menus pass none). A pick hands back the OPTION, not just its
  key — every consumer needs the row's label/sample anyway.
- `panel/FormatPicker.tsx` — the `data.format` editor: free entry +
  popover of `formatOptions`; shown only once a data key is picked.

## The router + per-item tabs

- `panel/PropertyPanel.tsx` — the thin router: item → `ItemPanel`,
  `…columns[n]` → `ColumnForm`, `…headerGroups[n]` → `GroupForm`,
  none/ghost → the no-selection hint card
  (with an open-document-settings CTA); the origin jump wires through
  Designer's `navigateDefaults`.
- `panel/ItemPanel.tsx` — the content/decoration/placement tab SHELL only
  (`applicableTabs`; only applicable tabs render; active tab clamped on
  type change). **The placement tab is withheld from BOX-LESS types**
  (`itemView.ts`'s `BOXLESS_TYPES` — `line`/`page_break`; both wire
  structs are `deny_unknown_fields` and take no `box:`, so offering the
  fields authored a parse error). `line` therefore renders its stroke
  editor PLUS a placement tab whose body is the ENDPOINT editor rather
  than the box fields (`POINT_PLACED_TYPES`), while `page_break` has NO
  applicable tab and renders the `panel.noEditable` placeholder. Tab
  bodies live beside it: `ContentSection.tsx` (per-type
  routing + the text/data pair; image/page-number surfaces in
  `contentParts.tsx`), `StyleSection.tsx` (+`StyleTabFields.tsx`),
  `BoxSection.tsx` (+`boxFields.tsx`); shared prop contract in
  `itemPanelProps.ts` (`ItemPanelProps` + `hasCapability`); shared
  helpers in `panelHelpers.tsx` (`HelpfulHeading` over the `HelpTopic`
  vocabulary — `content`/`style`/`placement`/`placementChild`, each value
  also the catalog SEGMENT `help.<topic>.title`/`.body`, so a topic is two
  strings rather than another branch; `chipsFor`,
  `documentScopeCreateField`, `scopePickerProps`) — no section imports
  another for a helper.
  - The static-text content field is the shared `text/TextEditor` chip
    editor over the SAME `text/chipContext.ts` context the canvas
    overlay uses; commit = `text/declModel` `commitOps` via `applyAll`.
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
    `BorderEditor` + text-color swatch). A **table** is the exception on the
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
  ineffectiveFill}`. `headerFill` is packaged as the same `EffectiveValue` the
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
  can't-happen leg; it is therefore total), `clearIneffectiveFillOp`. Removing
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
  so that move stays a change of render site. Capability-gated on `table.style`.
- `panel/TableStyleGallery.tsx` — the two pictures: `TableMiniature` (the live
  banding) and `TableStyleGallery` (the thumbnails). FIGURES, not renders — the
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
  made gets a decorative hover bubble, because `textAlign`/`color`/`fontWeight`
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
  applied-style chips; colours as swatch dots), `RuleControls.tsx` (the
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
  origin hint).
- `panel/rowConditionsModel.ts` (pure, READ) — `readRawEntries`/
  `readRowConditions`/`valueFormFor`; a hostile entry still yields a row
  so indices stay true, and a hostile display string is truncated.
  `panel/rowConditionOps.ts` (pure, WRITE) — the op builders. The wire
  is a SEQUENCE, so an edit addresses ONE entry by `[n]` in the PATH and
  touches only its own leaf (a rule the user never opened must not move
  in the diff); the FIRST rule seeds the list with `putValue`. Numeric
  fields get NUMBER literals — the engine predicate is type-strict.
- `panel/VisibilitySection.tsx` — an item's `visible:` presence binding,
  rendered ABOVE the content/decoration/placement tabs because it applies to
  every item type and is none of those concerns. It is also what gives
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
  `columnSheetData.ts` (what the sheet READS — picker options, the per-column
  format rows, the sample value, and `alignFor(index)`, each column's
  cascade-effective `textAlign`, so the sheet and `ColumnForm` agree about the
  same key rather than the panel contradicting itself; no floor is threaded
  there, since the sheet shows no origin and the floor changes only an origin
  LABEL).
- `panel/DocumentSettingsPage.tsx` — the fullscreen document view
  (page/size/defaults/styles/locale), opened by the whole-document tree row /
  File menu / origin jumps: the page shell — header, the three-column
  layout, the `sectionBody` switch, and the preview aside via
  `canvas/PageUnderlay`; a nonce-keyed `focus` selects a jumped-to
  section. Its parts:
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
    seeds re-expressed in one shared display unit) and `sizeLabel`.
  - `panel/pageSetupOps.ts` — the WRITE side, every key a literal path:
    `selectSizeOp` (named→custom clears orientation+size in one batch so
    no `orientation_ignored` lingers)/`orientationOp`/`customDimOp`/
    `customUnitOps`. A builder DECLINES with a null op or a dropped
    batch entry rather than authoring something the model would refuse.
- `panel/PageSetup.tsx` — the form (size select with a locale-preferred
  optgroup and an "other sizes" one holding what the first does not — the
  two used to OVERLAP, listing a locale size twice; orientation; live
  proportional thumbnail); embeds
  `MarginEditor` and, in custom mode, `CustomSizeFields`.
- `panel/CustomSizeFields.tsx` — the custom `{ w, h }` + shared unit
  cluster: value-keyed uncontrolled inputs that commit on blur ONLY when
  the value changed (the displayed numeral can be a unit-converted view
  of the wire, so a blur-through would rewrite what the user never
  touched).
- `panel/marginModel.ts` — pure page-margin model (`readMarginView`
  uniform/perSide/legacy-array; mode-switch ops seed all four sides;
  per-side values carried VERBATIM, no unit conversion).
- `panel/MarginEditor.tsx` — the mode select + uniform or per-side
  inputs; every control an `applyAll` batch.

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
    locale/currency combos, each with a what-this-pick-DOES line
    (`localeFacts`) read through the tag the ENGINE resolves to.
  - `panel/DefaultsStyleFields.tsx` — the cascade-root half: one field
    renderer (color as `ColorSwatchPicker`, everything else
    `StyleFieldInput`; engine fallbacks as placeholders from
    `engineDefaults.ts` `ENGINE_STYLE_DEFAULTS`) in ONE arrangement,
    `DefaultsStyleSection` (the `STYLE_ROWS` grid, drift-guarded, with
    the intro line and the recommended body-size one-click hint).
- `panel/localeFacts.ts` — what a locale/currency pick DOES, as data —
  copied from the defining files (`engine/formatter` builtins +
  `packs/locale/`) and pinned by a drift-guard test; composes samples
  from the engine's separators, never formats.
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
  `NameForm` / two-step delete confirm) — its six callbacks arrive as
  one `StyleRowActions` bundle, and it decides nothing about the
  document.
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
