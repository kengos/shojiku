// The selection overlay: an SVG of one interactive <rect> per laid-out box,
// sized to match the painted page. Each rect is directly clickable AND
// keyboard-focusable (Enter/Space selects), so selection needs no coordinate
// hit-testing — SVG paint order (shallower boxes before deeper ones) means the
// innermost box sits on top and is picked first. Built from JSX only (never a
// string-built SVG), so document-derived paths are React-escaped attributes.
//
// This file is the ASSEMBLY: the <svg> element, one `useOverlayDrag` call, and
// the LAYER ORDER — the paper anatomy (grid, margin-box guide) under the
// interactive layer, every other decoration over it. What is painted comes from
// the pure `overlayLayers`; what empty
// space does from `overlayBackground`; the clickable rects and their resize
// handles from `OverlayBoxLayer`; the decorations from `OverlayShapes` /
// `OverlayGestureShapes`; and all slot/plan math from the pure
// `dnd`/`manipulate`/`marquee` models.

import { useCallback, useId, useRef } from 'react';
import type { BoxRect, PlacedBox } from '../engine/types';
import { type ContainerMark, ContainerMarkVisual } from './ContainerMarkVisual';
import type { IndicatorLine } from './dropPlan';
import { marginGuide, type PageMargin } from './marginGuide';
import { OverlayBoxLayer } from './OverlayBoxLayer';
import { DropIndicators } from './OverlayDropShapes';
import { GhostRect, GuideLines, MarqueeRect } from './OverlayGestureShapes';
import { GroupFrame, MarginGuideShape, OverlayGrid } from './OverlayShapes';
import { overlayBackground } from './overlayBackground';
import type { CanvasManipulate } from './overlayDragModel';
import { overlayLayers } from './overlayLayers';
import { useOverlayDrag } from './useOverlayDrag';

/** A stable empty multi-selection so the default prop never re-creates a set. */
const EMPTY_SELECTION: ReadonlySet<string> = new Set();
const EMPTY_RECTS: readonly BoxRect[] = [];
const EMPTY_MARKS: readonly ContainerMark[] = [];

export interface BoxOverlayProps {
  readonly boxes: readonly PlacedBox[];
  /** Device pixels per pt — the same scale the page was rasterized at. */
  readonly scale: number;
  readonly width: number;
  readonly height: number;
  readonly selectedPath: string | null;
  readonly onSelect: (path: string) => void;
  /** Additional (canvas-local) multi-selected paths, painted with the
   * secondary stroke; the primary stays {@link selectedPath}. Empty/absent =
   * single-selection behavior. */
  readonly multiSelected?: ReadonlySet<string>;
  /** Shift-click on a box: toggle it in the multi-selection (the Designer
   * gates it to movable items). Absent = shift-click behaves as a plain click. */
  readonly onMultiToggle?: (path: string) => void;
  /** A rubber-band drag on empty overlay space finished: the movable item
   * paths it swept, and whether Shift was held (add vs replace). Absent (or no
   * `manipulate`) = no marquee gesture. */
  readonly onMarquee?: (paths: readonly string[], additive: boolean) => void;
  /** Clear the selection: a click on empty overlay space (not on a box rect). */
  readonly onDeselect: () => void;
  /** Request inline editing of a box (double-click, or Enter on the already-
   * selected box). The Designer decides whether the box actually qualifies —
   * the overlay just reports the intent. */
  readonly onEditRequest?: (path: string) => void;
  /** Enable direct manipulation (drag reorder + absolute move/resize/nudge).
   * Absent = the overlay is select-only (unchanged behavior). */
  readonly manipulate?: CanvasManipulate;
  /** Reports the overlay's SVG element (null on unmount) — the Designer's
   * palette drag hit-tests pages through it. */
  readonly svgRef?: (el: SVGSVGElement | null) => void;
  /** An externally planned insertion indicator (the palette drag), painted
   * like the reorder indicator. Never present while a reorder drag runs —
   * the two gestures are mutually exclusive. */
  readonly insertLine?: IndicatorLine | null;
  /** The palette drag's OTHER indicator: the cell(s) a drop would enter,
   * outlined. A table row / repeat fragment is one authored sub-template drawn
   * many times, so there is no single slot a line could point at — every
   * fragment outlines instead. Mutually exclusive with `insertLine`. */
  readonly insertRects?: readonly BoxRect[];
  /** Container marks (selected container / parent-card hover): dashed outline
   * + slot guides + kind chip. Empty/absent = none. */
  readonly containerMarks?: readonly ContainerMark[];
  /** Right-click on a box: open the context menu at the pointer (viewport px).
   * Absent = the browser's native menu (no override). */
  readonly onContextMenu?: (path: string, x: number, y: number) => void;
  /** The engine's RESOLVED page margins (`inspect.margin`, `[t,r,b,l]` pt) —
   * painted as the margin-box guide, which is where `x: 0` / `y: 0` start.
   * Absent = no guide (unchanged behavior for a host that passes none). */
  readonly margin?: PageMargin | null;
  /** The localized sentence shown while a drop would DROP the dragged item's
   * authored `x`/`y`. Absent = say nothing (this component carries no i18n of
   * its own — the host resolves its own copy). */
  readonly dropWarning?: string;
}

