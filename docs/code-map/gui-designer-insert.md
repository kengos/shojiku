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
  the pair `data/treeModel`'s `nodeForTarget` resolves on the other
  side, so an object group's own id travels beside the DOTTED full key)
  + `readDefinitionsView`: the `properties` tree → groups, `null`
  for anything unparseable/oversized/the retired v1 `groups:` form; +
  `rowScopeLabel` (the parent's display label for the heading badge,
  falling back to the parent id). The widely-imported surface of the
  area.
- `palette/bindings.ts` — `readBindings` → `BindingRef {path, key,
  scope, source}`: a PROJECTION of the data-reference walk
  (`data/refs/walk.ts`), one per place (an item, or a table column) per
  (key, scope, source), the place being `refs/match`'s `placePath` — so the
  palette and the data-item editor count the same places. A `document:` reference has path `document`, which
  `FieldPalette`'s pick skips (nothing on the canvas to select).
  Unparseable text yields `[]`, never a throw.
- `palette/bindingRefs.ts` — the binding-shape readers several walks share:
  `ARRAY_SOURCE_TYPES`, `bindingKey`, `bindingScope` (`scope: document`
  files a ref at document scope even inside a cell).
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

The plain insert is five pure leaves — what the menu OFFERS, what each
kind INSERTS, what a band REQUIRES, what the FLOW requires, and where the
result LANDS:

- `insert/insertMenu.ts` — `InsertKind`/`MenuEntry`/`InsertGroup`/
  `InsertArming` + `insertMenuGroups(armed)` (the menu's entry-class
  structure; only populated groups render, capability-less rows absent,
  band-only rows disabled with a reason). The arming is a NAMED record,
  not positional booleans — five bare `true`/`false` at a call site said
  nothing about which row each armed. The two `line` rows gate on
  DIFFERENT capabilities and so arm independently: the plain rule on
  `line.length` (its snippet spans `100%`) and the cut-here scaffold on
  `line.style` (its rule is dashed). The plain rule sits directly after
  `rect`, which is what a reader flattens to a hairline without it. The
  two FORM MARK rows (`ellipse`, `checkbox`) queue BEHIND the rule rather
  than beside the rect, so that measured adjacency is not split. The
  checkbox arms on TWO keys — `checkbox` AND `checkbox.auto_size` —
  because its snippet authors no `box:`: an engine carrying the item but
  not the cap-height default skips an unsized mark with
  `mark_missing_size` instead of drawing it. The `band` entry class is UNCONDITIONAL (no
  capability, host or schema gate — the two section bands have been in
  the wire since 0.1.0) and sits directly under the element group, next
  to the `page_number` row whose disabled reason names it; its rows are
  bare NOUNS with no `…`, like every other immediately-acting row.
  The CHARACTER GRID and the PAGE BREAK arm on one capability each
  (`char_grid`, `page_break`) and likewise queue behind the rule rather
  than splitting it: the grid follows the QR code as the next
  content-bearing box, the break follows the page NUMBER because the two
  are mirror images — one lays out only in a band, the other only in the
  flow, and each states its reason on a disabled row in the other's
  place.
  NOTE: `InsertGroup.labelKey` is structure only — `Menubar.tsx` renders
  groups as divider-separated blocks and shows no group heading.
- `insert/insertSnippet.ts` — `insertSnippet(kind, …)` (per-type default
  snippets — rect carries `borderWidth: 1` because a style-less rect
  draws nothing; the cut-here-line snippet is a container + dashed `line`
  sized from the FLOORED content width), `CutLineText`,
  `DEFAULT_CUT_LINE_PT`, `RULE_Y_PT`. The two FORM MARKS split on whether
  a size can be defaulted: the `ellipse` carries `box: { w: 60, h: 40 }`
  because an unanchored one with no positive `w`/`h` is SKIPPED
  (`mark_missing_size`), while the `checkbox` authors NOTHING at all —
  unsized, the engine matches its frame to the inherited font's
  cap-height square, which is the size an author wants beside a label and
  cannot compute. Neither authors a `style`: a mark's outline already
  defaults to 1 pt black (`DEFAULT_MARK_STROKE_PT`), because its visible
  geometry is its function. The plain rule authors neither
  `style` (the engine's own 1 pt black is already visible) nor `box` (a
  parse error on a `line`), and reaches its end with `x: "100%"` rather
  than render geometry, so it follows whatever it is nested in.
  `RULE_Y_PT` is MEASURED, not chosen: a flow line reserves its own
  vertical extent and paints at the BOTTOM of it, so every point of `y`
  is air ABOVE the rule and none below — 4 pt is the value that reads as
  a rule rather than as an underline of the text above it.
  The two newest snippets are the same discipline. `page_break` is the
  BARE tag: its wire struct takes only `id`/`visible` under
  `deny_unknown_fields`, so any second key is a parse error rather than a
  misplacement (the test asserts the own-key COUNT, not the shape). The
  `char_grid` snippet authors exactly the two REQUIRED grid dimensions
  (`charsPerLine: 20`, `lines: 10`) plus content, and content is not
  optional decoration: with neither `text` nor `data` the engine reports
  `empty_char_grid_item`, so the row would insert a diagnostic. It
  authors no `cellSize` (derived from the content width — on A4 at the
  engine's default 25pt margins that is 545.28/20 = 27.26pt ≈ 9.6mm,
  MEASURED off the rendered PNG; it is not the 9mm genkoyoshi cell, which
  `examples/typography/genkoyoshi-ja` authors explicitly on B5), no `box`
  (`box.w` already defaults to full width) and no `style` (the ruling
  draws at 0.5pt on its own). Probed with `make engine:preview`, whose
  positive control was the same item with `text` removed.
