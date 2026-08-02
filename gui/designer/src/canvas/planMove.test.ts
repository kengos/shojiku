import type { ReadFn } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import type { PlacedBox } from '../engine/types';
import { nudgeOps, planMove } from './planMove';

/** A read function over exact-path entries (unknown paths read undefined —
 * the materializer's miss shape). */
const docRead =
  (entries: Record<string, unknown>): ReadFn =>
  (path) =>
    entries[path];

const MM = 72 / 25.4;

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

describe('planMove', () => {
  const read = docRead(ABS_DOC);

  it('commits only the changed axis, rounded', () => {
    const plan = planMove(read, ABS_BOXES, 'sections.body.items[0]', { x: 0, y: 120 }, NO_SNAP);
    expect(plan).not.toBeNull();
    expect(plan?.ops).toEqual([
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['box', 'y'], value: 120 },
    ]);
    expect(plan?.ghost).toEqual({ x: 0, y: 120, w: 100, h: 30 });
    expect(plan?.guides).toEqual([]);
  });

  it('quantizes to the grid in authored space', () => {
    const plan = planMove(
      read,
      ABS_BOXES,
      'sections.body.items[0]',
      { x: 0, y: 121.5 },
      { grid: 4, threshold: 0, bypass: false },
    );
    expect(plan?.ops).toEqual([
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['box', 'y'], value: 120 },
    ]);
  });

  it('bypasses all snapping while Alt is held', () => {
    const plan = planMove(
      read,
      ABS_BOXES,
      'sections.body.items[0]',
      { x: 0, y: 121.5 },
      { grid: 4, threshold: 10, bypass: true },
    );
    expect(plan?.ops).toEqual([
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['box', 'y'], value: 121.5 },
    ]);
    expect(plan?.guides).toEqual([]);
  });

  it('lets a sibling alignment guide win over the grid', () => {
    // Proposed top edge 108.5; items[2]'s bottom edge is 110 (within 3).
    const plan = planMove(
      read,
      ABS_BOXES,
      'sections.body.items[0]',
      { x: 0, y: 108.5 },
      { grid: 4, threshold: 3, bypass: false },
    );
    expect(plan?.ops).toEqual([
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['box', 'y'], value: 110 },
    ]);
    // TWO guides: the y snap at 110 plus the exact x alignment (offset 0).
    expect(plan?.guides).toHaveLength(2);
    const horizontal = plan?.guides.find((g) => g.y1 === g.y2);
    expect(horizontal?.y1).toBe(110);
  });

  it('commits mm-authored positions in mm at 1dp', () => {
    const mmRead = docRead({
      'sections.body': { type: 'absolute' },
      'sections.body.items[0]': {
        type: 'rect',
        box: { x: '10mm', y: '20mm', w: '90mm', h: '14mm' },
      },
    });
    const boxes = [placed('sections.body.items[0]', 10 * MM, 20 * MM, 90 * MM, 14 * MM)];
    const plan = planMove(mmRead, boxes, 'sections.body.items[0]', { x: 2 * MM, y: 0 }, NO_SNAP);
    expect(plan?.ops).toEqual([
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['box', 'x'], value: '12mm' },
    ]);
  });

  it('bases absent keys at 0 and authors both moved axes', () => {
    const bare = docRead({
      'sections.body': { type: 'absolute' },
      'sections.body.items[0]': { type: 'rect' },
    });
    const boxes = [placed('sections.body.items[0]', 0, 0, 50, 20)];
    const plan = planMove(bare, boxes, 'sections.body.items[0]', { x: 8, y: 6 }, NO_SNAP);
    expect(plan?.ops).toEqual([
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['box', 'x'], value: 8 },
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['box', 'y'], value: 6 },
    ]);
  });

  it('returns an empty batch for a zero-delta drop (no undo step)', () => {
    const plan = planMove(read, ABS_BOXES, 'sections.body.items[0]', { x: 0, y: 0 }, NO_SNAP);
    expect(plan?.ops).toEqual([]);
  });

  it('refuses invalid drags', () => {
    // Not movable (flow child).
    const flowRead = docRead({
      'sections.body': { type: 'flow' },
      'sections.body.items[0]': { type: 'text' },
    });
    expect(
      planMove(flowRead, ABS_BOXES, 'sections.body.items[0]', { x: 0, y: 5 }, NO_SNAP),
    ).toBeNull();
    // Non-finite pointer delta (either axis).
    expect(
      planMove(read, ABS_BOXES, 'sections.body.items[0]', { x: Number.NaN, y: 0 }, NO_SNAP),
    ).toBeNull();
    expect(
      planMove(read, ABS_BOXES, 'sections.body.items[0]', { x: 0, y: Number.NaN }, NO_SNAP),
    ).toBeNull();
    // Path absent from the page.
    expect(planMove(read, [], 'sections.body.items[0]', { x: 0, y: 5 }, NO_SNAP)).toBeNull();
    // Duplicated path (ambiguous geometry).
    const dup = [ABS_BOXES[0], ABS_BOXES[0]];
    expect(planMove(read, dup, 'sections.body.items[0]', { x: 0, y: 5 }, NO_SNAP)).toBeNull();
  });

  it('skips guides when sibling geometry is ambiguous (duplicated indices)', () => {
    // The dragged box is unique but a sibling index appears twice (repeat
    // fragments): guides are skipped, the move itself still plans.
    const boxes = [ABS_BOXES[0], ABS_BOXES[1], ABS_BOXES[1]];
    const plan = planMove(
      read,
      boxes,
      'sections.body.items[0]',
      { x: 0, y: 108.5 },
      { grid: 0, threshold: 3, bypass: false },
    );
    expect(plan).not.toBeNull();
    expect(plan?.guides).toEqual([]);
    expect(plan?.ops).toEqual([
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['box', 'y'], value: 108.5 },
    ]);
  });

  it('refuses a drag whose committed value would overflow', () => {
    const hugeRead = docRead({
      'sections.body': { type: 'absolute' },
      'sections.body.items[0]': { type: 'rect', box: { x: Number.MAX_VALUE, y: 0, w: 10, h: 10 } },
    });
    const boxes = [placed('sections.body.items[0]', 0, 0, 10, 10)];
    expect(planMove(hugeRead, boxes, 'sections.body.items[0]', { x: 5, y: 0 }, NO_SNAP)).toBeNull();
  });

  it('survives a document swapped mid-drag (read throws)', () => {
    let calls = 0;
    const flaky: ReadFn = (path) => {
      calls += 1;
      if (calls > 1) {
        throw new Error('swapped');
      }
      return (ABS_DOC as Record<string, unknown>)[path];
    };
    expect(
      planMove(flaky, ABS_BOXES, 'sections.body.items[0]', { x: 0, y: 5 }, NO_SNAP),
    ).toBeNull();
  });

  it('axis-locks to x when x dominates, pinning y at its base', () => {
    const plan = planMove(
      read,
      ABS_BOXES,
      'sections.body.items[0]',
      { x: 12, y: 5 },
      { grid: 0, threshold: 0, bypass: false, axisLock: true },
    );
    expect(plan?.ops).toEqual([
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['box', 'x'], value: 12 },
    ]);
    expect(plan?.ghost).toEqual({ x: 12, y: 0, w: 100, h: 30 });
  });

  it('axis-locks to y when y dominates, pinning x at its base', () => {
    const plan = planMove(
      read,
      ABS_BOXES,
      'sections.body.items[0]',
      { x: 5, y: 12 },
      { grid: 0, threshold: 0, bypass: false, axisLock: true },
    );
    expect(plan?.ops).toEqual([
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['box', 'y'], value: 12 },
    ]);
  });

  it('keeps x on an exact diagonal tie (deterministic)', () => {
    const plan = planMove(
      read,
      ABS_BOXES,
      'sections.body.items[0]',
      { x: 7, y: 7 },
      { grid: 0, threshold: 0, bypass: false, axisLock: true },
    );
    expect(plan?.ops).toEqual([
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['box', 'x'], value: 7 },
    ]);
  });

  it('still grid-snaps the kept axis under axis-lock', () => {
    const plan = planMove(
      read,
      ABS_BOXES,
      'sections.body.items[0]',
      { x: 13.5, y: 2 },
      { grid: 4, threshold: 0, bypass: false, axisLock: true },
    );
    // x dominates → kept and snapped to 12; y locked at its base (no op).
    expect(plan?.ops).toEqual([
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['box', 'x'], value: 12 },
    ]);
  });

  it('lets Alt bypass the kept axis snap while Shift still locks the minor axis', () => {
    const plan = planMove(
      read,
      ABS_BOXES,
      'sections.body.items[0]',
      { x: 13.5, y: 3 },
      { grid: 4, threshold: 0, bypass: true, axisLock: true },
    );
    // Alt bypass → x not grid-snapped (13.5); Shift lock → y pinned (no op).
    expect(plan?.ops).toEqual([
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['box', 'x'], value: 13.5 },
    ]);
  });
});

