import type { ReadFn } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { manipulationFor } from './manipulate';

/** A read function over exact-path entries (unknown paths read undefined —
 * the materializer's miss shape). */
const docRead =
  (entries: Record<string, unknown>): ReadFn =>
  (path) =>
    entries[path];

// An absolute body of three stacked rects (authored numbers = page pt).
const ABS_DOC = {
  'sections.body': { type: 'absolute' },
  'sections.body.items[0]': { type: 'rect', box: { x: 0, y: 0, w: 100, h: 30 } },
  'sections.body.items[1]': { type: 'rect', box: { x: 0, y: 40, w: 100, h: 30 } },
  'sections.body.items[2]': { type: 'rect', box: { x: 0, y: 80, w: 100, h: 30 } },
};

describe('manipulationFor', () => {
  it('classifies absolute-body children as movable', () => {
    expect(manipulationFor(docRead(ABS_DOC), 'sections.body.items[0]')).toEqual({
      kind: 'move',
      place: 'absolute',
      x: { pt: 0, unit: null },
      y: { pt: 0, unit: null },
    });
  });

  it('classifies header and footer band items as movable', () => {
    const read = docRead({
      'sections.header': {},
      'sections.header.items[0]': { type: 'text', box: { x: 5, y: 5 } },
      'sections.footer': {},
      'sections.footer.items[0]': { type: 'text' },
    });
    expect(manipulationFor(read, 'sections.header.items[0]')).toEqual({
      kind: 'move',
      place: 'band',
      x: { pt: 5, unit: null },
      y: { pt: 5, unit: null },
    });
    expect(manipulationFor(read, 'sections.footer.items[0]')).toEqual({
      kind: 'move',
      place: 'band',
      x: { pt: 0, unit: null },
      y: { pt: 0, unit: null },
    });
  });

  it('classifies an x/y-authored container child as positioned-movable', () => {
    const read = docRead({
      'sections.body': { type: 'flow' },
      'sections.body.items[0]': { type: 'container', box: {} },
      'sections.body.items[0].items[0]': { type: 'rect', box: { x: 10, y: 10, w: 20, h: 20 } },
    });
    expect(manipulationFor(read, 'sections.body.items[0].items[0]')).toEqual({
      kind: 'move',
      place: 'positioned',
      x: { pt: 10, unit: null },
      y: { pt: 10, unit: null },
    });
  });

  it('classifies flow-body and flex-container children as reorderable', () => {
    const read = docRead({
      'sections.body': { type: 'flow' },
      'sections.body.items[0]': { type: 'text' },
      'sections.body.items[1]': { type: 'container', box: { direction: 'row' } },
      'sections.body.items[1].items[0]': { type: 'text' },
    });
    const flow = manipulationFor(read, 'sections.body.items[0]');
    expect(flow.kind).toBe('reorder');
    if (flow.kind === 'reorder') {
      expect(flow.place).toBe('flow');
      expect(flow.context.axis).toBe('y');
    }
    const flex = manipulationFor(read, 'sections.body.items[1].items[0]');
    expect(flex.kind).toBe('reorder');
    if (flex.kind === 'reorder') {
      expect(flex.place).toBe('flex');
      expect(flex.context.axis).toBe('x');
    }
  });

  it('fixes a grid-container child with the grid reason', () => {
    const read = docRead({
      'sections.body': { type: 'flow' },
      'sections.body.items[0]': { type: 'container', box: { type: 'grid', columns: 2 } },
      'sections.body.items[0].items[0]': { type: 'rect', box: { w: 10, h: 10 } },
    });
    expect(manipulationFor(read, 'sections.body.items[0].items[0]')).toEqual({
      kind: 'fixed',
      reason: 'grid',
    });
  });

  it('fixes sub-template content (columns / cell / item) with the repeat reason', () => {
    const read = docRead({});
    expect(manipulationFor(read, 'sections.body.items[0].columns[2]')).toEqual({
      kind: 'fixed',
      reason: 'repeat',
    });
    expect(manipulationFor(read, 'sections.body.items[0].columns[0].cell.items[1]')).toEqual({
      kind: 'fixed',
      reason: 'repeat',
    });
    expect(manipulationFor(read, 'sections.body.items[3].item.items[0]')).toEqual({
      kind: 'fixed',
      reason: 'repeat',
    });
    // A `headerGroups` cell repeats with the header on every page and its
    // geometry comes from the table's columns, so it refuses the same way a
    // column does — pinned because the box index now addresses it.
    expect(manipulationFor(read, 'sections.body.items[0].headerGroups[0]')).toEqual({
      kind: 'fixed',
      reason: 'repeat',
    });
  });

  it('fixes line and page_break with the noBox reason', () => {
    const read = docRead({
      'sections.body': { type: 'absolute' },
      'sections.body.items[0]': { type: 'line' },
      'sections.body.items[1]': { type: 'page_break' },
    });
    expect(manipulationFor(read, 'sections.body.items[0]')).toEqual({
      kind: 'fixed',
      reason: 'noBox',
    });
    expect(manipulationFor(read, 'sections.body.items[1]')).toEqual({
      kind: 'fixed',
      reason: 'noBox',
    });
  });

  it('fixes a relative-unit position with the relative reason', () => {
    const read = docRead({
      'sections.body': { type: 'absolute' },
      'sections.body.items[0]': { type: 'rect', box: { x: '50%', y: 0, w: 10, h: 10 } },
    });
    expect(manipulationFor(read, 'sections.body.items[0]')).toEqual({
      kind: 'fixed',
      reason: 'relative',
    });
  });

  it('fixes an x/y-authored flow-body child with the flowPositioned reason', () => {
    const read = docRead({
      'sections.body': { type: 'flow' },
      'sections.body.items[0]': { type: 'rect', box: { x: 10, w: 10, h: 10 } },
    });
    expect(manipulationFor(read, 'sections.body.items[0]')).toEqual({
      kind: 'fixed',
      reason: 'flowPositioned',
    });
  });

  it('fixes a section root with the section reason', () => {
    expect(manipulationFor(docRead(ABS_DOC), 'sections.body')).toEqual({
      kind: 'fixed',
      reason: 'section',
    });
  });

  it('fixes a non-items sequence entry with the repeat reason', () => {
    expect(manipulationFor(docRead({}), 'sections.body.rows[0]')).toEqual({
      kind: 'fixed',
      reason: 'repeat',
    });
  });

  it('degrades hostile documents to unknown, never throwing', () => {
    const bomb: ReadFn = () => {
      throw new Error('alias bomb');
    };
    expect(manipulationFor(bomb, 'sections.body.items[0]')).toEqual({
      kind: 'fixed',
      reason: 'unknown',
    });
    expect(manipulationFor(docRead({}), 'sections.body.items[0]')).toEqual({
      kind: 'fixed',
      reason: 'unknown',
    });
    const garbageChild = docRead({
      'sections.body': { type: 'absolute' },
      'sections.body.items[0]': 'garbage',
    });
    expect(manipulationFor(garbageChild, 'sections.body.items[0]')).toEqual({
      kind: 'fixed',
      reason: 'unknown',
    });
    const nonContainerOwner = docRead({
      a: { type: 'text' },
      'a.items[0]': { type: 'text' },
    });
    expect(manipulationFor(nonContainerOwner, 'a.items[0]')).toEqual({
      kind: 'fixed',
      reason: 'unknown',
    });
    const garbageBody = docRead({
      'sections.body': { type: 'garbage' },
      'sections.body.items[0]': { type: 'text' },
    });
    expect(manipulationFor(garbageBody, 'sections.body.items[0]')).toEqual({
      kind: 'fixed',
      reason: 'unknown',
    });
  });
});

describe('an anchored ellipse', () => {
  it('is fixed, because its position comes from the item it circles', () => {
    // It HAS a placement (the drain reports one), so without this rule it
    // would classify as an ordinary absolute box and the drag would commit
    // `box.x`/`box.y` — keys the engine never reads for an anchored mark.
    const read = docRead({
      'sections.body': { type: 'absolute' },
      'sections.body.items[0]': { type: 'ellipse', anchor: 'answer' },
      'sections.body.items[1]': { type: 'ellipse', box: { x: 5, y: 5, w: 10, h: 10 } },
    });
    expect(manipulationFor(read, 'sections.body.items[0]')).toEqual({
      kind: 'fixed',
      reason: 'anchored',
    });
    // …and an ordinary ellipse is untouched by the rule.
    expect(manipulationFor(read, 'sections.body.items[1]').kind).toBe('move');
  });
});
