# Code map — gui/designer (the embeddable React component)

> AI-only, token-dense. Index + repo-wide conventions: [CLAUDE.md](../../CLAUDE.md).
> Read this BEFORE searching or editing the covered dirs; update it in the
> same PR whenever files/modules/boundaries here change.
> Designer work often spans packages — seam work reads the neighbor's map too:
> [gui-core.md](gui-core.md) ← this component ← [gui-app.md](gui-app.md).
> **This component's map is split by area** — read the file for what you touch:
> [index/shell](gui-designer.md) ·
> [canvas](gui-designer-canvas.md) ·
> [panel](gui-designer-panel.md) ·
> [insert](gui-designer-insert.md) ·
> [chrome](gui-designer-chrome.md) ·
> [tutorial](gui-designer-tutorial.md).
> Granularity: file role + key exports + load-bearing conventions;
> behavior detail lives in the code's own headers.

Workspace preamble (pnpm workspace, three packages `designer-app → designer →
designer-core`, Biome + Vitest 100%×4, gates via `make gui:verify` in Docker):
[gui-core.md](gui-core.md).

`gui/designer/` — **the embeddable React component**: a live view of one
template document (engine renders, the GUI never draws or measures). This file
carries the composition root + its per-concern wiring hooks, the
session/tree/sidebar surfaces, the hook registry, and the test substrate.

| You touch | Read |
| --- | --- |
| engine transport, preview loop, canvas paint/overlay/zoom, drag·resize·snap | [gui-designer-canvas.md](gui-designer-canvas.md) |
| property panel (fields, placement, borders, page setup, styles, columns), diagnostics | [gui-designer-panel.md](gui-designer-panel.md) |
| insert menu + dialogs, container picker, scaffolds, image/paste import, field palette, sample data + the data-item editor | [gui-designer-insert.md](gui-designer-insert.md) |
| menubar, toolbar, help, i18n, `ui/` primitives, theme tokens, CSS, the chip text editor | [gui-designer-chrome.md](gui-designer-chrome.md) |
| the in-app tutorial: step data, coach mark, launcher, practice-document swap | [gui-designer-tutorial.md](gui-designer-tutorial.md) |

## Editor session

- `editor/useEditor.ts` — `useEditor`/`EditorController`: the `Editor` in a
  STABLE ref + a `revision` state per mutation; `apply`/`applyAll`/`read`/
  undo/redo/select; `subscribe` attached at CREATION (never in an effect);
  `replaceDocument(text)` swaps the whole document (fresh Editor at the
  session cap; history does not cross the swap) — the tutorial's
  practice-document mechanism.

## Layer tree + breadcrumb