- `insert/flowPlacement.ts` — the MIRROR of `bandPlacement`, and the
  INSERT-side half of the flow-only rule. Its other half is
  `canvas/dnd`'s `typeFitsOwner`/`FLOW_ONLY`, which answers the same
  question for a DROP or a saved block, in the wire's vocabulary
  (`repeat`, `repeat_flow`, `page_break`) rather than in `InsertKind`'s.
  The repeaters' creation path does NOT add to this file: the insert
  menu creates both only as iterable-dialog variants, whose spelling IS
  the wire type, so `scaffold.ts`'s `variantFitsBody` reads `typeFitsOwner`
  directly rather than keeping a third list. `requiresFlow` stays about
  `InsertKind`, and no `InsertKind` creates a repeater (a saved block
  carrying one is gated by `requiredOwner` against the resolved target's
  owner, below). Exports: `requiresFlow` (today `pageBreak`
  alone — `charGrid` is deliberately NOT one, since the engine places a
  `char_grid` everywhere and merely draws a single sheet outside a flow
  body), `insertTargetOwner(read, path)` — which `OwnerKind` a
  target is. OUTSIDE a repeating sub-template that is a resolved `…items`
  list read through `canvas/dnd`'s `receiverFor`, so an insert and a drop
  agree; inside one neither half applies (the path branch answers first, and
  the path need not be an `…items` list), and the two agree there by REFUSING
  rather than by classifying. A target ANYWHERE inside a repeating
  sub-template answers `cell`, decided from the PATH
  (`tree/subTemplate`'s `isOrInsideSubTemplate`, the same widened question
  `receiverFor` asks) before the document is consulted —
  the engine's data scope is not cleared on the way into a nested
  container, so the list one container down is as much a cell as the
  cell's own `items`; `cell` is strictly narrower than `container`,
  differing only in that it also refuses a `table` (`table_in_cell`).
  Everything else `receiverFor` cannot classify (a grid container, a
  typeless body, a throwing read, a non-`items` path) still answers
  `container`, which fails CLOSED (it holds neither restricted kind) and
  matches the engine, whose grid children warn `*_in_container` — and
  `isFlowTarget(read, path)`, `insertTargetOwner(…) === 'flow'`, and
  `insertTargetBand(read, path)`, the band a target is DIRECTLY (`null` for a
  container INSIDE a band, which is a `container`) — read by
  `insert/targetPlacement`'s `placeForTarget`, so a container in a footer
  receives its new child box-less rather than pinned against the page margin
  box. A canvas DROP differs there by design:
  `canvas/reparentTarget` resolves a drop inside a band's strip to the band
  before `receiverFor` is consulted, so a dragged item lands in the band while
  an inserted one lands in the selected container.
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
  height floored; a footer item starts one line (32pt) above the bottom
  edge, or is BOTTOM-ALIGNED when it carries a finite positive numeric
  `box.h` (every image, rect, QR code and ellipse snippet does; a saved
  block may), so a tall item never hangs past
  the margin box where nothing clips it; an item authoring no width of its own is given
  `w: '100%'`. That default is for TEXT-shaped items, and a
  `MARK_TYPES` item is exempt from it: an `ellipse`/`checkbox` is a
  fixed-aspect glyph, so a boxless checkbox — the exact shape the insert
  snippet produces — would otherwise arrive in a header as a frame
  stretched across the whole margin box. It takes the coordinates and
  nothing else. A BOXLESS item (`panel/itemView`'s `BOXLESS_TYPES`)
  is a SEPARATE exception and takes the offset in its OWN coordinates — a
  `box:` on a `line` is an engine parse error, not a misplacement, and
  shifting `from.y`/`to.y` is what puts a footer rule where footers
  print. Only a plain numeric `y` shifts; an anchored endpoint has no
  coordinate and a `Length` string would concatenate (`'50%' + 700`),
  so both are returned as authored. The values are UNTRUSTED — saved
  blocks restored from browser storage reach it through `hooks/useBlocks`.
- `insert/targetPlacement.ts` — `placeForTarget(read, preview, path,
  snippet)`: the ONE door every insert SURFACE that can land in a header
  or footer passes through before `insertItem` — the element insert
  (`hooks/useInsertActions`), saved blocks (`hooks/useBlocks`), the
  container picker's append (`hooks/useContainerInsert`), the field
  dialog (`hooks/useFieldInsert`) and the image import
  (`hooks/imageImportRun`). A band target DIRECTLY (`insertTargetBand`) →
  `bandPlaced` at `bandInsertY(band, bandBoxHeightPt(preview, read), own
  box.h)`; anything else → the snippet as authored. The iterable and paste
  dialogs never reach it: `insert/iterableTarget` always answers the body.
  Not a door for gestures on an EXISTING item: `insert/wrap.ts` moves the
  item's own position onto its new container, and a layer-tree drop into a
  band lands through `tree/rowDrag` `bandLanding`.
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
- `insert/wrap.ts` — wrap-in-container: `isWrappable(path, node)` (the
  ONE gate the context-menu row, the Layout tab action and the op builder
  share: an `…items` entry holding a map of a type `typeFitsOwner(…,
  'container')` accepts, so `page_number`/`page_break`/`repeat`/
  `repeat_flow`, which a container skips, are never wrapped) +
  `wrapInContainerOps` (ONE batch insertItem+removeItem; the node is
  re-authored via the snippet path, so hostile subtrees fail the validator
  and the batch rolls back whole). The item's OWNER keys — `box.x`/`box.y`
  and `flexGrow`/`flexBasis`/`columnSpan`/`rowSpan` — move onto the container
  verbatim (it is now the owner's child and resolves against the basis the
  item did, in every owner); an emptied item box is dropped except on a
  `REQUIRED_BOX_WIRE_TYPES` type (`rect`, where it is a required wire key); an
  anchored `ellipse` keeps its keys; a `line` outside the flow body gives the
  container its topmost numeric endpoint `y` and shifts both endpoints by it.
  `widthAxis(box)` decides the WIDTH axis: any `%` in `w`/`minWidth`/`maxWidth`
  sends all three plus `margin` onto the container. The item is filled back
  with `w: "100%"` ONLY if it had a `w` — an item sized by its owner (a `%`
  bound alone) must stay unsized, or an owner that measures a child from its
  content (a flex row, an `auto` grid track) sizes the wrapper as the whole
  basis (measured: 272.64pt → 515.99 in a row). Nothing is refused on this
  axis; a container's width is definite in every owner, and its DEFAULT is the
  basis the owner hands it — the parent's width minus the item's `x` and right
  margin in a band/flow/absolute owner, the share a `row` or grid gives it
  otherwise. That default is exactly why the `%` had to move: an offset item
  narrowed by that share (measured: a 50% rect at `x: 100` in a 545.28pt band
  came out 222.64pt instead of 272.64).
  `heightAxis(node)` decides the HEIGHT axis, and `isWrappable` reads the same
  answer: a new container is ALWAYS auto-height, so a `%` in
  `h`/`minHeight`/`maxHeight` left on the item resolves against nothing
  (`percent_of_auto`, and a sizeless `rect` is not drawn at all). `move` sends
  those three plus `margin` onto the container and rewrites the item's `h` to
  `"100%"`, so the item takes the container's content box — which is the item's
  old border box, the container having no padding of its own. `refuse`
  withholds the wrap entirely, for the two shapes no re-authoring preserves IN
  EVERY OWNER: a `%` `minHeight`/`maxHeight` with NO `h` (nothing to move onto —
  a container carrying only a bound is still auto-height), and a `line` endpoint
  `y` in `%` (no box to carry it; giving the container a full-height box instead
  pushes the following siblings down wherever the owner STACKS them — measured
  off the page in a flowing body and 200pt down in a column container). Both
  refusals are OWNER-INDEPENDENT, measured owner by owner: everywhere but a flex
  ROW the shape is LOST — a `%` bound with no `h` collapses to its content with
  `percent_of_auto` (flow/absolute body, header/footer band, column or grid
  container, repeat cell, card, table cell) and a `%` endpoint `y` lands at the
  container's top. A flex ROW is the EXCEPTION: the wrapper inherits the row's
  cross-axis stretch, so the basis survives and a line — or a `100%` bound —
  comes out IDENTICAL with no diagnostic, while every other bound loses the
  item's own stretch SILENTLY (200pt -> 40). Refused there too rather than
  offering a command that preserves the shape only for a line or at one value of
  the percentage, so `isWrappable(path, node)` needs no owner. `%` is spelled as
  `parse_length_text` spells it: a string that, trimmed, ends in `%`.
- `insert/blockModel.ts` — pure reusable-block model: `SavedBlock` (a
  named `SnippetValue`), `blockFromNode`/`validateBlockName`/
  `addBlock`/`removeBlock` (caps, fresh ids), `sanitizeBlocks` (the
  restore guard over untrusted storage), `blockInsertGroup` (the
  reusable-blocks menu group; armed only when the host wires
  `onBlocksChange`). Each row carries `requires`
  (`'band' | 'flow' | null`), read off `canvas/dnd`'s `requiredOwner` — the
  home for which owner a WIRE TYPE needs, whose insert-menu counterpart over
  `InsertKind` is `flowPlacement`'s `requiresFlow` — and `refuses`
  (`'cell' | null`), read off `insert/blockRefusal`. Either answer lets the
  menubar disable the row wherever the resolved target (`insertTargetOwner`)
  is that owner: the engine skips the item there and nothing draws.
  `hooks/useBlocks` re-checks BOTH against the same owner at insert time,
  since a disabled row is a UI state and the two can disagree if the selection
  moves between the menu being built and the row being clicked;
  `integration/wasm.test.ts` pins the rule against the real engine per kind
  and owner, and pins the wrapped-table case with a band control. A third
  field, `neverDraws` (read off `blockNeverDraws`), is NOT a gate: the row
  stays enabled and carries it as a note, and `useBlocks` does not re-check it.
- `insert/blockRefusal.ts` — `blockRefusedOwner(value)`, the whole-BLOCK
  counterpart of `canvas/dnd`'s per-TYPE `refusedOwner`, and the only part of
  the block feature that walks a node tree (split out of `blockModel`, which
  had reached 149 of its 150 executable lines). It walks the block's `items`
  CHAIN, because a cell's refusal travels down it, and deliberately does NOT
  descend into the block's own `cell:`/`item:`/`columns[]` sub-templates,
  where a table is already dead wherever the block lands — refusing there
  would leave a saved block insertable nowhere and would state a reason no
  target fixes. Of the three, only `cell:` and `item:` can ever decide an
  answer: `columns[]` exists solely on a `table` the walk has already refused
  by type. The refusal it feeds is of the WHOLE block and is therefore WIDER
  than the engine's, which drops only the table and still draws the container
  and the siblings beside it (measured); the CHANGELOG says so, because it is
  a capability the gate withdraws. Bounded over untrusted host storage — the
  `blocks` prop is host-supplied and the Designer does not sanitize it
  (`sanitizeBlocks` is a HOST export), and the walk re-runs on every menubar
  render: depth 24 as a backstop (`MAX_SNIPPET_DEPTH` is 16, so it cannot fire
  on a sanitized block) and 256 NODES as the working bound, which is the one
  that matters because the walk re-reads per node and a shared-reference graph
  re-expands. Beside it, `blockNeverDraws(value)`: whether the block holds an
  item no insert target makes draw — a restricted kind (`requiredOwner`
  non-null: page number, page break, repeat, repeat_flow) anywhere BELOW the
  root, whose owner there is the block's own container or a sub-template; or a
  table anywhere inside the block's OWN `cell:`/`item:`/`columns[].cell`, whose
  data scope nothing below clears (`table_in_cell`). It goes INTO the
  sub-templates — the mirror of the refusal's scope, for the mirror of its
  reason — carrying a "below a sub-template" bit, and never flags the root
  (the target-dependent `requires`) or a table outside a sub-template (the
  target-dependent `refuses`). The refusal's caps, with the deepest inspected
  level 24 in both walks, over a lazy child iterator, with each table column
  charged to the node budget so a shared cell-less `columns` array cannot be
  re-scanned whole per visit; past a cap it answers `false`. The real-wasm suite
  pins it per restricted kind, wrapped and in a column cell, plus a table in a
  column cell against a merely wrapped one, in the flow body and a footer band,
  with a clean-wrapper control.
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
  `CAP_STEPS`, and `byteAmount`, the KB/MB the readout writes a byte count
  in).
