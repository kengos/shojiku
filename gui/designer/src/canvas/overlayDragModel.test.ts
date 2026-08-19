import type { ReadFn } from '@shojiku/designer-core';
import { describe, expect, it, vi } from 'vitest';
import type { PlacedBox } from '../engine/types';
import {
  type CanvasManipulate,
  commitDrag,
  type OverlayDragContext,
  reorderContextFor,
  snapOptionsFor,
} from './overlayDragModel';

const docRead =
  (entries: Record<string, unknown>): ReadFn =>
  (path) =>
    entries[path];

const placed = (path: string, x: number, y: number, w: number, h: number): PlacedBox => ({
  path,
  border: { x, y, w, h },
  content: { x, y, w, h },
});

// An absolute body of three stacked rects (authored numbers = page pt).
const ABS_DOC = {
  'sections.body': { type: 'absolute' },
  'sections.body.items[0]': { type: 'rect', box: { x: 0, y: 0, w: 100, h: 30 } },
  'sections.body.items[1]': { type: 'rect', box: { x: 0, y: 40, w: 100, h: 30 } },
};
const ABS_BOXES = [
  placed('sections.body.items[0]', 0, 0, 100, 30),
  placed('sections.body.items[1]', 0, 40, 100, 30),
];

// A body holding ONE absolutely placed rect — no sibling, so no guide
// attractor can rewrite a plain move/resize delta.
const SOLO_DOC = {
  'sections.body': { type: 'absolute' },
  'sections.body.items[0]': { type: 'rect', box: { x: 0, y: 0, w: 100, h: 30 } },
};
const SOLO_BOXES = [placed('sections.body.items[0]', 0, 0, 100, 30)];

// A flow body — its children reorder rather than move.
const FLOW_DOC = {
  'sections.body': { type: 'flow', items: [{}, {}, {}] },
  'sections.body.items[0]': { type: 'text', text: 'a' },
  'sections.body.items[1]': { type: 'text', text: 'b' },
  'sections.body.items[2]': { type: 'text', text: 'c' },
};
const FLOW_BOXES = [
  placed('sections.body.items[0]', 0, 0, 100, 30),
  placed('sections.body.items[1]', 0, 40, 100, 30),
  placed('sections.body.items[2]', 0, 80, 100, 30),
];

// A flow body whose last item is a container — the cross-parent destination.
const NEST_DOC = {
  'sections.body': { type: 'flow', items: [{}, {}] },
  'sections.body.items[0]': { type: 'text', text: 'a' },
  'sections.body.items[1]': { type: 'container', items: [{}] },
  'sections.body.items[1].items': [{}],
  'sections.body.items[1].items[0]': { type: 'text', text: 'inner' },
};
const NEST_BOXES = [
  placed('sections.body.items[0]', 0, 0, 100, 30),
  placed('sections.body.items[1]', 0, 40, 100, 60),
  placed('sections.body.items[1].items[0]', 5, 45, 90, 20),
];

/** An element whose bounding rect the coordinate conversions read. */
const measurable = (left: number, top: number, width: number) => ({
  getBoundingClientRect: () => ({ left, top, width }),
});

function wiring(doc: Record<string, unknown>, grid = 0): CanvasManipulate {
  return {
    read: docRead(doc),
    onReorder: vi.fn(),
    onApply: vi.fn(),
    onRefused: vi.fn(),
    grid,
  };
}

function context(
  manipulate: CanvasManipulate,
  boxes: readonly PlacedBox[],
  svg: ReturnType<typeof measurable> | null = null,
): OverlayDragContext {
  return {
    // The context carries the REF, so every conversion reads the live element.
    svgRef: { current: svg as unknown as SVGSVGElement | null },
    boxes,
    scale: 1,
    width: 100,
    page: { width: 100, height: 200 },
    margin: null,
    manipulate,
  };
}

