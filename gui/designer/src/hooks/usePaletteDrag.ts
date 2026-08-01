// Palette drag-to-bind / drag-to-scaffold: the Designer owns the pointer state
// machine (the palette rows and array-group headings arm it), hit-tests the
// pointer against the page overlays' LIVE elements, and plans the insertion slot
// with the pure drag model — recomputed per move from current props, so a
// mid-drag edit never yields a stale-geometry insert. A drop outside every page
// is a no-op. The page hit-test half is shared with the image FILE drop, which
// plans differently over the same geometry.

import { useCallback, useMemo, useRef } from 'react';
import type { InsertIndicator } from '../canvas/DesignerCanvas';
import { clientToPagePt } from '../canvas/overlayGeometry';
import { type DragPoint, useDrag } from '../canvas/useDrag';
import type { EditorController } from '../editor/useEditor';
import type { BoxIndex, PlacedBox } from '../engine/types';
import { planPaletteDrop } from '../palette/drag';
import { dropSnippet, type PaletteDragPayload } from '../palette/dragSnippet';
import type { PaletteDrag as PaletteDragHandlers } from '../palette/FieldPalette';
import { scopeAuthorable } from '../panel/pickerModel';
import type { LastGoodPreview } from '../preview/reducer';
import type { PageHit } from './geometry';

const EMPTY_BOXES: BoxIndex = { pages: [] };
const EMPTY_PAGE_BOXES: readonly PlacedBox[] = [];

export interface PaletteDragOptions {
  readonly lastGood: LastGoodPreview | null;
  readonly editor: EditorController;
  readonly selectClearing: (path: string) => void;
  readonly capabilities: readonly string[] | undefined;
  readonly workshop: boolean;
  readonly canDeclare: boolean;
}

export interface PaletteDragWiring {
  readonly pageSvgRef: (index: number, el: SVGSVGElement | null) => void;
  /** The shared geometry half of every canvas drop (the palette drag AND an
   * image file drop, which plan differently over it). */
  readonly pageHitAt: (point: DragPoint) => PageHit | null;
  readonly paletteDrag: PaletteDragHandlers;
  /** The live insertion indicator (recomputed per render — the drag session's
   * point changes re-render, and an edit re-renders with fresh geometry). */
  readonly insertIndicator: InsertIndicator | null;
  /** The live last-good snapshot the hit-test reads — shared with the image
   * import, which clamps a new box against the same geometry. */
  readonly lastGoodRef: { readonly current: LastGoodPreview | null };
}

export function usePaletteDrag({
  lastGood,
  editor,
  selectClearing,
  capabilities,
  workshop,
  canDeclare,
}: PaletteDragOptions): PaletteDragWiring {
  // Destructured ONCE: the controller object is rebuilt every render, so the
  // memo deps below must be these stable fields, never `editor` itself.
  const { read, apply } = editor;
  const pageSvgEls = useRef(new Map<number, SVGSVGElement>());
  const pageSvgRef = useCallback((index: number, el: SVGSVGElement | null) => {
    if (el === null) {
      pageSvgEls.current.delete(index);
    } else {
      pageSvgEls.current.set(index, el);
    }
  }, []);
  const lastGoodRef = useRef(lastGood);
  lastGoodRef.current = lastGood;

  const pageHitAt = useCallback((point: DragPoint) => {
    const snapshot = lastGoodRef.current;
    const pages = snapshot?.pages ?? [];
    const boxes = snapshot?.inspect?.boxes ?? EMPTY_BOXES;
    const scale = snapshot?.scale ?? 1;
    for (const [index, el] of pageSvgEls.current) {
      const rect = el.getBoundingClientRect();
      const page = pages[index];
      // The containment checks vary per test run; a page missing for a
      // still-registered overlay cannot happen in a settled render, so it
      // rides the same guard as a trailing operand.
      if (
        rect.width <= 0 ||
        point.x < rect.left ||
        point.x > rect.left + rect.width ||
        point.y < rect.top ||
        point.y > rect.top + rect.height ||
        page === undefined
      ) {
        continue;
      }
      return {
        page: index,
        boxes: boxes.pages[index] ?? EMPTY_PAGE_BOXES,
        point: clientToPagePt(el, page.width, scale, point),
      };
    }
    return null;
  }, []);

  const palettePlanAt = useCallback(
    (point: DragPoint, payload: PaletteDragPayload) => {
      const hit = pageHitAt(point);
      if (hit === null) {
        return null;
      }
      const plan = planPaletteDrop(
        read,
        hit.boxes,
        hit.point,
        payload,
        scopeAuthorable(capabilities),
      );
      // `null` = this thing cannot live where the pointer is (a row field over
      // the body, a group over a cell): paint nothing, do nothing on release.
      return plan === null ? null : { page: hit.page, plan };
    },
    [pageHitAt, read, capabilities],
  );
  const onPaletteDrop = useCallback(
    (payload: PaletteDragPayload, point: DragPoint) => {
      const hit = palettePlanAt(point, payload);
      if (hit === null) {
        return;
      }
      const { path, index, documentScoped } = hit.plan;
      const result = apply({
        op: 'insertItem',
        path,
        index,
        value: dropSnippet(payload, workshop, canDeclare, documentScoped),
      });
      if (result.ok) {
        selectClearing(`${path}[${index}]`);
      }
    },
    [palettePlanAt, apply, selectClearing, workshop, canDeclare],
  );
  const paletteDragState = useDrag<PaletteDragPayload>(onPaletteDrop);
  const paletteDrag = useMemo<PaletteDragHandlers>(
    () => ({
      begin: paletteDragState.begin,
      move: paletteDragState.move,
      up: paletteDragState.up,
      cancel: paletteDragState.cancel,
      consumeClick: paletteDragState.consumeClick,
    }),
    [
      paletteDragState.begin,
      paletteDragState.move,
      paletteDragState.up,
      paletteDragState.cancel,
      paletteDragState.consumeClick,
    ],
  );

  let insertIndicator: InsertIndicator | null = null;
  const paletteSession = paletteDragState.session;
  if (paletteSession?.started === true) {
    const hit = palettePlanAt(paletteSession.point, paletteSession.payload);
    if (hit !== null && (hit.plan.line !== null || hit.plan.rects.length > 0)) {
      insertIndicator = { page: hit.page, line: hit.plan.line, rects: hit.plan.rects };
    }
  }

  return { pageSvgRef, pageHitAt, paletteDrag, insertIndicator, lastGoodRef };
}
