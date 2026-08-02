import type { ReadFn } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import type { PlacedBox } from '../engine/types';
import { marqueeRect, marqueeSelection, rectsOverlap } from './marquee';

const docRead =
  (entries: Record<string, unknown>): ReadFn =>
  (path) =>
    entries[path];

const placed = (path: string, x: number, y: number, w: number, h: number): PlacedBox => ({
  path,
  border: { x, y, w, h },
  content: { x, y, w, h },
});

describe('marqueeRect', () => {
  it('normalizes two points to a top-left rect regardless of drag direction', () => {
    expect(marqueeRect({ x: 30, y: 40 }, { x: 10, y: 5 })).toEqual({ x: 10, y: 5, w: 20, h: 35 });
    expect(marqueeRect({ x: 10, y: 5 }, { x: 30, y: 40 })).toEqual({ x: 10, y: 5, w: 20, h: 35 });
  });
});

describe('rectsOverlap', () => {
  const base = { x: 10, y: 10, w: 20, h: 20 };

  it('overlaps when the areas intersect', () => {
    expect(rectsOverlap(base, { x: 20, y: 20, w: 20, h: 20 })).toBe(true);
  });

  it('does not overlap when separated or merely edge-touching', () => {
    expect(rectsOverlap(base, { x: 40, y: 10, w: 5, h: 5 })).toBe(false);
    expect(rectsOverlap(base, { x: 30, y: 10, w: 5, h: 5 })).toBe(false); // shares the x=30 edge
  });

  it('never overlaps a non-finite rect (a hostile inspect geometry)', () => {
    expect(rectsOverlap(base, { x: Number.NaN, y: 10, w: 20, h: 20 })).toBe(false);
    expect(rectsOverlap({ x: Number.POSITIVE_INFINITY, y: 0, w: 1, h: 1 }, base)).toBe(false);
  });
});

describe('marqueeSelection', () => {
  const DOC = {
    'sections.body': { type: 'absolute' },
    'sections.body.items[0]': { type: 'rect', box: { x: 0, y: 0, w: 40, h: 20 } },
    'sections.body.items[1]': { type: 'rect', box: { x: 200, y: 0, w: 40, h: 20 } },
    'sections.body.items[2]': { type: 'rect', box: { x: 0, y: 100, w: 40, h: 20 } },
  };
  const boxes = [
    placed('sections.body.items[0]', 0, 0, 40, 20),
    placed('sections.body.items[1]', 200, 0, 40, 20),
    placed('sections.body.items[2]', 0, 100, 40, 20),
  ];
  const read = docRead(DOC);

  it('selects the movable items the marquee intersects', () => {
    // A rect covering items 0 and 2 (left column), not item 1 (far right).
    const rect = marqueeRect({ x: 0, y: 0 }, { x: 60, y: 130 });
    expect(marqueeSelection(read, boxes, rect)).toEqual([
      'sections.body.items[0]',
      'sections.body.items[2]',
    ]);
  });

  it('excludes non-movable boxes (a container that intersects is skipped)', () => {
    const flowRead = docRead({
      'sections.body': { type: 'flow' },
      'sections.body.items[0]': { type: 'rect', box: { x: 0, y: 0, w: 40, h: 20 } },
    });
    const rect = marqueeRect({ x: 0, y: 0 }, { x: 300, y: 300 });
    // The flow child (box.x present) is flowPositioned = fixed → not selected.
    expect(marqueeSelection(flowRead, boxes, rect)).toEqual([]);
  });

  it('returns nothing for a marquee that touches no movable item', () => {
    const rect = marqueeRect({ x: 500, y: 500 }, { x: 520, y: 520 });
    expect(marqueeSelection(read, boxes, rect)).toEqual([]);
  });

  it('dedupes a movable path that appears twice on the page', () => {
    const dup = [...boxes, placed('sections.body.items[0]', 5, 5, 40, 20)];
    // manipulationFor still classifies items[0] as movable; the walk dedupes.
    const rect = marqueeRect({ x: 0, y: 0 }, { x: 60, y: 60 });
    expect(marqueeSelection(read, dup, rect)).toEqual(['sections.body.items[0]']);
  });
});