- `tree/model.ts` — pure layer-tree model: `buildTree(text)` → `TreeView`
  (a DOCUMENT walk mirroring the palette walk so node paths ==
  box-index/diagnostic paths; a table's `headerGroups` get leaf nodes
  ahead of its columns, the order the table draws them; hostile posture:
  never throws, degrades to
  null, depth/node budgets → `truncated`). A node carries `conditional`
  when its item authors a `visible:` binding — the tree never EVALUATES the
  predicate (that is the engine's answer, arriving as the preview), it only
  reports that one exists, which is what explains a COLLAPSED item whose row
  highlights nothing on canvas because it emits no placed box.
  `tree/nodeFields.ts` holds the pure field readers the node builders share
  (`record`/`pickLabel`/`labelLine`/`bindingKey` + `MAX_LABEL_CHARS`), split
  out for the line budget — nothing there walks or recurses. `labelLine` is
  what keeps a MULTI-LINE value readable in a `nowrap` row: the first line plus
  a ` ⏎…` marker, the marker appended after clipping against a budget that pays
  for both it and the ellipsis. The row and the breadcrumb share `nodeLabel`,
  so both surfaces get it from the one place. Its two neighbours split off
  what happens to a BUILT tree: `tree/reorder.ts` (what a drag decides —
  `RowRect`/`dropIndexFor`/`seqPosition`/`moveOpFor` + the `MoveItemOp`
  shape) and `tree/selection.ts` (where the selection sits and goes —
  `breadcrumbChain` over a segment-wise prefix match, plus
  `seqLength`/`enclosingNodePath`/`nextSelectionAfterRemove`).
- `tree/labels.ts` — kind → localized chrome key; exports `SECTION_PREFIX`.
- `tree/kindIcons.ts` — `kindIcon(kind)` → the row's decorative type mark
  (real SVG, never text chars — a row's `textContent` is exactly its
  label). The three document sections are ONE FAMILY, not one mark:
  identical page outline, band drawn where that section actually prints
  (top / middle / bottom). Position carries it rather than a letter —
  the initial of "header" is only an H in one of the six shipped
  locales. An unknown `section:*` falls back to the body mark.
- `tree/bandGhosts.ts` (pure) — `missingBands(view)`: which section bands
  the document does NOT author, read off the BUILT tree, in `sections:`
  order. An unparseable tree and one with no sections at all both yield
  none — the second because `Sections.body` is required on the wire, so
  offering a header beside a missing body would author a document the
  engine refuses.
- `tree/BandPlaceholderRow.tsx` — the row for a band the document lacks:
  the band's own name and mark over a muted second line saying it has
  nothing in it (two lines because the pane narrows to 180px — the
  `data/ItemListRow` shape), pressing it runs `activateBand`. **CHROME,
  not a document node**: it never enters `TreeView.roots`, so it stays
  out of `visiblePaths`, the drag order, the breadcrumb chain and the
  count the drag hint is gated on — which is why it is its own component
  rather than a synthetic `TreeNode`.
- `tree/LayerTree.tsx` — the outline panel frame: the fixed whole-document
  document-root row, the band placeholders in their positional slots
  (header above the sections, footer below — `sections:` order, so no
  ordering work), collapse state, incoming-selection reveal, truncation
  notice, and the gesture hint at the foot (rows only) — one line plus a
  `HelpHint` naming the drag's HORIZONTAL meaning and the Alt+↑/↓ chord.
  Cross-parent drag shipped with no entry point and a walkthrough found it
  by accident; no `tree.*` string had mentioned dragging at all.
  `useRowReorder` is called AFTER the reveal effect (that order is
  the contract).
- `tree/TreeRow.tsx` — one row, recursing: twisty, kind mark, label,
  click/right-click/Alt+↑↓/collapse keys; registers in the shared
  `rowRefs` map.
- `tree/useRowReorder.ts` — the row-drag gesture (pointer state machine
  + Alt+↑/↓): the pointer drags over ALL visible rows, so a drop may
  leave the row's own parent; Alt+arrow stays inside it. Capture-phase
  Escape cancel, ONE transactional batch, selection travels;
  `marksFor(node)` = the per-row drop-indicator derivation.
- `tree/rowDrag.ts` — what a row drag IS while it runs: `DragState`
  (carrying the resolved `RowSlot`), `applyDrop` (the batch + the
  travelling selection), `visibleRows`/`siblingEnd` read off the
  `rowRefs` map at the moment they are needed (never captured at render
  time), `acceptsFor` (the destination predicate handed to the drop
  model, so an indicator can only point at a legal drop), `rowDropOps`
  (same-parent = one `moveItem`; cross-parent = the shared
  `canvas/reparent` batch), and the pure `rowDragMarks` the hook's
  `marksFor` delegates to.
- `tree/rowDrop.ts` — where a row drag LANDS: `visiblePaths` (what the
  tree shows, in its own order), `ROW_INDENT_PX` (12, `TreeRow`'s
  `pl-3` — the unit the horizontal position is read in), and
  `rowDropAt`. The vertical position picks the GAP; the horizontal one
  picks which of that gap's meanings was intended, walking the ancestor
  chain out of the PATHS (so no depth bookkeeping travels with the
  rows). The DEEPEST reading is "inside the row above" when that row can
  receive items and shows no children (empty or collapsed) — the tree's
  only way to fill a container the canvas can drop into — else "after it
  among its siblings"; never shallower than the row after the gap, and
  every candidate is filtered through the caller's `accepts`.
- `tree/Breadcrumb.tsx` — the ancestor chain above the canvas;
  constant-height bar.

## Sidebar

- `sidebar/Sidebar.tsx` — the generic tab frame (roving tabindex, arrow
  cycle, stranded-id clamp) + a `trailing` slot (`SidePane` puts the
  collapse toggle there).
- `sidebar/width.ts` — `clampSidebarWidth` + bounds (hostile-safe;
  exported for host persistence). The left pane is resizable
  (`ui/ResizeHandle` separator) + collapsible to a narrow rail;
  pane width is Designer-local state, never in the template.

## The composition root

- `index.ts` — the package barrel: `Designer`, the editor session and the
  version marker directly; everything else through one re-export per AREA
  under `exports/` — `canvas.ts` (canvas + preview + the engine transport
  seam), `panels.ts` (property/diagnostics/palette panels, page setup, the
  outline trio), `document.ts` (the content models a host persists or feeds
  in: definitions edits, image import, blocks, sample data + variants,
  text), `chrome.ts` (menubar, i18n, theme tokens, shortcuts, `ui/`
  primitives), `registry.ts` (the hook-registry seams + tutorial). `Op` +
  the size-cap helpers are re-exported from designer-core here.
- `Designer.tsx` — the composition root, PURE assembly:
  `useDesignerWiring(props)` + the render tree. Re-exports
  `bandOf`/`contentWidthPt`/`contentHeightPt`/`isEditableTarget`/
  `DesignerProps`.
- `wiring.ts` — `useDesignerWiring`, the composer: ONE call per wiring
  concern into `hooks/`, in the order the concerns feed each other — this
  file owns the hook-call ORDER. Head (`useDocumentCore`) and tail
  (`useCanvasWiring`) are contiguous runs of that sequence lifted into one
  call each; the middle (edit surfaces) plus shared derivations stay here.
  Children take named BUNDLES (`host`, `dialogs`, the hooks' result
  objects), nothing spread flat.
- `wiringTypes.ts` — `DesignerWiring`, the composer's result type.
- `hostConfig.ts` — `HostConfig` + `hostConfigOf(props, locale)`: the
  RESOLVED host configuration, built once so a default cannot fork. The
  raw untrusted `hostMenuEntries` deliberately stays OUT (validated in
  `shell/topMenubar.ts`).
- `props.ts` — `DesignerProps`: the whole host-injection surface in one
  file (seeds, definitions, change/save callbacks, theme seam (`colorScheme`
  — the component never reads the OS preference), capabilities, image
  codec/budgets, template-size cap, menu actions, blocks, tutorial store,
  copilot).

### Shell (`src/shell/` — the render tree, presentational only)

NONE of the shell children holds `useState`/`useEffect` — all state/effects
stay in `hooks/`, so the render tree can be re-cut without reordering an
effect. Convention, not a gate: keep
`grep -rn "useState\|useEffect" gui/designer/src/shell/` at zero. Props are
REQUIRED-only (no `?:`/defaults) so the split added no new branch legs.

- `shell/TopChrome.tsx` — the top stack: `Titlebar` + `Menubar` + tutorial
  strip + `SlimToolbar`.
- `shell/topMenubar.ts` — `useMenubarColumns`: the `validateHostEntries`
  memo over the UNTRUSTED host entries, `buildMenubar`, `openExportReview`.
  Every item dispatches an existing op or host callback (AI parity).
- `shell/SlimToolbar.tsx` — the slim `role=toolbar` row (undo/redo, grid,
  variant/zoom/size indicator, `FormatToolbar`, `AlignToolbar`, copilot,
  notice pills).
- `shell/SidePane.tsx` — the left pane: collapsed rail ⇄ `Sidebar` tabs
  (layers always; data iff EFFECTIVE definitions) + `ResizeHandle`.
- `shell/CanvasArea.tsx` — the center column: `CanvasTopbar`, `PageRail`
  (≥2 pages), scrolling `DesignerCanvas`, preview-error alert, empty-state
  card; memoizes `canvasManipulate` over destructured editor locals.
- `shell/CanvasTopbar.tsx` — breadcrumb + the placement chip (`canvas.place.*`
  keys in an `<output>`; a refused drag's reason until the next selection)
  + pdf/image notices + the over-cap raise button. Renders CATALOG keys
  only, never document content.
- `shell/canvasManipulate.ts` — the overlay's manipulation wiring as a
  pure factory: every drop that changes an item's PATH (a same-parent
  reorder, a cross-parent move) and every move/resize/nudge is ONE
  `applyAll` batch = one undo step, with the selection travelling to
  wherever the item landed; a refused drag sets the chip state.
- `shell/EditorBody.tsx` — the main grid + fullscreen switch (pane ·
  canvas · panel, or `FullscreenView` full-width).
- `shell/PanelColumn.tsx` — the right column: `PropertyPanel` over the
  `placementGeometry` memo (last-good boxes, tagged `fresh` only when the
  shown render matches the live document).
- `shell/FullscreenView.tsx` — the `DocumentSettingsPage`/`DataEditorView`
  branch (either takes the whole editor area).
- `shell/DialogHost.tsx` — every modal/overlay/popup, open-flag driven
  (shortcuts/glossary, `PdfPreviewModal`, the `Offcanvas` column sheet).
  The preview's `pageLabel` comes from `usePdfAction`, snapshotted WITH the
  bytes: a focus trap holds FOCUS, not the window-level keydown listener,
  so ⌘Z reaches the document while the modal is open and a live read would
  relabel the bytes with a page they were not rendered at.
- `shell/InsertDialogs.tsx` — the insert scaffolds' dialogs (iterable,
  field, paste, container picker).
