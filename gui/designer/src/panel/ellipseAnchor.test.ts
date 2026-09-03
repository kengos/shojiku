// An ellipse's `anchor:`. The load-bearing rule is that attaching DROPS
// `box.x`/`box.y` — the engine stops reading them, `canvas/manipulate` already
// refuses to drag an anchored ellipse for that reason, and leaving them would
// make the file read as though they place the oval — and that it drops only the
// ones the document carries, because removing an absent key refuses the batch.

import { describe, expect, it } from 'vitest';
import {
  anchorHidesCoords,
  anchorLabel,
  attachAnchorOps,
  detachAnchorOp,
  readEllipseAnchor,
} from './ellipseAnchor';

const P = 'sections.body.items[0]';
const read = (item: unknown) => (path: string) => (path === P ? item : undefined);

describe('reading the anchor', () => {
  it('reads an unanchored ellipse', () => {
    expect(readEllipseAnchor(read({ type: 'ellipse', box: { w: 60, h: 40 } }), P)).toEqual({
      anchor: '',
      anchored: false,
      hasX: false,
      hasY: false,
    });
  });

  it('reads the target and which coordinates are present', () => {
    expect(
      readEllipseAnchor(read({ type: 'ellipse', anchor: 'total', box: { x: 10, w: 60 } }), P),
    ).toEqual({ anchor: 'total', anchored: true, hasX: true, hasY: false });
  });

  it("reads `anchor: ''` as ANCHORED, the way the engine and the canvas do", () => {
    // `ellipse_atom` takes `if let Some(target) = &e.anchor`, so an empty one is
    // anchored and resolves to no item; `canvas/manipulate` refuses the drag on
    // `typeof child.anchor === 'string'`. A panel that called it unanchored
    // would offer coordinates for an item whose coordinates nothing reads.
    const view = readEllipseAnchor(read({ type: 'ellipse', anchor: '' }), P);
    expect(view.anchored).toBe(true);
    expect(view.anchor).toBe('');
    expect(anchorHidesCoords(read({ type: 'ellipse', anchor: '' }), 'ellipse', P)).toBe(true);
  });

  it('reads a non-string anchor as unanchored rather than echoing it', () => {
    expect(readEllipseAnchor(read({ type: 'ellipse', anchor: 42 }), P).anchored).toBe(false);
    expect(readEllipseAnchor(read({ type: 'ellipse', anchor: { id: 'x' } }), P).anchored).toBe(
      false,
    );
  });

  it('keeps a hostile id WHOLE, because the value round-trips to the wire', () => {
    // Clipping the value would author a truncated id on the next pick, and it
    // would resolve to nothing. Only what is DRAWN is bounded.
    const view = readEllipseAnchor(read({ type: 'ellipse', anchor: 'a'.repeat(10_000) }), P);
    expect(view.anchor.length).toBe(10_000);
    expect(anchorLabel(view.anchor).length).toBe(81);
    expect(anchorLabel(view.anchor).endsWith('…')).toBe(true);
    // …and a short id is drawn verbatim, marker included only when it earns one.
    expect(anchorLabel('total')).toBe('total');
  });

  it('reads a non-map box as carrying no coordinates', () => {
    const view = readEllipseAnchor(read({ type: 'ellipse', anchor: 't', box: 'wide' }), P);
    expect(view.hasX).toBe(false);
    expect(view.hasY).toBe(false);
  });

  it('survives a read that THROWS', () => {
    const throwing = () => {
      throw new Error('hostile');
    };
    expect(readEllipseAnchor(throwing, P).anchored).toBe(false);
  });
});

describe('attaching', () => {
  const unanchored = { anchor: '', anchored: false, hasX: true, hasY: true } as const;

  it('writes the anchor and drops BOTH coordinates in one batch', () => {
    expect(attachAnchorOps(P, 'total', unanchored)).toEqual([
      { op: 'setScalar', path: P, keys: ['anchor'], value: 'total' },
      { op: 'removeKey', path: P, keys: ['box', 'x'] },
      { op: 'removeKey', path: P, keys: ['box', 'y'] },
    ]);
  });

  it('drops only the coordinate the document actually carries', () => {
    // Removing an absent key refuses the WHOLE batch, so the anchor would not
    // land either.
    expect(attachAnchorOps(P, 'total', { ...unanchored, hasX: false })).toEqual([
      { op: 'setScalar', path: P, keys: ['anchor'], value: 'total' },
      { op: 'removeKey', path: P, keys: ['box', 'y'] },
    ]);
    expect(attachAnchorOps(P, 'total', { ...unanchored, hasX: false, hasY: false })).toEqual([
      { op: 'setScalar', path: P, keys: ['anchor'], value: 'total' },
    ]);
  });

  it('authors NOTHING for an empty target', () => {
    // `anchor: ''` resolves to no item, so the oval would vanish from the
    // canvas before the user had chosen anything.
    expect(attachAnchorOps(P, '', unanchored)).toEqual([]);
  });
});

describe('detaching', () => {
  it('removes the key and writes back NO coordinates', () => {
    // Inventing a position the user never chose is what every other snippet in
    // this package refuses to do; unset is the engine's own default.
    expect(detachAnchorOp(P)).toEqual({ op: 'removeKey', path: P, keys: ['anchor'] });
  });
});

describe('withholding the coordinate fields', () => {
  it('hides them for an anchored ellipse and nothing else', () => {
    expect(anchorHidesCoords(read({ type: 'ellipse', anchor: 't' }), 'ellipse', P)).toBe(true);
    expect(anchorHidesCoords(read({ type: 'ellipse' }), 'ellipse', P)).toBe(false);
    // A `checkbox` has no `anchor:` on the wire at all, so a stray key must not
    // take its coordinates away.
    expect(anchorHidesCoords(read({ type: 'checkbox', anchor: 't' }), 'checkbox', P)).toBe(false);
  });
});