export function BoxOverlay({
  boxes,
  scale,
  width,
  height,
  selectedPath,
  onSelect,
  multiSelected = EMPTY_SELECTION,
  onMultiToggle,
  onMarquee,
  onDeselect,
  onEditRequest,
  manipulate,
  svgRef: reportSvg,
  insertLine = null,
  insertRects = EMPTY_RECTS,
  containerMarks = EMPTY_MARKS,
  onContextMenu,
  margin = null,
  dropWarning,
}: BoxOverlayProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  // One callback ref keeps the internal ref current AND reports the element
  // upward (null on unmount, so a stale element never stays hit-testable).
  const attachSvg = useCallback(
    (el: SVGSVGElement | null) => {
      svgRef.current = el;
      reportSvg?.(el);
    },
    [reportSvg],
  );
  // The selection value already revealed on canvas — the scroll-into-view runs
  // once per selection (a tree/palette/diagnostic selection whose box is off the
  // visible canvas gets confirmed by scrolling to it; a click already on canvas
  // is visible so `block: 'nearest'` is a no-op). Mirrors the LayerTree row
  // reveal.
  const scrolledTo = useRef<string | null>(null);
  const patternId = `sj-grid-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`;

  const { drag, marquee, dragPath, indicator, ghostPx, guides, marqueePx, region, clearsPosition } =
    useOverlayDrag({
      svgRef,
      boxes,
      scale,
      width,
      height,
      margin,
      manipulate,
      onSelect,
      onMarquee,
    });
  const layers = overlayLayers({
    boxes,
    scale,
    selectedPath,
    multiSelected,
    dragPath,
    manipulate,
    containerMarks,
  });
  const background = overlayBackground({ marquee, manipulate, onMarquee, onDeselect });

  // Paper anatomy, not a gesture — derived every render like the grid, and
  // painted with it beneath the interactive layer.
  const guide = marginGuide(margin, scale, width, height);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: a background click clears the selection; the keyboard equivalent is the window-level Escape handler in Designer (a focusable full-page backdrop would only clutter the tab order).
    <svg
      ref={attachSvg}
      className={dragPath === null ? 'sj-box-overlay' : 'sj-box-overlay sj-box-overlay--dragging'}
      width={width}
      height={height}
      // Sit on top of the underlay canvas (the parent page div is positioned),
      // aligned to its origin — without this the SVG stacks below the canvas
      // in normal flow instead of overlaying it.
      style={{ position: 'absolute', top: 0, left: 0 }}
      aria-label="template layout overlay"
      // Named one by one rather than spread: a spread hides the click handler
      // from the a11y lint, which would silently retire the suppression below
      // instead of keeping the rule honest about this element.
      onClick={background.onClick}
      onPointerDown={background.onPointerDown}
      onPointerMove={background.onPointerMove}
      onPointerUp={background.onPointerUp}
      onPointerCancel={background.onPointerCancel}
    >
      <title>Template layout overlay</title>
      {manipulate !== undefined && manipulate.grid > 0 ? (
        <OverlayGrid
          grid={manipulate.grid}
          scale={scale}
          width={width}
          height={height}
          patternId={patternId}
        />
      ) : null}
      {guide !== null ? <MarginGuideShape guide={guide} /> : null}
      <OverlayBoxLayer
        boxes={layers.ordered}
        scale={scale}
        selection={layers.selection}
        wiring={{
          manipulate,
          drag,
          onSelect,
          onMultiToggle,
          onEditRequest,
          onContextMenu,
          scrolledTo,
        }}
      />
      {ghostPx !== null ? <GhostRect rect={ghostPx} /> : null}
      <GuideLines guides={guides} scale={scale} />
      <DropIndicators
        region={region}
        // The reorder indicator and an external (palette-drop) one share the
        // rendering; at most one exists at a time.
        line={indicator ?? insertLine}
        insertRects={insertRects}
        warning={clearsPosition ? dropWarning : undefined}
        ghost={ghostPx}
        scale={scale}
      />
      {layers.groupBox !== null ? <GroupFrame rect={layers.groupBox} /> : null}
      {marqueePx !== null ? <MarqueeRect rect={marqueePx} /> : null}
      {containerMarks.map((mark) => (
        <ContainerMarkVisual key={mark.path} mark={mark} boxes={boxes} scale={scale} />
      ))}
    </svg>
  );
}
