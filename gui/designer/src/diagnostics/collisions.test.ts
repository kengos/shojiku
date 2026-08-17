import { describe, expect, it } from 'vitest';
import type { BoxIndex, PlacedBox } from '../engine/types';
import { findTextCollisions } from './collisions';

const ZERO = { x: 0, y: 0, w: 0, h: 0 };

interface LineSpec {
  readonly x: number;
  readonly width: number;
  readonly emTop: number;
  readonly emBottom: number;
}

/** A text-bearing box drawn as the given horizontal lines. The border/content
 * boxes are deliberately inert: this model reads drawn text only. */
function text(path: string, lines: readonly LineSpec[], id?: string): PlacedBox {
  return {
    path,
    ...(id === undefined ? {} : { id }),
    border: ZERO,
    content: ZERO,
    text: {
      lines: lines.map((line) => ({ ...line, baseline: line.emBottom, capTop: line.emTop })),
    },
  };
}

function index(...pages: readonly (readonly PlacedBox[])[]): BoxIndex {
  return { pages };
}

/** Both sides of every reported collision, as `a|b` label pairs. */
function pairs(boxes: BoxIndex | undefined): readonly string[] {
  return findTextCollisions(boxes).map((hit) => `${hit.a.label}|${hit.b.label}`);
}

// The delivery note's header, measured from a real `shojiku inspect` run at
// both page sizes. The meta block is pinned in pt and does not move; the
// centred title is `w: "100%"` and re-centres when the sheet widens.
const TITLE_A4: LineSpec = { x: 257.3031, width: 80.6738, emTop: 41, emBottom: 63 };
const TITLE_A3: LineSpec = { x: 380.6081, width: 80.6738, emTop: 41, emBottom: 63 };
const DELIVERY_NO: LineSpec = { x: 430.5031, width: 139.7769, emTop: 39, emBottom: 48 };
const DELIVERED_ON: LineSpec = { x: 459.9201, width: 110.3599, emTop: 52, emBottom: 61 };
const ORDER_NO: LineSpec = { x: 423.4763, width: 146.8037, emTop: 65, emBottom: 74 };

function header(title: LineSpec): BoxIndex {
  return index([
    text('sections.header.items[1]', [title], 'title'),
    text('sections.header.items[2]', [DELIVERY_NO], 'delivery_no'),
    text('sections.header.items[3]', [DELIVERED_ON], 'delivered_on'),
    text('sections.header.items[4]', [ORDER_NO], 'order_no'),
  ]);
}

