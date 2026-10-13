// The anchored-endpoint `offset:` model. The wire takes bare pt NUMBERS only
// — a unit string fails the parse and refuses the whole document — and an
// offset is legal only beside `item:`, so most of these cases are about what
// the write side REFUSES and what it REMOVES.

import { Editor, type ReadFn } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import {
  canStepOffset,
  type LineOffsetView,
  lineOffsetOps,
  readLineOffset,
  stepLineOffsetOps,
} from './lineOffset';

const PATH = 'sections.body.items[1]';

function viewOf(to: unknown): LineOffsetView {
  const read: ReadFn = (path) =>
    path === PATH ? { type: 'line', from: { x: 0, y: 0 }, to } : undefined;
  return readLineOffset(read, PATH, 'to');
}

/** A real document whose `to` endpoint is `to` (flow YAML). */
function editorWith(to: string): Editor {
  return Editor.create(
    [
      'page: { size: A4, margin: 0 }',
      'sections:',
      '  body:',
      '    type: absolute',
      '    items:',
      '      - { type: rect, id: r1, box: { x: 200, y: 100, w: 40, h: 40 } }',
      `      - { type: line, from: { x: 0, y: 0 }, to: ${to} }`,
      '',
    ].join('\n'),
  );
}

/** Commit `raw` to `axis` of the real document's `to` endpoint. */
function commit(editor: Editor, axis: 'x' | 'y', raw: string) {
  const view = readLineOffset((p) => editor.read(p), PATH, 'to');
  const ops = lineOffsetOps(PATH, view, 'to', axis, raw, true);
  expect(editor.applyAll(ops).ok).toBe(true);
  return ops;
}

const toOf = (editor: Editor) => editor.read(`${PATH}.to`);

describe('readLineOffset', () => {
  it('reads an absent offset as two empty, absent axes', () => {
    expect(viewOf({ item: 'r1' })).toEqual({
      x: { text: '', present: false, readable: true },
      y: { text: '', present: false, readable: true },
      shape: 'absent',
    });
  });

  it('reads numbers verbatim, negatives and fractions included', () => {
    const view = viewOf({ item: 'r1', offset: { x: 4, y: -2.5 } });
    expect(view.x).toEqual({ text: '4', present: true, readable: true });
    expect(view.y).toEqual({ text: '-2.5', present: true, readable: true });
    expect(view.shape).toBe('map');
  });

  it('reads -0 as 0 and a one-axis offset with the other axis absent', () => {
    const view = viewOf({ item: 'r1', offset: { y: -0 } });
    expect(view.x.present).toBe(false);
    expect(view.y).toEqual({ text: '0', present: true, readable: true });
  });

  it('shows a string the engine refuses, marked unreadable', () => {
    // `offset: { x: "2mm" }` is a whole-document parse error; the field shows
    // the text so the user can see and replace it.
    expect(viewOf({ item: 'r1', offset: { x: '2mm' } }).x).toEqual({
      text: '2mm',
      present: true,
      readable: false,
    });
  });

  it('keeps an over-long string and a non-string value out of the field, still present', () => {
    const long = viewOf({ item: 'r1', offset: { x: 'x'.repeat(40), y: true } });
    expect(long.x).toEqual({ text: '', present: true, readable: false });
    expect(long.y).toEqual({ text: '', present: true, readable: false });
    expect(viewOf({ item: 'r1', offset: { x: { a: 1 } } }).x.readable).toBe(false);
    expect(viewOf({ item: 'r1', offset: { x: Number.POSITIVE_INFINITY } }).x.readable).toBe(false);
  });

  it("reads a bare `offset:` as shape 'null' — no shift, nothing to fix", () => {
    // The engine reads `offset: ~` as no offset at all (measured: it renders
    // identically), so it must not be classed with the values it refuses.
    expect(viewOf({ item: 'r1', offset: null })).toEqual({
      x: { text: '', present: false, readable: true },
      y: { text: '', present: false, readable: true },
      shape: 'null',
    });
  });

  it('reads the START endpoint, not the end', () => {
    const read: ReadFn = () => ({
      type: 'line',
      from: { item: 'r1', offset: { y: 2 } },
      to: { item: 'r1', offset: { x: 9 } },
    });
    const view = readLineOffset(read, PATH, 'from');
    expect(view.y.text).toBe('2');
    expect(view.x.present).toBe(false);
  });

  it("reads a non-map offset as shape 'other'", () => {
    expect(viewOf({ item: 'r1', offset: 5 }).shape).toBe('other');
    expect(viewOf({ item: 'r1', offset: [1, 2] }).shape).toBe('other');
  });

  it('reads a throwing or hostile document as no offset', () => {
    const throwing: ReadFn = () => {
      throw new Error('boom');
    };
    expect(readLineOffset(throwing, PATH, 'to').shape).toBe('absent');
    expect(viewOf('not a map').shape).toBe('absent');
    expect(readLineOffset(() => null, PATH, 'from').shape).toBe('absent');
  });
});

