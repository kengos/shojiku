// The `line` endpoint model. A line's `from`/`to` are the only position it
// has, and both are REQUIRED on the wire — so the write side's job is as much
// about what it REFUSES as about what it authors: a document that will not
// parse is worse than an edit that does not land.

import type { ReadFn } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { anchorTargets, readItemId } from './anchorTargets';
import {
  isAnchored,
  type LinePointsView,
  lineAnchorOps,
  lineArmOps,
  linePointOps,
  readLinePoints,
} from './linePoints';

const PATH = 'sections.body.items[0]';

function readerOf(item: unknown): ReadFn {
  return (path: string) => (path === PATH ? item : undefined);
}

function viewOf(item: unknown): LinePointsView {
  return readLinePoints(readerOf(item), PATH);
}

const CUT_LINE = { type: 'line', from: { x: 0, y: 2 }, to: { x: '100%', y: 2 } };

describe('readLinePoints', () => {
  it('reads both endpoints in their authored forms', () => {
    expect(viewOf(CUT_LINE)).toEqual({
      'from.x': '0',
      'from.y': '2',
      'to.x': '100%',
      'to.y': '2',
      'from.item': '',
      'from.edge': '',
      'to.item': '',
      'to.edge': '',
      offsets: { from: false, to: false },
      anchored: { from: false, to: false },
    });
  });

  it('accepts every unit the engine length grammar takes', () => {
    const view = viewOf({ from: { x: '12mm', y: '1.5em' }, to: { x: '2rem', y: '-3.25pt' } });
    expect(view).toEqual({
      'from.x': '12mm',
      'from.y': '1.5em',
      'to.x': '2rem',
      'to.y': '-3.25pt',
      'from.item': '',
      'from.edge': '',
      'to.item': '',
      'to.edge': '',
      offsets: { from: false, to: false },
      anchored: { from: false, to: false },
    });
  });

  it('reads a value it could not write back as unset, never verbatim', () => {
    // A map, a non-finite number, a relative-unit typo, and a string past the
    // length bound: showing any of these would offer a field whose own value
    // is not re-committable.
    const view = viewOf({
      from: { x: { pt: 4 }, y: Number.POSITIVE_INFINITY },
      to: { x: '12 furlongs', y: `${'9'.repeat(40)}pt` },
    });
    expect(view).toEqual({
      'from.x': '',
      'from.y': '',
      'to.x': '',
      'to.y': '',
      'from.item': '',
      'from.edge': '',
      'to.item': '',
      'to.edge': '',
      offsets: { from: false, to: false },
      anchored: { from: false, to: false },
    });
  });

  it('reads a missing, malformed or throwing document as four empty fields', () => {
    expect(viewOf({ type: 'line' })).toEqual({
      'from.x': '',
      'from.y': '',
      'to.x': '',
      'to.y': '',
      'from.item': '',
      'from.edge': '',
      'to.item': '',
      'to.edge': '',
      offsets: { from: false, to: false },
      anchored: { from: false, to: false },
    });
    expect(viewOf(['not', 'a', 'map'])).toEqual({
      'from.x': '',
      'from.y': '',
      'to.x': '',
      'to.y': '',
      'from.item': '',
      'from.edge': '',
      'to.item': '',
      'to.edge': '',
      offsets: { from: false, to: false },
      anchored: { from: false, to: false },
    });
    const throwing: ReadFn = () => {
      throw new Error('hostile document');
    };
    expect(readLinePoints(throwing, PATH)).toEqual({
      'from.x': '',
      'from.y': '',
      'to.x': '',
      'to.y': '',
      'from.item': '',
      'from.edge': '',
      'to.item': '',
      'to.edge': '',
      offsets: { from: false, to: false },
      anchored: { from: false, to: false },
    });
  });
});

