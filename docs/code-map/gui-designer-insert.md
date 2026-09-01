# Code map — gui/designer — insert flows, imports, field palette, sample data + the data-item editor

> AI-only, token-dense. Index + repo-wide conventions: [CLAUDE.md](../../CLAUDE.md).
> Read this BEFORE searching or editing the covered dirs; update it in the
> same PR whenever files/modules/boundaries here change.
> Area index + neighbors: [gui-designer.md](gui-designer.md). Granularity:
> file role + key exports + load-bearing contracts.

Covers `insert/`, `palette/`, `image/`, `sample/`, `data/`.

Area-wide postures: pure models over UNTRUSTED text — hostile/malformed/
alias-bomb input degrades to `null`/empty/no-op, never throws; walks and
lists are depth/count/byte capped; hostile-string lookups use real `Map`s
/ own-property guards (`__proto__` stays inert); every insert snippet is
probed against the real engine to render diagnostics-free AND visibly;
dialogs hand typed choices/refusals up and hold no document knowledge;
scaffold inserts are ONE op, params committed only after the insert
succeeded.

## Field palette (data tab)

- `palette/caps.ts` — the area's untrusted-input caps in one no-import
  leaf (`MAX_PALETTE_GROUPS`/`MAX_PALETTE_FIELDS`/`MAX_TEXT_CHARS`/
  `MAX_ENUM_OPTIONS`/`MAX_WALK_DEPTH`), shared by the display narrowing,
  both walks and the definitions view.
- `palette/fieldDisplay.ts` — per-value display narrowing over untrusted
  text: `record`/`clip`/`text`, `sampleDisplay` (containers as bounded
  JSON; a circular structure reads as `''`), `displayType` (mirrors the
  engine's `(type, format)` map — its result feeds a CLOSED
  `palette.type.*` label map, so a document string never composes a
  catalog key), and the ONE reader of the `enum` member dual form:
  `enumMember` (bare scalar | `{value, label}` → typed value + clipped
  label; malformed/container/inherited shapes → `undefined`),
  `enumOptions` (bounded `EnumOption {value, label}` display list),
  `enumValues` (the values alone). Read by the two walks, the
  definitions view and the drag/cell-target planners, plus
  `panel/pickerModel` (`sampleDisplay`) and `sample/genWalk`
  (`enumMember` — the generator picks the VALUE in its declared type).