- `image/import.ts` — the `ImageCodec` host-injection contract
  (`probe` takes a `ProbeKind`, so a host measures GIF/WebP too;
  `reencode` stays `RasterKind` and is never called for them) +
  `importImageFile` orchestration returning typed outcomes (never
  throws; the real browser codec lives in
  `designer-app/src/browser/imageCodec.ts`, coverage-excluded — jsdom
  tests inject a fake).
- `image/TemplateSizeIndicator.tsx` — the topbar headroom readout as
  used / limit (`12 KB / 2 MB` — not a bare percent), a `?` saying what the
  limit is for, and the raise prompt / at-ceiling hint.

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
  hostile-definitions bound the paste caps also ride), `ScaffoldVariant`
  (`table | repeat_flow | repeat | list` — each spelling is the wire
  `type:` its snippet inserts) and `SCAFFOLD_VARIANTS` (the ONE ordered
  list the picker renders and the dialog clamps against), `ScaffoldColumn`/
  `ScaffoldSpec`, `scaffoldFromGroup` (image-typed fields excluded),
  `variantsFor`/`defaultVariantFor`, and `variantFitsBody(variant,
  flowBody)` — the flow-only gate, answered by `canvas/dnd`'s
  `typeFitsOwner` (owner `flow` or `absoluteBody`): the cards and the grid
  fit only a flow body. The integration suite pins that answer to the real
  engine's `<type>_in_absolute_body` diagnostics, variant by variant. Of
  the three scaffold entry points only the dialog can pick a flow-only
  variant: paste always inserts a `table` and a palette drag inserts
  `defaultVariantFor` (table or list), both of which lay out in any body.