describe('nudgeOps', () => {
  const read = docRead(ABS_DOC);

  it('commits only the moved axis', () => {
    expect(nudgeOps(read, 'sections.body.items[0]', 4, 0)).toEqual([
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['box', 'x'], value: 4 },
    ]);
    expect(nudgeOps(read, 'sections.body.items[1]', 0, -4)).toEqual([
      { op: 'setScalar', path: 'sections.body.items[1]', keys: ['box', 'y'], value: 36 },
    ]);
  });

  it('keeps the authored unit', () => {
    const mmRead = docRead({
      'sections.body': { type: 'absolute' },
      'sections.body.items[0]': { type: 'rect', box: { x: '10mm', y: '20mm' } },
    });
    expect(nudgeOps(mmRead, 'sections.body.items[0]', 2 * MM, 0)).toEqual([
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['box', 'x'], value: '12mm' },
    ]);
  });

  it('returns an empty batch for a zero nudge', () => {
    expect(nudgeOps(read, 'sections.body.items[0]', 0, 0)).toEqual([]);
  });

  it('refuses a nudge whose committed value would overflow', () => {
    const hugeRead = docRead({
      'sections.body': { type: 'absolute' },
      'sections.body.items[0]': { type: 'rect', box: { x: Number.MAX_VALUE, y: 0, w: 10, h: 10 } },
    });
    expect(nudgeOps(hugeRead, 'sections.body.items[0]', 5, 0)).toBeNull();
  });

  it('refuses non-movable targets and hostile deltas', () => {
    const flowRead = docRead({
      'sections.body': { type: 'flow' },
      'sections.body.items[0]': { type: 'text' },
    });
    expect(nudgeOps(flowRead, 'sections.body.items[0]', 4, 0)).toBeNull();
    expect(nudgeOps(read, 'sections.body.items[0]', Number.NaN, 0)).toBeNull();
    expect(nudgeOps(read, 'sections.body.items[0]', 0, Number.NaN)).toBeNull();
    const bomb: ReadFn = () => {
      throw new Error('bomb');
    };
    expect(nudgeOps(bomb, 'sections.body.items[0]', 4, 0)).toBeNull();
  });
});