- `shell/TutorialSurfaces.tsx` — `TutorialDialog` + `CoachOverlay`.
- `shell/BlockSurfaces.tsx` — block save/manage dialogs + the right-click
  `ui/ContextMenu.tsx` and the border popover it can open. A shell: it
  turns each row KIND into its chrome label and its action, nothing more.
  Every row is an ACCELERATOR — duplicate/delete also ship as Edit-menu
  rows and window shortcuts, wrap on the placement tab, border on the
  format toolbar, save-as-block in the Insert menu.
- `shell/contextMenuRows.ts` — pure: WHICH rows apply to one path, in
  menu order (`duplicate`/`delete` on a sequence entry, `wrap` when
  `isWrappablePath`, `border` via `borderableView`, `saveBlock` when the
  host armed blocks). A row that does not apply is ABSENT, never
  disabled. The save-block row CARRIES its snippet, captured while the
  model has it narrowed. `readNodeAt` degrades a throwing read to
  `undefined`; `borderableView` is the ONE border rule, shared with the
  popover so the row and what it opens cannot disagree.
- `shell/BorderPopover.tsx` — the third host of the shared
  `panel/BorderEditor` (after the decoration tab and
  `toolbar/BorderControl`), over `ui/AnchoredSurface`. Re-derives its
  target every render and renders nothing once it is gone — an undo
  while it is open must not feed the editor a ghost path.