- `insert/scaffoldSnippet.ts` — `scaffoldSnippet(spec, variant,
  declarations?)`: one probed `insertItem` value per variant (table /
  repeat_flow card / n-up `repeat` grid / list; the card's `item:` and the
  grid's `cell:` are one shared body — a padded, 0.5pt-bordered container of
  one bound text per field; the grid starts at 2 × 2 with per-axis 8pt gaps,
  authoring neither `gap` (a later capability) nor `breakBefore`/`cutMarks`
  (engine defaults); the list interpolates via `chipWire` — the
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
  - `insert/iterableVariantPicker.tsx` — the four variant radios (Table /
    Cards / Grid / List); an unsupported variant renders DISABLED, never
    absent. When the body is not a flow it renders one sentence saying why
    (`iterable.variant.flowOnly`) as the fieldset's description.
  The dialog's `flowBody` is a REQUIRED prop, threaded by
  `shell/InsertDialogs` as `isFlowTarget(read, BODY_ITEMS_PATH)`; the
  render-time clamp over `variantsFor ∩ variantFitsBody` is the one door
  every confirm passes through, so `useIterableInsert` carries no second
  guard. Grid dimensions are chosen in the property panel, not here.
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
  is a no-op. `addSampleRow` creates a MISSING array at an all-key path
  (top level, or a table inside a group), never through a scalar or a row
  index.
- `sample/datetime.ts` — pure RFC 3339 wall-clock split/compose (never
  a `Date` round-trip; offset display-inert), `representativeOffset`.
- `sample/rekey.ts` — `renameSampleKey` / `removeSampleKey` /
  `restoreSampleValues`: a definitions keys path walked over the params
  (`properties` + name per object, `items` = every element), key order kept,
  `Object.fromEntries` rebuilds (proto-safe), a contradicting path skipped,
  an existing target never overwritten; removed values carry their path and
  position so an undo puts them back in place.
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

- `data/defsTree.ts` — `readDefsTree`: the definitions TREE (root,
  groups, tables = array of objects, lists = array of values, fields — any
  depth) over the same `parseTemplate`/`readTemplate` parse the palette
  uses. Each `DefsNode` carries the `keysPath` it was FOUND at (recorded in
  the walk, never re-derived from a dotted id — a table nested in another
  table's rows is `…items.properties.<b>.items…`), its `dataPath` (property
  names, rows add no segment), `scope` (the innermost table carrying it),
  `required` read from the PARENT's full `required` list + that list's
  path, the palette `leaf` for fields, and `choices` (a field's own or a
  list element's non-empty `enum` — `enumRules.declaresChoices`; the rail's
  「· 選択肢」 mark). `null` for text that is not a
  map, a non-map `properties`, or the v1 `groups:` form; a map with NO
  `properties` is an empty dictionary (the engine defaults it).
  Depth-capped (`MAX_WALK_DEPTH`) and `MAX_TREE_NODES` = 1024, its own cap
  rather than the palette's 256 per group (a DISPLAY cap —
  no write is decided from the truncated walk). `id` = keysPath joined by
  `SELECTION_SEP` (display-only).
