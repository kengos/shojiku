# Code map — gui/designer — canvas, preview loop, engine transport

> AI-only, token-dense. Index + repo-wide conventions: [CLAUDE.md](../../CLAUDE.md).
> Read this BEFORE searching or editing the covered dirs; update it in the
> same PR whenever files/modules/boundaries here change.
> Area index + neighbors: [gui-designer.md](gui-designer.md). Granularity:
> file role + key exports + load-bearing contracts.

Covers `engine/`, `preview/`, `canvas/`.

Area-wide postures: pure models classify from the DOCUMENT (a read throw
= a refusal, never a crash); a drag/drop that cannot be expressed as a
valid op paints nothing and does nothing on release; a commit is
changed-keys-only ops in ONE `applyAll` (one undo step); non-finite /
hostile geometry degrades to null before it can reach an op.

## Engine transport seam

- `engine/types.ts` — type-only mirrors of the wasm response shapes
  (`RawPage`/`PlacedBox`/`BoxIndex`/`InspectEnvelope`/`Diagnostic`/
  `FormatCatalog` & friends, engine serde names; coverage-excluded).
- `engine/transport.ts` — `EngineTransport`, the host-injection seam:
  `validate` + `renderRaw(…, {scale, pageIndex?}) → RenderOutcome` + the
  OPTIONAL `renderPdf` (absent = the Designer hides the action) and the
  OPTIONAL `formatCatalog(text, probes)` (absent = the pickers list
  spellings with no samples) — presence + capability, never a version
  sniff; async
  so a Worker/server transport slots in; `TransportError` (never an
  uncaught throw; carries a typed engine `code`/`args` when present).
- `engine/wasmTransport.ts` — `createWasmTransport(engine)` over a
  PREPARED structurally-typed engine (the gitignored pkg is never a
  static import); `renderPdf` spread in only when the engine exposes it.
- `engine/wasmResponse.ts` — what an engine RESPONSE means: the field
  guards + `toDiagnostics`/`toOutcome`/`toPdfOutcome`; a wrong shape, a
  fractional page dimension or an RGBA buffer that does not match its
  declared area becomes a `TransportError` here, not an `ImageData`
  blow-up mid-commit.
- `engine/formatCatalogResponse.ts` — a full RUNTIME guard over the
  catalog response, not merely a TS type: a TS type is compile-time only,
  and the spellings in this response are author-derived AND become
  authored values the moment one is picked. Closed-set fields match
  against a real array rather than an object table, so a prototype name
  never resolves to an inherited value.
- `engine/errors.ts` — `errorText` + `throwFields` (guarded typed-throw
  extraction).

## Preview loop

- `preview/reducer.ts` — pure `previewReducer`: revision-tagged snapshot
  correlation (stale results drop); `lastGood {pages, inspect, scale}`
  survives BOTH failure modes (throw AND `ok:false`) so a mid-edit
  invalid document never blanks the canvas; diagnostics always read the
  LATEST outcome.
- `preview/usePreview.ts` — the debounced loop (bump revision → debounce
  `renderRaw` → dispatch tagged with its scale).
