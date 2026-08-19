import type { ReadFn } from '@shojiku/designer-core';
import { describe, expect, it, vi } from 'vitest';
import type { PlacedBox } from '../engine/types';
import type { CanvasManipulate, DragTask, OverlayDragContext } from './overlayDragModel';
import { dragVisual, NO_DRAG_VISUAL } from './overlayDragVisual';
import type { DragPoint, DragSession } from './useDrag';

const docRead =
  (entries: Record<string, unknown>): ReadFn =>
  (path) =>
    entries[path];

const placed = (path: string, x: number, y: number, w: number, h: number): PlacedBox => ({
  path,
  border: { x, y, w, h },
  content: { x, y, w, h },
});

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

// A flow body whose second item is a container — the cross-parent destination.
const NEST_DOC = {
  'sections.body': { type: 'flow', items: [{}, {}] },
  'sections.body.items[0]': { type: 'rect', box: { x: 0, y: 0, w: 100, h: 30 } },
  'sections.body.items[1]': { type: 'container', items: [{}] },
  'sections.body.items[1].items': [{}],
  'sections.body.items[1].items[0]': { type: 'text', text: 'inner' },
};
const NEST_BOXES = [
  placed('sections.body.items[0]', 0, 0, 100, 30),
  placed('sections.body.items[1]', 0, 40, 100, 60),
  placed('sections.body.items[1].items[0]', 5, 45, 90, 20),
];

function wiring(doc: Record<string, unknown>): CanvasManipulate {
  return { read: docRead(doc), onReorder: vi.fn(), onApply: vi.fn(), onRefused: vi.fn(), grid: 0 };
}

function context(doc: Record<string, unknown>, boxes: readonly PlacedBox[]): OverlayDragContext {
  return {
    svgRef: { current: null },
    boxes,
    scale: 1,
    width: 100,
    page: { width: 100, height: 200 },
    margin: null,
    manipulate: wiring(doc),
  };
}

function session(payload: DragTask, start: DragPoint, point: DragPoint): DragSession<DragTask> {
  return { payload, pointerId: 1, start, point, started: true };
}

describe('dragVisual', () => {
  it('paints nothing for a refused gesture', () => {
    expect(
      dragVisual(
        context(ABS_DOC, ABS_BOXES),
        session({ mode: 'refused', reason: 'grid' }, { x: 0, y: 0 }, { x: 0, y: 20 }),
      ),
    ).toBe(NO_DRAG_VISUAL);
  });

  it('reports the ghost of a live move', () => {
    const visual = dragVisual(
      context(SOLO_DOC, SOLO_BOXES),
      session(
        { mode: 'move', path: 'sections.body.items[0]', startX: 0, startY: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 20 },
      ),
    );
    expect(visual.dragPath).toBe('sections.body.items[0]');
    expect(visual.ghost).toEqual({ x: 0, y: 20, w: 100, h: 30 });
    expect(visual.indicator).toBeNull();
  });

  it('reports the ghost of a live resize', () => {
    const visual = dragVisual(
      context(SOLO_DOC, SOLO_BOXES),
      session(
        { mode: 'resize', path: 'sections.body.items[0]', handle: 's', startX: 0, startY: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 10 },
      ),
    );
    expect(visual.dragPath).toBe('sections.body.items[0]');
    expect(visual.ghost).toEqual({ x: 0, y: 0, w: 100, h: 40 });
  });

  it('reports the winning alignment guide of a live move', () => {
    // The dragged bottom edge lands within threshold of items[1]'s centre.
    const visual = dragVisual(
      context(ABS_DOC, ABS_BOXES),
      session(
        { mode: 'move', path: 'sections.body.items[0]', startX: 0, startY: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 20 },
      ),
    );
    expect(visual.ghost).toEqual({ x: 0, y: 25, w: 100, h: 30 });
    // Both axes report a guide: the two boxes are already x-aligned (0..100),
    // so the horizontal guide holds at offset 0 while the vertical one pulls.
    expect(visual.guides).toHaveLength(2);
  });

  it('degrades to a visual no-op when the dragged box stopped being movable', () => {
    // A mid-drag edit that removed the item: the model must paint nothing
    // rather than carry the geometry it captured at press.
    const ctx = context({ 'sections.body': { type: 'absolute' } }, ABS_BOXES);
    expect(
      dragVisual(
        ctx,
        session(
          { mode: 'move', path: 'sections.body.items[0]', startX: 0, startY: 0 },
          { x: 0, y: 0 },
          { x: 0, y: 20 },
        ),
      ),
    ).toBe(NO_DRAG_VISUAL);
  });

  it('reports the insertion line and a pointer-following ghost for a reorder', () => {
    const visual = dragVisual(
      context(FLOW_DOC, FLOW_BOXES),
      session({ mode: 'reorder', path: 'sections.body.items[0]' }, { x: 0, y: 0 }, { x: 0, y: 50 }),
    );
    expect(visual.dragPath).toBe('sections.body.items[0]');
    expect(visual.indicator).not.toBeNull();
    // The ghost is the dragged box's own rect, offset by the pointer travel.
    expect(visual.ghost).toEqual({ x: 0, y: 50, w: 100, h: 30 });
    expect(visual.guides).toEqual([]);
  });

  it('paints nothing when the dragged box has no rect on this page', () => {
    expect(
      dragVisual(
        context(ABS_DOC, []),
        session(
          { mode: 'move', path: 'sections.body.items[0]', startX: 0, startY: 0 },
          { x: 0, y: 0 },
          { x: 10, y: 10 },
        ),
      ),
    ).toBe(NO_DRAG_VISUAL);
  });

  it('outlines the receiving owner when a MOVE drag enters another parent', () => {
    const visual = dragVisual(
      context({ ...NEST_DOC, 'sections.body': { type: 'absolute' } }, NEST_BOXES),
      session(
        { mode: 'move', path: 'sections.body.items[0]', startX: 0, startY: 0 },
        { x: 0, y: 0 },
        { x: 50, y: 90 },
      ),
    );
    expect(visual.region).toEqual({ x: 0, y: 40, w: 100, h: 60 });
    expect(visual.indicator).not.toBeNull();
    expect(visual.ghost).toEqual({ x: 50, y: 90, w: 100, h: 30 });
  });

  it('paints nothing when a reorder no longer resolves to a drop plan', () => {
    // Duplicated sibling geometry (repeat fragments): slot math would lie.
    const ctx = context(FLOW_DOC, [
      ...FLOW_BOXES,
      placed('sections.body.items[1]', 0, 40, 100, 30),
    ]);
    expect(
      dragVisual(
        ctx,
        session(
          { mode: 'reorder', path: 'sections.body.items[0]' },
          { x: 0, y: 0 },
          { x: 0, y: 50 },
        ),
      ),
    ).toBe(NO_DRAG_VISUAL);
  });
});