- `data/treeModel.ts` — pure readers over the tree: `flattenTree`,
  `findNode`, `nodeLabel`, `parentOf`, `ancestry` (the containers from the
  top down to a node), `nodeForTarget` (the
  palette jump → a field node), `filterTree` (a match keeps its subtree,
  ancestors stay), `addTargets` / `defaultAddTarget`, and `sampleSpot`
  (single path / one per row of the carrying table / none for a table
  nested in another table's rows).
- `data/schemaNode.ts` — `readSchemaNode` (the ONE raw read of a schema
  node at a keys path, own-property guarded, never throws) + `own` / `record`;
  shared by every reader below.
- `data/definitionsEdit.ts` — pure definitions-edit model:
  `readDefinitionField` (title/type/format/description/version at a keys
  path), op builders (changed-guard null; empty clears) incl. `versionOp`
  and `requiredOp` (the parent's list, order-kept; an emptied list is
  REMOVED; null past designer-core's string-list cap), `applyDefinitionOps`
  (a throwaway Editor applies PER OP with skip-on-refusal — a benign miss
  must not drop the other edits; fail-closed on malformed text),
  `coalesceDefsEdit` (a re-edited leaf's op moves to the END; a STRUCTURAL
  op is never dropped), `DEFINITION_TYPES`, `SEMANTIC_FORMATS`.
- `data/valueRules.ts` — the value rules other than choices:
  `readValueRules` (the six range keys as shown, `placeholder`, the raw
  `example`), `parseNumber` (the number ingress: `not_a_number` / `not_whole`
  / `negative` / `too_large`), `rangeOp` (the u64 COUNT keys — min/maxLength,
  min/maxItems — take non-negative safe integers, since a fraction or a
  negative there is a whole-document parse error; min/maximum any finite
  number; empty clears; a same number authors nothing), `rangeConflict`,
  `placeholderOp` (verbatim), `exampleOp` (typed by the base type) +
  `exampleEditable` (a container example is shown, never rewritten).
- `data/enumModel.ts` — choices read IN FULL for writing back (not the
  palette's capped display list): `readEnum` → absent / rows (`EnumRow`
  value + label + the labeled FORM, kept even with an empty label) /
  read-only with the member `count` (`shape`: a non-list, a container or
  malformed member, a non-canonical number — `enumSource.ts`; `too_long`);
  `parseEnumValue` (typed per base type); `writeRows` (one root-addressed
  `putValue` of the whole list, `removeKey` once empty — never `enum: []`,
  which makes every value warn); `fits` = within `MAX_ENUM_VALUES` (engine
  mirror, drift-pinned) AND designer-core's `MAX_SNIPPET_NODES` (list 1 +
  bare 1 + labeled 3 → 255 bare / 85 labeled). Whole-list because the
  definitions host takes ONE op per action and the sequence ops' path grammar
  cannot spell a non-identifier data name; a comment INSIDE the list does not
  survive an edit of it.
- `data/enumEdits.ts` — the member edits over `EnumTarget {keysPath, type,
  rows}`: `addRow` / `setRowValue` / `setRowLabel` (empty label → bare form) /
  `removeRow` (refusals `empty` / `duplicate` / `full` + the number ones) and
  `moveRow` (the shared `tree/reorder` slot math; never refused).
- `data/enumRules.ts` — the engine mirrors behind the notices:
  `engineFieldType` (`Schema::mapped`), `labelsIgnored` (the
  `definitions_enum_labels_ignored` predicate: a labeled-form member and a
  mapped type that is not text — an unknown format keeps labels),
  `memberMismatch`, `declaresChoices`; pinned to the engine source (each
  arm, and the arm COUNT so a new one fails) — `labelsIgnored` also arm by arm
  against the real engine in the seam suite.
- `data/enumSource.ts` — `enumSpelledCanonically`: every numeric member
  spelled as `String(value)` and the list not an alias, read from the parsed
  nodes' source ranges; otherwise `readEnum` reads the list READ-ONLY (a
  rewrite would turn `2.0` into `2`, which the engine compares as a different
  value).
- `data/structuralOps.ts` — `isNodeKeys` / `isStructural`: a node's
  `renameKey` / `removeKey` (the one predicate the edit list's shape and
  coalescing share).
- `data/defsRestructure.ts` — `renameInEdits` / `deleteInEdits`: the edit
  list kept as STRUCTURAL ops first (over the base) + CONTENT ops in final
  names. A rename re-keys the content under the node and appends a
  `renameKey` only when the BASE holds the node there (an added node is
  renamed by re-keying its add; a workshop base, re-inferred from the
  re-keyed sample, never gets one); a rename chain folds; a delete drops the
  node's content ops and removes a base node structurally.
- `data/renamePlan.ts` — `RestructureInput` (effective + base definitions,
  edits, template text + its `RefIndex`, session `maxBytes`, the
  `SampleSet`), `renameRefusal` (per keystroke: the add form's name rules,
  `same_name`, `key_exists`, and the template's `not_interpolatable` /
  `binding_capture` / `too_many_refs` / `walk_truncated`; only `too_large`
  and `edit_cap` wait for the full plan), `cascadePlan` (template + samples,
  measured: template vs `maxBytes`, each variant vs `MAX_PARAMS_BYTES`) and
  `planRename` (+ the edit list, the parent's `required` entry renamed in
  place, the `MAX_DEFS_EDITS` cap, the definitions cap) → one
  `Restructure {templateOps, sampleSet, edits, companion, keysPath}`;
  `applyScratch`, `mapVariants`.
- `data/deletePlan.ts` — `planDelete` (no template ops — references stay;
  every variant loses the value, the companion records what and where) and
  `reversePlan` (what a definitions undo re-applies: a delete's values put
  back by variant id; a rename's cascade BACK, planned over the documents as
  they are now; refused whole).