describe('linePointOps', () => {
  const view = viewOf(CUT_LINE);

  it('authors a unitless entry as a NUMBER — the engine bare-pt form', () => {
    expect(linePointOps(PATH, view, 'from.x', '18')).toEqual([
      { op: 'setScalar', path: PATH, keys: ['from', 'x'], value: 18 },
    ]);
  });

  it('keeps a suffixed entry as its authored string', () => {
    expect(linePointOps(PATH, view, 'to.y', '12.5mm')).toEqual([
      { op: 'setScalar', path: PATH, keys: ['to', 'y'], value: '12.5mm' },
    ]);
    expect(linePointOps(PATH, view, 'from.x', '50%')).toEqual([
      { op: 'setScalar', path: PATH, keys: ['from', 'x'], value: '50%' },
    ]);
  });

  it('writes nothing when the value did not change, trimming first', () => {
    expect(linePointOps(PATH, view, 'to.x', '100%')).toEqual([]);
    expect(linePointOps(PATH, view, 'to.x', '  100%  ')).toEqual([]);
  });

  // Both endpoints are required (`PointSpec { x, y }`, neither optional), so
  // there is no key-removal state to clear a field into.
  it('refuses an empty entry rather than removing a required key', () => {
    expect(linePointOps(PATH, view, 'from.y', '')).toEqual([]);
    expect(linePointOps(PATH, view, 'from.y', '   ')).toEqual([]);
  });

  it('refuses anything outside the engine length grammar', () => {
    for (const bad of ['abc', '12 furlongs', '1e6', '--3', '4..5', '12 pt', `${'9'.repeat(40)}`]) {
      expect(linePointOps(PATH, view, 'to.x', bad), bad).toEqual([]);
    }
  });

  it('accepts a negative endpoint — a line may start above its origin', () => {
    expect(linePointOps(PATH, view, 'from.y', '-4')).toEqual([
      { op: 'setScalar', path: PATH, keys: ['from', 'y'], value: -4 },
    ]);
  });
});

describe('anchorTargets / readItemId', () => {
  it('lists placed ids, deduped and sorted, minus the line’s own', () => {
    const pages = [
      [{ id: 'total' }, { id: 'note' }, {}],
      [{ id: 'total' }, { id: 'self' }],
    ];
    expect(anchorTargets(pages, 'self')).toEqual(['note', 'total']);
  });

  it('reads no targets when there is no geometry yet', () => {
    expect(anchorTargets(undefined, undefined)).toEqual([]);
  });

  it('reads the item’s own id, and nothing from a hostile document', () => {
    expect(readItemId(readerOf({ id: 'leader' }), PATH)).toBe('leader');
    expect(readItemId(readerOf({ id: 42 }), PATH)).toBeUndefined();
    // A document node that is not a map at all (a sequence, a scalar) —
    // the shape a hostile or half-edited file reaches the panel with.
    expect(readItemId(readerOf([1, 2]), PATH)).toBeUndefined();
    expect(readItemId(readerOf('line'), PATH)).toBeUndefined();
    expect(
      readItemId(() => {
        throw new Error('boom');
      }, PATH),
    ).toBeUndefined();
  });
});

