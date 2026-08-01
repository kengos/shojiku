import type { ReadFn } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import type { PlacedBox } from '../engine/types';
import { reorderContext, siblingRects } from './dnd';

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

describe('reorderContext', () => {
  it('resolves a flow-body child to a vertical drag', () => {
    const context = reorderContext(readOf(FLOW_DOC), 'sections.body.items[1]');
    expect(context).toEqual({ parent: 'sections.body.items', from: 1, axis: 'y' });
  });

  it('resolves a row flex-container child to a horizontal drag', () => {
    const read = readOf({
      'sections.body.items[2]': { type: 'container', box: { direction: 'row' } },
      'sections.body.items[2].items[0]': { type: 'text' },
    });
    const context = reorderContext(read, 'sections.body.items[2].items[0]');
    expect(context).toEqual({ parent: 'sections.body.items[2].items', from: 0, axis: 'x' });
  });

  it('defaults a container without a direction to a vertical drag', () => {
    const read = readOf({
      'sections.body.items[2]': { type: 'container' },
      'sections.body.items[2].items[1]': { type: 'text' },
    });
    expect(reorderContext(read, 'sections.body.items[2].items[1]')?.axis).toBe('y');
  });

  it('refuses a grid container (cells are track-placed, not order-placed)', () => {
    const read = readOf({
      'sections.body.items[0]': { type: 'container', box: { type: 'grid' } },
      'sections.body.items[0].items[0]': { type: 'text' },
    });
    expect(reorderContext(read, 'sections.body.items[0].items[0]')).toBeNull();
  });

  it('refuses a child with an authored box.x (absolutely placed)', () => {
    const read = readOf({
      'sections.body': { type: 'flow' },
      'sections.body.items[0]': { type: 'text', box: { x: 10 } },
    });
    expect(reorderContext(read, 'sections.body.items[0]')).toBeNull();
  });

  it('refuses a child with an authored box.y (absolutely placed)', () => {
    const read = readOf({
      'sections.body': { type: 'flow' },
      'sections.body.items[0]': { type: 'text', box: { y: 0 } },
    });
    expect(reorderContext(read, 'sections.body.items[0]')).toBeNull();
  });

  it('refuses an absolute body (order does not place its children)', () => {
    const read = readOf({
      'sections.body': { type: 'absolute' },
      'sections.body.items[0]': { type: 'text' },
    });
    expect(reorderContext(read, 'sections.body.items[0]')).toBeNull();
  });

  it('refuses a non-sequence path (a section root)', () => {
    expect(reorderContext(readOf(FLOW_DOC), 'sections.body')).toBeNull();
  });

  it('refuses cell/card sub-template children (tree-reorder-only surfaces)', () => {
    const read = readOf({
      'sections.body.items[0].cell': { items: [{}] },
      'sections.body.items[0].cell.items[0]': { type: 'text' },
      'sections.body.items[1].item': { items: [{}] },
      'sections.body.items[1].item.items[0]': { type: 'text' },
    });
    expect(reorderContext(read, 'sections.body.items[0].cell.items[0]')).toBeNull();
    expect(reorderContext(read, 'sections.body.items[1].item.items[0]')).toBeNull();
  });

  it('refuses a parent sequence that is not an items list', () => {
    const read = readOf({
      'sections.body.items[0]': { type: 'table', columns: [{}] },
      'sections.body.items[0].columns[0]': { label: 'x' },
    });
    expect(reorderContext(read, 'sections.body.items[0].columns[0]')).toBeNull();
  });

  it('treats a read throw as not draggable (alias-bomb posture)', () => {
    const read: ReadFn = () => {
      throw new Error('refused');
    };
    expect(reorderContext(read, 'sections.body.items[0]')).toBeNull();
  });

  it('resolves a hostile huge index without clamping (the op layer bounds it)', () => {
    const read = readOf({
      'sections.body': { type: 'flow' },
      'sections.body.items[999999999]': { type: 'text' },
    });
    const context = reorderContext(read, 'sections.body.items[999999999]');
    expect(context?.from).toBe(999999999);
  });

  it('refuses a missing or non-map owner', () => {
    expect(reorderContext(readOf({}), 'sections.body.items[0]')).toBeNull();
    const read = readOf({ 'sections.body': 'garbage', 'sections.body.items[0]': {} });
    expect(reorderContext(read, 'sections.body.items[0]')).toBeNull();
  });

  it('degrades hostile owner shapes safely, never throwing', () => {
    // `box` a string: no authored x/y detectable, flex default → draggable.
    const boxString = readOf({
      'sections.body.items[0]': { type: 'container', box: 'garbage' },
      'sections.body.items[0].items[0]': { type: 'text' },
    });
    expect(reorderContext(boxString, 'sections.body.items[0].items[0]')?.axis).toBe('y');
    // `direction` a number: not `row` → the column default.
    const directionNumber = readOf({
      'sections.body.items[0]': { type: 'container', box: { direction: 7 } },
      'sections.body.items[0].items[0]': { type: 'text' },
    });
    expect(reorderContext(directionNumber, 'sections.body.items[0].items[0]')?.axis).toBe('y');
    // A non-string owner `type` is not a container → refused.
    const typeNumber = readOf({
      'sections.body.items[0]': { type: 7 },
      'sections.body.items[0].items[0]': { type: 'text' },
    });
    expect(reorderContext(typeNumber, 'sections.body.items[0].items[0]')).toBeNull();
    // A hostile non-'flex' box.type string is not an order-placed mode.
    const modeGarbage = readOf({
      'sections.body.items[0]': { type: 'container', box: { type: 'zzz' } },
      'sections.body.items[0].items[0]': { type: 'text' },
    });
    expect(reorderContext(modeGarbage, 'sections.body.items[0].items[0]')).toBeNull();
    // A non-map child (malformed entry) has no box → still order-placed.
    const childGarbage = readOf({
      'sections.body': { type: 'flow' },
      'sections.body.items[0]': 'garbage',
    });
    expect(reorderContext(childGarbage, 'sections.body.items[0]')?.from).toBe(0);
  });
});

