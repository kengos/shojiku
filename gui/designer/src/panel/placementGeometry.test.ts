import type { ReadFn } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import type { BoxRect, PlacedBox } from '../engine/types';
import { childMarginInset, type PlacementGeometry, resolvePlacement } from './placementGeometry';
import { placementFor } from './placementModel';

/** A read that never leaks the prototype (own-key guard) — the shape the real
 * editor read has (a grammar lookup, not object indexing). */
function reader(map: Record<string, unknown>): ReadFn {
  return (path) => (Object.hasOwn(map, path) ? map[path] : undefined);
}

function rect(x: number, y: number, w: number, h: number): BoxRect {
  return { x, y, w, h };
}

function placed(path: string, border: BoxRect, content: BoxRect): PlacedBox {
  return { path, border, content };
}

function geo(
  boxes: readonly PlacedBox[],
  opts: {
    readonly margin?: readonly [number, number, number, number];
    readonly fresh?: boolean;
  } = {},
): PlacementGeometry {
  return {
    boxes: { pages: [boxes] },
    margin: opts.margin ?? [0, 0, 0, 0],
    fresh: opts.fresh ?? true,
  };
}

const CHILD = 'sections.body.items[0].items[1]';
const OWNER = 'sections.body.items[0]';

/** A flex container holding one child; the child's box is caller-supplied. */
function flexDoc(childBox: Record<string, unknown>): ReadFn {
  return reader({
    [OWNER]: { type: 'container', box: {} },
    [CHILD]: { type: 'text', box: childBox },
  });
}

describe('resolvePlacement — pin math', () => {
  it('resolves a pinnable child to parent-content-relative coordinates', () => {
    const g = geo([
      placed(OWNER, rect(0, 0, 300, 400), rect(20, 40, 260, 320)),
      placed(CHILD, rect(100, 200, 50, 30), rect(100, 200, 50, 30)),
    ]);
    const r = resolvePlacement(g, flexDoc({}), CHILD, placementFor(flexDoc({}), CHILD));
    // authored = border − parent.content: x 100−20=80, y 200−40=160; w/h = border size.
    expect(r).toEqual({ x: 80, y: 160, w: 50, h: 30 });
  });

  it('rounds fractional resolved values in the authored form (formatLength, 2dp)', () => {
    const g = geo([
      placed(OWNER, rect(0, 0, 300, 400), rect(20.125, 40, 260, 320)),
      placed(CHILD, rect(100.5678, 200.001, 50.339, 30), rect(100.5678, 200.001, 50.339, 30)),
    ]);
    const r = resolvePlacement(g, flexDoc({}), CHILD, placementFor(flexDoc({}), CHILD));
    // x = 100.5678 − 20.125 = 80.4428 → 80.44; y = 160.001 → 160; w 50.339 → 50.34.
    expect(r).toEqual({ x: 80.44, y: 160, w: 50.34, h: 30 });
  });

  it('subtracts the child box margin (the engine adds it when placing)', () => {
    const doc = flexDoc({ margin: { left: 10, top: 5 } });
    const g = geo([
      placed(OWNER, rect(0, 0, 300, 400), rect(20, 40, 260, 320)),
      placed(CHILD, rect(100, 200, 50, 30), rect(100, 200, 50, 30)),
    ]);
    const r = resolvePlacement(g, doc, CHILD, placementFor(doc, CHILD));
    expect(r).toEqual({ x: 70, y: 155, w: 50, h: 30 });
  });

  it('treats an auto margin as 0 (the engine resolves it to 0 outside flex placement)', () => {
    const doc = flexDoc({ margin: { left: 'auto' } });
    const g = geo([
      placed(OWNER, rect(0, 0, 300, 400), rect(20, 40, 260, 320)),
      placed(CHILD, rect(100, 200, 50, 30), rect(100, 200, 50, 30)),
    ]);
    const r = resolvePlacement(g, doc, CHILD, placementFor(doc, CHILD));
    expect(r).toEqual({ x: 80, y: 160, w: 50, h: 30 });
  });

  it('resolves a coordinate child relative to the page margin origin', () => {
    const read = reader({
      'sections.body': { type: 'absolute' },
      'sections.body.items[0]': { type: 'text', box: {} },
    });
    const path = 'sections.body.items[0]';
    const g = geo([placed(path, rect(90, 130, 40, 20), rect(90, 130, 40, 20))], {
      // [top, right, bottom, left]
      margin: [50, 60, 50, 30],
    });
    // authored = border − (left, top) = (90−30, 130−50) = (60, 80).
    expect(resolvePlacement(g, read, path, placementFor(read, path))).toEqual({
      x: 60,
      y: 80,
      w: 40,
      h: 20,
    });
  });

  it('resolves a flow child at page-origin (the y is display-only)', () => {
    const read = reader({
      'sections.body': { type: 'flow' },
      'sections.body.items[0]': { type: 'text', box: {} },
    });
    const path = 'sections.body.items[0]';
    const g = geo([placed(path, rect(30, 110, 200, 24), rect(30, 110, 200, 24))]);
    expect(resolvePlacement(g, read, path, placementFor(read, path))).toEqual({
      x: 30,
      y: 110,
      w: 200,
      h: 24,
    });
  });
});

