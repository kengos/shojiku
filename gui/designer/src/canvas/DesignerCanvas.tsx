// The canvas: each page's RGBA underlay with the selection overlay stacked on
// top, at the render scale. Presentational — it takes the rendered pages, the
// box index, and the current selection; the host owns the document/Editor and
// the transport. Composed with the engine by `CanvasPreview`.
//
// Zoom: the pages are painted at the scale the engine rasterized them at
// (`scale`), and `cssFactor` is a CSS transform that displays them at the
// desired zoom — 1 when the render already matches (crisp), otherwise an interim
// magnification until the debounced re-render catches up. When editing, the
// shared inline editor is positioned over the box on its page.

import type { BoxIndex, BoxRect, PlacedBox, RawPage } from '../engine/types';
import type { ChipContext } from '../text/chipContext';
import type { PendingDecl } from '../text/declModel';
import { BoxOverlay } from './BoxOverlay';
import type { ContainerMark } from './ContainerMarkVisual';
import type { IndicatorLine } from './dropPlan';
import { scaleRect } from './geometry';
import { InlineTextEditor } from './InlineTextEditor';
import type { PageMargin } from './marginGuide';
import type { CanvasManipulate } from './overlayDragModel';
import { PageUnderlay } from './PageUnderlay';

/** An externally planned insertion indicator on one page (the palette drag). */
/** Where the palette drag would land, painted on one page: a slot LINE in the
 * flow body, or outlined cell RECTS (one per drawn fragment of the cell the
 * drop would enter). Exactly one of the two is non-empty. */
export interface InsertIndicator {
  readonly page: number;
  readonly line: IndicatorLine | null;
  readonly rects: readonly BoxRect[];
}

/** An active inline text edit: which box, its seeded value, the commit /
 * cancel handlers, and the chip layer's binding options. Absent = not
 * editing. */
export interface InlineEdit {
  readonly path: string;
  readonly value: string;
  readonly ariaLabel: string;
  readonly onCommit: (value: string, declarations: readonly PendingDecl[]) => void;
  readonly onCancel: () => void;
  readonly chips?: ChipContext;
}

export interface DesignerCanvasProps {
  readonly pages: readonly RawPage[];
  readonly boxes: BoxIndex;
  /** Device px per pt the pages were rasterized at (aligns the overlay). */
  readonly scale: number;
  /** CSS transform factor over the painted pixels (default 1 — no transform). */
  readonly cssFactor?: number;
  readonly selectedPath: string | null;
  readonly onSelect: (path: string) => void;
  /** Canvas-local multi-selection (movable paths), painted secondary. */
  readonly multiSelected?: ReadonlySet<string>;
  /** Shift-click toggle into the multi-selection. */
  readonly onMultiToggle?: (path: string) => void;
  /** Rubber-band drop → the swept movable paths (+ additive Shift). */
  readonly onMarquee?: (paths: readonly string[], additive: boolean) => void;
  readonly onDeselect: () => void;
  readonly onEditRequest?: (path: string) => void;
  readonly inlineEdit?: InlineEdit;
  /** Direct-manipulation wiring (drag reorder + absolute move/resize/nudge,
   * per-page overlay); absent = select-only canvas. */
  readonly manipulate?: CanvasManipulate;
  /** Reports each page overlay's SVG element (null on unmount) — the
   * Designer's palette drag hit-tests pages through them. */
  readonly pageSvgRef?: (index: number, el: SVGSVGElement | null) => void;
  /** Reports each page's wrapper element (null on unmount) — the page-nav rail
   * measures/scrolls to pages through them. */
  readonly pageRef?: (index: number, el: HTMLDivElement | null) => void;
  /** The palette drag's planned insertion indicator, painted on its page. */
  readonly insertIndicator?: InsertIndicator | null;
  /** Container marks (selected container / parent-card hover) — each page's
   * overlay filters them against its own boxes. */
  readonly containerMarks?: readonly ContainerMark[];
  /** Right-click on a box: open the context menu at the pointer (viewport px). */
  readonly onContextMenu?: (path: string, x: number, y: number) => void;
  /** The engine's resolved page margins — painted as the margin-box guide on
   * EVERY page: the page geometry is one per document (there is no per-section
   * page setup), so every page has the same origin and a guide on page 1 alone
   * would leave later pages unexplained. */
  readonly margin?: PageMargin | null;
  /** Passed straight through to every page's overlay — the localized sentence
   * shown while a drop would DROP the dragged item's authored `x`/`y`. */
  readonly dropWarning?: string;
}

const NO_BOXES: readonly PlacedBox[] = [];

export function DesignerCanvas({
  pages,
  boxes,
  scale,
  cssFactor = 1,
  selectedPath,
  onSelect,
  multiSelected,
  onMultiToggle,
  onMarquee,
  onDeselect,
  onEditRequest,
  inlineEdit,
  manipulate,
  pageSvgRef,
  pageRef,
  insertIndicator = null,
  containerMarks,
  onContextMenu,
  margin,
  dropWarning,
}: DesignerCanvasProps) {
  return (
    <div
      // `sj-canvas` marker kept: the rendering-status opacity rule keys on
      // it (styles.css), and the canvas tests query it.
      className="sj-canvas mx-auto flex w-max flex-col items-center gap-4"
      style={{ transform: `scale(${cssFactor})`, transformOrigin: 'top left' }}
    >
      {pages.map((page, index) => {
        const pageBoxes = boxes.pages[index] ?? NO_BOXES;
        // The box being edited, if it is laid out on THIS page.
        const editingBox =
          inlineEdit === undefined
            ? undefined
            : pageBoxes.find((entry) => entry.path === inlineEdit.path);
        return (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: pages are a stable, order-preserving list with no identity of their own — the index is their key.
            key={`page-${index}`}
            ref={pageRef === undefined ? undefined : (el) => pageRef(index, el)}
            className="shadow-[0_2px_12px_var(--sj-paper-shadow)]"
            style={{ position: 'relative', width: page.width, height: page.height }}
          >
            <PageUnderlay page={page} />
            <BoxOverlay
              boxes={pageBoxes}
              scale={scale}
              width={page.width}
              height={page.height}
              selectedPath={selectedPath}
              onSelect={onSelect}
              multiSelected={multiSelected}
              onMultiToggle={onMultiToggle}
              onMarquee={onMarquee}
              onDeselect={onDeselect}
              onEditRequest={onEditRequest}
              manipulate={manipulate}
              svgRef={pageSvgRef === undefined ? undefined : (el) => pageSvgRef(index, el)}
              insertLine={
                insertIndicator !== null && insertIndicator.page === index
                  ? insertIndicator.line
                  : null
              }
              insertRects={
                insertIndicator !== null && insertIndicator.page === index
                  ? insertIndicator.rects
                  : undefined
              }
              containerMarks={containerMarks}
              onContextMenu={onContextMenu}
              margin={margin}
              dropWarning={dropWarning}
            />
            {inlineEdit !== undefined && editingBox !== undefined ? (
              <InlineTextEditor
                rect={scaleRect(editingBox.content, scale)}
                value={inlineEdit.value}
                onCommit={inlineEdit.onCommit}
                onCancel={inlineEdit.onCancel}
                ariaLabel={inlineEdit.ariaLabel}
                chips={inlineEdit.chips}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
