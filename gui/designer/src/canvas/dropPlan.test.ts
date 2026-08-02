import type { ReadFn } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import type { PlacedBox } from '../engine/types';
import { reorderContext, type SiblingBox } from './dnd';
import { dropSlotFor, indicatorLine, planDrop, slotToDocIndex } from './dropPlan';

/** A read function over a flat path → materialized-value table. */
function readOf(doc: Record<string, unknown>): ReadFn {
  return (path) => doc[path];
}

const FLOW_DOC: Record<string, unknown> = {
  'sections.body': { type: 'flow', items: [{}, {}, {}] },
  'sections.body.items[0]': { type: 'text', text: 'a' },
  'sections.body.items[1]': { type: 'text', box: { w: 100 } },
  'sections.body.items[2]': { type: 'container', items: [{}] },
};

const box = (path: string, x: number, y: number, w: number, h: number): PlacedBox => ({
  path,
  border: { x, y, w, h },
  content: { x, y, w, h },
});

const STACK: readonly SiblingBox[] = [
  { index: 0, rect: { x: 0, y: 0, w: 100, h: 30 } },
  { index: 1, rect: { x: 0, y: 40, w: 100, h: 30 } },
  { index: 2, rect: { x: 0, y: 80, w: 100, h: 30 } },
];

const ROW: readonly SiblingBox[] = [
  { index: 0, rect: { x: 0, y: 0, w: 30, h: 100 } },
  { index: 1, rect: { x: 40, y: 0, w: 30, h: 100 } },
];

describe('dropSlotFor', () => {
  it('places the slot by midpoint on the vertical axis', () => {
    expect(dropSlotFor(STACK, 10, 'y')).toBe(0);
    expect(dropSlotFor(STACK, 20, 'y')).toBe(1);
    expect(dropSlotFor(STACK, 70, 'y')).toBe(2);
    expect(dropSlotFor(STACK, 120, 'y')).toBe(3);
  });

  it('places the slot by midpoint on the horizontal axis', () => {
    expect(dropSlotFor(ROW, 5, 'x')).toBe(0);
    expect(dropSlotFor(ROW, 30, 'x')).toBe(1);
    expect(dropSlotFor(ROW, 90, 'x')).toBe(2);
  });

  it('refuses a non-finite coordinate', () => {
    expect(dropSlotFor(STACK, Number.NaN, 'y')).toBeNull();
    expect(dropSlotFor(STACK, Number.POSITIVE_INFINITY, 'y')).toBeNull();
  });
});

describe('slotToDocIndex', () => {
  it('maps a slot to the sibling document index, sparse runs included', () => {
    const sparse: readonly SiblingBox[] = [
      { index: 5, rect: { x: 0, y: 0, w: 10, h: 10 } },
      { index: 6, rect: { x: 0, y: 20, w: 10, h: 10 } },
    ];
    expect(slotToDocIndex(sparse, 0)).toBe(5);
    expect(slotToDocIndex(sparse, 1)).toBe(6);
    expect(slotToDocIndex(sparse, 2)).toBe(7);
    expect(slotToDocIndex([], 0)).toBe(0);
  });
});

describe('indicatorLine', () => {
  it('draws across the gap midpoint between vertical neighbours', () => {
    expect(indicatorLine(STACK, 1, 'y')).toEqual({ x1: 0, y1: 35, x2: 100, y2: 35 });
  });

  it('draws the leading and trailing edges at the extremes (vertical)', () => {
    expect(indicatorLine(STACK, 0, 'y')).toEqual({ x1: 0, y1: 0, x2: 100, y2: 0 });
    expect(indicatorLine(STACK, 3, 'y')).toEqual({ x1: 0, y1: 110, x2: 100, y2: 110 });
  });

  it('draws vertical lines on the horizontal axis', () => {
    expect(indicatorLine(ROW, 1, 'x')).toEqual({ x1: 35, y1: 0, x2: 35, y2: 100 });
    expect(indicatorLine(ROW, 0, 'x')).toEqual({ x1: 0, y1: 0, x2: 0, y2: 100 });
    expect(indicatorLine(ROW, 2, 'x')).toEqual({ x1: 70, y1: 0, x2: 70, y2: 100 });
  });

  it('yields nothing without neighbours', () => {
    expect(indicatorLine([], 0, 'y')).toBeNull();
  });
});

describe('planDrop', () => {
  const pageBoxes = [
    box('sections.body.items[0]', 0, 0, 100, 30),
    box('sections.body.items[1]', 0, 40, 100, 30),
    box('sections.body.items[2]', 0, 80, 100, 30),
  ];
  const contextFor = (path: string) => reorderContext(readOf(FLOW_DOC), path);

  it('builds the op, indicator, and source rect for a valid drag', () => {
    const plan = planDrop(contextFor, pageBoxes, 'sections.body.items[0]', { x: 50, y: 120 });
    expect(plan?.op).toEqual({ op: 'moveItem', path: 'sections.body.items', from: 0, to: 2 });
    expect(plan?.slot).toBe(3);
    expect(plan?.line).toEqual({ x1: 0, y1: 110, x2: 100, y2: 110 });
    expect(plan?.source).toEqual({ x: 0, y: 0, w: 100, h: 30 });
  });

  it('yields a null op for a no-op drop (the item stays where it is)', () => {
    const plan = planDrop(contextFor, pageBoxes, 'sections.body.items[1]', { x: 50, y: 60 });
    expect(plan).not.toBeNull();
    expect(plan?.op).toBeNull();
  });

  it('is null for a non-draggable path', () => {
    expect(planDrop(contextFor, pageBoxes, 'sections.body', { x: 0, y: 0 })).toBeNull();
  });

  it('is null over ambiguous sibling geometry (duplicated indices)', () => {
    const duplicated = [...pageBoxes, box('sections.body.items[0]', 0, 200, 10, 10)];
    expect(planDrop(contextFor, duplicated, 'sections.body.items[0]', { x: 0, y: 0 })).toBeNull();
  });

  it('is null when the dragged item is not laid out on this page', () => {
    const otherPage = [box('sections.body.items[5]', 0, 0, 10, 10)];
    expect(planDrop(contextFor, otherPage, 'sections.body.items[0]', { x: 0, y: 0 })).toBeNull();
  });

  it('is null at a hostile non-finite pointer position', () => {
    expect(
      planDrop(contextFor, pageBoxes, 'sections.body.items[0]', { x: 0, y: Number.NaN }),
    ).toBeNull();
  });

  it('rides the drag axis for a row container (x decides the slot)', () => {
    const read = readOf({
      'sections.body.items[2]': { type: 'container', box: { direction: 'row' } },
      'sections.body.items[2].items[0]': { type: 'text' },
      'sections.body.items[2].items[1]': { type: 'text' },
    });
    const rowBoxes = [
      box('sections.body.items[2].items[0]', 0, 0, 30, 100),
      box('sections.body.items[2].items[1]', 40, 0, 30, 100),
    ];
    const plan = planDrop(
      (path) => reorderContext(read, path),
      rowBoxes,
      'sections.body.items[2].items[0]',
      { x: 90, y: 50 },
    );
    expect(plan?.op).toEqual({
      op: 'moveItem',
      path: 'sections.body.items[2].items',
      from: 0,
      to: 1,
    });
  });
});
