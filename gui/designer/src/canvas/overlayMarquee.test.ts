// Tests for overlayMarquee.ts — the rubber-band release, which selects and
// never edits.
import type { ReadFn } from '@shojiku/designer-core';
import { describe, expect, it, vi } from 'vitest';
import type { PlacedBox } from '../engine/types';
import type { CanvasManipulate, OverlayDragContext } from './overlayDragModel';
import { commitMarquee } from './overlayMarquee';

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

function wiring(doc: Record<string, unknown>): CanvasManipulate {
  return { read: docRead(doc), onReorder: vi.fn(), onApply: vi.fn(), onRefused: vi.fn(), grid: 0 };
}

function context(manipulate: CanvasManipulate, boxes: readonly PlacedBox[]): OverlayDragContext {
  return {
    svgRef: { current: null },
    boxes,
    scale: 1,
    width: 100,
    page: { width: 100, height: 200 },
    margin: null,
    manipulate,
  };
}

describe('commitMarquee', () => {
  it('reports the movable items the swept rect intersects, with the additive flag', () => {
    const onMarquee = vi.fn();
    commitMarquee(
      context(wiring(ABS_DOC), ABS_BOXES),
      { startX: -5, startY: -5, additive: true },
      { x: 200, y: 200 },
      onMarquee,
    );
    expect(onMarquee).toHaveBeenCalledWith(
      ['sections.body.items[0]', 'sections.body.items[1]'],
      true,
    );
  });

  it('reports an empty selection when the band misses every box', () => {
    const onMarquee = vi.fn();
    commitMarquee(
      context(wiring(ABS_DOC), ABS_BOXES),
      { startX: 500, startY: 500, additive: false },
      { x: 600, y: 600 },
      onMarquee,
    );
    expect(onMarquee).toHaveBeenCalledWith([], false);
  });
});
