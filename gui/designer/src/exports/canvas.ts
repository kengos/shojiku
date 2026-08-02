// Public surface of the CANVAS area: what paints the document and what the
// paint is driven by — the engine transport seam, the debounced preview loop,
// the RGBA underlay + box overlay, and the pure geometry/manipulation models
// the direct-manipulation gestures decide from. Re-exported wholesale by the
// package index.

export { BoxOverlay, type BoxOverlayProps } from '../canvas/BoxOverlay';
// Canvas.
export {
  DesignerCanvas,
  type DesignerCanvasProps,
  type InlineEdit,
} from '../canvas/DesignerCanvas';
// Canvas drag-reorder substrate: reorder eligibility + sibling geometry, the
// pure slot/indicator drop model, and the generic pointer drag state machine
// (move/resize and palette drags reuse it).
export {
  type Axis,
  type ReorderContext,
  reorderContext,
  type SiblingBox,
  siblingRects,
} from '../canvas/dnd';
export {
  type DropPlan,
  dropSlotFor,
  type IndicatorLine,
  indicatorLine,
  planDrop,
  slotToDocIndex,
} from '../canvas/dropPlan';
export { scaleRect } from '../canvas/geometry';
export {
  type AxisGuide,
  alignPositions,
  axisGuide,
  type GuideLine,
  guideLineFor,
} from '../canvas/guides';
export { InlineTextEditor, type InlineTextEditorProps } from '../canvas/InlineTextEditor';
export {
  type AuthoredLength,
  formatLength,
  ptLength,
  readLength,
  snapLength,
} from '../canvas/lengths';
// Canvas absolute-manipulation model (pure): movability classification, the
// plan vocabulary + editor grid steps, the move/nudge and resize plans, and
// the resize-handle vocabulary.
export {
  type FixedReason,
  type Manipulation,
  type MovablePlace,
  manipulationFor,
  type ReorderPlace,
} from '../canvas/manipulate';
export type { CanvasManipulate } from '../canvas/overlayDragModel';
export { clientToPagePt } from '../canvas/overlayGeometry';
export { PageUnderlay, type PageUnderlayProps } from '../canvas/PageUnderlay';
export { paintPage } from '../canvas/paint';
export {
  DEFAULT_GRID_STEP,
  GRID_STEPS,
  type ManipulationPlan,
  MIN_SIZE_PT,
  normalizeGridStep,
  type SnapOptions,
} from '../canvas/plan';
export { nudgeOps, planMove } from '../canvas/planMove';
export { planResize } from '../canvas/planResize';
export { HANDLES, type Handle, handleKeys, resizableHandle } from '../canvas/resizeHandles';
export {
  DRAG_THRESHOLD_PX,
  type DragPoint,
  type DragSession,
  type UseDrag,
  useDrag,
} from '../canvas/useDrag';
export { ZoomControl, type ZoomControlProps } from '../canvas/ZoomControl';
// Zoom model (pure — steps/clamp/fit/anchor/render-scale cap) and the shared
// inline text editor (the ONE text-editing component the panel + canvas share).
export {
  anchorScroll,
  clampZoom,
  cssFactor,
  fitZoom,
  isZoomStep,
  MAX_RENDER_SCALE,
  MAX_ZOOM,
  MIN_ZOOM,
  renderScale,
  stepZoom,
  wheelZoom,
  ZOOM_STEPS,
  zoomPercent,
} from '../canvas/zoom';
export {
  type EngineTransport,
  type PdfOutcome,
  type RenderOptions,
  type RenderOutcome,
  TransportError,
} from '../engine/transport';
export type * from '../engine/types';
// Engine transport seam (host-injection point).
export { createWasmTransport, type WasmEngine } from '../engine/wasmTransport';
export { CanvasPreview, type CanvasPreviewProps } from '../preview/CanvasPreview';
// Preview loop.
export { EngineProvider, type EngineProviderProps, useEngineTransport } from '../preview/context';
export {
  INITIAL_PREVIEW,
  type PreviewEvent,
  type PreviewState,
  type PreviewStatus,
  previewReducer,
} from '../preview/reducer';
export {
  DEFAULT_DEBOUNCE_MS,
  DEFAULT_SCALE,
  type UsePreviewOptions,
  usePreview,
} from '../preview/usePreview';
