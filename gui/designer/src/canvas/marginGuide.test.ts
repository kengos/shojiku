import { describe, expect, it } from 'vitest';
import { type MarginGuide, marginGuide, ORIGIN_MARKER_PX, type PageMargin } from './marginGuide';

/** The engine's tuple is what the transport PARSES, never a proof — a hostile
 * envelope can carry any shape at all, so the hostile cases cast through here
 * rather than pretending the type holds. */
const hostile = (value: unknown): PageMargin => value as PageMargin;

const guide = (result: MarginGuide | null): MarginGuide => {
  if (result === null) {
    throw new Error('expected a guide');
  }
  return result;
};

describe('marginGuide', () => {
  it('insets the page by each margin, scaled, with the origin at the inset corner', () => {
    // A4 at 1 px/pt with the engine's default 25pt margins.
    const { rect, origin } = guide(marginGuide([25, 25, 25, 25], 1, 595, 842));
    expect(rect).toEqual({ x: 25, y: 25, w: 545, h: 792 });
    expect(origin).toBe(true);
  });

  it('scales the insets with the render scale', () => {
    const { rect } = guide(marginGuide([25, 25, 25, 25], 2, 1190, 1684));
    expect(rect).toEqual({ x: 50, y: 50, w: 1090, h: 1584 });
  });

  it('applies each side independently, not uniformly', () => {
    // [top, right, bottom, left] — deliberately all different.
    const { rect } = guide(marginGuide([10, 20, 30, 40], 1, 500, 400));
    expect(rect).toEqual({ x: 40, y: 10, w: 500 - 60, h: 400 - 40 });
  });

  it('paints nothing when every side is zero — the sheet-absolute escape hatch', () => {
    // `margin: 0` means the margin box IS the sheet, so there is no invisible
    // inner rectangle to reveal and a guide would only draw a page border.
    expect(marginGuide([0, 0, 0, 0], 1, 595, 842)).toBeNull();
  });

  it('still paints when only SOME sides are zero', () => {
    const { rect } = guide(marginGuide([0, 0, 40, 0], 1, 595, 842));
    expect(rect).toEqual({ x: 0, y: 0, w: 595, h: 802 });
  });

  it('paints nothing without margins at hand', () => {
    expect(marginGuide(null, 1, 595, 842)).toBeNull();
    expect(marginGuide(undefined, 1, 595, 842)).toBeNull();
  });

  it('refuses a non-finite side', () => {
    expect(marginGuide([Number.NaN, 25, 25, 25], 1, 595, 842)).toBeNull();
    expect(marginGuide([25, Number.POSITIVE_INFINITY, 25, 25], 1, 595, 842)).toBeNull();
  });

  it('refuses a negative side', () => {
    // The wire rejects negative page margins at parse, so this cannot arrive
    // from a valid engine — it is refused anyway rather than trusted.
    expect(marginGuide([25, 25, 25, -1], 1, 595, 842)).toBeNull();
  });

  it('refuses a non-positive or non-finite scale', () => {
    expect(marginGuide([25, 25, 25, 25], 0, 595, 842)).toBeNull();
    expect(marginGuide([25, 25, 25, 25], -1, 595, 842)).toBeNull();
    expect(marginGuide([25, 25, 25, 25], Number.NaN, 595, 842)).toBeNull();
  });

  it('refuses a non-positive or non-finite page size', () => {
    expect(marginGuide([25, 25, 25, 25], 1, 0, 842)).toBeNull();
    expect(marginGuide([25, 25, 25, 25], 1, 595, 0)).toBeNull();
    expect(marginGuide([25, 25, 25, 25], 1, Number.NaN, 842)).toBeNull();
    expect(marginGuide([25, 25, 25, 25], 1, 595, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('refuses margins that consume an axis, on either axis', () => {
    // The engine falls a consumed axis back to 0 before it reaches us
    // (`page_margin_too_large`), so this is the belt to that braces.
    expect(marginGuide([10, 300, 10, 300], 1, 595, 842)).toBeNull();
    expect(marginGuide([500, 10, 500, 10], 1, 595, 842)).toBeNull();
  });

  describe('the origin marker', () => {
    it('is present when the top margin band has room for it', () => {
      expect(guide(marginGuide([ORIGIN_MARKER_PX, 5, 5, 5], 1, 595, 842)).origin).toBe(true);
    });

    it('is dropped when the top band is too thin, keeping the rectangle', () => {
      // It would otherwise draw off the top of the page.
      const result = guide(marginGuide([ORIGIN_MARKER_PX - 1, 5, 5, 5], 1, 595, 842));
      expect(result.origin).toBe(false);
      expect(result.rect.y).toBe(ORIGIN_MARKER_PX - 1);
    });

    it('follows the SCALED band, not the authored pt value', () => {
      // 8pt of margin is below the marker's room at 1×, and above it at 2×.
      expect(guide(marginGuide([8, 5, 5, 5], 1, 595, 842)).origin).toBe(false);
      expect(guide(marginGuide([8, 5, 5, 5], 2, 1190, 1684)).origin).toBe(true);
    });
  });

  describe('a hostile envelope', () => {
    it('refuses the wrong arity', () => {
      expect(marginGuide(hostile([25, 25, 25]), 1, 595, 842)).toBeNull();
      expect(marginGuide(hostile([25, 25, 25, 25, 25]), 1, 595, 842)).toBeNull();
    });

    it('refuses string sides rather than coercing them', () => {
      // `'25' * 1` is 25 in JS — without the typeof guard this would paint.
      expect(marginGuide(hostile(['25', '25', '25', '25']), 1, 595, 842)).toBeNull();
    });

    it('refuses a non-array', () => {
      expect(
        marginGuide(hostile({ top: 25, right: 25, bottom: 25, left: 25 }), 1, 595, 842),
      ).toBeNull();
      expect(marginGuide(hostile('25,25,25,25'), 1, 595, 842)).toBeNull();
      // A four-CHARACTER string has length 4 and no `.every` — an arity check
      // alone would crash here instead of refusing.
      expect(marginGuide(hostile('2525'), 1, 595, 842)).toBeNull();
    });

    it('refuses a SPARSE array at the per-side guard, not downstream', () => {
      // `Array.prototype.every` skips holes: without materializing first, this
      // would sail past `side()` and only be caught by the extent check.
      const holed: unknown[] = [25, 25, 25, 25];
      delete holed[2];
      expect(marginGuide(hostile(holed), 1, 595, 842)).toBeNull();
    });

    it('never lets a NaN reach the geometry — every refusal is null', () => {
      // A NaN in an SVG attribute is how a bad envelope would otherwise show
      // up on screen, so the model must have no path that returns one.
      for (const bad of [
        [Number.NaN, 0, 0, 0],
        [0, Number.NaN, 0, 0],
        [0, 0, Number.NaN, 0],
        [0, 0, 0, Number.NaN],
      ]) {
        expect(marginGuide(hostile(bad), 1, 595, 842)).toBeNull();
      }
    });
  });
});