- `preview/draftTemplate.ts` — the UNCOMMITTED-edit overlay: the ops of an
  edit in progress applied to a THROWAWAY `Editor` over the committed
  source, serialized. Total — a refused batch, an unparseable source, or a
  result over the caller's byte cap all answer `null` and the loop renders
  the COMMITTED text. The size check lives here or nowhere: `applyAll`
  enforces no bound, and only a re-parse does, which a successful batch
  never performs. The session's document, its undo history and every
  save/export path are untouched (all read the editor's own text). Distinct
  from `designer-app`'s persisted "draft", which is the unsaved DOCUMENT.
- `preview/context.tsx` — `EngineProvider`/`useEngineTransport`.
- `preview/CanvasPreview.tsx` — context + loop + canvas assembly.

## Paint + overlay

- `canvas/geometry.ts` — `scaleRect` pt→px. `canvas/paint.ts` —
  `paintPage` RGBA→canvas (no-op without a 2D ctx).
  `canvas/PageUnderlay.tsx` — callback-ref canvas paint.
- `canvas/BoxOverlay.tsx` — the overlay ASSEMBLY: the `<svg>` element,
  ONE `useOverlayDrag` call, and the LAYER ORDER (the paper anatomy —
  grid, margin-box guide — under the interactive layer, every other
  decoration over it). JSX-only —
  document-derived paths are React-escaped (pinned by a hostile-path
  test). `svgRef` reports the SVG (the palette drag hit-tests through
  it); `insertLine` vs `insertRects` are the two mutually-exclusive
  external insertion indicators; the drag's OWN receiving-owner outline
  reuses the `insertRects` shape, painted under the insertion line so
  the line stays the answer to "where exactly". `BoxOverlayProps` is the host-facing
  surface (re-exported from the package index) — deliberately flat; its
  optional `margin` paints the margin-box guide (absent = no guide, so an
  existing host is unchanged).
  The background handlers are named one by one rather than spread: a
  spread hides `onClick` from the a11y lint and would silently retire
  the element's `useKeyWithClickEvents` suppression.
- `canvas/overlayLayers.ts` — pure: what the overlay PAINTS, derived in
  ONE pass over an `OverlayLayersInput` bundle → `{ordered, selection,
  groupBox}`. `ordered` is stable-sorted shallowest-first so a
  container/table fragment never masks its own cells; `selection` is the
  `OverlayBoxSelection` the interactive layer reads every box out of
  (marked paths, the primary's ability + its px rect — non-null only
  when MOVABLE). A selection the current box list does not carry
  degrades to a null rect (paths are re-synthesized each layout).
- `canvas/overlayBackground.ts` — pure factory for what the overlay's
  own EMPTY SPACE does: a click between boxes deselects (a completed
  marquee's trailing click is consumed instead), a press there arms the
  rubber band. Both act only on `target === currentTarget`; the marquee
  arm fails CLOSED without wiring or without a handler. Never memoize —
  the handlers must close over the CURRENT machine each render.
- `canvas/OverlayBoxLayer.tsx` — the INTERACTIVE layer (everything on
  the overlay you can click or focus): one `OverlayBox` per laid-out
  box, then `OverlayHandles` on the selected movable one. Owns the
  stable `index:path` keying rule; takes the `OverlayBoxSelection` +
  `OverlayBoxWiring` bundles rather than a dozen loose values.
- `canvas/overlayGeometry.ts` — the overlay's pure geometry:
  `pathDepth`/`byDepth`, `clientToPagePt` (over the LIVE bounding rect
  so zoom factors out; unmeasurable → ratio 1), `clientDeltaToPt`,
  `handleCenter`/`boxCursor`/`arrowDelta`, `groupBounds` (null below
  two DISTINCT paths — repeat fragments count once).
- `canvas/overlayMarquee.ts` — the rubber band's model, kept apart from
  the box drag for the same reason it has its own `useDrag` machine: it
  SELECTS and never edits, and shares nothing with the box drag but the
  context bundle and the pointer conversion. `MarqueeTask` +
  `commitMarquee`.
- `canvas/useOverlayDrag.ts` — the overlay's pointer WIRING only: the
  box drag machine (move/resize/reorder/refused) + the marquee on its
  OWN `useDrag` instance, the once-per-session refusal report, and the
  page-pt → overlay-px scaling of what it returns. Takes the page in PT
  and the resolved margins, which is what the band regions are measured
  from (`BoxOverlay` divides its px dimensions by the render scale). What a release
  commits and what a live drag paints are `overlayDragModel` /
  `overlayDragVisual`.
- `canvas/overlayDragModel.ts` — the drag's pure model: the
  `CanvasManipulate` wiring contract, the `DragTask`/`MarqueeTask`
  gesture payloads, the `OverlayDragContext` bundle every computation is
  asked over (it carries the SVG **ref**, not the element — every
  pointer conversion must read the LIVE rect at drop time),
  `snapOptionsFor`, `reorderContextFor`, `reparentAt`, and the
  `commitDrag` release (the marquee's is `overlayMarquee`). Every release asks
  `reparentAt` FIRST — a drop over a different parent is a reparent
  whichever gesture armed the drag, and its `null` for the own-parent
  case is what hands the release back to the shipped reorder/move
  paths. `onReorder` therefore takes a BATCH plus the path the item
  ended up at. A commit that produced no change selects the pressed item
  instead (the drag machine suppressed the trailing click).
- `canvas/overlayDragVisual.ts` — `dragVisual` → `DragVisual`
  {dragPath, indicator, ghost (page pt), guides, region — the receiving
  owner of a cross-parent drop — and `clearsPosition`, read off the
  batch's own `removeKey` ops so the warning is honest rather than a
  blanket "entering a container"}, recomputed from the
  CURRENT context every render (a mid-drag edit degrades to a visual
  no-op, never a stale-geometry op); `NO_DRAG_VISUAL` is the
  paints-nothing value (idle / below threshold / refused / no plan).
- `canvas/OverlayBox.tsx` — ONE interactive `<rect>`: its paint, its
  ARIA, and the DISPATCH of the gestures it receives (click/shift-click
  select, right-click menu, double-click edit, per-kind cursors,
  once-per-selection `scrollIntoView`). Paint inlined as the
  no-stylesheet fallback — `fill="transparent"` (not `none`) keeps it
  hit-testable. It is the ONE reader of `PlacedBox.hidden` that paints
  (the layer tree and hit-testing ignore the flag): an unselected hidden
  box gets the GHOST — a dashed 1px outline at 0.4 opacity — plus the
  unstyled `sj-box--hidden` class as a host hook. The flag has two engine
  causes (a `visible:` predicate that did not hold, and a
  `header.visuallyHidden` header's cells) and it is an ENUMERATION, not a
  predicate — do not reason "this reserves a box and paints nothing, so it
  must be stamped". Two cases that are not: an authored `opacity: 0` (the
  author's paint choice, so the flag means "is not there", not "looks
  faint") and an unmatched `data:` mark, which reserves its box by design
  and reports `hidden: false` today. This side needs no
  capability gate for either cause: an older engine omits the field,
  which reads as `undefined` and simply draws no ghost.
- `canvas/overlayBoxGestures.ts` — pure: what a gesture on one box
  MEANS, decided from the document. `boxKeyPlan` → `BoxKeyPlan | null`
  (`reorder` / `apply` / `consume` / `edit` / `select`); `null` = the key
  is not ours, so the caller must NOT `preventDefault`, and `consume` is
  the deliberate "ours but the document does not change" arm (first item
  moving up, a nudge that rounds back to the authored spelling).
  `boxDragTask` → the `DragTask` a press arms (move / reorder / a TYPED
  refusal). `applyBoxKeyPlan` dispatches the two document-changing arms —
  its absent-wiring guard lives here, not as an optional chain at the
  call site, which would leave a branch leg no render can cover.
- `canvas/OverlayHandles.tsx` — the 8 resize handles on the selected
  movable box (filtered by `resizableHandle`; `OverlayBoxLayer`'s JSX
  holds the narrowing).
- `canvas/OverlayShapes.tsx` — the overlay's STATE shapes: the grid
  pattern (fed by `manipulate.grid`), the multi-selection group frame
  (fed by `groupBounds`), and `MarginGuideShape` (fed by `marginGuide`) —
  the page's margin box, DASHED because nothing the engine draws is
  dashed, so it can never be read as document ink; both its strokes are
  FIXED values rather than `--sj-text`/`--sj-accent`, since it is drawn
  on the engine-rendered paper, which is pixels and stays white in either
  colour scheme. `.sj-grid-line` now follows the same rule for the same
  reason — it was `--sj-text` at 8% on that same paper, so the snap grid
  faded out in dark chrome; both are the `#1f1a17` `OverlayGrid`'s inline
  fallback already used, and the stylesheet was the half that diverged.
- `canvas/marginGuide.ts` — pure: the margin box as canvas geometry.
  `marginGuide(margin, scale, width, height)` turns the engine's RESOLVED
  `inspect.margin` (`[t,r,b,l]` pt, post-clamp) into the px rect the
  overlay paints, plus whether the top band has room for the `0,0` origin
  marker (`ORIGIN_MARKER_PX`). It exists because the coordinate origin IS
  the margin box (`docs/engine/page.md`) while an absolutely placed item
  is bounded by the SHEET — two invisible rectangles, one that the
  numbers are measured from and one that the warnings are. `null` (paint
  nothing) covers hostile/degenerate input AND the deliberate case of
  every side `0`, which is the sheet-absolute escape hatch: there the
  margin box already is the sheet.
- `canvas/OverlayGestureShapes.tsx` — the overlay's GESTURE shapes, each
  fed by a live drag machine or the external palette-drag props: ghost,
  guides, drop line, insert rects, marquee.
- `canvas/OverlayDropShapes.tsx` — `DropIndicators`, the four layers that
  answer "where would this land, and at what cost": the receiving owner's
  outline, the insertion line inside it, the palette drag's cell rects,
  and the warning chip a drop that would CLEAR the item's authored
  `x`/`y` carries. The only gesture shape with TEXT — a localized
  sentence the host resolves and passes down (`BoxOverlay` carries no
  i18n of its own, like the container-mark chip).
  Both shape modules are `pointer-events: none` with NO ARIA at all, and
  each piece takes resolved non-null geometry — the caller's JSX decides
  existence.
- `canvas/ContainerMarkVisual.tsx` — `ContainerMark {path, label}` +
  its dashed outline / slot guides / kind chip (chip labels are CHROME
  strings, never document-derived).
- `canvas/DesignerCanvas.tsx` — per-page underlay+overlay stack; passes
  `margin` to EVERY page (one page geometry per document, so every page
  shares the origin);
  applies the zoom `cssFactor` transform; slots the `InlineTextEditor`;
  threads reorder/multi-select wiring, `pageSvgRef` + `insertIndicator`
  (palette drop), and `pageRef` (the page-nav rail measures through it).

## Page-nav rail

- `canvas/pageNav.ts` — pure: `mostVisiblePageIndex` (client-px spans,
  earliest-tie, nearest-center fallback) + guarded
  `scrollPageIntoView`.
- `canvas/PageRail.tsx` — the thumbnail rail (≥2 pages): downscaled
  canvases via `paintPage`, `aria-current` on the current page; reports
  a jump intent, never touches the document.

## Zoom + inline editing

- `canvas/zoom.ts` — pure zoom model: `clampZoom`/`stepZoom`/
  `wheelZoom`/`fitZoom`/`isMeasurable` (gates the open-at-Fit pass),
  `renderScale` (capped — the RGBA memory bound), `cssFactor`,
  `anchorScroll` (cursor-anchored wheel math).
- `canvas/ZoomControl.tsx` — the topbar [−][level select][+] cluster;
  all math in `zoom.ts`.
- `canvas/InlineTextEditor.tsx` — the double-click editor: the shared
  `TextEditor` over the box's content rect, armed with the shared
  `ChipContext`; `onCommit(value, declarations)` — the same contract as
  the panel field, so the two chip surfaces cannot drift.

## Direct manipulation (pure models + the pointer machine)

- `canvas/dnd.ts` — the DnD substrate's ELIGIBILITY half, on both sides:
  what may LEAVE (`reorderContext` — drag eligibility + axis from the
  document; refusals incl. grid, sub-templates, authored x/y) and what
  may RECEIVE (`ownerPlacement` → the four `OwnerKind`s and the slot
  axis, `typeFitsOwner` — the engine's own placement rules, so a move
  cannot leave an item somewhere it would warn-and-skip, and
  `receiverFor`). Plus `siblingRects` (duplicated index → null, since
  repeat fragments share paths) and `SUB_TEMPLATE_RE`, shared with
  `manipulate`.
- `canvas/reparent.ts` — the cross-parent move as OPS, and the one model
  BOTH surfaces share (the layer tree asks it the same question). ONE
  `moveItem` carrying `toPath`, preceded by whatever `box` keys the
  crossing invalidates: entering an order-placed owner CLEARS an
  authored `x`/`y` — a CHOICE, not a no-op, since only the flow body
  ignores them and a container honours them (see `reparent.ts`) —
  entering a coordinate-placed one WRITES them from the drop point
  against the margin box (the origin a band child and an absolute-body child share —
  `assemble.rs` builds all three sections from one page basis), in the
  item's own authored form and only where the value changes. Every
  refusal is a `null`: a non-sequence or sub-template source, the
  item's OWN parent (the shipped reorder path owns that), a destination
  inside the moved item, a type the destination cannot lay out, a
  hostile index, a read that throws.
- `canvas/reparentTarget.ts` — where a canvas cross-parent drop LANDS:
  `bandRegion` (the band's own rect is not in `inspect`, so its region
  is the `sections.<band>.height` the DOCUMENT declares, taken from the
  top of the margin box for a header and the bottom for a footer — the
  shape `insert/bandPlacement` already places a fresh band item by),
  `receiverUnder` (bands FIRST — a declared band strip wins outright, so a
  container inside a header is not reachable this way — then innermost-hit
  over the boxes per the `cellUnder` rule, then the body), and `planReparent` → the target
  plus what the overlay paints (the receiving owner's outline, and the
  insertion line inside an order-placed one). Slot math is the shipped
  `dropPlan` one, never a second implementation.
- `canvas/dropPlan.ts` — the DROP half: `dropSlotFor` (list space) /
  `slotToDocIndex` (document space — a page may show a sparse run) /
  `indicatorLine`, and `planDrop` (`{op: MoveItemOp|null, line,
  source}`; op math shared with `tree/model`).
- `canvas/manipulate.ts` — the pure CLASSIFICATION model:
  `manipulationFor` → move | reorder | `{kind:'fixed', reason}` (the
  chip/refusal vocabulary). Exports the untrusted-node read guards
  `record` + `baseLength` the plan/handle models share; the `noBox`
  refusal reads `panel/itemView.ts`'s shared `BOXLESS_TYPES`.
- `canvas/plan.ts` — the plan VOCABULARY + shared commit math:
  `SnapOptions`/`ManipulationPlan`/`MIN_SIZE_PT`,
  `GRID_STEPS`/`DEFAULT_GRID_STEP`/`normalizeGridStep` (the
  untrusted-step allowlist), `sourceRect` + `axisOp` (shared with
  `align.ts`), `guideTargets`.
- `canvas/planMove.ts` — `planMove` (pointer drag; guide snap wins over
  grid snap per axis, `axisLock` on Shift) and `nudgeOps` (arrow key —
  a straight authored-space delta, never snapped). Both changed-keys-only.
- `canvas/planResize.ts` — `planResize`: leading-edge handles move
  position + size, trailing-edge ones size only; moving edge guide-snaps
  else grid-snaps; `MIN_SIZE_PT` clamp. Only the keys the handle TOUCHES
  must be writable in authored form, so an untouched `"100%"` w never
  blocks a vertical drag.
- `canvas/resizeHandles.ts` — the handle vocabulary: `Handle`/`HANDLES`,
  `handleKeys` (which `box` keys a handle writes), `resizableHandle`
  (can every touched key be written back in its authored form?).
- `canvas/align.ts` — the pure align/distribute model:
  `alignTargets`/`movableCount` (the toolbar gate), `alignOps`/
  `distributeOps` (changed-keys via the shared `axisOp`; never throws).
- `canvas/marquee.ts` — the pure rubber-band model (`marqueeRect`/
  `rectsOverlap`/`marqueeSelection` → movable paths only).
- `canvas/lengths.ts` — authored-length math: `readLength`/
  `formatLength` (commits in the AUTHORED form at per-unit precision;
  non-finite → null)/`snapLength`/`stepLength` (unit-preserving,
  reversible); unit constants from `panel/pageSizes` — never a second
  mapping.
- `canvas/guides.ts` — smart-guide math (`alignPositions`/`axisGuide`/
  `guideLineFor`).
- `canvas/useDrag.ts` — the generic pointer drag state machine
  (semantics-free; box/palette/marquee drags reuse it):
  `DRAG_THRESHOLD_PX` 4 (the ONE threshold), alt/shift modifiers,
  primary-pointer + finite guards, guarded pointer capture,
  capture-phase Escape cancel, `consumeClick` one-shot suppression.
