// Tests for reparent.ts — the shared cross-parent move, as ops. Every refusal
// is asserted as "authors NOTHING", because that is what the model promises
// the two surfaces: a `null` is an indicator that never paints and a release
// that never edits.
import type { ReadFn } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { receiverFor } from './dnd';
import type { PageMargin } from './marginGuide';
import { type ReparentTarget, reparentedPath, reparentOps } from './reparent';

function readOf(doc: Record<string, unknown>): ReadFn {
  return (path) => doc[path];
}

const DOC: Record<string, unknown> = {
  'sections.header': { height: 40, items: [{}] },
  'sections.body': { type: 'flow', items: [{}, {}, {}] },
  'sections.body.items[0]': { type: 'text', text: 'plain' },
  'sections.body.items[1]': { type: 'text', box: { x: 12, y: '5mm', w: 100 } },
  'sections.body.items[2]': { type: 'container', items: [{}] },
  'sections.body.items[2].items[0]': { type: 'text', text: 'inner' },
  'sections.header.items[0]': { type: 'page_number', box: { x: 0, y: 4 } },
};

const READ = readOf(DOC);
const MARGIN: PageMargin = [20, 30, 20, 30];

/** The target naming an owner by path, at `index`. */
function target(owner: string, index: number, at?: { x: number; y: number }): ReparentTarget {
  const receiver = receiverFor(READ, owner);
  if (receiver === null) {
    throw new Error(`no receiver at ${owner}`);
  }
  return at === undefined ? { receiver, index } : { receiver, index, at };
}

describe('reparentOps — into an ORDER-placed owner', () => {
  it('is the move alone when the item authors no coordinates', () => {
    expect(
      reparentOps(READ, 'sections.body.items[0]', target('sections.body.items[2]', 1), null),
    ).toEqual([
      {
        op: 'moveItem',
        path: 'sections.body.items',
        from: 0,
        to: 1,
        toPath: 'sections.body.items[2].items',
      },
    ]);
  });

  it('clears an authored x and y first — they are not layout there', () => {
    const ops = reparentOps(
      READ,
      'sections.body.items[1]',
      target('sections.body.items[2]', 0),
      null,
    );
    expect(ops?.slice(0, 2)).toEqual([
      { op: 'removeKey', path: 'sections.body.items[1]', keys: ['box', 'x'] },
      { op: 'removeKey', path: 'sections.body.items[1]', keys: ['box', 'y'] },
    ]);
    // The clears address the OLD path, so they must run before the move.
    expect(ops?.[2]).toMatchObject({ op: 'moveItem', to: 0 });
  });

  it('clears only the axis that was authored', () => {
    const read = readOf({
      ...DOC,
      'sections.body.items[0]': { type: 'text', box: { y: 9, w: 10 } },
    });
    const ops = reparentOps(
      read,
      'sections.body.items[0]',
      target('sections.body.items[2]', 0),
      null,
    );
    expect(ops?.filter((op) => op.op === 'removeKey')).toEqual([
      { op: 'removeKey', path: 'sections.body.items[0]', keys: ['box', 'y'] },
    ]);
  });
});

describe('reparentOps — into a COORDINATE-placed owner', () => {
  it('writes x and y from the drop point, against the margin box', () => {
    const ops = reparentOps(
      READ,
      'sections.body.items[0]',
      target('sections.header', 1, { x: 130, y: 60 }),
      MARGIN,
    );
    expect(ops?.slice(0, 2)).toEqual([
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['box', 'x'], value: 100 },
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['box', 'y'], value: 40 },
    ]);
  });

  it('keeps the authored UNIT when the item already had one', () => {
    const ops = reparentOps(
      READ,
      'sections.body.items[1]',
      target('sections.header', 1, { x: 30, y: 48.4 }),
      MARGIN,
    );
    // x resolves back to 0 (the margin corner) and y to 10mm.
    expect(ops?.slice(0, 2)).toEqual([
      { op: 'setScalar', path: 'sections.body.items[1]', keys: ['box', 'x'], value: 0 },
      { op: 'setScalar', path: 'sections.body.items[1]', keys: ['box', 'y'], value: '10mm' },
    ]);
  });

  it('authors NO coordinates without a drop point — the layer tree case', () => {
    expect(
      reparentOps(READ, 'sections.body.items[0]', target('sections.header', 1), MARGIN),
    ).toEqual([
      {
        op: 'moveItem',
        path: 'sections.body.items',
        from: 0,
        to: 1,
        toPath: 'sections.header.items',
      },
    ]);
  });

  it('authors NO coordinates when the margins are not known yet', () => {
    const ops = reparentOps(
      READ,
      'sections.body.items[0]',
      target('sections.header', 1, { x: 130, y: 60 }),
      null,
    );
    expect(ops).toHaveLength(1);
  });

  it('refuses a non-finite drop point rather than authoring garbage', () => {
    for (const at of [
      { x: Number.NaN, y: 0 },
      { x: 0, y: Number.POSITIVE_INFINITY },
    ]) {
      expect(
        reparentOps(READ, 'sections.body.items[0]', target('sections.header', 1, at), MARGIN),
      ).toBeNull();
    }
  });

  it('refuses a position authored in a relative unit it cannot write back', () => {
    const read = readOf({
      ...DOC,
      'sections.body.items[0]': { type: 'text', box: { x: '50%', y: 0 } },
    });
    expect(
      reparentOps(
        read,
        'sections.body.items[0]',
        target('sections.header', 1, { x: 1, y: 1 }),
        MARGIN,
      ),
    ).toBeNull();
  });
});

