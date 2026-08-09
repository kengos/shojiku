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
  (`RawPage`/`PlacedBox`/`BoxIndex`/`InspectEnvelope`/`Diagnostic`,
  engine serde names; coverage-excluded).
- `engine/transport.ts` — `EngineTransport`, the host-injection seam:
  `validate` + `renderRaw(…, {scale, pageIndex?}) → RenderOutcome` + the
  OPTIONAL `renderPdf` (absent = the Designer hides the action); async
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
- `preview/context.tsx` — `EngineProvider`/`useEngineTransport`.
- `preview/CanvasPreview.tsx` — context + loop + canvas assembly.

## Paint + overlay

- `canvas/geometry.ts` — `scaleRect` pt→px. `canvas/paint.ts` —
  `paintPage` RGBA→canvas (no-op without a 2D ctx).
  `canvas/PageUnderlay.tsx` — callback-ref canvas paint.
- `canvas/BoxOverlay.tsx` — the overlay ASSEMBLY: the `<svg>` element,
  ONE `useOverlayDrag` call, and the LAYER ORDER (grid under the
  interactive layer, every other decoration over it). JSX-only —
  document-derived paths are React-escaped (pinned by a hostile-path
  test). `svgRef` reports the SVG (the palette drag hit-tests through
  it); `insertLine` vs `insertRects` are the two mutually-exclusive
  external insertion indicators. `BoxOverlayProps` is the host-facing
  surface (re-exported from the package index) — deliberately flat.
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
- `canvas/useOverlayDrag.ts` — the overlay's pointer WIRING only: the
  box drag machine (move/resize/reorder/refused) + the marquee on its
  OWN `useDrag` instance, the once-per-session refusal report, and the
  page-pt → overlay-px scaling of what it returns. What a release
  commits and what a live drag paints are `overlayDragModel` /
  `overlayDragVisual`.
- `canvas/overlayDragModel.ts` — the drag's pure model: the
  `CanvasManipulate` wiring contract, the `DragTask`/`MarqueeTask`
  gesture payloads, the `OverlayDragContext` bundle every computation is
  asked over (it carries the SVG **ref**, not the element — every
  pointer conversion must read the LIVE rect at drop time),
  `snapOptionsFor`, `reorderContextFor`, and the `commitDrag` /
  `commitMarquee` releases. A commit that produced no change selects the
  pressed item instead (the drag machine suppressed the trailing click).
- `canvas/overlayDragVisual.ts` — `dragVisual` → `DragVisual`
  {dragPath, indicator, ghost (page pt), guides}, recomputed from the
  CURRENT context every render (a mid-drag edit degrades to a visual
  no-op, never a stale-geometry op); `NO_DRAG_VISUAL` is the
  paints-nothing value (idle / below threshold / refused / no plan).
- `canvas/OverlayBox.tsx` — ONE interactive `<rect>`: its paint, its
  ARIA, and the DISPATCH of the gestures it receives (click/shift-click
  select, right-click menu, double-click edit, per-kind cursors,
  once-per-selection `scrollIntoView`). Paint inlined as the
  no-stylesheet fallback — `fill="transparent"` (not `none`) keeps it
  hit-testable.
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
  pattern (fed by `manipulate.grid`) and the multi-selection group frame
  (fed by `groupBounds`).
- `canvas/OverlayGestureShapes.tsx` — the overlay's GESTURE shapes, each
  fed by a live drag machine or the external palette-drag props: ghost,
  guides, drop line, insert rects, marquee.
  Both shape modules are `pointer-events: none` with NO ARIA at all, and
  each piece takes resolved non-null geometry — the caller's JSX decides
  existence.
- `canvas/ContainerMarkVisual.tsx` — `ContainerMark {path, label}` +
  its dashed outline / slot guides / kind chip (chip labels are CHROME
  strings, never document-derived).
- `canvas/DesignerCanvas.tsx` — per-page underlay+overlay stack;
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

- `canvas/dnd.ts` — the DnD substrate's ELIGIBILITY half:
  `reorderContext` (drag eligibility + axis from the document; refusals
  incl. grid, sub-templates, authored x/y) and `siblingRects`
  (duplicated index → null, since repeat fragments share paths).
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
