// Tests for reparentTarget.ts — which owner a canvas pointer is over, the band
// regions the document declares, and the slot inside an order-placed one.
import type { ReadFn } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import type { PlacedBox } from '../engine/types';
import type { PageMargin } from './marginGuide';
import { bandRegion, planReparent, receiverUnder } from './reparentTarget';

function readOf(doc: Record<string, unknown>): ReadFn {
  return (path) => doc[path];
}

const DOC: Record<string, unknown> = {
  'sections.header': { height: 40, items: [{}] },
  'sections.header.items': [{}],
  'sections.footer': { height: 20, items: [] },
  'sections.footer.items': [],
  'sections.body': { type: 'flow', items: [{}, {}] },
  'sections.body.items[0]': { type: 'text', text: 'a' },
  'sections.body.items[1]': { type: 'container', items: [{}, {}] },
  'sections.body.items[1].items[0]': { type: 'container', items: [] },
  'sections.body.items[1].items[1]': { type: 'text', text: 'b' },
};
const READ = readOf(DOC);

const box = (path: string, x: number, y: number, w: number, h: number): PlacedBox => ({
  path,
  border: { x, y, w, h },
  content: { x, y, w, h },
});

// A 200x400pt page with 20pt margins: the margin box is (20,20)-(180,380),
// so the header region is y 20..60 and the footer y 360..380.
const PAGE = { width: 200, height: 400 };
const MARGIN: PageMargin = [20, 20, 20, 20];

const BOXES: readonly PlacedBox[] = [
  box('sections.body.items[0]', 20, 80, 160, 40),
  box('sections.body.items[1]', 20, 140, 160, 120),
  box('sections.body.items[1].items[0]', 30, 150, 140, 50),
  box('sections.body.items[1].items[1]', 30, 210, 140, 40),
];

describe('bandRegion', () => {
  it('gives the header the TOP of the margin box', () => {
    expect(bandRegion(READ, 'header', PAGE, MARGIN)).toEqual({ x: 20, y: 20, w: 160, h: 40 });
  });

  it('gives the footer the BOTTOM of the margin box', () => {
    expect(bandRegion(READ, 'footer', PAGE, MARGIN)).toEqual({ x: 20, y: 360, w: 160, h: 20 });
  });

  it('declares no region without a usable height', () => {
    for (const height of [undefined, 0, -5, '40', Number.NaN, 5000]) {
      const read = readOf({ ...DOC, 'sections.header': { height, items: [] } });
      expect(bandRegion(read, 'header', PAGE, MARGIN)).toBeNull();
    }
  });

  it('declares no region on a degenerate page or a throwing read', () => {
    expect(bandRegion(READ, 'header', { width: 20, height: 400 }, MARGIN)).toBeNull();
    expect(bandRegion(READ, 'header', { width: 200, height: 20 }, MARGIN)).toBeNull();
    expect(
      bandRegion(READ, 'header', { width: Number.POSITIVE_INFINITY, height: 400 }, MARGIN),
    ).toBeNull();
    expect(
      bandRegion(
        () => {
          throw new Error('alias bomb');
        },
        'header',
        PAGE,
        MARGIN,
      ),
    ).toBeNull();
  });
});

describe('receiverUnder', () => {
  it('takes a band whose declared region holds the pointer', () => {
    expect(receiverUnder(READ, BOXES, { x: 100, y: 40 }, PAGE, MARGIN)?.items).toBe(
      'sections.header.items',
    );
    expect(receiverUnder(READ, BOXES, { x: 100, y: 370 }, PAGE, MARGIN)?.items).toBe(
      'sections.footer.items',
    );
  });

  it('takes the INNERMOST receiving box under the pointer', () => {
    expect(receiverUnder(READ, BOXES, { x: 100, y: 170 }, PAGE, MARGIN)?.items).toBe(
      'sections.body.items[1].items[0].items',
    );
  });

  it('takes the enclosing container over a child that receives nothing', () => {
    expect(receiverUnder(READ, BOXES, { x: 100, y: 220 }, PAGE, MARGIN)?.items).toBe(
      'sections.body.items[1].items',
    );
  });

  it('falls back to the body over empty page space', () => {
    expect(receiverUnder(READ, BOXES, { x: 100, y: 300 }, PAGE, MARGIN)?.items).toBe(
      'sections.body.items',
    );
  });

  it('skips the band regions entirely when the margins are unknown', () => {
    expect(receiverUnder(READ, BOXES, { x: 100, y: 40 }, PAGE, null)?.items).toBe(
      'sections.body.items',
    );
  });

  it('takes nothing when even the body cannot receive', () => {
    expect(receiverUnder(readOf({}), [], { x: 1, y: 1 }, PAGE, null)).toBeNull();
  });
});

