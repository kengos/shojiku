// @vitest-environment node
import { Editor, type ReadFn } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { readBorder } from './borderModel';
import { edgeOps, presetOps } from './borderOps';
import { MAX_BORDER_WIDTH, type Pen } from './borderTypes';

const P = 'sections.body.items[0]';

/** A ReadFn over a fixed item + styles registry. */
function reader(item: unknown, styles: unknown = {}): ReadFn {
  return (path) => (path === P ? item : path === 'styles' ? styles : undefined);
}

const PEN: Pen = { width: 1, color: '', style: 'solid' };

describe('edgeOps / presetOps author the simplest wire form', () => {
  it('(a) empty → one edge on = a single-side putValue map', () => {
    const v = readBorder(reader({ type: 'text' }), P);
    expect(edgeOps(P, v, 'top', PEN)).toEqual([
      { op: 'putValue', path: P, keys: ['style', 'borderWidth'], value: { top: 1 } },
    ]);
  });

  it('(b) three sides → the fourth collapses to a scalar', () => {
    const v = readBorder(
      reader({ type: 'text', style: { borderWidth: { top: 1, right: 1, bottom: 1 } } }),
      P,
    );
    expect(edgeOps(P, v, 'left', PEN)).toEqual([
      { op: 'setScalar', path: P, keys: ['style', 'borderWidth'], value: 1 },
    ]);
  });

  it('(c) a uniform scalar, one edge off → a scalar→map putValue', () => {
    const v = readBorder(reader({ type: 'text', style: { borderWidth: 1 } }), P);
    expect(edgeOps(P, v, 'top', PEN)).toEqual([
      {
        op: 'putValue',
        path: P,
        keys: ['style', 'borderWidth'],
        value: { right: 1, bottom: 1, left: 1 },
      },
    ]);
  });

  it('(d) an existing map, one side rewidened → a targeted leaf setScalar', () => {
    const v = readBorder(reader({ type: 'text', style: { borderWidth: { top: 1, right: 1 } } }), P);
    // A different pen width applies (the edge is on but not matching) → leaf edit.
    expect(edgeOps(P, v, 'top', { width: 2, color: '', style: 'solid' })).toEqual([
      { op: 'setScalar', path: P, keys: ['style', 'borderWidth', 'top'], value: 2 },
    ]);
  });

  it('(d2) an existing map, one of several sides off → a targeted leaf removeKey', () => {
    const v = readBorder(reader({ type: 'text', style: { borderWidth: { top: 1, right: 1 } } }), P);
    // The clicked side matches the pen → off; the other side stays, so the map
    // survives and only the emptied side is removed (a leaf removeKey).
    expect(edgeOps(P, v, 'top', PEN)).toEqual([
      { op: 'removeKey', path: P, keys: ['style', 'borderWidth', 'top'] },
    ]);
  });

  it('editing one edge of a STYLE-sourced border authors only the changed property', () => {
    const v = readBorder(
      reader(
        { type: 'text', styleNames: ['framed'] },
        { framed: { borderWidth: 1, borderColor: '#ff0000' } },
      ),
      P,
    );
    // A blue pen at the same width recolors the top edge. The width is unchanged
    // (still the style's 1 on every side), so NO borderWidth is authored — only
    // borderColor, as a full map preserving the style's other-edge colors.
    expect(edgeOps(P, v, 'top', { width: 1, color: '#0000ff', style: 'solid' })).toEqual([
      {
        op: 'putValue',
        path: P,
        keys: ['style', 'borderColor'],
        value: { top: '#0000ff', right: '#ff0000', bottom: '#ff0000', left: '#ff0000' },
      },
    ]);
  });

  it('clears a double-styled edge when the pen also is double (matches on style)', () => {
    const v = readBorder(
      reader({
        type: 'text',
        style: {
          borderWidth: { top: 2, right: 2 },
          borderStyle: { top: 'double', right: 'double' },
        },
      }),
      P,
    );
    // The top edge's effective style is `double`; a double pen at the same
    // width/color matches → the edge clears (leaf removeKeys, right side stays).
    expect(edgeOps(P, v, 'top', { width: 2, color: '', style: 'double' })).toEqual([
      { op: 'removeKey', path: P, keys: ['style', 'borderWidth', 'top'] },
      { op: 'removeKey', path: P, keys: ['style', 'borderStyle', 'top'] },
    ]);
  });

  it('(e) the none preset → removeKey with no map or color/style residue', () => {
    const ed = Editor.create(
      'sections:\n  body:\n    type: flow\n    items:\n      - type: text\n        text: hi\n        style: { borderWidth: 1, borderColor: "#ff0000", borderStyle: double }\n',
    );
    const v = readBorder((path) => ed.read(path), P);
    ed.applyAll(presetOps(P, v, 'none', PEN));
    const item = ed.read(P) as { style?: unknown };
    expect(item.style).toBeUndefined();
    expect(ed.text()).not.toContain('border');
  });

  it('(e2) clicking the LAST remaining edge off removes the whole key, siblings intact', () => {
    // An edge-click (not the preset) on the only drawn side: the whole
    // borderWidth key goes away — no `{}` map residue — while an unrelated
    // sibling style key survives byte-exact and the style map is NOT pruned.
    const ed = Editor.create(
      'sections:\n  body:\n    type: flow\n    items:\n      - type: text\n        text: hi\n        style: { color: "#111111", borderWidth: { top: 1 } }\n',
    );
    const v = readBorder((path) => ed.read(path), P);
    const ops = edgeOps(P, v, 'top', PEN);
    expect(ops).toEqual([{ op: 'removeKey', path: P, keys: ['style', 'borderWidth'] }]);
    ed.applyAll(ops);
    expect(ed.text()).toContain('style: { color: "#111111" }');
    expect(ed.text()).not.toContain('borderWidth');
  });

  it('applies the pen (width/color/style) to a clicked edge', () => {
    const v = readBorder(reader({ type: 'text' }), P);
    const ops = edgeOps(P, v, 'bottom', { width: 2, color: '#123456', style: 'double' });
    expect(ops).toEqual([
      { op: 'putValue', path: P, keys: ['style', 'borderWidth'], value: { bottom: 2 } },
      { op: 'putValue', path: P, keys: ['style', 'borderColor'], value: { bottom: '#123456' } },
      { op: 'putValue', path: P, keys: ['style', 'borderStyle'], value: { bottom: 'double' } },
    ]);
  });

  it('clicking an edge that exactly matches the pen clears it', () => {
    const v = readBorder(reader({ type: 'text', style: { borderWidth: 1 } }), P);
    // The clicked side matches the pen exactly → off (→ map without that side).
    expect(edgeOps(P, v, 'left', PEN)).toEqual([
      {
        op: 'putValue',
        path: P,
        keys: ['style', 'borderWidth'],
        value: { top: 1, right: 1, bottom: 1 },
      },
    ]);
  });

  it('a solid pen authors no borderStyle key (the default)', () => {
    const v = readBorder(reader({ type: 'text' }), P);
    const ops = presetOps(P, v, 'all', PEN);
    expect(ops).toEqual([{ op: 'setScalar', path: P, keys: ['style', 'borderWidth'], value: 1 }]);
  });

  it('preset all authors the PEN values on every side (not the existing widths)', () => {
    const v = readBorder(reader({ type: 'text', style: { borderWidth: { top: 5 } } }), P);
    expect(presetOps(P, v, 'all', { width: 2, color: '', style: 'solid' })).toEqual([
      { op: 'setScalar', path: P, keys: ['style', 'borderWidth'], value: 2 },
    ]);
  });

  it('none over an OWN border removes all three keys', () => {
    const v = readBorder(
      reader({
        type: 'text',
        style: { borderWidth: 1, borderColor: '#ff0000', borderStyle: 'double' },
      }),
      P,
    );
    expect(presetOps(P, v, 'none', PEN)).toEqual([
      { op: 'removeKey', path: P, keys: ['style', 'borderWidth'] },
      { op: 'removeKey', path: P, keys: ['style', 'borderColor'] },
      { op: 'removeKey', path: P, keys: ['style', 'borderStyle'] },
    ]);
  });

  it('none over a STYLE-inherited border authors a 0-width OVERRIDE', () => {
    const v = readBorder(
      reader({ type: 'text', styleNames: ['framed'] }, { framed: { borderWidth: 2 } }),
      P,
    );
    expect(presetOps(P, v, 'none', PEN)).toEqual([
      { op: 'setScalar', path: P, keys: ['style', 'borderWidth'], value: 0 },
    ]);
  });

  it('none over an ALREADY-zero override emits nothing', () => {
    const v = readBorder(
      reader(
        { type: 'text', styleNames: ['framed'], style: { borderWidth: 0 } },
        { framed: { borderWidth: 2 } },
      ),
      P,
    );
    expect(presetOps(P, v, 'none', PEN)).toEqual([]);
  });

  it('re-applying the identical uniform border changes nothing (touched-keys only)', () => {
    const v = readBorder(reader({ type: 'text', style: { borderWidth: 1 } }), P);
    expect(presetOps(P, v, 'all', PEN)).toEqual([]);
  });

  it('clamps a hostile pen width to the engine cap on write', () => {
    const v = readBorder(reader({ type: 'text' }), P);
    expect(presetOps(P, v, 'all', { width: 1e300, color: '', style: 'solid' })).toEqual([
      { op: 'setScalar', path: P, keys: ['style', 'borderWidth'], value: MAX_BORDER_WIDTH },
    ]);
  });
});

describe('round-trip: a border edit touches only its own keys (real Editor)', () => {
  const SRC =
    'sections:\n  body:\n    type: flow\n    items:\n      - type: text\n        text: hi\n        # keep me\n        style: { color: "#111111", borderWidth: { top: 1, right: 1 } }\n';

  it('a single-side width edit rewrites only that side (siblings byte-exact)', () => {
    const ed = Editor.create(SRC);
    const v = readBorder((path) => ed.read(path), P);
    ed.applyAll(edgeOps(P, v, 'top', { width: 2, color: '', style: 'solid' }));
    const text = ed.text();
    expect(text).toContain('keep me');
    expect(text).toContain('color: "#111111"');
    expect(text).toContain('top: 2');
    expect(text).toContain('right: 1');
  });

  it('applies a whole edit as ONE undo step (byte-exact restore)', () => {
    const ed = Editor.create(SRC);
    const before = ed.text();
    const v = readBorder((path) => ed.read(path), P);
    ed.applyAll(presetOps(P, v, 'all', { width: 3, color: '#222222', style: 'double' }));
    expect(ed.text()).not.toBe(before);
    ed.undo();
    expect(ed.text()).toBe(before);
  });
});
