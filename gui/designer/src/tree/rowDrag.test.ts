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

describe('rowDropOps into a band', () => {
  // A4 at margin 25: the document's margin box is 791.89pt, floored to 791.
  const BAND_DOC: Record<string, unknown> = {
    page: { size: 'A4', margin: 25 },
    'sections.header': { items: [] },
    'sections.footer': { items: [] },
    'sections.body': { type: 'flow', items: [] },
    'sections.body.items[0]': { type: 'text', text: 'a' },
    'sections.body.items[1]': { type: 'rect', box: { w: 120, h: 60 } },
    'sections.body.items[2]': { type: 'text', text: 'b', box: { y: 12 } },
    'sections.body.items[3]': { type: 'line', from: { x: 0, y: 0 }, to: { x: 10, y: 0 } },
    'sections.body.items[4]': { type: 'ellipse', anchor: 'total', box: { w: 60, h: 40 } },
    'sections.body.items[5]': { type: 'container', items: [{}] },
    'sections.body.items[5].items[0]': { type: 'text', text: 'pinned', box: { x: 10, y: 4 } },
    'sections.header.items[0]': { type: 'text', text: 'h', box: { y: 5 } },
  };
  const drag = (index: number): DragState => ({
    ...DRAG,
    path: `sections.body.items[${index}]`,
    from: index,
  });
  const move = (index: number, toPath: string) => ({
    op: 'moveItem',
    path: 'sections.body.items',
    from: index,
    to: 0,
    toPath,
  });
  const footer = { parent: 'sections.footer.items', index: 0 };

  it('lands a box-less row at the foot of a footer, like an insert there', () => {
    const result = rowDropOps(readOf(BAND_DOC), drag(0), footer);
    expect(result?.ops).toEqual([
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['box', 'y'], value: 759 },
      move(0, 'sections.footer.items'),
    ]);
  });

  it('bottom-aligns a row that carries its own numeric height', () => {
    const result = rowDropOps(readOf(BAND_DOC), drag(1), footer);
    expect(result?.ops[0]).toEqual({
      op: 'setScalar',
      path: 'sections.body.items[1]',
      keys: ['box', 'y'],
      value: 731,
    });
  });

  it('writes nothing for the top of a header, where a box-less row already sits', () => {
    const result = rowDropOps(readOf(BAND_DOC), drag(0), {
      parent: 'sections.header.items',
      index: 0,
    });
    expect(result?.ops).toEqual([move(0, 'sections.header.items')]);
  });

  it('keeps coordinates that are already margin-box coordinates: a row from another band', () => {
    const fromHeader: DragState = {
      ...DRAG,
      path: 'sections.header.items[0]',
      parent: 'sections.header.items',
    };
    expect(rowDropOps(readOf(BAND_DOC), fromHeader, footer)?.ops).toEqual([
      {
        op: 'moveItem',
        path: 'sections.header.items',
        from: 0,
        to: 0,
        toPath: 'sections.footer.items',
      },
    ]);
  });

  it('re-lands a row whose x/y were never margin-box coordinates', () => {
    // A flow-body `y` the engine never read…
    expect(rowDropOps(readOf(BAND_DOC), drag(2), footer)?.ops).toEqual([
      { op: 'setScalar', path: 'sections.body.items[2]', keys: ['box', 'y'], value: 759 },
      move(2, 'sections.footer.items'),
    ]);
    // …and a container child pinned against the CONTAINER's origin.
    const pinned: DragState = {
      ...DRAG,
      path: 'sections.body.items[5].items[0]',
      parent: 'sections.body.items[5].items',
    };
    expect(rowDropOps(readOf(BAND_DOC), pinned, footer)?.ops).toEqual([
      { op: 'setScalar', path: 'sections.body.items[5].items[0]', keys: ['box', 'x'], value: 0 },
      { op: 'setScalar', path: 'sections.body.items[5].items[0]', keys: ['box', 'y'], value: 759 },
      {
        op: 'moveItem',
        path: 'sections.body.items[5].items',
        from: 0,
        to: 0,
        toPath: 'sections.footer.items',
      },
    ]);
  });

  it('writes no box position for a line or an anchored ellipse', () => {
    expect(rowDropOps(readOf(BAND_DOC), drag(3), footer)?.ops).toEqual([
      move(3, 'sections.footer.items'),
    ]);
    expect(rowDropOps(readOf(BAND_DOC), drag(4), footer)?.ops).toEqual([
      move(4, 'sections.footer.items'),
    ]);
  });

  it('degrades to no coordinates when the margin box cannot be measured', () => {
    // An unrecognized page size has no exact pt height: the landing is the top,
    // which writes nothing rather than a guessed coordinate.
    const doc = { ...BAND_DOC, page: { size: 'NOT-A-SIZE', margin: 25 } };
    expect(rowDropOps(readOf(doc), drag(0), footer)?.ops).toEqual([
      move(0, 'sections.footer.items'),
    ]);
    // A valid document whose vertical margins are percentages has none either.
    const percent = { ...BAND_DOC, page: { size: 'A4', margin: { top: '5%', bottom: '5%' } } };
    expect(rowDropOps(readOf(percent), drag(0), footer)?.ops).toEqual([
      move(0, 'sections.footer.items'),
    ]);
  });

  it('leaves the move to the shared model when the row or the document cannot be read', () => {
    const scalar = { ...BAND_DOC, 'sections.body.items[0]': 'garbage' };
    expect(rowDropOps(readOf(scalar), drag(0), footer)).toBeNull();
    const throwing: ReadFn = (path) => {
      if (path === 'page') {
        throw new Error('refused');
      }
      return BAND_DOC[path];
    };
    expect(rowDropOps(throwing, drag(0), footer)?.ops).toEqual([move(0, 'sections.footer.items')]);
  });
});

describe('the tree indicator and release agree about a band', () => {
  it('refuses at both, not just at release, when the landing cannot be written', () => {
    // An absurd custom page puts the landing beyond what a length can be
    // written as; the indicator must not promise a drop the release refuses.
    const doc: Record<string, unknown> = {
      page: { size: { w: 10, h: 1e307 }, margin: 0 },
      'sections.footer': { items: [] },
      'sections.body': { type: 'flow', items: [{}] },
      'sections.body.items[0]': { type: 'text', text: 'a' },
    };
    const read = readOf(doc);
    expect(rowDropOps(read, DRAG, { parent: 'sections.footer.items', index: 0 })).toBeNull();
    expect(acceptsFor(read, DRAG.path, DRAG.parent)('sections.footer.items')).toBe(false);
    // …and the ordinary page is accepted at both.
    const ok = readOf({ ...doc, page: { size: 'A4', margin: 25 } });
    expect(rowDropOps(ok, DRAG, { parent: 'sections.footer.items', index: 0 })).not.toBeNull();
    expect(acceptsFor(ok, DRAG.path, DRAG.parent)('sections.footer.items')).toBe(true);
  });

  it('leaves a path that is not a sequence entry to the shared model', () => {
    const read = readOf({ 'sections.footer': { items: [] }, 'sections.body': { type: 'flow' } });
    expect(acceptsFor(read, 'sections.body', 'sections')('sections.footer.items')).toBe(false);
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
