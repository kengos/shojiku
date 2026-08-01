import type { ReadFn } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { pinOps, placementFor, unpinOps } from './placementModel';

/** A read that never leaks the prototype (own-key guard) — the shape the real
 * editor read has (a grammar lookup, not object indexing). */
function reader(map: Record<string, unknown>): ReadFn {
  return (path) => (Object.hasOwn(map, path) ? map[path] : undefined);
}

/** A read that throws — an alias-bomb subtree. */
const throwingRead: ReadFn = () => {
  throw new Error('alias bomb');
};

const CHILD = 'sections.body.items[0].items[1]';
const OWNER = 'sections.body.items[0]';

/** A flex container holding one child; the child's box is caller-supplied. */
function flexDoc(childBox: Record<string, unknown>): ReadFn {
  return reader({
    [OWNER]: { type: 'container', box: {} },
    [CHILD]: { type: 'text', box: childBox },
  });
}

describe('placementFor', () => {
  it('classifies a flex container child with no coordinates as pinnable + auto', () => {
    const p = placementFor(flexDoc({}), CHILD);
    expect(p.kind).toBe('pinnable');
    expect(p.pinned).toBe(false);
  });

  it('classifies a container child with x only, y only, or both as pinnable + pinned', () => {
    expect(placementFor(flexDoc({ x: 10 }), CHILD).pinned).toBe(true);
    expect(placementFor(flexDoc({ y: 20 }), CHILD).pinned).toBe(true);
    expect(placementFor(flexDoc({ x: 10, y: 20 }), CHILD).pinned).toBe(true);
  });

  it('classifies a GRID container child the same both ways (auto / pinned)', () => {
    const grid = (childBox: Record<string, unknown>): ReadFn =>
      reader({
        [OWNER]: { type: 'container', box: { type: 'grid', columns: ['1fr', '1fr'] } },
        [CHILD]: { type: 'text', box: childBox },
      });
    expect(placementFor(grid({}), CHILD)).toMatchObject({ kind: 'pinnable', pinned: false });
    expect(placementFor(grid({ x: 5 }), CHILD)).toMatchObject({ kind: 'pinnable', pinned: true });
  });

  it('classifies a flow-body child as flow, flagging ignoredY only when y is authored', () => {
    const flow = (childBox: Record<string, unknown>): ReadFn =>
      reader({
        'sections.body': { type: 'flow' },
        'sections.body.items[0]': { type: 'text', box: childBox },
      });
    expect(placementFor(flow({}), 'sections.body.items[0]')).toMatchObject({
      kind: 'flow',
      ignoredY: false,
    });
    expect(placementFor(flow({ y: 30 }), 'sections.body.items[0]')).toMatchObject({
      kind: 'flow',
      ignoredY: true,
    });
  });

  it('classifies a band child and an absolute-body child as coordinate', () => {
    const band = reader({
      'sections.header': { items: [] },
      'sections.header.items[0]': { type: 'text', box: {} },
    });
    expect(placementFor(band, 'sections.header.items[0]').kind).toBe('coordinate');
    const absolute = reader({
      'sections.body': { type: 'absolute' },
      'sections.body.items[0]': { type: 'text', box: {} },
    });
    expect(placementFor(absolute, 'sections.body.items[0]').kind).toBe('coordinate');
  });

  it('classifies sub-template, section-root, and line paths as plain', () => {
    // A `columns[` / `cell.` / `item.` path is a repeating sub-template.
    expect(placementFor(reader({}), 'sections.body.items[0].columns[1]').kind).toBe('plain');
    expect(placementFor(reader({}), 'sections.body.items[0].cell.items[0]').kind).toBe('plain');
    expect(placementFor(reader({}), 'sections.body.items[0].headerGroups[0]').kind).toBe('plain');
    // A section root is not a sequence entry.
    expect(placementFor(reader({}), 'sections.body').kind).toBe('plain');
    // A `line` in a container is box-only (its coordinates are `points`, not box).
    expect(placementFor(flexDoc({}), CHILD)).not.toMatchObject({ kind: 'plain' });
    const lineDoc = reader({
      [OWNER]: { type: 'container', box: {} },
      [CHILD]: { type: 'line', box: {} },
    });
    expect(placementFor(lineDoc, CHILD).kind).toBe('plain');
  });

  it('classifies an unknown body type or a non-container owner as plain', () => {
    const weirdBody = reader({
      'sections.body': { type: 'grid-ish-typo' },
      'sections.body.items[0]': { type: 'text', box: {} },
    });
    expect(placementFor(weirdBody, 'sections.body.items[0]').kind).toBe('plain');
    // A hostile document nesting an items array under a non-container item.
    const textOwner = reader({
      [OWNER]: { type: 'text' },
      [CHILD]: { type: 'text', box: {} },
    });
    expect(placementFor(textOwner, CHILD).kind).toBe('plain');
  });

  it('never throws on a hostile document (a read throw classifies as plain)', () => {
    expect(placementFor(throwingRead, CHILD).kind).toBe('plain');
  });
});

describe('pinOps / unpinOps', () => {
  it('pins BOTH coordinates in one batch at the resolved values', () => {
    expect(pinOps(CHILD, 80, 160)).toEqual([
      { op: 'setScalar', path: CHILD, keys: ['box', 'x'], value: 80 },
      { op: 'setScalar', path: CHILD, keys: ['box', 'y'], value: 160 },
    ]);
  });

  it('unpins only the coordinates that are PRESENT (x-only case)', () => {
    expect(unpinOps(flexDoc({ x: 80, y: 160 }), CHILD)).toEqual([
      { op: 'removeKey', path: CHILD, keys: ['box', 'x'] },
      { op: 'removeKey', path: CHILD, keys: ['box', 'y'] },
    ]);
    expect(unpinOps(flexDoc({ x: 80 }), CHILD)).toEqual([
      { op: 'removeKey', path: CHILD, keys: ['box', 'x'] },
    ]);
    // A hostile read degrades to no ops, never throws.
    expect(unpinOps(throwingRead, CHILD)).toEqual([]);
  });
});
