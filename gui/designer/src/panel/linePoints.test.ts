// The `line` endpoint model. A line's `from`/`to` are the only position it
// has, and both are REQUIRED on the wire — so the write side's job is as much
// about what it REFUSES as about what it authors: a document that will not
// parse is worse than an edit that does not land.

import type { ReadFn } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { type LinePointsView, linePointOps, readLinePoints } from './linePoints';

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
    });
  });

  it('accepts every unit the engine length grammar takes', () => {
    const view = viewOf({ from: { x: '12mm', y: '1.5em' }, to: { x: '2rem', y: '-3.25pt' } });
    expect(view).toEqual({
      'from.x': '12mm',
      'from.y': '1.5em',
      'to.x': '2rem',
      'to.y': '-3.25pt',
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
    expect(view).toEqual({ 'from.x': '', 'from.y': '', 'to.x': '', 'to.y': '' });
  });

  it('reads a missing, malformed or throwing document as four empty fields', () => {
    expect(viewOf({ type: 'line' })).toEqual({
      'from.x': '',
      'from.y': '',
      'to.x': '',
      'to.y': '',
    });
    expect(viewOf(['not', 'a', 'map'])).toEqual({
      'from.x': '',
      'from.y': '',
      'to.x': '',
      'to.y': '',
    });
    const throwing: ReadFn = () => {
      throw new Error('hostile document');
    };
    expect(readLinePoints(throwing, PATH)).toEqual({
      'from.x': '',
      'from.y': '',
      'to.x': '',
      'to.y': '',
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