describe('lineOffsetOps — writes', () => {
  it('writes a typed numeral as a NUMBER under to.offset, keeping item', () => {
    const editor = editorWith('{ item: r1 }');
    expect(commit(editor, 'x', '4')).toEqual([
      { op: 'setScalar', path: PATH, keys: ['to', 'offset', 'x'], value: 4 },
    ]);
    expect(toOf(editor)).toEqual({ item: 'r1', offset: { x: 4 } });
    commit(editor, 'y', ' -4.5 ');
    expect(toOf(editor)).toEqual({ item: 'r1', offset: { x: 4, y: -4.5 } });
  });

  it('writes nothing for an unchanged entry — the same text or the same number', () => {
    // Without the guard each of these is a same-value setScalar, which lands
    // and pushes an undo step for a change that did not happen.
    const view = viewOf({ item: 'r1', offset: { x: 4 } });
    expect(lineOffsetOps(PATH, view, 'to', 'x', '4', true)).toEqual([]);
    expect(lineOffsetOps(PATH, view, 'to', 'x', ' 4 ', true)).toEqual([]);
    expect(lineOffsetOps(PATH, view, 'to', 'x', '4.0', true)).toEqual([]);
  });

  it.each([['2mm'], ['4pt'], ['1e3'], ['abc'], ['-'], ['--1'], ['+4'], ['.5'], ['1'.repeat(33)]])(
    'refuses %j — the engine reads numbers only',
    (raw) => {
      expect(lineOffsetOps(PATH, viewOf({ item: 'r1' }), 'to', 'x', raw, true)).toEqual([]);
    },
  );

  it('writes nothing to an endpoint that is not anchored', () => {
    // The same entry that writes on an anchored endpoint (above) refuses here:
    // `{ x, y, offset }` is an engine parse error.
    const view = viewOf({ x: 0, y: 0 });
    expect(lineOffsetOps(PATH, view, 'to', 'x', '4', false)).toEqual([]);
    expect(lineOffsetOps(PATH, view, 'to', 'x', '', false)).toEqual([]);
  });

  it('replaces a non-map offset whole, in one batch', () => {
    const editor = editorWith('{ item: r1, offset: 5 }');
    expect(commit(editor, 'x', '4')).toEqual([
      { op: 'removeKey', path: PATH, keys: ['to', 'offset'] },
      { op: 'setScalar', path: PATH, keys: ['to', 'offset', 'x'], value: 4 },
    ]);
    expect(toOf(editor)).toEqual({ item: 'r1', offset: { x: 4 } });
  });

  it('replaces a bare `offset:` whole when a number is typed, and leaves it for a zero', () => {
    const editor = editorWith('{ item: r1, offset: ~ }');
    const view = readLineOffset((p) => editor.read(p), PATH, 'to');
    expect(lineOffsetOps(PATH, view, 'to', 'x', '0', true)).toEqual([]);
    expect(commit(editor, 'x', '4')).toEqual([
      { op: 'removeKey', path: PATH, keys: ['to', 'offset'] },
      { op: 'setScalar', path: PATH, keys: ['to', 'offset', 'x'], value: 4 },
    ]);
    expect(toOf(editor)).toEqual({ item: 'r1', offset: { x: 4 } });
  });

  it('refuses a magnitude that would print in exponent form', () => {
    // `String(1e21)` is "1e+21": the field could neither show it back as typed
    // nor step it.
    const view = viewOf({ item: 'r1' });
    expect(lineOffsetOps(PATH, view, 'to', 'x', '1000000000000000000000', true)).toEqual([]);
    expect(lineOffsetOps(PATH, view, 'to', 'x', '-1000000000000000000000', true)).toEqual([]);
    // 21 nines is already 1e21 as a double, so it refuses too; 1e20 is the
    // largest power of ten that still prints as plain digits.
    expect(lineOffsetOps(PATH, view, 'to', 'x', '999999999999999999999', true)).toEqual([]);
    expect(lineOffsetOps(PATH, view, 'to', 'x', '100000000000000000000', true)).toEqual([
      { op: 'setScalar', path: PATH, keys: ['to', 'offset', 'x'], value: 1e20 },
    ]);
  });

  it('writes the START endpoint under from.offset, leaving the end alone', () => {
    const editor = Editor.create(
      editorWith('{ item: r1, offset: { x: 9 } }')
        .text()
        .replace('from: { x: 0, y: 0 }', 'from: { item: r1, edge: top }'),
    );
    const view = readLineOffset((p) => editor.read(p), PATH, 'from');
    expect(editor.applyAll(lineOffsetOps(PATH, view, 'from', 'x', '3', true)).ok).toBe(true);
    expect(editor.read(`${PATH}.from`)).toEqual({ item: 'r1', edge: 'top', offset: { x: 3 } });
    expect(toOf(editor)).toEqual({ item: 'r1', offset: { x: 9 } });
  });

  it('replaces an unreadable string axis with the number typed over it', () => {
    const editor = editorWith('{ item: r1, offset: { x: "2mm" } }');
    commit(editor, 'x', '6');
    expect(toOf(editor)).toEqual({ item: 'r1', offset: { x: 6 } });
  });
});

