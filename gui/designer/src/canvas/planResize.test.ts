import type { ReadFn } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import type { PlacedBox } from '../engine/types';
import { MIN_SIZE_PT } from './plan';
import { planResize } from './planResize';

/** A read function over exact-path entries (unknown paths read undefined —
 * the materializer's miss shape). */
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
  'sections.body.items[2]': { type: 'rect', box: { x: 0, y: 80, w: 100, h: 30 } },
};

const ABS_BOXES = [
  placed('sections.body.items[0]', 0, 0, 100, 30),
  placed('sections.body.items[1]', 0, 40, 100, 30),
  placed('sections.body.items[2]', 0, 80, 100, 30),
];

const NO_SNAP = { grid: 0, threshold: 0, bypass: false };

describe('planResize', () => {
  const read = docRead(ABS_DOC);

  it('grows width and height from the se corner', () => {
    const plan = planResize(
      read,
      ABS_BOXES,
      'sections.body.items[0]',
      'se',
      { x: 20, y: 10 },
      NO_SNAP,
    );
    expect(plan?.ops).toEqual([
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['box', 'w'], value: 120 },
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['box', 'h'], value: 40 },
    ]);
    expect(plan?.ghost).toEqual({ x: 0, y: 0, w: 120, h: 40 });
  });

  it('moves position and compensates size from the west edge', () => {
    const plan = planResize(
      read,
      ABS_BOXES,
      'sections.body.items[0]',
      'w',
      { x: -10, y: 0 },
      NO_SNAP,
    );
    expect(plan?.ops).toEqual([
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['box', 'x'], value: -10 },
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['box', 'w'], value: 110 },
    ]);
  });

  it('clamps at the minimum size instead of collapsing', () => {
    const plan = planResize(
      read,
      ABS_BOXES,
      'sections.body.items[0]',
      'w',
      { x: 150, y: 0 },
      NO_SNAP,
    );
    expect(plan?.ops).toEqual([
      {
        op: 'setScalar',
        path: 'sections.body.items[0]',
        keys: ['box', 'x'],
        value: 100 - MIN_SIZE_PT,
      },
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['box', 'w'], value: MIN_SIZE_PT },
    ]);
  });

  it('resizes the north edge (y + h)', () => {
    const plan = planResize(
      read,
      ABS_BOXES,
      'sections.body.items[1]',
      'n',
      { x: 0, y: -8 },
      NO_SNAP,
    );
    expect(plan?.ops).toEqual([
      { op: 'setScalar', path: 'sections.body.items[1]', keys: ['box', 'y'], value: 32 },
      { op: 'setScalar', path: 'sections.body.items[1]', keys: ['box', 'h'], value: 38 },
    ]);
  });

  it('grid-snaps the resized extent', () => {
    const plan = planResize(
      read,
      ABS_BOXES,
      'sections.body.items[0]',
      'e',
      { x: 21.7, y: 0 },
      { grid: 4, threshold: 0, bypass: false },
    );
    expect(plan?.ops).toEqual([
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['box', 'w'], value: 120 },
    ]);
  });

  it('guide-snaps the moving edge to a sibling edge', () => {
    // items[1] spans y 40..70; drag items[0]'s south edge from 30 toward 40.
    const plan = planResize(
      read,
      ABS_BOXES,
      'sections.body.items[0]',
      's',
      { x: 0, y: 8.5 },
      { grid: 0, threshold: 3, bypass: false },
    );
    expect(plan?.ops).toEqual([
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['box', 'h'], value: 40 },
    ]);
    expect(plan?.guides).toHaveLength(1);
  });

  it('authors w/h for an auto-sized box from its resolved extent', () => {
    const bare = docRead({
      'sections.body': { type: 'absolute' },
      'sections.body.items[0]': { type: 'rect' },
    });
    const boxes = [placed('sections.body.items[0]', 0, 0, 50, 20)];
    const plan = planResize(bare, boxes, 'sections.body.items[0]', 'se', { x: 10, y: 5 }, NO_SNAP);
    expect(plan?.ops).toEqual([
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['box', 'w'], value: 60 },
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['box', 'h'], value: 25 },
    ]);
  });

  it('refuses a resize on a non-movable box and a mid-drag document swap', () => {
    const flowRead = docRead({
      'sections.body': { type: 'flow' },
      'sections.body.items[0]': { type: 'text' },
    });
    expect(
      planResize(flowRead, ABS_BOXES, 'sections.body.items[0]', 'se', { x: 5, y: 0 }, NO_SNAP),
    ).toBeNull();
    let calls = 0;
    const flaky: ReadFn = (path) => {
      calls += 1;
      if (calls > 2) {
        throw new Error('swapped');
      }
      return (ABS_DOC as Record<string, unknown>)[path];
    };
    expect(
      planResize(flaky, ABS_BOXES, 'sections.body.items[0]', 'se', { x: 5, y: 0 }, NO_SNAP),
    ).toBeNull();
  });

  it('refuses a handle touching a relative-authored key and hostile input', () => {
    const pctRead = docRead({
      'sections.body': { type: 'absolute' },
      'sections.body.items[0]': { type: 'text', box: { x: 0, y: 18, w: '100%', h: 16 } },
    });
    const boxes = [placed('sections.body.items[0]', 0, 18, 500, 16)];
    expect(
      planResize(pctRead, boxes, 'sections.body.items[0]', 'e', { x: 5, y: 0 }, NO_SNAP),
    ).toBeNull();
    expect(
      planResize(read, ABS_BOXES, 'sections.body.items[0]', 'se', { x: Number.NaN, y: 0 }, NO_SNAP),
    ).toBeNull();
    expect(
      planResize(read, ABS_BOXES, 'sections.body.items[0]', 'se', { x: 0, y: Number.NaN }, NO_SNAP),
    ).toBeNull();
    expect(
      planResize(read, [], 'sections.body.items[0]', 'se', { x: 5, y: 0 }, NO_SNAP),
    ).toBeNull();
  });

  it('resizes the untouched-relative axis: an n/s handle works on a "100%" width', () => {
    const pctRead = docRead({
      'sections.body': { type: 'absolute' },
      'sections.body.items[0]': { type: 'text', box: { x: 0, y: 18, w: '100%', h: 16 } },
    });
    const boxes = [placed('sections.body.items[0]', 0, 18, 500, 16)];
    const plan = planResize(pctRead, boxes, 'sections.body.items[0]', 's', { x: 0, y: 4 }, NO_SNAP);
    expect(plan?.ops).toEqual([
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['box', 'h'], value: 20 },
    ]);
  });

  it('refuses a resize whose committed value would overflow', () => {
    const hugeRead = docRead({
      'sections.body': { type: 'absolute' },
      'sections.body.items[0]': {
        type: 'rect',
        box: { x: 0, y: 0, w: Number.MAX_VALUE, h: 10 },
      },
    });
    const boxes = [placed('sections.body.items[0]', 0, 0, 10, 10)];
    expect(
      planResize(hugeRead, boxes, 'sections.body.items[0]', 'e', { x: 5, y: 0 }, NO_SNAP),
    ).toBeNull();
  });

  it('guide-snaps a horizontal edge and reports the vertical guide line', () => {
    // items[0]'s right edge starts at 100; siblings' right edges are 100 too,
    // so a small pull snaps back and the plan is a guide-only no-op.
    const plan = planResize(
      read,
      ABS_BOXES,
      'sections.body.items[0]',
      'e',
      { x: 1.5, y: 0 },
      { grid: 0, threshold: 3, bypass: false },
    );
    expect(plan?.ops).toEqual([]);
    expect(plan?.guides).toHaveLength(1);
    expect(plan?.guides[0]?.x1).toBe(100);
    expect(plan?.guides[0]?.x2).toBe(100);
  });

  it('bypasses resize snapping while Alt is held', () => {
    const plan = planResize(
      read,
      ABS_BOXES,
      'sections.body.items[0]',
      'e',
      { x: 21.7, y: 0 },
      { grid: 4, threshold: 3, bypass: true },
    );
    expect(plan?.ops).toEqual([
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['box', 'w'], value: 121.7 },
    ]);
    expect(plan?.guides).toEqual([]);
  });

  it('guide-snaps a leading edge (n handle) to a sibling edge', () => {
    // items[1]'s top edge (40) pulled toward items[0]'s bottom edge (30).
    const plan = planResize(
      read,
      ABS_BOXES,
      'sections.body.items[1]',
      'n',
      { x: 0, y: -8.5 },
      { grid: 0, threshold: 3, bypass: false },
    );
    expect(plan?.ops).toEqual([
      { op: 'setScalar', path: 'sections.body.items[1]', keys: ['box', 'y'], value: 30 },
      { op: 'setScalar', path: 'sections.body.items[1]', keys: ['box', 'h'], value: 40 },
    ]);
    expect(plan?.guides).toHaveLength(1);
  });

  it('emits an empty batch when nothing changed', () => {
    const plan = planResize(
      read,
      ABS_BOXES,
      'sections.body.items[0]',
      'se',
      { x: 0, y: 0 },
      NO_SNAP,
    );
    expect(plan?.ops).toEqual([]);
  });
});
