// Tests for reorder.ts — what a row drag decides: the drop slot among
// sibling rects, the single moveItem op (post-splice semantics), and the
// sequence-entry path split.
import { describe, expect, it } from 'vitest';
import { dropIndexFor, moveOpFor, seqPosition } from './reorder';

describe('dropIndexFor', () => {
  const rects = [
    { top: 0, height: 10 },
    { top: 10, height: 10 },
    { top: 20, height: 10 },
  ];

  it('slots before the first row whose midpoint the pointer is above', () => {
    expect(dropIndexFor(rects, -5)).toBe(0);
    expect(dropIndexFor(rects, 3)).toBe(0);
    expect(dropIndexFor(rects, 7)).toBe(1);
    expect(dropIndexFor(rects, 24)).toBe(2);
  });

  it('slots after the last row when the pointer is below every midpoint', () => {
    expect(dropIndexFor(rects, 26)).toBe(3);
    expect(dropIndexFor([], 5)).toBe(0);
  });
});

describe('moveOpFor', () => {
  it('is null when the drop lands where the row already is', () => {
    expect(moveOpFor('sections.body.items', 1, 1)).toBeNull();
    expect(moveOpFor('sections.body.items', 1, 2)).toBeNull();
  });

  it('adjusts the to-index for the post-splice semantics of moveItem', () => {
    expect(moveOpFor('sections.body.items', 1, 3)).toEqual({
      op: 'moveItem',
      path: 'sections.body.items',
      from: 1,
      to: 2,
    });
    expect(moveOpFor('sections.body.items', 2, 0)).toEqual({
      op: 'moveItem',
      path: 'sections.body.items',
      from: 2,
      to: 0,
    });
  });
});

describe('seqPosition', () => {
  it('splits a sequence entry path into parent and index', () => {
    expect(seqPosition('sections.body.items[3]')).toEqual({
      parent: 'sections.body.items',
      index: 3,
    });
    expect(seqPosition('a.columns[0]')).toEqual({ parent: 'a.columns', index: 0 });
  });

  it('is null for a non-entry path', () => {
    expect(seqPosition('sections.body')).toBeNull();
  });
});
