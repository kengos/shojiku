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
- `panel/BorderEditor.tsx` — the Excel-style border editor shared by the
  decoration tab + toolbar popover; keyed by path at each host so the pen
  resets on selection change. The SHELL only: pen state, the
  `style.border.sides` / `style.borderRadius` gates, the all-sides/none
  presets, and the ONE `applyAll` per action (one undo step). Its
  clusters:
  - `panel/BorderDiagram.tsx` — the 96×64 paper diagram: per-edge SVG
    painting the effective line (real dash pattern, a second offset
    stroke for `double`, a faint dotted placeholder when off) + the four
    hit buttons + the pen/named-style/table hints. It reports WHICH edge
    was clicked (`onEdge`); it knows nothing about ops.
  - `panel/BorderPen.tsx` — the pen row (width stepper / colour /
    line-style select) and the two line-style capability gates. Editor
    state only — nothing here writes the document.
  - `panel/BorderRadiusField.tsx` — the corner-rounding field: commits
    through `radiusOps` (authored unit preserved) and steps only on a
    bare numeral or an empty field.

## Panel model + field widgets

- `panel/itemView.ts` — the READ side: `readItemView` → `ItemView`
  (incl. `dataScope`, `pageFormat`), `display`/`record` narrowings,
  `registryNames`, `BOX_AXES`, `imageSourceSummary` (format + KiB — the
  raw `src` never reaches a field).
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
  never re-scopes). `panel/PickerPopover.tsx` — the open popover: search,
  the three offer states, the rows (label / key / localized type / sample
  / document badge) and the optional `onCreateField` tail (workshop mode,
  document scope only).
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
  type change). Tab bodies live beside it: `ContentSection.tsx` (per-type
  routing + the text/data pair; image/page-number surfaces in
  `contentParts.tsx`), `StyleSection.tsx` (+`StyleTabFields.tsx`),
  `BoxSection.tsx` (+`boxFields.tsx`); shared prop contract in
  `itemPanelProps.ts` (`ItemPanelProps` + `hasCapability`); shared
  helpers in `panelHelpers.tsx` (`HelpfulHeading`, `chipsFor`,
  `documentScopeCreateField`, `scopePickerProps`) — no section imports
  another for a helper.
  - The static-text content field is the shared `text/TextEditor` chip
    editor over the SAME `text/chipContext.ts` context the canvas
    overlay uses; commit = `text/declModel` `commitOps` via `applyAll`.
  - The placement tab composes PARENT-FIRST (`ParentContainerCard`, then the
    item's own placement, then a container's own `LayoutSection`) and is
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
    `BorderEditor` + text-color swatch). Each unset style field carries
    a `panel/OriginBadge.tsx` effective-value hint (resolved value +
    origin default/style/inherited + a to-document-settings jump; the engine-floor
    origin shows no jump).
- `panel/TableColumnsSection.tsx` — the columns section for a selected
  table: source rebinding via the array-group picker, then per-column
  label / ▲▼ reorder / delete / label-only add — each ONE op over
  `panel/columnsModel.ts` (`readColumnsView`/`columnPathInfo`/
  `addColumnOp`/`removeColumnOp`/`moveColumnOp`).
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
  `bindingScopeFor`).
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
  expanded body: alignment/bold/background/text-color over a row-scope
  `FieldPicker`; `styleNames` reported, not edited), `ruleInputs.tsx`
  (its leaf inputs — the value control is enum select / nothing (clean
  boolean) / free entry, plus the labeled swatch row).
- `panel/rowConditionsModel.ts` (pure, READ) — `readRawEntries`/
  `readRowConditions`/`valueFormFor`; a hostile entry still yields a row
  so indices stay true, and a hostile display string is truncated.
  `panel/rowConditionOps.ts` (pure, WRITE) — the op builders. The wire
  is a SEQUENCE, so an edit addresses ONE entry by `[n]` in the PATH and
  touches only its own leaf (a rule the user never opened must not move
  in the diff); the FIRST rule seeds the list with `putValue`. Numeric
  fields get NUMBER literals — the engine predicate is type-strict.
- `panel/TableColumnSheet.tsx` — the same per-column editing transposed
  horizontally in a bottom `ui/Offcanvas.tsx` sheet (columns as strips;
  header drag-reorder or Alt+←/→, ONE `moveItem` each; reuses the same
  pickers/models as the vertical section). Parts:
  `useColumnHeaderDrag.ts` (the header reorder machine),
  `TableColumnCells.tsx` (the cell parts incl. the sample row over
  `displaySample`).
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
- `panel/PageSetup.tsx` — the form (size select with locale-preferred
  optgroup, orientation, live proportional thumbnail); embeds
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
  the half its `section` prop names (the document-settings view supplies
  the heading), or the standalone stacked form when it names neither.
  - `panel/DefaultsLocaleFields.tsx` — the document settings half:
    locale/currency combos, each with a what-this-pick-DOES line
    (`localeFacts`) read through the tag the ENGINE resolves to.
  - `panel/DefaultsStyleFields.tsx` — the cascade-root half: one field
    renderer (color as `ColorSwatchPicker`, everything else
    `StyleFieldInput`; engine fallbacks as placeholders from
    `engineDefaults.ts` `ENGINE_STYLE_DEFAULTS`) laid out in TWO
    arrangements — `DefaultsStyleSection` (the `STYLE_ROWS` grid,
    drift-guarded, with the intro line and the recommended body-size
    one-click hint) and `DefaultsStyleList` (flat, for the standalone
    form).
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
  `onApplyFix(ops)` (one `applyAll`).
- `diagnostics/fixModel.ts` — pure quick-fix registry: `fixFor(diag,
  read)` over a `Map` keyed by wire diagnostic code (a forged
  `code:'constructor'` must miss); each builder emits a `removeKey`
  batch dropping the offending key(s), `null` when nothing concrete is
  removable (no dead button). Hostile reads and stale paths degrade to
  no-op.