- `data/refs/` — the data-reference census every usage count, usage list and
  rename shares: `types.ts` (`DataRef` at its LEAF — `path` + `keys`, `form`
  whole / inline / strings, `frame`, `spelled`, `carrier`, `owner`, the
  item's `shadow` declaration names — and `RefIndex {refs, truncated}`,
  `MAX_REF_ITEMS`, `DOCUMENT_OWNER`), `walk.ts` (`readDataRefs`: all three
  bands + `document:`, item recursion and frames, depth / item bounds),
  `item.ts` (one item's own surfaces: data, visible, text mark, text / link
  of the interpolating types, spans, `bindings:` declarations; a `list`
  inside rows joins them while any other source is read from the root, as
  the engine checks it; a list's
  entry frame), `table.ts` (columns' data + label, row conditions,
  header-group labels), `collect.ts` (leaf recording; a string at
  `MAX_TEXT_EXPRS` marks the walk truncated), `match.ts` (`refsUnder` — a
  ref in the node's own frame spelling its relative key or running through
  it; `placePath` / `placeCount` — a place is the item, or a table column),
  `rewrite.ts` (`rewritePlan`: one
  `setScalar` / `setStrings` per leaf, interpolated strings re-emitted
  segment by segment from their wire slices; refusals `not_interpolatable` /
  `binding_capture` / `too_many_refs`). The engine census it mirrors is
  pinned path-for-path by the seam suite (`integration/
  definitionsAuthoring.test.ts`).
- `data/defsPlan.ts` — the untrusted-boundary pair: `addFieldPlan` (ONE
  `putValue` of a fresh item — `ADD_KINDS` = the four scalar types + group /
  table / list, containers written WITHOUT an empty `properties: {}` so the
  first child is block-style — into the root, a group or a table's rows,
  `title` only when a label was given; refusals empty / too long / exists in
  THAT container (read from the document, own-property) / a `.` (no binding
  path reaches it) / a character that draws nothing — `\p{Cc}`, `\p{Cf}`,
  `\p{Zl}`, `\p{Zp}`, `\p{Default_Ignorable_Code_Point}` (the Hangul
  fillers included), checked per character so ZWJ·ZWNJ and the variation
  selectors stay allowed; returns the OP and the
  new `keysPath`) + `sanitizeDefsEdits` (the persisted-edit-list restore
  guard; deep validation stays with designer-core at apply).
- `data/defsHistory.ts` — panel-local DEFINITION undo ring (a faithful
  parallel of `sample/history.ts` — definitions are a distinct undo
  document; three independent undo contexts). An entry is `{ops,
  companion?}`: a rename / delete carries what reverting the template and
  samples takes (`DefsCompanion`), counted in the byte budget;
  `peekDefsHistory` lets the undo plan its reverse before popping.

The fullscreen editor is a SHELL plus per-responsibility panes; inside
`data/` imports run one way (shell → pane → row/form → pure model) and
the panes never import each other.

- `data/DataEditorView.tsx` — the shell (document-settings mould: whole editor
  area, own back control, Escape closes): owns the tree (`readDefsTree`) and
  the selection (a node id, re-resolved per render; `initialSelection` seeds
  it ONCE on mount through `nodeForTarget` — the view is unmounted whenever
  it is not open, so every entry re-seeds, and a stale/hostile target simply
  resolves to nothing), the reference memo (`readDataRefs` over the
  template), the sample commit path (`commitSample` → `onParamsChange`), and
  builds ONE `DetailContext` for the right pane; `sampleDataReadOnly` renders
  sample values as text. The definition actions live in `useNodeActions`.
- `data/useNodeActions.ts` — the definition edit (`false` from the host =
  refused at the edit-list cap), the definitions undo (`false` = its reverse
  was refused; a keys path = where an undone rename put the node back, which
  stays selected), and the `RestructureActions` (armed only with the host's
  `restructure` over editable definitions): rename selects the renamed node,
  delete selects its parent; each outcome lands in the rail's status line.
- `data/editorProps.ts` — `DataEditorViewProps` (optionality carries
  meaning: an absent callback disarms its affordance; `definitionsInferred`
  = the base is the stub inferred from the sample data; `restructure` =
  the host's `RestructureHost` rename / remove, absent = no controls;
  `formatCatalog` = `DataFormatCatalog` {`catalog`, `atCurrency`}, the
  Designer's `derived.formats` via `FullscreenView`, absent = no variants and
  no samples).
- `data/detailContext.ts` — `DetailContext`, the one bundle the right
  pane's parts take (tree, texts, editability, commit callbacks, `onSelect`,
  the template's `RefIndex`, the nested `RestructureActions`, the optional
  `formats` catalog).
- `data/EditorBand.tsx` — the band over the right pane: project-scoped
  (`data.projectScopeHint`, wins) or inferred-from-sample (workshop with a
  real stub — never at blank start, where nothing was inferred).
- `data/ItemListPane.tsx` — the left rail: search (owns its query state),
  the add control, the definitions-edit undo button (reachable with no
  selection), the status line (`role=status`: a delete done, an edit or undo
  refused), and the tree — an EMPTY dictionary still shows its root row
  (with the empty note under it), so the file's own label/version are
  editable before any item exists.
- `data/ItemTree.tsx` — the tree: the 「データ全体の情報」 root row first,
  then nodes indented under their containers; folded ids are panel-local
  VIEW state; a search shows every match open, and a selection that MOVES
  (a jump, a just-added item) opens its folded ancestors.