- `shell/ReviewSurfaces.tsx` — `SaveReviewModal` (save/export), the
  copilot dialog + its review modal (confirm re-checks `text === baseline`).

## Wiring hooks (`src/hooks/` — one concern per file)

A LEAF concern hook never imports a sibling: every cross-concern value
threads through the composer. The only sibling-importing hooks are the four
SUB-COMPOSERS, which exist to hold a call ORDER: `usePreviewSession`
(zoom → preview → auto-fit), `useDocumentCore`, `useCanvasWiring`,
`useInsertActions` (the four scaffold hooks). `usePopover.ts` is a generic
UI primitive. Hooks taking several editor operations take the whole
`editor: EditorController` and destructure ONCE at the top — memo dep
lists name the destructured stable fields, never `editor` itself.

- `hooks/geometry.ts` — shared page-geometry vocabulary (NON-hook):
  `PageHit`, `contentWidthPt`/`contentHeightPt` (pixel-derived, callers
  floor), `bandOf`.
- `hooks/useDocumentCore.ts` — the head: transport + i18n handles,
  `useTemplateCap`, `useEditor`, `useSampleData`,
  `useDefinitionsOwnership`, `usePreviewSession`, theme style memo.
- `hooks/useCanvasWiring.ts` — the tail: `usePageNav`, `usePaletteDrag`,
  `useImageImport`, `useInlineEdit`, `useHostNotify`, `usePdfAction`,
  `useDocDerived`.