describe('planReparent', () => {
  it('plans a SLOT and an insertion line inside an order-placed owner', () => {
    // Between the container's two children (the first ends at y 200, the
    // second starts at 210).
    const plan = planReparent(READ, BOXES, { x: 100, y: 208 }, PAGE, MARGIN);
    expect(plan?.target.receiver.items).toBe('sections.body.items[1].items');
    expect(plan?.target.index).toBe(1);
    expect(plan?.line).not.toBeNull();
    expect(plan?.region).toEqual({ x: 20, y: 140, w: 160, h: 120 });
  });

  it('appends into a coordinate-placed owner and paints no line', () => {
    const plan = planReparent(READ, BOXES, { x: 100, y: 40 }, PAGE, MARGIN);
    expect(plan?.target).toEqual({
      receiver: {
        items: 'sections.header.items',
        placement: { owner: 'band', axis: null },
      },
      index: 1,
      at: { x: 100, y: 40 },
    });
    expect(plan?.line).toBeNull();
    expect(plan?.region).toEqual({ x: 20, y: 20, w: 160, h: 40 });
  });

  it('slots along X inside a row-direction container', () => {
    const read = readOf({
      ...DOC,
      'sections.body.items[1]': { type: 'container', box: { direction: 'row' }, items: [{}, {}] },
    });
    // The two children sit side by side; a pointer past the first one's
    // midpoint takes the second slot.
    const boxes = [
      box('sections.body.items[1]', 20, 140, 160, 60),
      box('sections.body.items[1].items[0]', 30, 150, 60, 40),
      box('sections.body.items[1].items[1]', 100, 150, 60, 40),
    ];
    expect(planReparent(read, boxes, { x: 95, y: 170 }, PAGE, MARGIN)?.target.index).toBe(1);
    expect(planReparent(read, boxes, { x: 40, y: 170 }, PAGE, MARGIN)?.target.index).toBe(0);
  });

  it('outlines the FOOTER band as its own region', () => {
    expect(planReparent(READ, BOXES, { x: 100, y: 370 }, PAGE, MARGIN)?.region).toEqual({
      x: 20,
      y: 360,
      w: 160,
      h: 20,
    });
  });

  it('reports no region for the body, which has no box of its own', () => {
    expect(planReparent(READ, BOXES, { x: 100, y: 300 }, PAGE, MARGIN)?.region).toBeNull();
  });

  it('appends into an owner whose item list is missing or unreadable', () => {
    const read = readOf({ 'sections.header': { height: 40 } });
    expect(planReparent(read, [], { x: 100, y: 40 }, PAGE, MARGIN)?.target.index).toBe(0);
    const throwing: ReadFn = (path) => {
      if (path === 'sections.header.items') {
        throw new Error('alias bomb');
      }
      return { height: 40 };
    };
    expect(planReparent(throwing, [], { x: 100, y: 40 }, PAGE, MARGIN)?.target.index).toBe(0);
  });

  it('plans nothing when nothing under the pointer can receive', () => {
    expect(planReparent(readOf({}), [], { x: 1, y: 1 }, PAGE, null)).toBeNull();
  });

  it('plans nothing when the order-placed geometry is ambiguous or hostile', () => {
    // A duplicated index — repeat fragments share a path, so no slot is safe.
    const duplicated = [...BOXES, box('sections.body.items[0]', 20, 300, 160, 40)];
    expect(planReparent(READ, duplicated, { x: 100, y: 300 }, PAGE, MARGIN)).toBeNull();
    expect(planReparent(READ, BOXES, { x: 100, y: Number.NaN }, PAGE, MARGIN)).toBeNull();
  });
});