describe('lineOffsetOps — removal is the normal form of zero', () => {
  it.each([[''], ['0'], ['-0'], ['0.0']])(
    'removes only the axis for %j while the other axis stays',
    (raw) => {
      const editor = editorWith('{ item: r1, offset: { x: 4, y: 2 } }');
      expect(commit(editor, 'x', raw)).toEqual([
        { op: 'removeKey', path: PATH, keys: ['to', 'offset', 'x'] },
      ]);
      expect(toOf(editor)).toEqual({ item: 'r1', offset: { y: 2 } });
    },
  );

  it('removes the whole offset with its last axis — never `offset: {}`', () => {
    const editor = editorWith('{ item: r1, offset: { x: 4 } }');
    expect(commit(editor, 'x', '')).toEqual([
      { op: 'removeKey', path: PATH, keys: ['to', 'offset'] },
    ]);
    expect(toOf(editor)).toEqual({ item: 'r1' });
    expect(editor.text()).not.toContain('offset');
  });

  it('writes nothing when zeroing an axis that is not there', () => {
    const view = viewOf({ item: 'r1', offset: { y: 2 } });
    expect(lineOffsetOps(PATH, view, 'to', 'x', '0', true)).toEqual([]);
    expect(lineOffsetOps(PATH, viewOf({ item: 'r1' }), 'to', 'x', '', true)).toEqual([]);
  });

  it('clears an unreadable axis by emptying it', () => {
    // The field shows `2mm`; emptying it must remove the value the engine
    // refuses, not read as "no change" over an empty field.
    const editor = editorWith('{ item: r1, offset: { x: "2mm" } }');
    commit(editor, 'x', '');
    expect(toOf(editor)).toEqual({ item: 'r1' });
    const hidden = viewOf({ item: 'r1', offset: { x: true, y: 1 } });
    expect(lineOffsetOps(PATH, hidden, 'to', 'x', '', true)).toEqual([
      { op: 'removeKey', path: PATH, keys: ['to', 'offset', 'x'] },
    ]);
  });

  it('removes a non-map offset when emptied', () => {
    expect(lineOffsetOps(PATH, viewOf({ item: 'r1', offset: 5 }), 'to', 'y', '', true)).toEqual([
      { op: 'removeKey', path: PATH, keys: ['to', 'offset'] },
    ]);
  });
});

describe('stepLineOffsetOps', () => {
  const step = (to: unknown, dir: 1 | -1, by: number, anchored = true) =>
    stepLineOffsetOps(PATH, viewOf(to), 'to', 'x', dir, by, anchored);

  it('steps an empty axis from its 0 default', () => {
    expect(step({ item: 'r1' }, 1, 1)).toEqual([
      { op: 'setScalar', path: PATH, keys: ['to', 'offset', 'x'], value: 1 },
    ]);
    expect(step({ item: 'r1' }, -1, 2)).toEqual([
      { op: 'setScalar', path: PATH, keys: ['to', 'offset', 'x'], value: -2 },
    ]);
  });

  it('steps a bare `offset:` from 0, replacing the key', () => {
    expect(step({ item: 'r1', offset: null }, 1, 1)).toEqual([
      { op: 'removeKey', path: PATH, keys: ['to', 'offset'] },
      { op: 'setScalar', path: PATH, keys: ['to', 'offset', 'x'], value: 1 },
    ]);
  });

  it('steps by a fractional grid without float noise', () => {
    expect(step({ item: 'r1', offset: { x: 4 } }, 1, 0.5)?.[0]).toMatchObject({ value: 4.5 });
    expect(step({ item: 'r1', offset: { x: 0.1 } }, 1, 0.2)?.[0]).toMatchObject({ value: 0.3 });
  });

  it('removes the axis when a step lands on 0', () => {
    expect(step({ item: 'r1', offset: { x: 1, y: 3 } }, -1, 1)).toEqual([
      { op: 'removeKey', path: PATH, keys: ['to', 'offset', 'x'] },
    ]);
  });

  it('refuses to step what it cannot read, or an endpoint that is not anchored', () => {
    expect(step({ item: 'r1', offset: { x: '2mm' } }, 1, 1)).toEqual([]);
    expect(step({ item: 'r1', offset: { x: true } }, 1, 1)).toEqual([]);
    expect(step({ item: 'r1', offset: 5 }, 1, 1)).toEqual([]);
    expect(step({ x: 0, y: 0 }, 1, 1, false)).toEqual([]);
  });

  it('refuses a step that cannot move the value', () => {
    expect(step({ item: 'r1', offset: { x: 2 ** 60 } }, 1, 1)).toEqual([]);
  });
});

describe('canStepOffset', () => {
  it('steps an empty axis or a plain numeral, nothing else', () => {
    expect(canStepOffset({ text: '', present: false, readable: true })).toBe(true);
    expect(canStepOffset({ text: '-2.5', present: true, readable: true })).toBe(true);
    expect(canStepOffset({ text: '1e+21', present: true, readable: true })).toBe(false);
    expect(canStepOffset({ text: '', present: true, readable: false })).toBe(false);
  });
});