- `hooks/useChromeDialogs.ts` — Designer-local dialog flags (column sheet,
  shortcuts/glossary).
- `hooks/useSampleData.ts` — sample-data ownership: props are the INITIAL
  seed, the editor owns after mount; `commitSet` is the ONE mutation path;
  Workshop mode = no engineer definitions + editable sample → `stub` inferred
  from non-empty params.
- `hooks/useDefinitionsOwnership.ts` — definitions ownership: base
  (engineer file | workshop stub | minimal doc) + the data-item editor's
  coalesced op list re-applied over it each render; `effectiveDefinitions`
  feeds palette/editor, `definitionsForEngine` feeds preview/validate (a
  pristine stub never reaches the engine); reports text + ops with a
  dedup ref seeded to the base; own undo ring. Also derives
  `paletteGroups`.
- `hooks/useZoom.ts` + `hooks/useAutoFit.ts` — zoom is Designer-local UI
  state, never in the template: `renderScale` + instant `cssFactor`,
  ⌘/Ctrl+wheel via a non-passive native listener through a callback ref;
  auto-fit measures the last-good page on demand, one-shot initial fit.
- `hooks/usePreviewSession.ts` — composes zoom → DRAFT → preview →
  auto-fit; returns `renderedScale`/`cssFactor`/`fresh`/`pages`
  (last-good, never blanked)/`boxes`/`setDraftOps`. `fresh` means the
  render is of the live COMMITTED document, so a draft render is never
  fresh — that is what keeps a geometry-derived action (today the
  placement pin) from authoring numbers measured off text nobody
  committed. Takes the session `maxBytes`: a draft re-parses the
  committed text, and under a different bound a legally oversized
  document would stop previewing the moment it was edited.
- `hooks/useDraftPreview.ts` — the draft state: the ops of an edit the
  document has not accepted, and the template string they produce
  (`preview/draftTemplate`). An edit that cannot be derived, or that
  reproduces the committed text exactly, is NO draft — the loop then
  renders the committed text and the session stays fresh. **Publishing
  is debounced, withdrawing is not**: a derivation costs a full re-parse
  (~55ms on the largest bundled example, ~32ms of it the parse), so
  running one per keystroke would block the main thread on exactly the
  documents worth editing — and every derivation but the last is thrown
  away by the render debounce anyway. An edit that has ENDED must stop
  rendering at once, so a withdrawal skips the timer. Because the ops
  have already settled by the time they reach the loop,
  `usePreviewSession` asks for the draft render with no further debounce.
  **Not the app's "draft"**: `designer-app/src/persistence` uses that word
  for the unsaved DOCUMENT it persists between sessions (reached through
  `onChange`, which carries the committed `editor.text`). This one never
  leaves the render loop.
- `hooks/useTemplateCap.ts` — the session's template-size cap: seeded
  `max(persisted cap, source byte size)`, raised via the image headroom
  prompt.
- `hooks/useAdvisories.ts` — the GUI's own advisories (drawn-text
  collisions; model in
  [gui-designer-panel.md](gui-designer-panel.md) § Diagnostics), memoized
  over the LAST-GOOD inspect and gated on `inspect.text_metrics`.
