import type { ReadFn } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import {
  addSlotOp,
  alignItemsOp,
  directionOp,
  gapOp,
  gapStepOp,
  MAX_FLEX_GROW,
  MAX_GAP_PT,
  ratioOp,
} from './layoutOps';

/** A read that never leaks the prototype (own-key guard) — the shape the real
 * editor read has (a grammar lookup, not object indexing). */
function reader(map: Record<string, unknown>): ReadFn {
  return (path) => (Object.hasOwn(map, path) ? map[path] : undefined);
}

/** A read that throws — an alias-bomb subtree. */
const throwingRead: ReadFn = () => {
  throw new Error('alias bomb');
};

const PATH = 'sections.body.items[0]';

function container(box: Record<string, unknown>, items: unknown[] = []): ReadFn {
  return reader({ [PATH]: { type: 'container', box, items } });
}

describe('op builders', () => {
  it('directionOp / alignItemsOp author the box keys as scalars', () => {
    expect(directionOp(PATH, 'row')).toEqual({
      op: 'setScalar',
      path: PATH,
      keys: ['box', 'direction'],
      value: 'row',
    });
    expect(alignItemsOp(PATH, 'center')).toEqual({
      op: 'setScalar',
      path: PATH,
      keys: ['box', 'alignItems'],
      value: 'center',
    });
  });

  it('gapOp clears on empty, authors a bare number as a number and a unit string verbatim', () => {
    expect(gapOp(PATH, '')).toEqual({ op: 'removeKey', path: PATH, keys: ['box', 'gap'] });
    expect(gapOp(PATH, '8')).toEqual({
      op: 'setScalar',
      path: PATH,
      keys: ['box', 'gap'],
      value: 8,
    });
    expect(gapOp(PATH, '4mm')).toEqual({
      op: 'setScalar',
      path: PATH,
      keys: ['box', 'gap'],
      value: '4mm',
    });
  });

  it('gapOp clamps a negative to 0 and refuses garbage / relative units / over-cap', () => {
    expect(gapOp(PATH, '-3')).toEqual({
      op: 'setScalar',
      path: PATH,
      keys: ['box', 'gap'],
      value: 0,
    });
    expect(gapOp(PATH, 'abc')).toBeNull();
    expect(gapOp(PATH, '5%')).toBeNull();
    expect(gapOp(PATH, 'NaN')).toBeNull();
    expect(gapOp(PATH, String(MAX_GAP_PT + 1))).toBeNull();
  });

  it('gapStepOp steps an empty gap from 0, clamps a step below zero, and refuses garbage', () => {
    expect(gapStepOp(PATH, '', 1, 1)).toEqual({
      op: 'setScalar',
      path: PATH,
      keys: ['box', 'gap'],
      value: 1,
    });
    expect(gapStepOp(PATH, '0', -1, 1)).toEqual({
      op: 'setScalar',
      path: PATH,
      keys: ['box', 'gap'],
      value: 0,
    });
    expect(gapStepOp(PATH, '4mm', 1, 1)).toEqual({
      op: 'setScalar',
      path: PATH,
      keys: ['box', 'gap'],
      value: '4.4mm',
    });
    expect(gapStepOp(PATH, 'abc', 1, 1)).toBeNull();
  });

  it('ratioOp authors a finite weight, clears on empty, refuses hostile numbers', () => {
    const CHILD = `${PATH}.items[0]`;
    expect(ratioOp(CHILD, '2')).toEqual({
      op: 'setScalar',
      path: CHILD,
      keys: ['box', 'flexGrow'],
      value: 2,
    });
    expect(ratioOp(CHILD, '0')).toEqual({
      op: 'setScalar',
      path: CHILD,
      keys: ['box', 'flexGrow'],
      value: 0,
    });
    expect(ratioOp(CHILD, '')).toEqual({
      op: 'removeKey',
      path: CHILD,
      keys: ['box', 'flexGrow'],
    });
    expect(ratioOp(CHILD, '-1')).toBeNull();
    expect(ratioOp(CHILD, 'NaN')).toBeNull();
    expect(ratioOp(CHILD, 'Infinity')).toBeNull();
    expect(ratioOp(CHILD, '1e300')).toBeNull();
    expect(ratioOp(CHILD, String(MAX_FLEX_GROW + 1))).toBeNull();
  });

  it('addSlotOp appends a placeholder text child at the current length', () => {
    const read = container({}, [{ type: 'text' }, { type: 'text' }]);
    expect(addSlotOp(read, PATH, 'Text')).toEqual({
      op: 'insertItem',
      path: `${PATH}.items`,
      index: 2,
      value: { type: 'text', text: 'Text' },
    });
  });

  it('addSlotOp appends at 0 for a missing items list and a hostile read', () => {
    expect(addSlotOp(reader({ [PATH]: { type: 'container' } }), PATH, 'Text')).toMatchObject({
      index: 0,
    });
    expect(addSlotOp(throwingRead, PATH, 'Text')).toMatchObject({ index: 0 });
    // A node that is not a map at all (null, a sequence) is not a container —
    // appending at 0 lets `insertItem` refuse, rather than reading `.items`
    // off a hostile shape.
    expect(addSlotOp(reader({ [PATH]: null }), PATH, 'Text')).toMatchObject({ index: 0 });
    expect(addSlotOp(reader({ [PATH]: [{ type: 'text' }] }), PATH, 'Text')).toMatchObject({
      index: 0,
    });
  });
});