describe('reparentOps — refusals', () => {
  it('authors nothing for the item OWN parent — the reorder path owns that', () => {
    expect(
      reparentOps(READ, 'sections.body.items[0]', target('sections.body', 2), null),
    ).toBeNull();
  });

  it('authors nothing for a destination inside the item being moved', () => {
    expect(
      reparentOps(READ, 'sections.body.items[2]', target('sections.body.items[2]', 0), null),
    ).toBeNull();
  });

  it('authors nothing for an item type the destination cannot lay out', () => {
    // A `page_number` lays out only in a band.
    expect(
      reparentOps(READ, 'sections.header.items[0]', target('sections.body.items[2]', 0), null),
    ).toBeNull();
  });

  it('authors nothing for a source that is not a sequence entry', () => {
    expect(
      reparentOps(READ, 'sections.body', target('sections.body.items[2]', 0), null),
    ).toBeNull();
    expect(
      reparentOps(READ, 'sections.body.items[0].columns[0]', target('sections.body', 0), null),
    ).toBeNull();
  });

  it('authors nothing for a source inside a repeating sub-template', () => {
    const read = readOf({
      ...DOC,
      'sections.body.items[2].cell.items[0]': { type: 'text' },
    });
    expect(
      reparentOps(read, 'sections.body.items[2].cell.items[0]', target('sections.body', 0), null),
    ).toBeNull();
  });

  it('authors nothing for a hostile index', () => {
    for (const index of [-1, 1.5, Number.NaN]) {
      expect(
        reparentOps(READ, 'sections.body.items[0]', target('sections.body.items[2]', index), null),
      ).toBeNull();
    }
  });

  it('authors nothing when the item read throws, or reads as a non-map', () => {
    const receiver = receiverFor(READ, 'sections.body.items[2]');
    if (receiver === null) {
      throw new Error('fixture');
    }
    expect(
      reparentOps(
        () => {
          throw new Error('alias bomb');
        },
        'sections.body.items[0]',
        { receiver, index: 0 },
        null,
      ),
    ).toBeNull();
    expect(
      reparentOps(readOf({}), 'sections.body.items[0]', { receiver, index: 0 }, null),
    ).toBeNull();
  });
});

describe('reparentedPath', () => {
  const parent = 'sections.body.items';

  it('is the plain destination path when the removal shifts nothing', () => {
    expect(reparentedPath(parent, 3, 'sections.header.items', 1)).toBe('sections.header.items[1]');
    expect(reparentedPath(parent, 3, `${parent}[1].items`, 0)).toBe(`${parent}[1].items[0]`);
  });

  it('shifts a destination that sits inside a LATER sibling of the moved item', () => {
    // Lifting items[1] out drops items[4] to items[3], so the item lands at
    // items[3].items[2] — not at the pre-move spelling.
    expect(reparentedPath(parent, 1, `${parent}[4].items`, 2)).toBe(`${parent}[3].items[2]`);
  });

  it('shifts the sibling INDEX, never a similar-looking one', () => {
    // `[10]` must not be read as `[1]`.
    expect(reparentedPath(parent, 1, `${parent}[10].items`, 0)).toBe(`${parent}[9].items[0]`);
    // A destination whose first index equals the moved index cannot be a later
    // sibling — it IS the moved item, which `reparentOps` already refuses.
    expect(reparentedPath(parent, 4, `${parent}[4].items`, 0)).toBe(`${parent}[4].items[0]`);
  });

  it('leaves a malformed destination spelling alone', () => {
    expect(reparentedPath(parent, 1, `${parent}[x].items`, 0)).toBe(`${parent}[x].items[0]`);
  });
});
