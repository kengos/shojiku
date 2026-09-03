// A form mark's paint. The two assertions that matter most are NEGATIVE: this
// model must never author a per-side `borderWidth`/`borderColor` map (the
// engine reduces one to its top side and warns `shape_border_sides_ignored`)
// and must never author `borderRadius` (answered with `border_radius_ignored`
// on "a form mark"). A model that wrote either would ship a control whose
// every use adds a diagnostic.

import { describe, expect, it } from 'vitest';
import {
  fillOp,
  readShapeStyle,
  strokeColorOp,
  strokeWidthAcceptable,
  strokeWidthOp,
} from './shapeStyle';

const P = 'sections.body.items[1]';
const reads =
  (item: unknown, styles: unknown = {}) =>
  (path: string) =>
    path === P ? item : path === 'styles' ? styles : undefined;

describe('reading the paint', () => {
  it('reads a scalar width, colour and fill', () => {
    const view = readShapeStyle(
      reads({
        type: 'ellipse',
        style: { borderWidth: 2, borderColor: '#c00', backgroundColor: '#eee' },
      }),
      P,
    );
    expect(view).toEqual({
      strokeWidth: '2',
      strokeColor: '#c00',
      fill: '#eee',
      widthFromStyle: null,
    });
  });

  it('reads a per-side MAP as its TOP side, the way the engine does', () => {
    // `bw.uniform().unwrap_or_else(|| bw.sides()[0])`. Reading through the
    // generic cascade instead would flatten the map to unset and report a set
    // stroke as blank.
    const view = readShapeStyle(
      reads({ type: 'checkbox', style: { borderWidth: { top: 3, bottom: 9 } } }),
      P,
    );
    expect(view.strokeWidth).toBe('3');
  });

  it('reads a map with NO top as unset — which is what it strokes', () => {
    const view = readShapeStyle(
      reads({ type: 'ellipse', style: { borderWidth: { bottom: 4 } } }),
      P,
    );
    expect(view.strokeWidth).toBe('');
  });

  it('falls through to a named style, and says which one', () => {
    const view = readShapeStyle(
      reads(
        { type: 'ellipse', styleNames: ['a', 'b'] },
        { a: { borderWidth: 1 }, b: { borderWidth: 4 } },
      ),
      P,
    );
    // Later name wins, as `resolve_style` walks them.
    expect(view.strokeWidth).toBe('4');
    expect(view.widthFromStyle).toBe('b');
  });

  it('lets the item’s OWN value win by key PRESENCE, whatever its shape', () => {
    // `authored()` ends `pick(&item.style).or(found)`. An own per-side map with
    // no top strokes at ZERO while a named style says 2 — reporting the 2 would
    // make the panel contradict the canvas beside it.
    const view = readShapeStyle(
      reads(
        { type: 'ellipse', styleNames: ['s'], style: { borderWidth: { bottom: 1 } } },
        { s: { borderWidth: 2 } },
      ),
      P,
    );
    expect(view.strokeWidth).toBe('');
    expect(view.widthFromStyle).toBe(null);
  });

  it('reads an empty or unreadable item as unpainted', () => {
    expect(readShapeStyle(() => undefined, P)).toEqual({
      strokeWidth: '',
      strokeColor: '',
      fill: '',
      widthFromStyle: null,
    });
    const throwing = () => {
      throw new Error('hostile');
    };
    expect(readShapeStyle(throwing, P).strokeWidth).toBe('');
  });

  it('leaves a hostile registry NAME inert', () => {
    // Registry names are document-derived, so an inherited lookup would resolve
    // `constructor` to something.
    const view = readShapeStyle(reads({ type: 'ellipse', styleNames: ['__proto__'] }, {}), P);
    expect(view.strokeWidth).toBe('');
    expect(view.widthFromStyle).toBe(null);
  });
});