- `palette/schemaWalk.ts` — the definitions schema walk: `leafField`,
  `collectFields` (object groups flatten to dotted full keys; nested
  array properties surface as their own groups), `collectRowFields`
  (row-relative keys; a row's own ARRAY child becomes a group of its own
  under the joined dotted path, carrying `rowScope` = its parent group —
  the engine models it, but it is bindable only from inside that
  parent's cell, so the palette shows it and arms NO drag and
  `insert/iterableModel`'s `arrayGroups` filters it out), `arrayGroup`.
  Depth- and count-bounded.
- `palette/model.ts` — the palette's view types (`PaletteField`,
  `PaletteGroup`, whose `rowScope` names the group whose ROWS carry this
  one; `FieldTarget {group, key}` — the jump a row's gear hands up, and
  the pair `data/editorModel`'s `selectionKey` resolves on the other
  side, so an object group's own id travels beside the DOTTED full key)
  + `readDefinitionsView`: the `properties` tree → groups, `null`
  for anything unparseable/oversized/the retired v1 `groups:` form; +
  `rowScopeLabel` (the parent's display label for the heading badge,
  falling back to the parent id). The widely-imported surface of the
  area.
- `palette/bindings.ts` — the template walk → `BindingRef {path, key,
  scope, source}`; unparseable text yields `[]`, never a throw.
- `palette/bindingRefs.ts` — its per-item helpers: `bindingKey`,
  `bindingScope` (`scope: document` files a ref at document scope even
  inside a cell), `entryScope` (a `list`'s per-entry keys resolve one
  scope FURTHER IN — against the array it binds, addressed the way the
  engine's catalog does, so a row-carried source joins its parent's
  path), `collectInterpolations` + `pushInterpolated` (`{key}` refs and
  `bindings:` declarations resolved via `text/declModel`; one ref per
  distinct (key, scope)).
- `palette/usage.ts` — `buildUsage` (→ real `Map`s; binding keys are
  attacker-influenced, so `__proto__` stays inert) + `fieldUsage` /
  `groupUsage` (a `rowScope` group is bound row-relatively, so its usage
  sits in its PARENT's row map under the trailing key).
- `palette/filter.ts` — `filterGroups`: plain `includes`, never a
  RegExp; a group-level hit keeps the whole group.
- `palette/FieldPalette.tsx` — the read-only grouped/searchable panel
  shell (search box, empty state, the definitions→usage correlation it
  hands down); dispatches ZERO ops itself. Two SEPARATE editor entry
  points: `onOpenEditor` (the header gear, no target — it is wired
  straight to a click handler, so widening it would put a MouseEvent
  where a target belongs) and `onOpenField` (a row's gear, carrying a
  `FieldTarget`). A `?` beside the heading says which part of a row is
  the display label and which the data key — one hint for the list rather
  than a label per part, because the row measures ~215px.
- `palette/paletteRow.tsx` — one field row + its chrome: the `PaletteDrag`
  wiring type, the localized type label (exported `TYPE_LABEL_KEYS`,
  shared with `panel/FieldPicker`, `text/InsertFieldMenu` and
  `data/ItemListRow`), the
  used/unused badge. Every text span in the row wraps
  (`[overflow-wrap:anywhere]`) and every one is bounded: the KEY needed both,
  since `leafField` clips a title, a type and a sample but passes a property
  path through verbatim — unwrapped it painted out of the ~215px row, and
  wrapped-but-unclipped it would bury the list under one row instead, so the
  display goes through `clip()` while the drag payload and the pick op keep
  the whole key; a used field's click cycles bound placements via
  the shared selection. The per-field gear (`onEdit`) is a SIBLING of the
  row, never inside it — a bound row IS a `<button>` and a
  button-in-button is invalid HTML (the `data/ItemListRow` shape).
- `palette/paletteGroup.tsx` — one group section: its heading (an ARRAY
  group's heading drags to drop the group's default iterable scaffold)
  and the rows under it.
- `palette/dragSnippet.ts` — what a palette drag CARRIES:
  `PaletteDragPayload` (field|group) + `dropSnippet`/`boundSnippet` (the
  type-appropriate bound item; `documentScoped` adds `scope: document` —
  the engine's `element` default is never authored).
- `palette/drag.ts` — where it LANDS: `planInsertDrop` (the flow-body
  slot under the pointer, reusing the canvas dnd slot math) and
  `planPaletteDrop` (`null` = paint nothing, do nothing — the canvas-dnd
  refusal posture).
- `palette/cellTarget.ts` — which sub-template cell (`cell:`/`item:`) is
  under the pointer; the INNERMOST hit wins, own-property-guarded, and a
  plain table column with no `cell:` refuses.

## Insert menu + container picker

The plain insert is four pure leaves — what the menu OFFERS, what each
kind INSERTS, what a band REQUIRES, and where the result LANDS:

- `insert/insertMenu.ts` — `InsertKind`/`MenuEntry`/`InsertGroup`/
  `InsertArming` + `insertMenuGroups(armed)` (the menu's entry-class
  structure; only populated groups render, capability-less rows absent,
  band-only rows disabled with a reason). The arming is a NAMED record,
  not positional booleans — five bare `true`/`false` at a call site said
  nothing about which row each armed. The two `line` rows gate on
  DIFFERENT capabilities and so arm independently: the plain rule on
  `line.length` (its snippet spans `100%`) and the cut-here scaffold on
  `line.style` (its rule is dashed). The plain rule sits directly after
  `rect`, which is what a reader flattens to a hairline without it. The `band` entry class is UNCONDITIONAL (no
  capability, host or schema gate — the two section bands have been in
  the wire since 0.1.0) and sits directly under the element group, next
  to the `page_number` row whose disabled reason names it; its rows are
  bare NOUNS with no `…`, like every other immediately-acting row.
  NOTE: `InsertGroup.labelKey` is structure only — `Menubar.tsx` renders
  groups as divider-separated blocks and shows no group heading.
- `insert/insertSnippet.ts` — `insertSnippet(kind, …)` (per-type default
  snippets — rect carries `borderWidth: 1` because a style-less rect
  draws nothing; the cut-here-line snippet is a container + dashed `line`
  sized from the FLOORED content width), `CutLineText`,
  `DEFAULT_CUT_LINE_PT`, `RULE_Y_PT`. The plain rule authors neither
  `style` (the engine's own 1 pt black is already visible) nor `box` (a
  parse error on a `line`), and reaches its end with `x: "100%"` rather
  than render geometry, so it follows whatever it is nested in.
  `RULE_Y_PT` is MEASURED, not chosen: a flow line reserves its own
  vertical extent and paints at the BOTTOM of it, so every point of `y`
  is air ABOVE the rule and none below — 4 pt is the value that reads as
  a rule rather than as an underline of the text above it.
- `insert/bandGeometry.ts` — WHICH margin-box height a band insert places
  against: `documentContentHeightPt` (read off the document's own
  `page.size`/`orientation`/`margin` through `readPageView` + `readMarginView`
  — exact, and available before any render; `null` for a percent margin or an
  unrecognized size rather than a guess) and `bandBoxHeightPt` (render first
  — it reports what the engine actually laid out — document second, `NaN`
  last, which `bandInsertY` already reads as "unknown" and answers with the
  top of the box). The render-only reader answers a flat 792 with no
  last-good preview, which is A4-at-margin-25 exactly: right by coincidence
  on the five A4 blank presets and 50pt too large on the two Letter ones,
  where a footer item's line box ran off the sheet and rendered invisibly.
- `insert/bandPlacement.ts` — `requiresBand`/`bandInsertY`/`bandPlaced`:
  band children are coordinate-placed against the page margin box,
  height floored. A BOXLESS item (`panel/itemView`'s `BOXLESS_TYPES`)
  is the exception and takes the offset in its OWN coordinates — a
  `box:` on a `line` is an engine parse error, not a misplacement, and
  shifting `from.y`/`to.y` is what puts a footer rule where footers
  print. Only a plain numeric `y` shifts; an anchored endpoint has no
  coordinate and a `Length` string would concatenate (`'50%' + 700`),
  so both are returned as authored. The values are UNTRUSTED — the
  other caller is `hooks/useBlocks`, which band-places user-saved
  blocks restored from browser storage.
- `insert/bandCreate.ts` — CREATING a band (`sections.header` /
  `sections.footer`), which nothing in the deterministic UI did before:
  `BAND_NAMES`, `BAND_LABEL_KEYS` (ONE catalog key per band, shared by
  the insert menu, the layer tree and the panel heading — the
  `TYPE_LABEL_KEYS` precedent), `bandPath`/`bandFromPath` (exact match,
  so a path INSIDE a band is not one), `bandExists` (a non-map band
  reads as PRESENT — overwriting it would destroy authored content),
  `bandCreateOp` (ONE `putValue` of exactly `{repeat, height, items}` —
  `Band` is `deny_unknown_fields`, and two of the three are
  load-bearing: without `items: []` an insert falls through to the body,
  without a positive `height` the band is not a canvas drop target),
  `bandActivateOps` and `activateBand`. Activation is IDEMPOTENT —
  absent: create then select; present: select only, authoring nothing
  and minting no undo step — which is what lets the menu row and the
  tree row be the same word in both states instead of appearing,
  disappearing or greying out.
- `insert/model.ts` — where an insert lands: `BODY_ITEMS_PATH`,
  `InsertTarget`, `resolveInsertTarget` (selection with an `items` list
  → inside; else after the nearest `items`-keyed ancestor; else body
  append), `hasNoBodyItems`. The `ReadFn` these take is
  designer-core's (see [gui-core.md](gui-core.md)) — it used to live
  here, and 47 files imported ONLY that type from this module, 46 of
  them from outside the area (canvas 24, panel 11, text 5, toolbar 4,
  palette 2) — a document-read contract sourced from a feature.
- `insert/containerModel.ts` — pure container-picker model:
  `containerShape` (clamped 6×4 trace → flex row/column or grid),
  `containerSnippet` (explicit `direction`, honest placeholder text
  children), `isPlaceholderSlot` (the document-only untouched-slot
  predicate shared by nest-into-slot and the grid shrink; anything
  content-bearing reads as content).
- `insert/containerInsert.ts` — `resolveContainerInsert`: nest (replace
  a placeholder slot directly inside a container) vs append; hostile
  reads fall to append — the implicit replace never fires on content.
- `insert/wrap.ts` — wrap-in-container: `isWrappablePath` (read-free
  gate) + `wrapInContainerOps` (ONE batch insertItem+removeItem; the
  node is re-authored via the snippet path, so hostile subtrees fail the
  validator and the batch rolls back whole).
- `insert/blockModel.ts` — pure reusable-block model: `SavedBlock` (a
  named `SnippetValue`), `blockFromNode`/`validateBlockName`/
  `addBlock`/`removeBlock` (caps, fresh ids), `sanitizeBlocks` (the
  restore guard over untrusted storage), `blockInsertGroup` (the
  reusable-blocks menu group; armed only when the host wires
  `onBlocksChange`). Each row carries `flowOnly`, read off `canvas/dnd`'s
  `typeFitsOwner` — the ONE home for which owner a kind fits — so the
  menubar can disable it inside a band. Unlike the band-only page number,
  which merely warns in the wrong place, a `repeat`/`repeat_flow`/
  `page_break` inside a band does NOT parse: the whole document stops
  rendering. `hooks/useBlocks` re-checks the same predicate at insert time,
  since a disabled row is a UI state and the two can disagree if the
  selection moves between the menu being built and the row being clicked.
- `insert/BlockDialog.tsx` / `insert/BlockManageDialog.tsx` — the
  save-as-block naming modal (IME-guarded Enter) and the manage modal
  (two-step per-row delete).
- `insert/ContainerPickerDialog.tsx` — the n×m trace grid in a compact
  Modal (real cell buttons + arrow-key roving; `data-cell` tutorial
  anchors; `<output>` preview names the shape; optional `nestHint`
  banner shows the implicit replace before it fires).

## Image import

- `image/model.ts` — pure, DOM-free: `importPlan`
  (accept/downscale/refuse — SVG never rasterized, over-pixel refused
  before any canvas), `fitDimensions`, `defaultBox` (px → pt at 96 dpi,
  clamped to content width), `DEFAULT_IMAGE_BUDGETS`. **GIF and WebP
  travel VERBATIM** — a canvas cannot emit GIF and re-encoding either
  would silently drop an animation — so an over-budget one is REFUSED
  (`too_large`) where a png/jpeg would be downscaled; `RasterKind` means
  "re-encodable" and stays png/jpeg, while the wider `ProbeKind` is what
  the codec can measure. Its four leaves:
  `image/sniff.ts` (`sniffImage` — magic bytes, both GIF signatures in
  full and WebP's RIFF FORM tag, + the SVG root-element scan; MIME never
  trusted), `image/clipboard.ts` (`imageFileFromClipboard` — the
  defensive walk to a pasted `files[0]`; no MIME filter, since the sniff
  decides and a "no file" answer is what lets the caller leave a text
  paste alone), `image/dataUri.ts` (`composeDataUri` over a
  hand-rolled base64 — no `fromCharCode` spread to overflow on a
  multi-megabyte image), `image/capacity.ts`
  (`headroom`/`projectImport` — the pre-op cap gate — plus `nextCapStep`/
  `CAP_STEPS`).
- `image/import.ts` — the `ImageCodec` host-injection contract
  (`probe` takes a `ProbeKind`, so a host measures GIF/WebP too;
  `reencode` stays `RasterKind` and is never called for them) +
  `importImageFile` orchestration returning typed outcomes (never
  throws; the real browser codec lives in
  `designer-app/src/browser/imageCodec.ts`, coverage-excluded — jsdom
  tests inject a fake).
- `image/TemplateSizeIndicator.tsx` — the topbar headroom % + raise
  prompt / at-ceiling hint.

## Paste import

- `insert/pasteGrid.ts` — clipboard text → header + data grid:
  `parsePasteGrid` (TSV/quote-aware CSV; the byte cap slices BEFORE any
  parsing, then column/row/cell caps) + the caps themselves
  (`MAX_PASTE_BYTES`/`MAX_PASTE_COLUMNS` (= `MAX_SCAFFOLD_FIELDS`)/
  `MAX_PASTE_ROWS`/`MAX_CELL_CHARS`).
- `insert/pasteColumns.ts` — typing the grid's columns: charset-guarded
  `deriveKey` (reserved names checked pre- AND post-strip, so
  `__proto__` cannot sneak through as `proto`), the closed `inferKind`
  switch (a leading `=`/`@` is never numeric — formulas stay literal,
  NO evaluation ever), `coerceCell`, `analyzeColumns`.
- `insert/paste.ts` — the import's exit: `PasteRefusal`,
  `freshSourceKey`, `buildPasteScaffold` (money columns carry
  `format:'symbol'`; proto-safe verbatim rows).
- `insert/PasteDialog.tsx` — textarea + live parsed preview +
  truncation note; inserts a NEW table only.

## Scaffolds + create dialogs

The scaffold is four leaves — the spec VOCABULARY, its snippet
REALIZATION, the blank-start SCHEMA side, and where an iterable LANDS:

- `insert/scaffold.ts` — the spec vocabulary: `MAX_SCAFFOLD_FIELDS` (the
  hostile-definitions bound the paste caps also ride), `ScaffoldVariant`/
  `ScaffoldColumn`/`ScaffoldSpec`, `scaffoldFromGroup` (image-typed
  fields excluded), `variantsFor`/`defaultVariantFor`.
- `insert/scaffoldSnippet.ts` — `scaffoldSnippet(spec, variant,
  declarations?)`: one probed `insertItem` value per variant (table /
  repeat_flow card / list; the list interpolates via `chipWire` — the
  ONE parser round-trip, so an unsafe key can never inject grammar; with
  `declarations` a charset-unsafe field rides a minted `bindings:`
  entry). Total — a field-less spec degrades to the list.
- `insert/scaffoldFields.ts` — the blank-start side: the `FieldKind`
  quintet + `FIELD_KINDS` (the enumeration both create forms render, so
  neither carries a copy that can drift from the type), `ScaffoldField`,
  `scaffoldSchema` (kind → schema through a closed switch; a
  `__proto__` field name stays inert own data via computed-key spread),
  `scaffoldFromFields`.
- `insert/iterableTarget.ts` — `resolveIterableTarget`: iterables are
  body-level, so the generic `model.ts` rule does not apply to them.
- `insert/iterableModel.ts` — pure dialog model (`iterableAvailable`,
  `arrayGroups`, `validateCreateForm` with typed refusals,
  `confirmChoice` — every branch pure).
- `insert/IterableDialog.tsx` — the iterable modal shell (`<dialog
  open>`, mode radios, refusals via `iterable.error.*`); it holds the
  create draft as ONE `IterableDraft` and composes three leaves:
  - `insert/iterableSourceList.tsx` — the bindable-group radio list.
  - `insert/iterableCreateForm.tsx` — the workshop-mode create form
    (`IterableDraft` = name + row fields, in and out as one bundle;
    row count capped by `MAX_FORM_FIELDS`).
  - `insert/iterableVariantPicker.tsx` — the variant trio; an
    unsupported variant renders DISABLED, never absent.
- `insert/fieldModel.ts` — pure create-data-field model
  (`validateFieldForm`, `fieldSchema` (sample rides as `example` — no
  second value-set path), `initialFieldSample`, `confirmField` with
  typed refusals; samples clipped).
- `insert/FieldDialog.tsx` — the create-field modal (name, kind select),
  over `insert/fieldSampleInput.tsx` — the kind-aware sample widget,
  reseeded by the shell on kind change.

### Modal chrome

All five insert dialogs (iterable / field / paste / block save / block
manage) render inside `ui/Modal` (chrome map) — Escape/backdrop/focus
trap/× are Modal's (i.e. Headless UI's) responsibility, so their suites
test only their own wiring (each footer close path reaches `onClose`),
never the chrome. The callers keep CONDITIONAL mounting so per-dialog
draft state resets on reopen. `PasteDialog` uses `size="roomy"` (560px)
so ~5 column chips fit one row; the rest use the 460px default.

## Sample data (`sample/` — the params models + the value-synth seam)

The params-JSON model is three files with one-way imports — `view.ts`
and `edit.ts` both import `model.ts` and never each other.

- `sample/model.ts` — the params substrate: `SampleKind`
  (string/number/boolean/date/datetime), `SamplePath` (SEGMENTS, never a
  dotted string), the view types, `inferKind`/`kindFromType`/`display`,
  own-property readers, the ONE `parseParams`/`serializeParams` pair,
  `coerceSampleValue` (a non-finite entry stays a STRING so the engine
  surfaces the mismatch)/`initialSampleValue`; hostile caps.
- `sample/view.ts` — the READ side: `readSampleView(paramsText,
  definitions?)` (schema labels/kinds from the SAME parse the palette
  uses — one schema reader; value-inferred fallback so blank-start data
  stays editable; bounded walks).
- `sample/edit.ts` — the WRITE side: `setSampleValue`/`addSampleField`/
  `addSampleRow`/`removeSampleRow`, each a serializable text→text
  transform (AI parity) over proto-safe rebuilds; a missing
  intermediate map is CREATED, a path contradicting the existing shape
  is a no-op.
- `sample/datetime.ts` — pure RFC 3339 wall-clock split/compose (never
  a `Date` round-trip; offset display-inert), `representativeOffset`.
- `sample/history.ts` — panel-local sample undo ring (count+byte
  capped, no redo).
- `sample/generate.ts` — the public generation API: `generateParams`,
  `fillMissingParams` (non-clobbering CTA), `missingParamKeys`,
  `extendParams` (fresh-key-only — the scaffold hook),
  `extendParamsValue` (verbatim twin).
- `sample/genWalk.ts` — the schema walk (`genValue`/`generateRoot`,
  leaf resolution example→enum→synth→type-default; hostile-schema caps
  live here).
- `sample/genConstraints.ts` — the bounds layer (`constraintsOf`/
  `clampLeaf` — the generator owns the bounds; an injected synth may be
  hostile; `coerceToType` reconciles examples with declared types).
- `sample/inferStub.ts` — `inferDefinitions(paramsText)` = the workshop-mode
  stub, RECOMPUTED (definition edits ride on top as ops) and emitted
  through the ONE YAML serializer.
- `sample/synth.ts` — the `ValueSynth` injection seam + `baselineSynth`
  deterministic floor.
- `sample/variants.ts` — pure sample-variant model: `SampleSet` (an
  ARRAY, never an object keyed by id), pure set→set transforms with
  typed refusals, `variantDisplayName`; `MAX_VARIANTS`.
- `sample/variantsStore.ts` — the persistence projection (`toStored`
  drops labels — they re-resolve from the catalog at open;
  `restoreSampleSet` Map-guarded, declared preset variants missing from
  the stored set are APPENDED — absence can only mean an older draft).
- `sample/VariantSelect.tsx` — the labeled switcher select, shared by
  the canvas topbar + the data editor's variant bar.

## Data-item editor (`data/` — the fullscreen definitions + sample editor)

- `data/definitionsEdit.ts` — pure definitions-edit model:
  `fieldKeysPath` (palette field → root-addressed schema keys path),
  `readDefinitionField`, op builders (changed-guard null; empty clears),
  `applyDefinitionOps` (a throwaway Editor applies PER OP with
  skip-on-refusal — a benign miss must not drop the other edits;
  fail-closed on malformed text), `coalesceDefsEdit`,
  `DEFINITION_TYPES`.
- `data/defsPlan.ts` — the untrusted-boundary pair: `addFieldPlan` (a
  fresh top-level field as ONE `putValue`; returns the OP so the
  Designer coalesces it) + `sanitizeDefsEdits` (the persisted-edit-list
  restore guard; deep validation stays with designer-core at apply).
- `data/defsHistory.ts` — panel-local DEFINITION undo ring (a faithful
  parallel of `sample/history.ts` — definitions are a distinct undo
  document; three independent undo contexts).

The fullscreen editor is a SHELL plus per-responsibility panes; inside
`data/` imports run one way (shell → pane → row/form → pure model) and
the panes never import each other.

- `data/DataEditorView.tsx` — the shell (document-settings mould: whole editor
  area, own back control, Escape closes): owns the selection
  (`selectionKey`-addressed, re-resolved per render; `initialSelection`
  seeds it ONCE on mount — the view is unmounted whenever it is not open,
  so every entry re-seeds, and a stale/hostile target simply resolves to
  nothing), the derived
  view/usage memos, and the two commit paths (`commitSample` →
  `onParamsChange`; `dispatchDefEdit` → `onDefinitionEdit(op)`);
  `sampleDataReadOnly` renders sample values as text.
- `data/editorProps.ts` — `DataEditorViewProps` (optionality carries
  meaning: an absent callback disarms its affordance).
- `data/ItemListPane.tsx` — the left rail: search (owns its query
  state), the add-item form, the definitions-edit undo button (reachable with
  no selection), the grouped list, the `definitionsProjectScoped` hint.
- `data/ItemListRow.tsx` — one row (label/key/type/usage chip; the
  `HelpHint` is a SIBLING of the row button — no button-in-button).
- `data/AddItemForm.tsx` — name + type dispatching `addFieldPlan`'s op
  (IME-guarded Enter).
- `data/DetailPane.tsx` — the right pane for ONE field: definition form
  + sample value(s) (array-group fields render one per row with
  add/remove). The 「sample value」 heading is the section's ONE label —
  the widget under it is named after the FIELD in both branches — and
  carries the `?` saying the data is preview-only placeholder, a sentence
  that has to hold in every arm the pane classifies (scalar / array,
  editable / read-only mounted host). STATELESS, not keyed by selection — each uncontrolled
  input is keyed by its own value; a control added here needs the same
  value-key.
- `data/DefinitionForm.tsx` — display label / type / format (the shared
  `FormatPicker`) / description; read-only (not hidden) without
  `onDefinitionEdit`.
- `data/ValueField.tsx` — the sample-value widgets per kind (roomy
  textarea for strings — the genkoyoshi body-text case; compact widgets else;
  uncontrolled + commit-on-blur, keyed by the CALLER's `key={value}` plus its
  own reseed nonce — `panel/useReseedKey`). The nonce is what the caller's key
  cannot provide: two kinds commit without MOVING the value, so the entry the
  editor did not take would stay on screen. A cleared `datetime` authors
  nothing (there is no blank RFC 3339 value), and a `number` goes through
  `coerceSampleValue`, which runs `Number(raw)` — `100.0` over a 100 authors
  100. The datetime blur compares the COMPOSED wire value rather than the two
  wall-clock strings, because the input shows a converted view the browser may
  spell differently (jsdom returns `…T05:06:07.000` for a value authored
  `…T05:06:07`); before that, every bare tab-through re-authored the sample. A field with declared
  `enum` members routes to `data/enumValue.tsx` — the labeled select
  (options show labels, the raw-value caption sits beneath, an
  out-of-enum current value stays visible + warned, a SATURATED list
  (display cap reached) stands down to free entry, commit on change);
  `ReadonlyValue` shows label + machine value.
- `data/SampleControls.tsx` — the document-level controls (variant bar,
  sample undo, the generate CTA while `missingParamKeys` is non-empty);
  replaced wholesale by the read-only hint on a mounted host.
- `data/VariantBar.tsx` — the variant switcher/add/two-step delete
  (user variants only removable); typed refusals as localized notices.
- `data/editorModel.ts` — the editor's pure helpers: `selectionKey` +
  `SELECTION_SEP` (U+0000 written as an ESCAPE — display-only composite
  key; ops address resolved objects instead; the escape also keeps the
  file out of binary grep classification), `sampleKind`, `readAt`,
  `arrayLength`, `TYPE_OPTION_KEY`.