- `hooks/useDocDerived.ts` — shared read-only indexes memoized on the
  text: `treeView` (nullable), `styleUsage`, `formatUsage`, `styleFloor`
  — plus the two ENGINE answers, `formats` (the format catalog) and
  `localeFacts` (what the document's `defaults.locale` pick DOES). Takes
  ONE input bundle. The two engine answers share the catalog KEY, because
  `defaults.locale` and `defaults.currency` both live in the slice it
  names. `localeTag` arrives already resolved to a tag the ENGINE can
  answer for (`i18n/locales.ts` `engineLocaleFor`, applied in
  `useCanvasWiring` where the chrome registry is in scope), and
  `localePacks` is the host's pack source
  (`hooks/useLocaleFacts.ts` — one call per (tag, slice), a bounded
  memory keyed by a tag that is user input, and an answer shown only
  while it still describes the tag on screen). `formatUsage` also takes
  the palette groups (`defs.paletteGroups`, passed through from
  `useCanvasWiring`), because only the DEFINITIONS can say which bindings
  are dated and therefore which `format:` values reach the registry at
  all. That one is not a pure
  derivation (it is an engine answer, so `null` until it arrives and
  permanently on a transport that cannot answer) but lives here because
  it is keyed on the document and consumed by the same surfaces.
- `hooks/useFormatCatalog.ts` — asks the engine for the catalog, keyed on
  the document SLICE it depends on (`formats/catalogKey.ts` — the
  `formats:` and `defaults:` blocks, textually, so a body keystroke costs
  no engine call and a document that does not parse still produces a
  key). Keeps the last good catalog when a later ask fails, drops an
  answer that arrives after the key moved on, and probes against the LIVE
  text through a ref rather than the text the callback closed over.
  A transport with no `formatCatalog` simply leaves it `null` — a
  capability gate by PRESENCE, never a version sniff.
- `hooks/useHostNotify.ts` — report `text` through `onChange` after every
  edit that CHANGES it (handler in a ref).
- `hooks/useMultiSelect.ts` — canvas multi-select + align/distribute
  (canvas-local Set, reset on plain select/Escape; `doAlign`/`doDistribute`
  = ONE `applyAll` over the primary's page). Owns `refused` (the placement
  chip's drag-refusal state).
- `hooks/usePaletteDrag.ts` — palette drag-to-bind/scaffold: `useDrag`
  machine, live-rect hit test (`pageHitAt`), `planPaletteDrop` →
  `insertIndicator`, drop = ONE `insertItem` at the plan's path + select.
- `hooks/useImageImport.ts` — menu entry, canvas file drop, clipboard
  paste and panel replace route ONE pipeline: size gate →
  `insertItem`/`setScalar`;
  notices ride the topbar `<output>`; `applyRaisedCap`; returns
  `hasImageItem`/`nextCap`. The React wiring only — what the import DOES
  is `hooks/imageImportRun.ts` (`runImageImport` over an explicit
  `ImageImportContext`: the pre-op cap gate, then the op; `textBytes` is
  the RENDER-time size, deliberately not an accessor — plus
  `dropInsertTarget`, where a canvas file drop lands).
- `hooks/usePasteImage.ts` — the window-level `paste` route into that same
  pipeline, and the guard ORDER that makes it safe: no codec → inert; an
  editable target → the platform's own paste keeps the event; a paste
  carrying no file → NOT consumed (`preventDefault` fires only once a file
  is in hand, so the insert menu's clipboard-TEXT import and every
  ordinary text paste are untouched).
- `hooks/useInsertActions.ts` — plain element insert (band-aware), the
  insert-menu gates (`insertGroups` — a capability-less row is ABSENT
  rather than broken; `canDeclare`), and the four scaffold hooks over one
  shared `InsertContext`. Every scaffold selects the new item on success,
  leaves no orphan params on refusal.
- `hooks/insertContext.ts` — `InsertContext` (type only; one object
  argument per scaffold hook).
- `hooks/useContainerInsert.ts` — the container picker (placeholder slot
  replaced in place as ONE `applyAll`).
- `hooks/useIterableInsert.ts` — the iterable dialog (params rows first,
  typed refusal, then ONE `insertItem`, params committed only after
  success).
- `hooks/useFieldInsert.ts` — the create-data-field modal (workshop mode).
- `hooks/usePasteInsert.ts` — the paste import (scaffold + verbatim
  params rows + ONE table insert).
- `hooks/useBlocks.ts` — reusable-block library: `blocks` prop is the
  host-owned app-global list; pure `insert/blockModel`; `insertBlock` is
  a plain band-aware `insertItem` (AI parity).
- `hooks/useSelectionOps.ts` — `deleteAt`/`duplicateAt` (PATH-scoped: the
  right-click menu acts on the path it was opened at, never on whatever
  the selection has become), `deleteSelected`/`duplicateSelected` as the
  selection-scoped wrappers the keyboard and the Edit menu use, plus
  `wrapSelected` and the context-menu anchor. A delete selects the
  surviving neighbour.
- `hooks/useSelectionShortcuts.ts` — the window keydown effect over pure
  `shortcuts.ts`, guarded by `isEditableTarget` (exported here, and
  re-exported from `Designer.tsx`).
- `hooks/useInlineEdit.ts` — double-click a static-text box → the shared
  `TextEditor` over its content rect (same chip context as the panel);
  commit = ONE `applyAll` of `text/declModel` `commitOps`.
- `hooks/useSaveFlow.ts` — validate-before-save fail-closed: fresh
  `transport.validate` at save time (errors block, a throw blocks); Save
  AND Export first open the save/export review pane; `baselineText` =
  the opened-document baseline.
- `hooks/useCopilot.ts` — the AI-copilot run (see § AI copilot).
- `hooks/useTutorialWiring.ts` — the tutorial reads/replaces the document
  through the SAME surfaces user actions use; owns the host adapter, the
  coach `currentStep`, the four `observe` effects, and `uiEvent` (the
  closed set of no-byte UI moments).
- `hooks/useDocViews.ts` — the two fullscreen views + their mutual
  exclusion (opening clears selection; later selection closes; Escape via
  live open refs); `docFocus` scroll-to-origin jump; renders
  `DataEditorView` over effective definitions + active params. TWO data
  entry points, not one widened: `openDataView()` (menu / tab gear —
  clears `dataFocus`, so it always lands on the no-selection surface) and
  `openDataField(target)` (a palette row's gear), whose `dataFocus`
  becomes the view's `initialSelection`.
- `hooks/useContainerMarks.ts` — selection + hovered-card highlight →
  `BoxOverlay` `containerMarks` with `containerKindLabel` chips.
- `hooks/usePdfAction.ts` — render the real PDF via the engine; gated on
  transport `renderPdf` + host `onDownloadPdf` + the `wasm.render.pdf`
  capability (never a version sniff).
- `hooks/usePageNav.ts` — the page-nav rail (live-rect
  `mostVisiblePageIndex`, thumbnail jump).
- `hooks/useEditorPrefs.ts` — grid-step + pane width/collapsed prefs
  (normalized/clamped; never written into the template).

## Hook registry (`src/registry/` — host-composition surface)

Integrator doc: [designer-hooks.md](../designer-hooks.md). The
subscriber-style extension surface (`ShojikuGui.hook('init:presets', …)`)
— a HOST composes collected contributions into the existing
services/props; nothing in the component reads the singleton.

- `registry/registry.ts` — `HookRegistry` over a CLOSED `EventTable` (real
  `Map`; unknown names throw): notifications fan out in registration
  order (per-subscriber error isolation); provider events hold a SINGLE
  slot (second registration throws; call errors propagate — fail-closed);
  per-event deprecation metadata, warn-once.
- `registry/events.ts` — `HOOK_EVENTS`, the append-only v1 table (pinned
  literally by its test): notifications `init:fonts`/`init:presets`;
  providers `load:template`/`save:template`/`list:projects`/
  `load:project`/`save:definitions`/`suggest:ops`.
- `registry/copilot.ts` — the AI-copilot seam: `CopilotRequest`/
  `CopilotReply`/`CopilotProvider`, `COPILOT_INSTRUCTIONS` (drift-guarded
  against the op set), `sanitizeCopilotOps` (fail-closed shallow narrow
  of the untrusted reply; op-name allowlist is load-bearing — deep
  validation stays with the scratch-editor dry-run).
- `registry/fonts.ts` — `FontSource`/`InstalledFont`/`collectFontSources`
  (ctx closed after emit) + `chainFontSources` (first-fulfilled-wins).
- `registry/presets.ts` — `PresetContribution` + `collectPresets`:
  defense-in-depth over integrator code (id charset re-guard, first-wins
  duplicates — the host seeds bundled entries BEFORE the event fires,
  thumbnail scheme guard incl. control-char strip; invalid contributions
  dropped + reported, never a boot crash).
- `registry/persistence.ts` — the provider seam types
  (`TemplateStore`/`ProjectSource`/`DefinitionsStore`/…) — the
  interfaces' operation names ARE the provider events.
- `registry/singleton.ts` — `ShojikuGui`, the module-level instance
  integrator packages register into at import time.

## AI copilot (`src/copilot/`)

- `copilot/CopilotDialog.tsx` — the prompt modal over `ui/Modal` (chrome
  error KEYS only; ⌘/Ctrl+Enter `isComposing`-guarded).
- Designer wiring: `copilot?: CopilotProvider` prop (absent = hidden).
  Run = package request (prompt + `COPILOT_INSTRUCTIONS` + text +
  effective definitions + selection + params) → provider →
  `sanitizeCopilotOps` → dry-run on a SCRATCH `Editor` at the session cap
  (over-cap refused; a result after the dialog closed DROPPED by an epoch
  guard) → proposal opens `SaveReviewModal` mode `copilot`; confirm
  re-checks `text === baseline` (refuses stale), no-change applies
  nothing, else ONE live `applyAll` (one undo step, AI parity). Tests:
  `copilot/copilotFlow.test.tsx`.

## Keyboard

- `shortcuts.ts` — pure `shortcutAction`: the window key-chord → intent
  table (undo/redo/delete/duplicate/deselect); guards stay in Designer.

## Test substrate

- **Sibling-test convention**: every logic-bearing module carries a
  same-named `.test.ts(x)`; a module with no separate public surface
  (opTarget-style internals: `toolbar/cascade`, `sample/genWalk`/
  `genConstraints`) is pinned through its owning surface's test, which
  says so in its header. Composed-Designer FEATURE suites live next to
  their wiring hook (`hooks/use*.test.tsx` — sample data, palette drag,
  iterable/paste/image/field/container inserts, doc views, tutorial,
  page nav, blocks, pdf); `Designer.test.tsx` keeps the core suite
  (mount, menubar, editing, save/export review, canvas manipulation).
- `src/testkit/` — the shared substrate those suites import:
  `fixtures.ts` (tiny sources + fake render outcomes), `harness.tsx`
  (`draw` mount over a mock transport + menubar/data-editor helpers — its
  `pickMenu` matches a menu row as `^<item>…?$`, so a call site names the bare
  action while the shipped label carries the HIG ellipsis) and `sourceWalk.ts`
  (the ONE walker behind every convention gate: `sourceFiles`/`codeLines`/
  `nearestOpenTag`/`hits` over both packages' sources — its nearest-tag helper
  reads a generic type argument as a tag, so a rule that must exempt a module
  exempts it BY PATH). Coverage-excluded (`vitest.config.ts` `src/testkit/**`),
  but still budget-counted and typechecked/linted like any non-test source.
- `src/integration/wasm.test.ts` — real-engine integration (node env,
  never a mock): dynamic-imports the `make engine:wasm` pkg + injects
  en-US/noto-sans bytes; exercises op → re-render → re-validate, the
  save-block trigger, the layer-tree grammar-identity pin (every engine
  box path addressable in `buildTree`), reorder/duplicate re-renders,
  the canvas dnd pipeline over real inspect geometry, zoomed render
  scale, and the page-setup size table against the engine.
- `vitest.setup.ts` — jsdom RTL setup: auto-cleanup, `ImageData`/
  `getContext` shims, the `PointerEvent` shim.