describe('snapOptionsFor', () => {
  it('takes the grid from the wiring and the modifiers from the point', () => {
    const ctx = context(wiring(ABS_DOC, 4), ABS_BOXES);
    expect(snapOptionsFor(ctx, { x: 0, y: 0, alt: true, shift: true })).toEqual({
      grid: 4,
      // Unmeasurable (no element): ratio 1 over scale 1, so the 6px guide
      // threshold is 6pt.
      threshold: 6,
      bypass: true,
      axisLock: true,
    });
  });

  it('reads absent modifiers as off rather than undefined', () => {
    const ctx = context(wiring(ABS_DOC, 0), ABS_BOXES);
    const opts = snapOptionsFor(ctx, { x: 0, y: 0 });
    expect(opts.bypass).toBe(false);
    expect(opts.axisLock).toBe(false);
  });

  it('reads the SVG ref at CALL time, not when the context was built', () => {
    const ref = { current: null as unknown as SVGSVGElement | null };
    const ctx: OverlayDragContext = {
      svgRef: ref,
      boxes: ABS_BOXES,
      scale: 1,
      width: 100,
      page: { width: 100, height: 200 },
      margin: null,
      manipulate: wiring(ABS_DOC, 0),
    };
    expect(snapOptionsFor(ctx, { x: 0, y: 0 }).threshold).toBe(6);
    // The overlay mounts (or resizes) AFTER the context was built: a
    // half-width rect doubles the pt-per-px ratio, and the threshold must
    // follow. Capturing `svgRef.current` at build time would miss this.
    ref.current = measurable(0, 0, 50) as unknown as SVGSVGElement;
    expect(snapOptionsFor(ctx, { x: 0, y: 0 }).threshold).toBe(12);
  });
});

describe('reorderContextFor', () => {
  it('resolves a flow child to its reorder context', () => {
    const ctx = context(wiring(FLOW_DOC), FLOW_BOXES);
    expect(reorderContextFor(ctx, 'sections.body.items[1]')).toEqual({
      parent: 'sections.body.items',
      from: 1,
      axis: 'y',
    });
  });

  it('refuses a box that classifies as movable rather than reorderable', () => {
    const ctx = context(wiring(ABS_DOC), ABS_BOXES);
    expect(reorderContextFor(ctx, 'sections.body.items[0]')).toBeNull();
  });
});

