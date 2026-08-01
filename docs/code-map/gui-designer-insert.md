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
  (row-relative keys; arrays inside rows are engine-rejected and just
  skipped), `arrayGroup`. Depth- and count-bounded.
- `palette/model.ts` — the palette's view types (`PaletteField`,
  `PaletteGroup`) + `readDefinitionsView`: the `properties` tree →
  groups, `null` for anything unparseable/oversized/the retired v1
  `groups:` form. The widely-imported surface of the area.
- `palette/bindings.ts` — the template walk → `BindingRef {path, key,
  scope, source}`; unparseable text yields `[]`, never a throw.
- `palette/bindingRefs.ts` — its per-item helpers: `bindingKey`,
  `bindingScope` (`scope: document` files a ref at document scope even
  inside a cell), `collectInterpolations` + `pushInterpolated` (`{key}`
  refs and `bindings:` declarations resolved via `text/declModel`; one
  ref per distinct (key, scope)).
- `palette/usage.ts` — `buildUsage` (→ real `Map`s; binding keys are
  attacker-influenced, so `__proto__` stays inert) + `fieldUsage` /
  `groupUsage`.
- `palette/filter.ts` — `filterGroups`: plain `includes`, never a
  RegExp; a group-level hit keeps the whole group.
- `palette/FieldPalette.tsx` — the read-only grouped/searchable panel
  shell (search box, empty state, the definitions→usage correlation it
  hands down); dispatches ZERO ops itself.
- `palette/paletteRow.tsx` — one field row + its chrome: the `PaletteDrag`
  wiring type, the localized type label (exported `TYPE_LABEL_KEYS`,
  shared with `panel/FieldPicker`, `text/InsertFieldMenu` and
  `data/ItemListRow`), the
  used/unused badge; a used field's click cycles bound placements via
  the shared selection.
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

- `insert/insertMenu.ts` — `InsertKind`/`MenuEntry`/`InsertGroup` +
  `insertMenuGroups` (the menu's entry-class structure; only populated
  groups render, capability-less rows absent, band-only rows disabled
  with a reason).
- `insert/insertSnippet.ts` — `insertSnippet(kind, …)` (per-type default
  snippets — rect carries `borderWidth: 1` because a style-less rect
  draws nothing; the cut-here-line snippet is a container + dashed `line`
  sized from the FLOORED content width), `CutLineText`,
  `DEFAULT_CUT_LINE_PT`.
- `insert/bandPlacement.ts` — `requiresBand`/`bandInsertY`/`bandPlaced`:
  band children are coordinate-placed against the page margin box,
  height floored.
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
  `onBlocksChange`).
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
  clamped to content width), `DEFAULT_IMAGE_BUDGETS`. Its three leaves:
  `image/sniff.ts` (`sniffImage` — magic bytes + the SVG root-element
  scan, MIME never trusted), `image/dataUri.ts` (`composeDataUri` over a
  hand-rolled base64 — no `fromCharCode` spread to overflow on a
  multi-megabyte image), `image/capacity.ts`
  (`headroom`/`projectImport` — the pre-op cap gate — plus `nextCapStep`/
  `CAP_STEPS`).
- `image/import.ts` — the `ImageCodec` host-injection contract +
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
  (`selectionKey`-addressed, re-resolved per render), the derived
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
  add/remove). STATELESS, not keyed by selection — each uncontrolled
  input is keyed by its own value; a control added here needs the same
  value-key.
- `data/DefinitionForm.tsx` — display label / type / format (the shared
  `FormatPicker`) / description; read-only (not hidden) without
  `onDefinitionEdit`.
- `data/ValueField.tsx` — the sample-value widgets per kind (roomy
  textarea for strings — the genkoyoshi body-text case; compact widgets else;
  uncontrolled + commit-on-blur + value-keyed). A field with declared
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
