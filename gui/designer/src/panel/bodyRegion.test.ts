import type { Op, ReadFn } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { regionOps } from './bodyRegion';

const BODY = 'sections.body';
const read =
  (body: Record<string, unknown>): ReadFn =>
  (path) =>
    path === BODY ? body : undefined;
const set = (axis: string, value: number | string): Op => ({
  op: 'setScalar',
  path: BODY,
  keys: ['box', axis],
  value,
});
const clear = (axis: string): Op => ({ op: 'removeKey', path: BODY, keys: ['box', axis] });
const put = (value: Record<string, unknown>) => [
  { op: 'putValue', path: BODY, keys: ['box'], value },
];

describe('regionOps', () => {
  it('completes a one-axis edit on a body with no region into a whole one', () => {
    expect(regionOps(read({ type: 'flow' }), BODY, set('y', 40))).toEqual(
      put({ x: 0, y: 40, w: '100%', h: '100%' }),
    );
    // A hostile region reads as none.
    expect(regionOps(read({ box: [1] }), BODY, set('w', '50%'))).toEqual(
      put({ x: 0, y: 0, w: '50%', h: '100%' }),
    );
  });

  it('edits one axis of a region, and clearing an axis puts its whole-area value back', () => {
    const body = { box: { x: 10, y: 74, w: '100%', h: 672 } };
    expect(regionOps(read(body), BODY, set('x', 0))).toEqual(
      put({ x: 0, y: 74, w: '100%', h: 672 }),
    );
    expect(regionOps(read(body), BODY, clear('h'))).toEqual(
      put({ x: 10, y: 74, w: '100%', h: '100%' }),
    );
  });

  it('removes a region that is back at the whole area, and writes nothing for none', () => {
    const body = { box: { x: 0, y: 10, w: '100%', h: '100%' } };
    expect(regionOps(read(body), BODY, clear('y'))).toEqual([
      { op: 'removeKey', path: BODY, keys: ['box'] },
    ]);
    expect(regionOps(read({}), BODY, set('x', 0))).toBeNull();
    expect(regionOps(read({}), BODY, clear('h'))).toBeNull();
  });

  it('passes over a refused edit and anything that is not a region axis', () => {
    expect(regionOps(read({}), BODY, null)).toBeNull();
    expect(
      regionOps(read({}), BODY, { op: 'setScalar', path: BODY, keys: ['gap'], value: 4 }),
    ).toBeNull();
    expect(regionOps(read({}), BODY, { op: 'moveItem', path: BODY, from: 0, to: 1 })).toBeNull();
  });
});