describe('siblingRects', () => {
  const parent = 'sections.body.items';

  it('collects exact children in index order, skipping descendants and other parents', () => {
    const rects = siblingRects(
      [
        box('sections.body.items[1]', 0, 40, 100, 30),
        box('sections.body.items[0]', 0, 0, 100, 30),
        box('sections.body.items[0].items[0]', 5, 5, 10, 10),
        box('sections.header.items[0]', 0, 0, 10, 10),
        box('sections.body.items[abc]', 0, 0, 1, 1),
      ],
      parent,
    );
    expect(rects).toEqual([
      { index: 0, rect: { x: 0, y: 0, w: 100, h: 30 } },
      { index: 1, rect: { x: 0, y: 40, w: 100, h: 30 } },
    ]);
  });

  it('refuses duplicated indices (repeat fragments share paths)', () => {
    const rects = siblingRects(
      [box('sections.body.items[0]', 0, 0, 10, 10), box('sections.body.items[0]', 0, 20, 10, 10)],
      parent,
    );
    expect(rects).toBeNull();
  });

  it('keeps a sparse page run sorted by document index', () => {
    const rects = siblingRects(
      [box('sections.body.items[7]', 0, 40, 10, 10), box('sections.body.items[5]', 0, 0, 10, 10)],
      parent,
    );
    expect(rects?.map((s) => s.index)).toEqual([5, 7]);
  });

  it('ignores negative and non-integer indices', () => {
    const rects = siblingRects(
      [box('sections.body.items[-1]', 0, 0, 10, 10), box('sections.body.items[1.5]', 0, 0, 10, 10)],
      parent,
    );
    expect(rects).toEqual([]);
  });
});