- `data/ItemListRow.tsx` — one row (label / data name / type or kind, plus
  「· 選択肢」 when `choices` / 必須 / usage chip — `placeCount(refsUnder(…))`; a group's row shows none); a container's OWN chevron toggle
  (the layer tree's IconChevronDown + `data-collapsed` pattern) beside the
  select button; the `HelpHint` is a SIBLING of the row button — no
  button-in-button.
- `data/AddItemForm.tsx` — the IconPlus opener; the open form mounts with
  追加先 = `defaultAddTarget` (the selected container, or the selected item's
  container, or the root) / 表示ラベル / データ名 (hint by `aria-describedby`) /
  型 (seven kinds), dispatches `addFieldPlan`'s op, reports the new id so the
  shell selects it, and drops its draft on add or cancel (IME-guarded Enter).
- `data/AddTargetSelect.tsx` — the 追加先 select; each target named as a
  breadcrumb from the top (`treeModel` `ancestry`, a table as 「… の各行」), so
  same-labelled groups in different places read apart.
- `data/DetailPane.tsx` — the right pane for ONE node: `NodeHeader` (keyed
  by the node) over the part that kind edits: `RootDetail`,
  `ContainerDetail`, or a field's `DefinitionForm` + `FieldRules` +
  `SampleSection` + `ExampleField` + `FieldOtherTools`. STATELESS, not keyed by selection — each
  uncontrolled input is keyed by its own value; a control added here needs the
  same value-key, and a part holding per-node STATE is keyed by the node.
- `data/NodeHeader.tsx` — label, kind chip for a container, 「データ名:」 the
  node's OWN name (the unit a rename edits), the usage chip (「このテンプレート
  で N か所」 opening the usage list / 「このテンプレートでは未使用」; a group
  counts its children; a truncated walk adds that the count is a floor), and
  — with `RestructureActions` — 「データ名を変更」 / 「削除」 (the chip carries
  the tree rows' chevron) (immediate for an
  unused node in an unshared file over a complete walk, else the confirm).
- `data/RenameForm.tsx` — the rename form: new name (refused as typed via
  `renameRefusal`, plan-only refusals on submit), the `old → new` line, what
  it rewrites (places + every sample; withheld while refused), the shared
  warning; `useRefusalText` maps a `RestructureRefusal` to its message.
- `data/undoHint.ts` — the definitions undo control's description when its
  next step is a rename (old → new) or a delete (the name).
- `data/DeleteConfirm.tsx` — the two-step delete: title (with what is
  inside), the places + outcome (references stay → 診断), the shared
  sentence, the sample sentence + undo route.
- `data/UsageList.tsx` — one row per owner + role, named as the layer tree
  names it (`tree/labels` `kindName`), the column / header group it sits in,
  and the role word — a panel's own label key where one exists
  (`panel.visible.title`, `panel.mark.ellipseState`, …).
- `data/RootDetail.tsx` — root `title` (as 表示ラベル) / `description` /
  `version` (版（技術者向け）+ hint); no required flag.
- `data/ContainerDetail.tsx` — a group / table / list: label, description,
  `RequiredToggle`, a table's 行数の範囲 or a list's 個数の範囲 + its
  `ListElementSection`, (group / table) 中の項目 link buttons that select,
  and a table's `TableOtherTools` (1 行の呼び名 = `items.title`).
- `data/RequiredToggle.tsx` — the 必須 checkbox over `requiredOp`, and what
  it does by PARENT: a top-level item warns in 診断 whenever missing; inside a
  group only when that group is in the data; in a table, per row (the
  engine checks an object's `required` only where the object exists).
  Printing never stops.
- `data/SampleSection.tsx` — the sample value(s) by `sampleSpot`: one value,
  one per row with add/remove (by params PATH — a table inside an object
  works), or the no-rows note. The 「sample value」 heading is the section's
  ONE label and carries the `?` saying the data is preview-only placeholder,
  a sentence that has to hold in every arm (single / rows / none, editable /
  read-only mounted host).
- `data/DefinitionForm.tsx` — a field's display label / `TypeFields` / 必須 /
  description; read-only (not hidden) without `onDefinitionEdit`.
- `data/TypeFields.tsx` — the 型 / 表すもの pair (a `<select>` over the
  SEMANTIC formats the engine's `(type, format)` table refines, plus an
  authored out-of-set value verbatim), shared by a field and a list element;
  `allowUnset` shows a missing type as unset (and hides 表すもの).
- `data/FieldRules.tsx` — a field's value-rule sections, keyed by the node
  (they hold per-node state): `EnumSection`, `DisplaySection`, and the range
  its base type reads (値の範囲 / 文字数の範囲; none for yes / no).
- `data/RuleInput.tsx` — the commit-on-blur input every value-rule control
  shares: value key + reseed nonce, Enter commits (IME-guarded), a refusal
  shown under it via `aria-describedby` until the next commit; an optional
  `list` names a `<datalist>` of suggestions.
- `data/RangeFields.tsx` — one 下限 〜 上限 pair by `RangeKind` (bound /
  length / rows / count / the two element kinds), unit word, the
  consequence line, the lower-above-upper warning; `useNumberRefusal`.
- `data/DisplaySection.tsx` — 「表示」 by the field's ENGINE type
  (`engineFieldType`; `date-time` → the catalog's `datetime`): currency →
  `CurrencyField` + `PrecisionField`; percentage → `PrecisionField`; quantity →
  `UnitField`; then `DefaultFormatField`, the places-are-standard note when a
  precision override sits beside engine samples, `PlaceholderField` (also the
  list element's — a list prints values verbatim, so it gets nothing else),
  and `DisplayFormatsList` for date / datetime / currency or wherever a list
  is authored. Samples come from `useFieldCatalog`.
- `data/displayRules.ts` — `readDisplayRules` (currency / precision / unit /
  displayFormat as shown), verbatim `currencyOp` / `unitOp` /
  `displayFormatOp` (empty clears, unchanged authors nothing), `precisionOp`
  (`parseNumber` whole + non-negative, then `over_max` past `MAX_PRECISION` =
  20, the formatter's clamp — drift-pinned; the wire is a u32).
- `data/DisplayKeyFields.tsx` — `CurrencyField` (suggests
  `CURRENCY_SUGGESTIONS`; hint names the document's ロケール・通貨 section by
  its label key) and `UnitField` (suggests `UNIT_SUGGESTIONS` = `item`, the
  only key every pack declares — drift-pinned; an undeclared key gets the
  prints-verbatim / warns / printing-goes-on note); `data/PrecisionField.tsx`
  — the places entry with its refusals beside it.
- `data/DefaultFormatField.tsx` — the `displayFormat` picker: the catalog's
  variants for the type (`variantOptions` + the type's own `default` last, in
  the engine's order and origin) through `FormatOptionList` (label + wire
  spelling + engine sample) plus the field's own declared ids not in it (as
  written, first), 「文書の表示形式に従う」 clears; a FIXED type shows
  its rendering and no picker; a type with no variants shows nothing unless
  authored; an authored out-of-set value stays selected verbatim.
- `data/useFieldCatalog.ts` — the catalog a field reads: the document's, or
  `atCurrency(field currency)`'s (none while it is on its way or when it
  cannot be had — including while the document does not parse, which
  `catalogAtCurrency` checks with a `validate` of the copy because the engine
  still answers an unparseable template at the locale's own currency).
- `data/displayFormatsModel.ts` — `displayFormats` as rows `{id, label}`:
  `readFormats` (read-only for any shape it could not write back as found —
  not a list, unknown keys, non-string id/label, `label: ''` — or past the
  snippet budget: `FORMATS_MAX_LABELED` 85 / `FORMATS_MAX_BARE` 127), edits as
  ONE whole-list `putValue` (`addFormat` / `setFormatId` / `setFormatLabel` /
  `removeFormat` / `moveFormat`; empty label omits `label`; empty /
  duplicate id refused; the last removal removes the key).
- `data/DisplayFormatsList.tsx` / `data/DisplayFormatRow.tsx` /
  `data/DisplayFormatAdd.tsx` — 「表示形式の絞り込み」 behind a disclosure
  button (`aria-expanded`, the `AdvancedStyles` idiom) that starts CLOSED
  (「（なし）」 when empty); offered where the catalog names variants for the
  type (its non-fixed entries) or a list is authored; the hint says an empty
  list restricts nothing, that with entries a placement picking a format
  outside it and the document's named formats warns (validate's
  `unknown_format`; a currency field adds the three money formats, a plain
  number the two that promote it, named by their label keys; a few picks such
  as a type name never warn), and that the placement picker does not offer it
  yet; a list repeating an id is read-only; rows like the choices' (`touch-none` grip, ▲▼, focus
  follows — `data/useMoveFocus.ts`, shared with `EnumRows`), the catalog's
  spellings as id suggestions; a read-only host gets no controls and no
  empty list.
- `data/recommendedStyle.ts` — the hints for other tools: `readRecommended`
  (a map, or `unreadable` for a scalar / list / null bag), `textAlignOp` /
  `boldOp` MERGE into the bag (other keys kept; clearing the bag's last own
  key removes the bag; an unreadable bag is never written), `TEXT_ALIGNS` /
  `BOLD` drift-pinned to the style enums; `readRowTitle` / `rowTitleOp`
  (a table's `items.title`, never creating `items`).
- `data/OtherToolsSection.tsx` — 「ほかのツール向けの情報」, open: a field's
  alignment as the shared `ui/Segmented` radio group (指定なし first, an
  authored out-of-set value as its own segment) + 太字をおすすめ (another hand-written weight shown
  until replaced, and the "clearing writes nothing" line withheld while it
  remains) + the kept-keys line; a table's 1 行の呼び名.
- `data/ExampleField.tsx` — under the sample value: the generation example,
  typed per field (a select for yes / no), badged as saved in the definitions
  for every variant; editable on a sample-read-only host.
- `data/EnumSection.tsx` — 選択肢: `EnumToggle`, the read-only note, and the
  table + add row + `EnumNotices`; not offered on a yes / no field with none
  authored, nor without definition editing; an edit the host refuses (its
  edit-list cap) keeps the entry with the reason. Keyed by the node by its
  caller.
- `data/EnumToggle.tsx` — 「値を選択肢で決める」: ON writes nothing; OFF over
  members (a read-only list included — removing writes no list) confirms, OFF
  over an authored `enum: []` removes it at once, OFF over a list only opened
  here closes it.
- `data/EnumRows.tsx` / `data/EnumRow.tsx` — the member rows (pointer-only
  `touch-none` grip + up / down buttons, both at 2+ rows, the rule list's
  shape; focus follows a moved member; a mistyped member marked
  `aria-invalid`); `data/useEnumDrag.ts` — `useRowDrag(move, dispatch)`, the
  row lists' drag over the shared `usePointerReorder` (release = one op; the
  line reads the same resolve), and `useEnumDrag` over it.
- `data/EnumAddRow.tsx` — the add draft (typed value + printed text, 追加 /
  IME-guarded Enter; a refusal stays with the draft).
- `data/EnumNotices.tsx` — labels-ignored (a field: names 型 / 表すもの by
  their own label keys; a list element: a list prints values as they are), the
  type-mismatch notice (no fix asked on a read-only host), and the authored
  empty list.
- `data/ListElementSection.tsx` — a list's 「1 つ 1 つの値」 at `items`:
  `TypeFields`, placeholder (its hint says a list does not print it), the
  element range by type, its `EnumSection`; an element with no `type` offers
  型 ALONE (shown unset) — any other key first would leave `items` without
  its required `type`, a whole-file parse error.
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
- `data/editorModel.ts` — the editor's pure helpers: `SELECTION_SEP`
  (U+0000 written as an ESCAPE — joins a node's keys path into its
  display-only id; ops address the node's `keysPath` instead; the escape also
  keeps the file out of binary grep classification), `sampleKind`,
  `commitSampleValue` (a fresh top-level scalar is created, an existing leaf
  set in place), `readAt`
  and `arrayLength` (by params PATH), `TYPE_OPTION_KEY`, `KIND_OPTION_KEY`
  (the add form's seven kinds; the two repeating kinds are explained by
  example).
