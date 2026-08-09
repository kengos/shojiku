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
designer-core`, Biome + Vitest 100%×4, gates via `make gui` in Docker):
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
  (`record`/`pickLabel`/`bindingKey` + `MAX_LABEL_CHARS`), split out for the
  line budget — nothing there walks or recurses. Its two neighbours split off
  what happens to a BUILT tree: `tree/reorder.ts` (what a drag decides —
  `RowRect`/`dropIndexFor`/`seqPosition`/`moveOpFor` + the `MoveItemOp`
  shape) and `tree/selection.ts` (where the selection sits and goes —
  `breadcrumbChain` over a segment-wise prefix match, plus
  `seqLength`/`enclosingNodePath`/`nextSelectionAfterRemove`).
- `tree/labels.ts` — kind → localized chrome key; exports `SECTION_PREFIX`.
- `tree/kindIcons.ts` — `kindIcon(kind)` → the row's decorative type mark
  (real SVG, never text chars — a row's `textContent` is exactly its
  label).
- `tree/LayerTree.tsx` — the outline panel frame: the fixed whole-document
  document-root row, collapse state, incoming-selection reveal, truncation
  notice. `useRowReorder` is called AFTER the reveal effect (that order is
  the contract).
- `tree/TreeRow.tsx` — one row, recursing: twisty, kind mark, label,
  click/right-click/Alt+↑↓/collapse keys; registers in the shared
  `rowRefs` map.
- `tree/useRowReorder.ts` — the row-reorder gesture (pointer state machine
  + Alt+↑/↓): drop among OWN siblings only (a drag can never reparent),
  capture-phase Escape cancel, one `moveItem`, selection travels;
  `marksFor(node)` = the per-row drop-indicator derivation.
- `tree/rowDrag.ts` — what a row drag IS while it runs: `DragState`,
  `applyMove` (the op + the travelling selection), the live
  `siblingRects`/`siblingEnd` read off the `rowRefs` map at the moment
  they are needed (never captured at render time), and the pure
  `rowDragMarks` the hook's `marksFor` delegates to.
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
  pure factory: reorder drop = ONE `moveItem`; move/resize/nudge = ONE
  `applyAll` batch = one undo step; a refused drag sets the chip state.
- `shell/EditorBody.tsx` — the main grid + fullscreen switch (pane ·
  canvas · panel, or `FullscreenView` full-width).
- `shell/PanelColumn.tsx` — the right column: `PropertyPanel` over the
  `placementGeometry` memo (last-good boxes, tagged `fresh` only when the
  shown render matches the live document).
- `shell/FullscreenView.tsx` — the `DocumentSettingsPage`/`DataEditorView`
  branch (either takes the whole editor area).
- `shell/DialogHost.tsx` — every modal/overlay/popup, open-flag driven
  (shortcuts/glossary, `PdfPreviewModal`, the `Offcanvas` column sheet).
- `shell/InsertDialogs.tsx` — the insert scaffolds' dialogs (iterable,
  field, paste, container picker).
- `shell/TutorialSurfaces.tsx` — `TutorialDialog` + `CoachOverlay`.
- `shell/BlockSurfaces.tsx` — block save/manage dialogs + the right-click
  `ui/ContextMenu.tsx` (hand-rolled pointer-anchored `role="menu"`; items:
  wrap-in-container (`wrapSelected`, gated by `isWrappablePath`) and
  save-as-block when armed — both ACCELERATORS only; keyboard
  paths exist in the placement tab / Insert menu).
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
- `hooks/usePreviewSession.ts` — composes zoom → preview → auto-fit;
  returns `renderedScale`/`cssFactor`/`fresh`/`pages` (last-good, never
  blanked)/`boxes`.
- `hooks/useTemplateCap.ts` — the session's template-size cap: seeded
  `max(persisted cap, source byte size)`, raised via the image headroom
  prompt.
- `hooks/useAdvisories.ts` — the GUI's own advisories (drawn-text
  collisions; model in
  [gui-designer-panel.md](gui-designer-panel.md) § Diagnostics), memoized
  over the LAST-GOOD inspect and gated on `inspect.text_metrics`.
- `hooks/useDocDerived.ts` — shared read-only indexes memoized on the
  text: `treeView` (nullable), `styleUsage`, `styleFloor`.
- `hooks/useHostNotify.ts` — report `text` through `onChange` after every
  edit that CHANGES it (handler in a ref).
- `hooks/useMultiSelect.ts` — canvas multi-select + align/distribute
  (canvas-local Set, reset on plain select/Escape; `doAlign`/`doDistribute`
  = ONE `applyAll` over the primary's page). Owns `refused` (the placement
  chip's drag-refusal state).
- `hooks/usePaletteDrag.ts` — palette drag-to-bind/scaffold: `useDrag`
  machine, live-rect hit test (`pageHitAt`), `planPaletteDrop` →
  `insertIndicator`, drop = ONE `insertItem` at the plan's path + select.
- `hooks/useImageImport.ts` — menu entry, canvas file drop, and panel
  replace route ONE pipeline: size gate → `insertItem`/`setScalar`;
  notices ride the topbar `<output>`; `applyRaisedCap`; returns
  `hasImageItem`/`nextCap`. The React wiring only — what the import DOES
  is `hooks/imageImportRun.ts` (`runImageImport` over an explicit
  `ImageImportContext`: the pre-op cap gate, then the op; `textBytes` is
  the RENDER-time size, deliberately not an accessor — plus
  `dropInsertTarget`, where a canvas file drop lands).
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
- `hooks/useSelectionOps.ts` — `deleteSelected` (selects the surviving
  neighbour)/`duplicateSelected`/`wrapSelected`, context-menu anchor, the
  window keydown effect over pure `shortcuts.ts` — all guarded by
  `isEditableTarget` (exported here).
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
  `DataEditorView` over effective definitions + active params.
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
  `fixtures.ts` (tiny sources + fake render outcomes) and `harness.tsx`
  (`draw` mount over a mock transport + menubar/data-editor helpers).
  Coverage-excluded (`vitest.config.ts` `src/testkit/**`), but still
  budget-counted and typechecked/linted like any non-test source.
- `src/integration/wasm.test.ts` — real-engine integration (node env,
  never a mock): dynamic-imports the `make wasm` pkg + injects
  en-US/noto-sans bytes; exercises op → re-render → re-validate, the
  save-block trigger, the layer-tree grammar-identity pin (every engine
  box path addressable in `buildTree`), reorder/duplicate re-renders,
  the canvas dnd pipeline over real inspect geometry, zoomed render
  scale, and the page-setup size table against the engine.
- `vitest.setup.ts` — jsdom RTL setup: auto-cleanup, `ImageData`/
  `getContext` shims, the `PointerEvent` shim (see
  `docs/agents/gotchas/gui-testing.md`).
