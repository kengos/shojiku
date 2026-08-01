import { describe, expect, it } from 'vitest';
import type { BoxRect, PlacedBox } from '../engine/types';
import {
  arrowDelta,
  boxCursor,
  byDepth,
  clientDeltaToPt,
  clientToPagePt,
  groupBounds,
  handleCenter,
  pathDepth,
} from './overlayGeometry';

/** A box at the given rect — only `path`/`border` matter to this module. */
function box(path: string, rect: BoxRect): PlacedBox {
  return { path, border: rect, content: rect };
}

/** An element whose bounding rect the coordinate conversions read. */
function measurable(left: number, top: number, width: number) {
  return { getBoundingClientRect: () => ({ left, top, width }) };
}

describe('pathDepth', () => {
  it('counts `.` and `[` as segment separators', () => {
    expect(pathDepth('sections')).toBe(0);
    expect(pathDepth('sections.body')).toBe(1);
    expect(pathDepth('sections.body.items[0]')).toBe(3);
    expect(pathDepth('sections.body.items[0].cell')).toBe(4);
  });
});

describe('byDepth', () => {
  it('orders a parent before its child so the child paints on top', () => {
    const parent = box('sections.body.items[0]', { x: 0, y: 0, w: 100, h: 100 });
    const child = box('sections.body.items[0].cell', { x: 0, y: 0, w: 50, h: 50 });
    // Engine walk order can emit the covering container LAST.
    expect(byDepth([child, parent]).map((b) => b.path)).toEqual([parent.path, child.path]);
  });

  it('keeps same-depth boxes in their original walk order (stable sort)', () => {
    const first = box('sections.body.items[0]', { x: 0, y: 0, w: 10, h: 10 });
    const second = box('sections.body.items[1]', { x: 0, y: 20, w: 10, h: 10 });
    const third = box('sections.body.items[2]', { x: 0, y: 40, w: 10, h: 10 });
    expect(byDepth([third, first, second]).map((b) => b.path)).toEqual([
      third.path,
      first.path,
      second.path,
    ]);
  });

  it('leaves an empty list empty', () => {
    expect(byDepth([])).toEqual([]);
  });
});

describe('clientToPagePt', () => {
  it('divides by the scale when there is no element to measure', () => {
    expect(clientToPagePt(null, 100, 2, { x: 20, y: 40 })).toEqual({ x: 10, y: 20 });
  });

  it('factors out the live rect ratio (the zoom transform) and the scale', () => {
    // 100pt of page drawn into a 200px-wide rect at scale 2 → ratio 0.5.
    expect(clientToPagePt(measurable(10, 20, 200), 100, 2, { x: 210, y: 220 })).toEqual({
      x: 50,
      y: 50,
    });
  });

  it('falls back to ratio 1 for an unmeasurable rect (jsdom)', () => {
    expect(clientToPagePt(measurable(0, 0, 0), 100, 1, { x: 7, y: 9 })).toEqual({ x: 7, y: 9 });
  });
});

describe('clientDeltaToPt', () => {
  it('re-expresses a client delta in page pt, dropping the origin offset', () => {
    expect(
      clientDeltaToPt(measurable(50, 60, 200), 100, 2, { x: 100, y: 100 }, { x: 140, y: 180 }),
    ).toEqual({ x: 10, y: 20 });
  });
});

describe('handleCenter', () => {
  const rect: BoxRect = { x: 10, y: 20, w: 100, h: 40 };

  it('pins a corner handle to that corner', () => {
    expect(handleCenter('nw', rect)).toEqual({ cx: 10, cy: 20 });
    expect(handleCenter('se', rect)).toEqual({ cx: 110, cy: 60 });
    expect(handleCenter('ne', rect)).toEqual({ cx: 110, cy: 20 });
    expect(handleCenter('sw', rect)).toEqual({ cx: 10, cy: 60 });
  });

  it('centers an edge handle on its edge', () => {
    expect(handleCenter('n', rect)).toEqual({ cx: 60, cy: 20 });
    expect(handleCenter('s', rect)).toEqual({ cx: 60, cy: 60 });
    expect(handleCenter('w', rect)).toEqual({ cx: 10, cy: 40 });
    expect(handleCenter('e', rect)).toEqual({ cx: 110, cy: 40 });
  });
});

describe('boxCursor', () => {
  it('shows the select cursor on an unselected box', () => {
    expect(boxCursor(false, { kind: 'move' })).toBe('pointer');
  });

  it('shows the select cursor when the ability is unknown', () => {
    expect(boxCursor(true, null)).toBe('pointer');
  });

  it('says what a drag on the selected box would do', () => {
    expect(boxCursor(true, { kind: 'move' })).toBe('move');
    expect(boxCursor(true, { kind: 'reorder' })).toBe('grab');
    expect(boxCursor(true, { kind: 'fixed' })).toBe('default');
  });
});

describe('arrowDelta', () => {
  it('maps each arrow key to a one-step delta', () => {
    expect(arrowDelta('ArrowLeft', 4)).toEqual({ dx: -4, dy: 0 });
    expect(arrowDelta('ArrowRight', 4)).toEqual({ dx: 4, dy: 0 });
    expect(arrowDelta('ArrowUp', 4)).toEqual({ dx: 0, dy: -4 });
    expect(arrowDelta('ArrowDown', 4)).toEqual({ dx: 0, dy: 4 });
  });
});

describe('groupBounds', () => {
  const a = box('sections.body.items[0]', { x: 10, y: 10, w: 20, h: 20 });
  const b = box('sections.body.items[1]', { x: 50, y: 60, w: 30, h: 10 });
  const boxes = [a, b];

  it('is absent when nothing is selected', () => {
    expect(groupBounds(boxes, new Set(), null, false, 1)).toBeNull();
  });

  it('is absent for a single selected path (the box stroke already shows it)', () => {
    expect(groupBounds(boxes, new Set(), a.path, true, 1)).toBeNull();
    expect(groupBounds(boxes, new Set([a.path]), null, false, 1)).toBeNull();
  });

  it('unions the multi-set with the movable primary, at the given scale', () => {
    expect(groupBounds(boxes, new Set([b.path]), a.path, true, 2)).toEqual({
      x: 20,
      y: 20,
      w: 140,
      h: 120,
    });
  });

  it('excludes a primary that is not movable', () => {
    // Only `b` is in the group → one path → no frame.
    expect(groupBounds(boxes, new Set([b.path]), a.path, false, 1)).toBeNull();
  });

  it('unions repeat fragments sharing one path as a single member', () => {
    const twin = box(b.path, { x: 90, y: 60, w: 10, h: 10 });
    // Two rects, ONE distinct path beyond the primary → still a 2-path group.
    expect(groupBounds([a, b, twin], new Set([b.path]), a.path, true, 1)).toEqual({
      x: 10,
      y: 10,
      w: 90,
      h: 60,
    });
  });
});
