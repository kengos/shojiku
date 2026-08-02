import type { ReadFn } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import type { PlacedBox } from '../engine/types';
import { alignOps, alignTargets, distributeOps, movableCount } from './align';

/** A read over exact-path entries (an unknown path reads undefined). */
const docRead =
  (entries: Record<string, unknown>): ReadFn =>
  (path) =>
    entries[path];

const placed = (path: string, x: number, y: number, w: number, h: number): PlacedBox => ({
  path,
  border: { x, y, w, h },
  content: { x, y, w, h },
});

// Three absolute body items at known positions (authored numbers = page pt).
const DOC = {
  'sections.body': { type: 'absolute' },
  'sections.body.items[0]': { type: 'rect', box: { x: 10, y: 10, w: 40, h: 20 } },
  'sections.body.items[1]': { type: 'rect', box: { x: 100, y: 50, w: 60, h: 20 } },
  'sections.body.items[2]': { type: 'rect', box: { x: 30, y: 100, w: 20, h: 20 } },
};
const A = 'sections.body.items[0]';
const B = 'sections.body.items[1]';
const C = 'sections.body.items[2]';
const BOXES = [placed(A, 10, 10, 40, 20), placed(B, 100, 50, 60, 20), placed(C, 30, 100, 20, 20)];
const ALL = [A, B, C];
const read = docRead(DOC);

const xOp = (path: string, value: number) => ({
  op: 'setScalar',
  path,
  keys: ['box', 'x'],
  value,
});
const yOp = (path: string, value: number) => ({
  op: 'setScalar',
  path,
  keys: ['box', 'y'],
  value,
});

describe('alignOps — horizontal', () => {
  it('aligns left edges to the group minimum, leaving the already-aligned item untouched', () => {
    // A sits at the minimum x=10, so it emits NO op (changed keys only — the
    // invariant, not the formula): only B and C move to x=10.
    expect(alignOps(read, BOXES, ALL, 'left')).toEqual([xOp(B, 10), xOp(C, 10)]);
  });

  it('aligns right edges to the group maximum (B already flush right emits nothing)', () => {
    // max right = B's 160; A→120, C→140, B unchanged.
    expect(alignOps(read, BOXES, ALL, 'right')).toEqual([xOp(A, 120), xOp(C, 140)]);
  });

  it('aligns horizontal centers to the group center', () => {
    // center = (10 + 160) / 2 = 85; newLeft = 85 − w/2.
    expect(alignOps(read, BOXES, ALL, 'centerX')).toEqual([xOp(A, 65), xOp(B, 55), xOp(C, 75)]);
  });
});

describe('alignOps — vertical', () => {
  it('aligns top edges to the group minimum (A already at the top)', () => {
    expect(alignOps(read, BOXES, ALL, 'top')).toEqual([yOp(B, 10), yOp(C, 10)]);
  });

  it('aligns bottom edges to the group maximum', () => {
    // max bottom = C's 120; A→100, B→100, C unchanged.
    expect(alignOps(read, BOXES, ALL, 'bottom')).toEqual([yOp(A, 100), yOp(B, 100)]);
  });

  it('aligns vertical centers to the group center', () => {
    // center = (10 + 120) / 2 = 65; newTop = 65 − h/2 = 55 for every h=20.
    expect(alignOps(read, BOXES, ALL, 'middle')).toEqual([yOp(A, 55), yOp(B, 55), yOp(C, 55)]);
  });
});

describe('alignOps — gating', () => {
  it('emits nothing for fewer than two movable targets', () => {
    expect(alignOps(read, BOXES, [A], 'left')).toEqual([]);
    expect(alignOps(read, BOXES, [], 'left')).toEqual([]);
  });
});