describe('the width op', () => {
  it('writes the PARSED number, never the raw text', () => {
    // `BorderWidth` has no `visit_str`, so a string there is a serde type error
    // — a template that no longer loads, not a diagnostic the engine degrades
    // past. `.5` is the likeliest keystroke that a text-preserving path would
    // write verbatim.
    expect(strokeWidthOp(P, ' .5 ')).toEqual({
      op: 'setScalar',
      path: P,
      keys: ['style', 'borderWidth'],
      value: 0.5,
    });
  });

  it('CLEARS the key on empty, because absent IS the 1pt default', () => {
    // Without this an authored width could never be undone except by retyping
    // the default, which the minimal-wire rule says never to author.
    expect(strokeWidthOp(P, '  ')).toEqual({
      op: 'removeKey',
      path: P,
      keys: ['style', 'borderWidth'],
    });
  });

  it('authors NOTHING when the width is not the item’s OWN to clear', () => {
    // The field is seeded with the RESOLVED width, so it can show a named
    // style's value. `removeKey` on the absent own key refuses the batch, so
    // clearing would be a silent no-op with the field reseeding to the style's
    // number; returning null lets the editor reseed honestly instead.
    expect(strokeWidthOp(P, '', false)).toBe(null);
    expect(strokeWidthOp(P, '  ', false)).toBe(null);
    // …and a typed value still writes, style-sourced or not.
    expect(strokeWidthOp(P, '3', false)).toMatchObject({ op: 'setScalar', value: 3 });
  });

  it('keeps `0` as a value — that is what turns the outline off', () => {
    expect(strokeWidthOp(P, '0')).toMatchObject({ value: 0 });
  });

  it('authors NOTHING for a refused entry', () => {
    for (const raw of ['-1', 'wide', '1001', 'Infinity', 'NaN']) {
      expect(strokeWidthOp(P, raw)).toBe(null);
    }
    expect(strokeWidthAcceptable('1000')).toBe(true);
    expect(strokeWidthAcceptable('1000.1')).toBe(false);
  });
});

describe('the colour ops', () => {
  it('writes the stroke colour as a SCALAR, never a per-side map', () => {
    expect(strokeColorOp(P, '#123456')).toMatchObject({
      op: 'setScalar',
      keys: ['style', 'borderColor'],
      value: '#123456',
    });
  });

  it('clears the stroke colour back to the engine black', () => {
    expect(strokeColorOp(P, '')).toMatchObject({ op: 'removeKey', keys: ['style', 'borderColor'] });
  });

  it('writes and clears the fill', () => {
    expect(fillOp(P, '#fff')).toMatchObject({
      op: 'setScalar',
      keys: ['style', 'backgroundColor'],
      value: '#fff',
    });
    expect(fillOp(P, '')).toMatchObject({ op: 'removeKey', keys: ['style', 'backgroundColor'] });
  });
});

describe('the two keys the engine warns about are never authored', () => {
  it('writes no `borderRadius` and no per-side map, whatever the input', () => {
    const written = [
      strokeWidthOp(P, '2'),
      strokeWidthOp(P, ''),
      strokeColorOp(P, '#000'),
      strokeColorOp(P, ''),
      fillOp(P, '#000'),
      fillOp(P, ''),
    ].filter((op) => op !== null);
    expect(written).toHaveLength(6);
    for (const op of written) {
      // Every builder here writes a map-key op, so the narrowing is total —
      // and asserting it is part of the claim: an op with no `keys` would be a
      // whole-value write, which is how a per-side map would get in.
      expect(op.op === 'setScalar' || op.op === 'removeKey').toBe(true);
      if (op.op !== 'setScalar' && op.op !== 'removeKey') {
        continue;
      }
      expect(op.keys).not.toContain('borderRadius');
      expect(op.keys).toHaveLength(2);
      expect(op.keys[0]).toBe('style');
      if (op.op === 'setScalar') {
        expect(typeof op.value).not.toBe('object');
      }
    }
  });
});