describe('commitDrag', () => {
  it('does nothing at all for a refused gesture', () => {
    const manipulate = wiring(ABS_DOC);
    const onSelect = vi.fn();
    commitDrag(
      context(manipulate, ABS_BOXES),
      { mode: 'refused', reason: 'grid' },
      { x: 0, y: 0 },
      onSelect,
    );
    expect(manipulate.onApply).not.toHaveBeenCalled();
    expect(manipulate.onReorder).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('dispatches the move op batch a drag realizes', () => {
    const manipulate = wiring(SOLO_DOC);
    const onSelect = vi.fn();
    commitDrag(
      context(manipulate, SOLO_BOXES),
      { mode: 'move', path: 'sections.body.items[0]', startX: 0, startY: 0 },
      { x: 0, y: 20 },
      onSelect,
    );
    expect(manipulate.onApply).toHaveBeenCalledWith('sections.body.items[0]', [
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['box', 'y'], value: 20 },
    ]);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('treats a move that committed nothing as a click on the pressed item', () => {
    const manipulate = wiring(SOLO_DOC);
    const onSelect = vi.fn();
    commitDrag(
      context(manipulate, SOLO_BOXES),
      { mode: 'move', path: 'sections.body.items[0]', startX: 5, startY: 5 },
      { x: 5, y: 5 },
      onSelect,
    );
    expect(manipulate.onApply).not.toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith('sections.body.items[0]');
  });

  it('dispatches the resize op batch a handle drag realizes', () => {
    const manipulate = wiring(SOLO_DOC);
    commitDrag(
      context(manipulate, SOLO_BOXES),
      { mode: 'resize', path: 'sections.body.items[0]', handle: 's', startX: 0, startY: 0 },
      { x: 0, y: 10 },
      vi.fn(),
    );
    expect(manipulate.onApply).toHaveBeenCalledWith('sections.body.items[0]', [
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['box', 'h'], value: 40 },
    ]);
  });

  it('lets a sibling alignment guide win over the raw pointer delta', () => {
    // items[1] sits at y 40..70, so a 20pt drop puts the dragged bottom edge
    // at 50 — within the 6pt guide threshold of the sibling's centre (55).
    // The guide pulls the commit to 25, and the whole snap path runs through
    // the context's own `guideTargets` lookup.
    const manipulate = wiring(ABS_DOC);
    commitDrag(
      context(manipulate, ABS_BOXES),
      { mode: 'move', path: 'sections.body.items[0]', startX: 0, startY: 0 },
      { x: 0, y: 20 },
      vi.fn(),
    );
    expect(manipulate.onApply).toHaveBeenCalledWith('sections.body.items[0]', [
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['box', 'y'], value: 25 },
    ]);
  });

  it('bypasses the guide when Alt is held', () => {
    const manipulate = wiring(ABS_DOC);
    commitDrag(
      context(manipulate, ABS_BOXES),
      { mode: 'move', path: 'sections.body.items[0]', startX: 0, startY: 0 },
      { x: 0, y: 20, alt: true },
      vi.fn(),
    );
    expect(manipulate.onApply).toHaveBeenCalledWith('sections.body.items[0]', [
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['box', 'y'], value: 20 },
    ]);
  });

  it('dispatches the moveItem a reorder drop realizes', () => {
    const manipulate = wiring(FLOW_DOC);
    commitDrag(
      context(manipulate, FLOW_BOXES),
      { mode: 'reorder', path: 'sections.body.items[0]' },
      { x: 0, y: 200 },
      vi.fn(),
    );
    expect(manipulate.onReorder).toHaveBeenCalledWith(
      [{ op: 'moveItem', path: 'sections.body.items', from: 0, to: 2 }],
      'sections.body.items[2]',
    );
  });

  it('commits a CROSS-PARENT drop as the shared reparent batch', () => {
    const manipulate = wiring(NEST_DOC);
    commitDrag(
      context(manipulate, NEST_BOXES),
      { mode: 'reorder', path: 'sections.body.items[0]' },
      { x: 50, y: 90 },
      vi.fn(),
    );
    expect(manipulate.onReorder).toHaveBeenCalledWith(
      [
        {
          op: 'moveItem',
          path: 'sections.body.items',
          from: 0,
          to: 1,
          toPath: 'sections.body.items[1].items',
        },
      ],
      // Lifting items[0] out drops the container to items[0], so the moved
      // item lands there — not at the pre-move spelling items[1].
      'sections.body.items[0].items[1]',
    );
  });

  it('never turns a RESIZE into a reparent, however far the handle travels', () => {
    // A resize's pointer is a HANDLE, and leaving the item's own box is what
    // resizing looks like — so the owner under it says nothing about where the
    // item belongs. Here the south handle is dragged down into the container
    // below; the release must still be a resize.
    const manipulate = wiring({ ...NEST_DOC, 'sections.body': { type: 'absolute' } });
    commitDrag(
      context(manipulate, NEST_BOXES),
      { mode: 'resize', path: 'sections.body.items[0]', handle: 's', startX: 50, startY: 30 },
      { x: 50, y: 90 },
      vi.fn(),
    );
    expect(manipulate.onReorder).not.toHaveBeenCalled();
    expect(manipulate.onApply).toHaveBeenCalledWith('sections.body.items[0]', [
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['box', 'h'], value: 90 },
    ]);
  });

  it('treats a reorder back onto its own slot as a click', () => {
    const manipulate = wiring(FLOW_DOC);
    const onSelect = vi.fn();
    commitDrag(
      context(manipulate, FLOW_BOXES),
      { mode: 'reorder', path: 'sections.body.items[0]' },
      { x: 0, y: 1 },
      onSelect,
    );
    expect(manipulate.onReorder).not.toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith('sections.body.items[0]');
  });
});
