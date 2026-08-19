// Tests for rowDrag.ts — the parts of a row drag the component tests cannot
// reach directly: the destination predicate handed to the drop model, and the
// ops a landing commits.
import type { Op, OpResult, ReadFn } from '@shojiku/designer-core';
import { describe, expect, it, vi } from 'vitest';
import { acceptsFor, applyDrop, type DragState, rowDropOps, visibleRows } from './rowDrag';

function readOf(doc: Record<string, unknown>): ReadFn {
  return (path) => doc[path];
}

const DOC: Record<string, unknown> = {
  'sections.body': { type: 'flow', items: [{}, {}] },
  'sections.body.items[0]': { type: 'text', text: 'a' },
  'sections.body.items[1]': { type: 'container', items: [] },
  'sections.body.items[1].items': [],
};
const READ = readOf(DOC);

const DRAG: DragState = {
  path: 'sections.body.items[0]',
  parent: 'sections.body.items',
  from: 0,
  pointerId: 1,
  startY: 0,
  started: true,
  drop: null,
};

describe('acceptsFor', () => {
  const accepts = acceptsFor(READ, DRAG.path, DRAG.parent);

  it('always accepts the row own parent — that is a plain reorder', () => {
    expect(accepts('sections.body.items')).toBe(true);
  });

  it('accepts a container the shared model would move this row into', () => {
    expect(accepts('sections.body.items[1].items')).toBe(true);
  });

  it('refuses a sequence whose owner receives nothing', () => {
    expect(accepts('sections.body.items[0].items')).toBe(false);
    expect(accepts('nowhere.items')).toBe(false);
  });

  it('refuses everything when the document read throws (alias-bomb posture)', () => {
    const throwing = () => {
      throw new Error('alias bomb');
    };
    const accepts = acceptsFor(throwing, DRAG.path, DRAG.parent);
    expect(accepts('sections.body.items[1].items')).toBe(false);
    // Its OWN parent still passes — a plain reorder reads no document.
    expect(accepts('sections.body.items')).toBe(true);
  });

  it('refuses a destination the shared model rejects for THIS row', () => {
    // A `page_number` lays out only in a band, so no container takes it.
    const read = readOf({ ...DOC, 'sections.body.items[0]': { type: 'page_number' } });
    expect(acceptsFor(read, DRAG.path, DRAG.parent)('sections.body.items[1].items')).toBe(false);
  });
});

describe('visibleRows', () => {
  it('skips a path whose row is not mounted', () => {
    const el = {
      getBoundingClientRect: () => ({ top: 5, height: 20, left: 12 }),
    } as unknown as HTMLElement;
    const rowRefs = { current: new Map([['sections.body.items[0]', el]]) };
    expect(visibleRows(rowRefs, ['sections.body', 'sections.body.items[0]'])).toEqual([
      { path: 'sections.body.items[0]', top: 5, height: 20, left: 12 },
    ]);
  });
});

describe('rowDropOps', () => {
  it('is ONE moveItem for a drop in the row own parent', () => {
    expect(rowDropOps(READ, DRAG, { parent: 'sections.body.items', index: 2 })).toEqual({
      ops: [{ op: 'moveItem', path: 'sections.body.items', from: 0, to: 1 }],
      selectPath: 'sections.body.items[1]',
    });
  });

  it('commits nothing when the drop lands where the row already is', () => {
    expect(rowDropOps(READ, DRAG, { parent: 'sections.body.items', index: 0 })).toBeNull();
  });

  it('is the shared reparent batch for a drop in another parent', () => {
    expect(rowDropOps(READ, DRAG, { parent: 'sections.body.items[1].items', index: 0 })).toEqual({
      ops: [
        {
          op: 'moveItem',
          path: 'sections.body.items',
          from: 0,
          to: 0,
          toPath: 'sections.body.items[1].items',
        },
      ],
      // The container drops from items[1] to items[0] once the row leaves.
      selectPath: 'sections.body.items[0].items[0]',
    });
  });

  it('commits nothing when the destination owner receives nothing', () => {
    expect(rowDropOps(READ, DRAG, { parent: 'sections.body.items[0].items', index: 0 })).toBeNull();
  });

  it('commits nothing when the shared model refuses the move', () => {
    const read = readOf({ ...DOC, 'sections.body.items[0]': { type: 'page_number' } });
    expect(rowDropOps(read, DRAG, { parent: 'sections.body.items[1].items', index: 0 })).toBeNull();
  });
});

describe('applyDrop', () => {
  it('moves the selection only when the batch lands', () => {
    const onSelect = vi.fn();
    const ok = vi.fn((_ops: readonly Op[]): OpResult => ({ ok: true }));
    applyDrop(ok, onSelect, [], 'sections.body.items[1]');
    expect(onSelect).toHaveBeenCalledWith('sections.body.items[1]');

    const refused = vi.fn(
      (_ops: readonly Op[]): OpResult => ({
        ok: false,
        error: { code: 'index_out_of_range', message: 'no' },
      }),
    );
    onSelect.mockClear();
    applyDrop(refused, onSelect, [], 'sections.body.items[1]');
    expect(onSelect).not.toHaveBeenCalled();
  });
});