describe('findTextCollisions', () => {
  it('reports two items whose drawn lines overlap on both axes', () => {
    const boxes = index([
      text('a', [{ x: 0, width: 100, emTop: 0, emBottom: 10 }], 'left'),
      text('b', [{ x: 50, width: 100, emTop: 5, emBottom: 15 }], 'right'),
    ]);
    expect(pairs(boxes)).toEqual(['left|right']);
    expect(findTextCollisions(boxes)[0].page).toBe(0);
  });

  it('stays silent on the page size the document was authored for', () => {
    // The title's box spans the meta block on A4 too — box overlap is normal
    // here, which is exactly why this model reads the drawn line instead.
    expect(pairs(header(TITLE_A4))).toEqual([]);
  });

  it('reports the items the widened sheet actually collides, and only those', () => {
    // order_no sits below the title's em band, so it is NOT reported: the
    // count and the membership are both the claim.
    expect(pairs(header(TITLE_A3))).toEqual(['title|delivery_no', 'title|delivered_on']);
  });

  it('never collides an item with its own stacked lines', () => {
    const boxes = index([
      text('a', [
        { x: 0, width: 100, emTop: 0, emBottom: 12 },
        { x: 0, width: 100, emTop: 6, emBottom: 18 },
      ]),
    ]);
    expect(findTextCollisions(boxes)).toEqual([]);
  });

  it('reports a colliding pair once even when several of their lines overlap', () => {
    const boxes = index([
      text('a', [
        { x: 0, width: 100, emTop: 0, emBottom: 10 },
        { x: 0, width: 100, emTop: 10, emBottom: 20 },
      ]),
      text('b', [
        { x: 50, width: 100, emTop: 2, emBottom: 8 },
        { x: 50, width: 100, emTop: 12, emBottom: 18 },
      ]),
    ]);
    expect(pairs(boxes)).toEqual(['a|b']);
  });

  describe('when document order runs against geometric order', () => {
    // Every other fixture here happens to scan left-to-right and top-to-bottom,
    // which leaves half of the overlap test never evaluating false — the
    // operands could be deleted outright and the suite would stay green.
    // Absolute placement reorders these freely, so these two are the cases
    // that actually pin the axis checks.
    it('does not collide an item that is entirely LEFT of one scanned before it', () => {
      const boxes = index([
        text('right', [{ x: 500, width: 80, emTop: 40, emBottom: 60 }]),
        text('left', [{ x: 0, width: 80, emTop: 40, emBottom: 60 }]),
      ]);
      expect(findTextCollisions(boxes)).toEqual([]);
    });

    it('does not collide an item that is entirely ABOVE one scanned before it', () => {
      const boxes = index([
        text('lower', [{ x: 0, width: 80, emTop: 400, emBottom: 420 }]),
        text('upper', [{ x: 0, width: 80, emTop: 10, emBottom: 30 }]),
      ]);
      expect(findTextCollisions(boxes)).toEqual([]);
    });

    it('still collides a genuine overlap when the later item is left of the earlier', () => {
      const boxes = index([
        text('right', [{ x: 60, width: 80, emTop: 40, emBottom: 60 }]),
        text('left', [{ x: 0, width: 80, emTop: 40, emBottom: 60 }]),
      ]);
      expect(pairs(boxes)).toEqual(['right|left']);
    });
  });

  it('reports a pair once when the same item is placed repeatedly on a page', () => {
    // A `repeat` cell child yields one box PER ELEMENT, all sharing one path,
    // so a page interleaves two items' rectangles: P Q P. The same pair is
    // then reachable as (P,Q) and as (Q,P), and an un-normalized dedup key
    // would report it twice and eat two of the reported slots.
    const boxes = index([
      text('name', [{ x: 0, width: 100, emTop: 0, emBottom: 10 }]),
      text('price', [{ x: 50, width: 100, emTop: 5, emBottom: 15 }]),
      text('name', [{ x: 50, width: 100, emTop: 10, emBottom: 20 }]),
    ]);
    expect(pairs(boxes)).toEqual(['name|price']);
  });

  it('never collides two placements of the SAME item', () => {
    // Row 1's cell overrunning row 2's is invisible to this model: both
    // placements carry one path, and "`name` overlaps `name`" would not help
    // anyone. A structural blind spot, pinned so it is not mistaken for a bug.
    const boxes = index([
      text('cell', [{ x: 0, width: 100, emTop: 0, emBottom: 12 }]),
      text('cell', [{ x: 0, width: 100, emTop: 6, emBottom: 18 }]),
    ]);
    expect(findTextCollisions(boxes)).toEqual([]);
  });

  it('never collides items on different pages', () => {
    const one = text('a', [{ x: 0, width: 100, emTop: 0, emBottom: 10 }]);
    const two = text('b', [{ x: 0, width: 100, emTop: 0, emBottom: 10 }]);
    expect(findTextCollisions(index([one], [two]))).toEqual([]);
  });

  it('treats a blank line as drawing nothing, not as overlapping everything', () => {
    // The engine emits a zero-WIDTH LineMetric for a blank line inside a
    // paragraph (`"a\n\nb"` wraps to three lines, the middle one empty). Its
    // em band is a normal height, so a degenerate rectangle sits right in the
    // middle of the neighbour's text — and nothing is drawn there at all.
    const boxes = index([
      text('paragraph', [
        { x: 0, width: 200, emTop: 0, emBottom: 12 },
        { x: 50, width: 0, emTop: 14, emBottom: 26 },
      ]),
      text('pinned', [{ x: 0, width: 200, emTop: 14, emBottom: 26 }]),
    ]);
    expect(findTextCollisions(boxes)).toEqual([]);
  });

  it('treats abutting em bands as clear, not colliding', () => {
    const boxes = index([
      text('a', [{ x: 0, width: 100, emTop: 0, emBottom: 10 }]),
      text('b', [{ x: 0, width: 100, emTop: 10, emBottom: 20 }]),
    ]);
    expect(findTextCollisions(boxes)).toEqual([]);
  });

  it('reports nothing for boxes that draw no text', () => {
    const rect: PlacedBox = { path: 'a', border: ZERO, content: ZERO };
    const image: PlacedBox = { path: 'b', border: ZERO, content: ZERO };
    expect(findTextCollisions(index([rect, image]))).toEqual([]);
  });

  it('reports nothing when there is no render to read', () => {
    expect(findTextCollisions(undefined)).toEqual([]);
  });

  describe('vertical writing', () => {
    it('collides columns using the axis-swapped em band', () => {
      const boxes: BoxIndex = {
        pages: [
          [
            {
              path: 'a',
              id: 'tate',
              border: ZERO,
              content: ZERO,
              text: { columns: [{ y: 0, height: 100, baseline: 0, emLeft: 0, emRight: 12 }] },
            },
            {
              path: 'b',
              id: 'yoko',
              border: ZERO,
              content: ZERO,
              text: { columns: [{ y: 50, height: 100, baseline: 0, emLeft: 6, emRight: 18 }] },
            },
          ],
        ],
      };
      expect(pairs(boxes)).toEqual(['tate|yoko']);
    });

    it('leaves abutting columns clear', () => {
      const boxes: BoxIndex = {
        pages: [
          [
            {
              path: 'a',
              border: ZERO,
              content: ZERO,
              text: { columns: [{ y: 0, height: 10, baseline: 0, emLeft: 0, emRight: 12 }] },
            },
            {
              path: 'b',
              border: ZERO,
              content: ZERO,
              text: { columns: [{ y: 10, height: 10, baseline: 0, emLeft: 0, emRight: 12 }] },
            },
          ],
        ],
      };
      expect(findTextCollisions(boxes)).toEqual([]);
    });
  });

  describe('labels', () => {
    it('prefers the authored id and falls back to the path', () => {
      const boxes = index([
        text('sections.body.items[0]', [{ x: 0, width: 100, emTop: 0, emBottom: 10 }]),
        text('sections.body.items[1]', [{ x: 50, width: 100, emTop: 0, emBottom: 10 }], 'named'),
      ]);
      expect(pairs(boxes)).toEqual(['sections.body.items[0]|named']);
    });

    it('truncates an over-long authored id', () => {
      const long = 'x'.repeat(120);
      const boxes = index([
        text('a', [{ x: 0, width: 100, emTop: 0, emBottom: 10 }], long),
        text('b', [{ x: 50, width: 100, emTop: 0, emBottom: 10 }], 'other'),
      ]);
      const [hit] = findTextCollisions(boxes);
      expect(hit.a.label).toBe(`${'x'.repeat(40)}…`);
    });

    it('falls back to the path for an empty id', () => {
      const boxes = index([
        text('a', [{ x: 0, width: 100, emTop: 0, emBottom: 10 }], ''),
        text('b', [{ x: 50, width: 100, emTop: 0, emBottom: 10 }], 'other'),
      ]);
      expect(pairs(boxes)).toEqual(['a|other']);
    });
  });

  describe('hostile geometry', () => {
    it.each(['x', 'width', 'emTop', 'emBottom'])(
      'ignores a line whose %s is not a finite number',
      (field) => {
        const broken = { x: 0, width: 100, emTop: 0, emBottom: 10, [field]: Number.NaN };
        const boxes: BoxIndex = {
          pages: [
            [
              { path: 'a', border: ZERO, content: ZERO, text: { lines: [broken] } as never },
              text('b', [{ x: 0, width: 100, emTop: 0, emBottom: 10 }]),
            ],
          ],
        };
        expect(findTextCollisions(boxes)).toEqual([]);
      },
    );

    it.each(['y', 'height', 'emLeft', 'emRight'])(
      'ignores a column whose %s is not a finite number',
      (field) => {
        const broken = {
          y: 0,
          height: 100,
          baseline: 0,
          emLeft: 0,
          emRight: 12,
          [field]: Number.POSITIVE_INFINITY,
        };
        const boxes: BoxIndex = {
          pages: [
            [
              { path: 'a', border: ZERO, content: ZERO, text: { columns: [broken] } as never },
              {
                path: 'b',
                border: ZERO,
                content: ZERO,
                text: { columns: [{ y: 0, height: 100, baseline: 0, emLeft: 0, emRight: 12 }] },
              },
            ],
          ],
        };
        expect(findTextCollisions(boxes)).toEqual([]);
      },
    );

    it.each([
      ['a non-object metrics bundle', 'nonsense'],
      ['a metrics bundle with neither lines nor columns', {}],
      ['a non-array lines field', { lines: 'nope' }],
      ['a non-array columns field', { columns: 7 }],
    ])('degrades on %s', (_label, metrics) => {
      const boxes: BoxIndex = {
        pages: [
          [
            { path: 'a', border: ZERO, content: ZERO, text: metrics as never },
            text('b', [{ x: 0, width: 100, emTop: 0, emBottom: 10 }]),
          ],
        ],
      };
      expect(findTextCollisions(boxes)).toEqual([]);
    });

    it.each([
      ['a null line', null],
      ['a primitive line', 10n],
      ['a symbol line', Symbol('line')],
    ])('ignores %s without throwing', (_label, line) => {
      const boxes: BoxIndex = {
        pages: [
          [
            { path: 'a', border: ZERO, content: ZERO, text: { lines: [line] } as never },
            text('b', [{ x: 0, width: 100, emTop: 0, emBottom: 10 }]),
          ],
        ],
      };
      expect(findTextCollisions(boxes)).toEqual([]);
    });

    it.each([
      ['a null column', null],
      ['a primitive column', 10n],
      ['a symbol column', Symbol('column')],
    ])('ignores %s without throwing', (_label, column) => {
      const boxes: BoxIndex = {
        pages: [
          [
            { path: 'a', border: ZERO, content: ZERO, text: { columns: [column] } as never },
            {
              path: 'b',
              border: ZERO,
              content: ZERO,
              text: { columns: [{ y: 0, height: 100, baseline: 0, emLeft: 0, emRight: 12 }] },
            },
          ],
        ],
      };
      expect(findTextCollisions(boxes)).toEqual([]);
    });

    it('keys pairs by value, so prototype-shaped paths resolve as data', () => {
      const boxes = index([
        text('__proto__', [{ x: 0, width: 100, emTop: 0, emBottom: 10 }]),
        text('constructor', [{ x: 50, width: 100, emTop: 0, emBottom: 10 }]),
        text('toString', [{ x: 60, width: 100, emTop: 0, emBottom: 10 }]),
      ]);
      expect(pairs(boxes)).toEqual([
        '__proto__|constructor',
        '__proto__|toString',
        'constructor|toString',
      ]);
    });
  });

  describe('bounds', () => {
    it('caps the collisions it reports', () => {
      // 40 mutually overlapping items would collide in 780 pairs.
      const many = Array.from({ length: 40 }, (_, i) =>
        text(`item${i}`, [{ x: 0, width: 100, emTop: 0, emBottom: 10 }]),
      );
      expect(findTextCollisions(index(many))).toHaveLength(20);
    });

    it('bounds ONE box that draws a huge number of lines', () => {
      // The per-page bound has to apply to the LINE LIST, not just be checked
      // between boxes: a single text item can wrap to arbitrarily many lines,
      // and spreading them into `push(...)` would blow the call stack inside a
      // React render. 50k lines in one box must neither hang nor throw.
      const huge = text(
        'runaway',
        Array.from({ length: 50_000 }, (_, i) => ({
          x: 0,
          width: 5,
          emTop: i * 10,
          emBottom: i * 10 + 5,
        })),
      );
      expect(findTextCollisions(index([huge]))).toEqual([]);
    });

    it('stops comparing once the document-wide budget is spent', () => {
      // A long, entirely CLEAN document is the worst case: the collision cap
      // short-circuits only once something has been found, so nothing else
      // bounds the quadratic scan. A collision buried at the end of a later
      // page is past the budget and is not reached.
      const clear = (page: number) =>
        Array.from({ length: 400 }, (_, i) =>
          text(`p${page}i${i}`, [{ x: 0, width: 5, emTop: i * 20, emBottom: i * 20 + 10 }]),
        );
      const late = clear(3);
      late[399] = text('late', [{ x: 0, width: 5, emTop: 398 * 20, emBottom: 398 * 20 + 10 }]);
      expect(findTextCollisions(index(clear(0), clear(1), late, clear(2)))).toEqual([]);
    });

    it('still reports a collision reachable within the budget', () => {
      // The positive control for the test above: without it, an empty result
      // would be indistinguishable from a sweep that never ran.
      const clear = (page: number) =>
        Array.from({ length: 400 }, (_, i) =>
          text(`p${page}i${i}`, [{ x: 0, width: 5, emTop: i * 20, emBottom: i * 20 + 10 }]),
        );
      const early = clear(3);
      early[1] = text('early', [{ x: 0, width: 5, emTop: 0, emBottom: 10 }]);
      expect(pairs(index(clear(0), clear(1), early))).toEqual(['p3i0|early']);
    });

    it('bounds the lines it scans on one page', () => {
      // 500 non-overlapping lines on one item, then a pair that WOULD collide
      // past the scan bound: the scan stops rather than walking the page.
      const wall = text(
        'wall',
        Array.from({ length: 500 }, (_, i) => ({
          x: 0,
          width: 5,
          emTop: i * 10,
          emBottom: i * 10 + 5,
        })),
      );
      const boxes = index([
        wall,
        text('a', [{ x: 0, width: 100, emTop: 9000, emBottom: 9010 }]),
        text('b', [{ x: 50, width: 100, emTop: 9000, emBottom: 9010 }]),
      ]);
      expect(findTextCollisions(boxes)).toEqual([]);
    });
  });
});