describe('the anchored arm', () => {
  const ANCHORED = { type: 'line', from: { x: 0, y: 2 }, to: { item: 'total', edge: 'left' } };

  it('reads the arm from the WIRE, not from a mode flag', () => {
    // An externally-authored document must display honestly: this one was
    // never touched by the panel, and there is no UI state to consult.
    const view = viewOf(ANCHORED);
    expect(isAnchored(view, 'to')).toBe(true);
    expect(isAnchored(view, 'from')).toBe(false);
    expect(view['to.item']).toBe('total');
    expect(view['to.edge']).toBe('left');
    expect(view['to.x']).toBe('');
  });

  it('shows a hostile id as unset rather than round-tripping it', () => {
    const view = viewOf({ from: { x: 0, y: 0 }, to: { item: 'a‮b c!' } });
    expect(view['to.item']).toBe('');
    // …but the endpoint is still ANCHORED. Reading the arm off the display
    // text would show empty coordinate fields for an anchored endpoint, and
    // the switch below would then overwrite an id the user never saw.
    expect(isAnchored(view, 'to')).toBe(true);
  });

  it('drops an undisplayable id when switching to coordinates', () => {
    const view = viewOf({ to: { item: 'a‮b c!' } });
    expect(lineArmOps(PATH, view, 'to', 'xy')).toEqual([
      { op: 'removeKey', path: PATH, keys: ['to', 'item'] },
      { op: 'setScalar', path: PATH, keys: ['to', 'x'], value: 0 },
      { op: 'setScalar', path: PATH, keys: ['to', 'y'], value: 0 },
    ]);
  });

  it('switches coordinates -> anchored in ONE undo step, with no stale x/y', () => {
    const ops = lineArmOps(PATH, viewOf(CUT_LINE), 'to', 'anchor');
    expect(ops).toEqual([
      { op: 'removeKey', path: PATH, keys: ['to', 'x'] },
      { op: 'removeKey', path: PATH, keys: ['to', 'y'] },
      { op: 'setScalar', path: PATH, keys: ['to', 'item'], value: '' },
    ]);
  });

  it('switches anchored -> coordinates in ONE undo step, with no stale anchor keys', () => {
    // The mirror case, asserted separately: a two-sided toggle ships
    // half-done when only one direction is covered.
    const ops = lineArmOps(
      PATH,
      viewOf({ from: { item: 'total', edge: 'left', offset: { x: 1 } } }),
      'from',
      'xy',
    );
    expect(ops).toEqual([
      { op: 'removeKey', path: PATH, keys: ['from', 'item'] },
      { op: 'removeKey', path: PATH, keys: ['from', 'edge'] },
      { op: 'removeKey', path: PATH, keys: ['from', 'offset'] },
      { op: 'setScalar', path: PATH, keys: ['from', 'x'], value: 0 },
      { op: 'setScalar', path: PATH, keys: ['from', 'y'], value: 0 },
    ]);
  });

  it('drops only the keys the document carries', () => {
    // An anchor with no `edge`/`offset`: removing keys that are not there
    // would refuse the whole batch, and the switch would silently no-op.
    const ops = lineArmOps(PATH, viewOf({ to: { item: 'total' } }), 'to', 'xy');
    expect(ops).toEqual([
      { op: 'removeKey', path: PATH, keys: ['to', 'item'] },
      { op: 'setScalar', path: PATH, keys: ['to', 'x'], value: 0 },
      { op: 'setScalar', path: PATH, keys: ['to', 'y'], value: 0 },
    ]);
  });

  it('asking a coordinate endpoint for coordinates removes nothing', () => {
    // The button never asks this — it offers the arm the endpoint is NOT in
    // — but the model is called by ops code too, and a stray `removeKey`
    // for an absent `item` would refuse the whole batch.
    expect(lineArmOps(PATH, viewOf(CUT_LINE), 'to', 'xy')).toEqual([
      { op: 'setScalar', path: PATH, keys: ['to', 'x'], value: 0 },
      { op: 'setScalar', path: PATH, keys: ['to', 'y'], value: 0 },
    ]);
  });

  it('writes an edge only when it is one the engine knows', () => {
    const view = viewOf(ANCHORED);
    expect(lineAnchorOps(PATH, view, 'to.edge', 'top')).toEqual([
      { op: 'setScalar', path: PATH, keys: ['to', 'edge'], value: 'top' },
    ]);
    expect(lineAnchorOps(PATH, view, 'to.edge', 'centre')).toEqual([]);
    expect(lineAnchorOps(PATH, view, 'to.edge', 'left')).toEqual([]);
  });

  it('clearing the edge REMOVES the key, because its absence is `center`', () => {
    const view = viewOf(ANCHORED);
    expect(lineAnchorOps(PATH, view, 'to.edge', '')).toEqual([
      { op: 'removeKey', path: PATH, keys: ['to', 'edge'] },
    ]);
  });

  it('refuses to clear the target — the arm has no meaning without one', () => {
    const view = viewOf(ANCHORED);
    expect(lineAnchorOps(PATH, view, 'to.item', '')).toEqual([]);
    expect(lineAnchorOps(PATH, view, 'to.item', 'a b')).toEqual([]);
    expect(lineAnchorOps(PATH, view, 'to.item', 'other')).toEqual([
      { op: 'setScalar', path: PATH, keys: ['to', 'item'], value: 'other' },
    ]);
  });
});