describe('distributeOps', () => {
  it('equalizes horizontal gaps, moving only the middle item', () => {
    // Sorted by x: A(10,w40) C(30,w20) B(100,w60). span=150, sizes=120,
    // gap=15 → C lands leading-edge at 65; A and B (the ends) stay put.
    expect(distributeOps(read, BOXES, ALL, 'horizontal')).toEqual([xOp(C, 65)]);
  });

  it('equalizes vertical gaps, moving only the middle item', () => {
    // Sorted by y: A(10,h20) B(50,h20) C(100,h20). span=110, sizes=60,
    // gap=25 → B lands at 55; A and C stay put.
    expect(distributeOps(read, BOXES, ALL, 'vertical')).toEqual([yOp(B, 55)]);
  });

  it('emits nothing for fewer than three movable targets', () => {
    expect(distributeOps(read, BOXES, [A, B], 'horizontal')).toEqual([]);
  });

  it('emits no op for a middle item already evenly spaced', () => {
    // A(0,w10) B(45,w10) C(90,w10): span=100, sizes=30, gap=35 → B's target
    // leading edge is 0+10+35 = 45, exactly where it already is → no op.
    const evenRead = docRead({
      'sections.body': { type: 'absolute' },
      'sections.body.items[0]': { type: 'rect', box: { x: 0, y: 0, w: 10, h: 10 } },
      'sections.body.items[1]': { type: 'rect', box: { x: 45, y: 0, w: 10, h: 10 } },
      'sections.body.items[2]': { type: 'rect', box: { x: 90, y: 0, w: 10, h: 10 } },
    });
    const evenBoxes = [placed(A, 0, 0, 10, 10), placed(B, 45, 0, 10, 10), placed(C, 90, 0, 10, 10)];
    expect(distributeOps(evenRead, evenBoxes, ALL, 'horizontal')).toEqual([]);
  });
});

describe('movable subset filtering', () => {
  it('dedupes repeated paths and counts only movable targets', () => {
    // The primary may be passed alongside the multi-set — deduped once.
    expect(movableCount(read, BOXES, [A, A, B])).toBe(2);
  });

  it('excludes a relative-unit item (cannot write the position back)', () => {
    const relRead = docRead({
      ...DOC,
      'sections.body.items[1]': { type: 'rect', box: { x: '50%', y: 50, w: 60, h: 20 } },
    });
    expect(alignTargets(relRead, BOXES, ALL).map((t) => t.path)).toEqual([A, C]);
    // Only A and C remain → align still works over the two.
    expect(alignOps(relRead, BOXES, ALL, 'left')).toEqual([xOp(C, 10)]);
  });

  it('excludes a non-movable (flow-positioned / container) path', () => {
    const flowRead = docRead({
      'sections.body': { type: 'flow' },
      'sections.body.items[0]': { type: 'rect', box: { x: 10, y: 10, w: 40, h: 20 } },
      'sections.body.items[1]': { type: 'rect', box: { x: 100, y: 50, w: 60, h: 20 } },
    });
    // A flow child with box.x is flowPositioned = fixed → not a target.
    expect(movableCount(flowRead, BOXES, [A, B])).toBe(0);
    expect(alignOps(flowRead, BOXES, [A, B], 'left')).toEqual([]);
  });

  it('excludes an item whose page geometry is ambiguous (duplicated path)', () => {
    const dupBoxes = [...BOXES, placed(B, 200, 200, 60, 20)];
    // B now matches twice → sourceRect null → dropped; A and C remain.
    expect(alignTargets(read, dupBoxes, ALL).map((t) => t.path)).toEqual([A, C]);
  });

  it('skips an item whose inspect rect is non-finite, aligning the rest', () => {
    // A hostile NaN border on B must be dropped (not poison the group min/max):
    // A and C still align left to their shared minimum x=10.
    const nanBoxes = [
      placed(A, 10, 10, 40, 20),
      placed(B, Number.NaN, 50, 60, 20),
      placed(C, 30, 100, 20, 20),
    ];
    expect(alignTargets(read, nanBoxes, ALL).map((t) => t.path)).toEqual([A, C]);
    expect(alignOps(read, nanBoxes, ALL, 'left')).toEqual([xOp(C, 10)]);
  });

  it('never throws on a hostile read (classifies as not movable)', () => {
    const hostile: ReadFn = () => {
      throw new Error('boom');
    };
    expect(() => alignOps(hostile, BOXES, ALL, 'left')).not.toThrow();
    expect(alignOps(hostile, BOXES, ALL, 'left')).toEqual([]);
  });
});