describe('resolvePlacement — unavailable geometry', () => {
  const doc = flexDoc({});
  const p = placementFor(doc, CHILD);

  it('returns null when there is no geometry', () => {
    expect(resolvePlacement(null, doc, CHILD, p)).toBeNull();
  });

  it('still resolves from STALE geometry (displays stay stable; the pin gate is the caller)', () => {
    const g = geo(
      [
        placed(OWNER, rect(0, 0, 300, 400), rect(20, 40, 260, 320)),
        placed(CHILD, rect(100, 200, 50, 30), rect(100, 200, 50, 30)),
      ],
      { fresh: false },
    );
    expect(resolvePlacement(g, doc, CHILD, p)).toEqual({ x: 80, y: 160, w: 50, h: 30 });
  });

  it('returns null when the item box is absent from the index', () => {
    const g = geo([placed(OWNER, rect(0, 0, 10, 10), rect(0, 0, 10, 10))]);
    expect(resolvePlacement(g, doc, CHILD, p)).toBeNull();
  });

  it('disables the pin (x/y null) when the parent box is missing', () => {
    const g = geo([placed(CHILD, rect(100, 200, 50, 30), rect(100, 200, 50, 30))]);
    expect(resolvePlacement(g, doc, CHILD, p)).toEqual({ x: null, y: null, w: 50, h: 30 });
  });

  it('disables coordinates for non-finite geometry, and for a %/garbage margin', () => {
    const finiteChild = placed(CHILD, rect(Number.NaN, 200, 50, 30), rect(0, 0, 50, 30));
    const g = geo([placed(OWNER, rect(0, 0, 10, 10), rect(0, 0, 10, 10)), finiteChild]);
    expect(resolvePlacement(g, doc, CHILD, p)).toMatchObject({ x: null });
    // A percent margin is not pt-safe.
    const pct = flexDoc({ margin: { left: '10%' } });
    const g2 = geo([
      placed(OWNER, rect(0, 0, 300, 400), rect(20, 40, 260, 320)),
      placed(CHILD, rect(100, 200, 50, 30), rect(100, 200, 50, 30)),
    ]);
    expect(resolvePlacement(g2, pct, CHILD, placementFor(pct, CHILD))).toMatchObject({
      x: null,
      y: null,
    });
  });

  it('disables coordinates when a resolved value overflows to non-finite', () => {
    const g = geo([
      placed(OWNER, rect(0, 0, 1e308, 1e308), rect(0, 0, 1e308, 1e308)),
      placed(CHILD, rect(1e308, 1e308, 50, 30), rect(1e308, 1e308, 50, 30)),
    ]);
    // border − content overflows the formatLength rounding to Infinity → null.
    expect(resolvePlacement(g, doc, CHILD, p)).toMatchObject({ x: null, y: null });
  });

  it('degrades a pinnable resolution for a path with no owner (inconsistent placement input)', () => {
    // The model is pure and exported, so a hostile/buggy caller can hand it a
    // `pinnable` placement for a non-child path — it must degrade, not throw.
    const path = 'sections.body';
    const g = geo([placed(path, rect(5, 5, 10, 10), rect(5, 5, 10, 10))]);
    expect(
      resolvePlacement(g, reader({}), path, { kind: 'pinnable', pinned: false, ignoredY: false }),
    ).toEqual({ x: null, y: null, w: 10, h: 10 });
  });

  it('does not match or pollute on a __proto__ envelope path', () => {
    const g = geo([placed(CHILD, rect(1, 1, 1, 1), rect(1, 1, 1, 1))]);
    // A hostile path neither matches a box (array find, no prototype walk) nor
    // pollutes Object.prototype (the model never assigns by a document key).
    expect(
      resolvePlacement(g, reader({}), '__proto__', placementFor(reader({}), '__proto__')),
    ).toBeNull();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('childMarginInset', () => {
  it('reads absent / uniform / per-side pt margins, auto as 0, rejecting non-pt ones', () => {
    expect(childMarginInset(flexDoc({}), CHILD)).toEqual({ left: 0, top: 0 });
    expect(childMarginInset(flexDoc({ margin: 8 }), CHILD)).toEqual({ left: 8, top: 8 });
    expect(childMarginInset(flexDoc({ margin: '4mm' }), CHILD)).toEqual({
      left: (4 * 72) / 25.4,
      top: (4 * 72) / 25.4,
    });
    expect(childMarginInset(flexDoc({ margin: { left: 3, top: 6 } }), CHILD)).toEqual({
      left: 3,
      top: 6,
    });
    // Auto margins resolve to 0 once pinned (absolute placement), both forms.
    expect(childMarginInset(flexDoc({ margin: 'auto' }), CHILD)).toEqual({ left: 0, top: 0 });
    expect(childMarginInset(flexDoc({ margin: { left: 'auto' } }), CHILD)).toEqual({
      left: 0,
      top: 0,
    });
    // Relative / garbage margins are not pt-safe in either form.
    expect(childMarginInset(flexDoc({ margin: { left: '50%' } }), CHILD)).toBeNull();
    expect(childMarginInset(flexDoc({ margin: 'garbage' }), CHILD)).toBeNull();
  });
});
