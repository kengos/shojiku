import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  anchorOf,
  clipperOf,
  placeTip,
  type TipPlacement,
  tipAnchorClasses,
  useTipPlacement,
} from './useTipPlacement';

/** Rects the stubbed `getBoundingClientRect` hands back, keyed by the marker
 * attribute on the element. jsdom lays nothing out, so every geometry in this
 * file is supplied — which is exactly why the numbers below are real ones read
 * off the running app rather than invented. */
const RECTS: Record<string, { left: number; right: number; width: number }> = {};

function stubRects() {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const key = this.hasAttribute('data-sj-tip')
      ? 'tip'
      : ((this as HTMLElement).dataset.rect ?? '');
    const rect = RECTS[key] ?? { left: 0, right: 0, width: 0 };
    return { ...rect, top: 0, bottom: 0, x: rect.left, y: 0, height: 0, toJSON: () => ({}) };
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const key of Object.keys(RECTS)) {
    delete RECTS[key];
  }
});

describe('placeTip', () => {
  const clip = { left: 0, right: 300 };

  it('stays centred when the centred bubble fits', () => {
    expect(placeTip({ left: 140, right: 160 }, 100, clip)).toBe('center');
  });

  it('anchors at the start when the centred bubble runs off the clipping left edge', () => {
    expect(placeTip({ left: 10, right: 30 }, 100, clip)).toBe('start');
  });

  it('anchors at the end when the centred bubble runs off the clipping right edge', () => {
    expect(placeTip({ left: 270, right: 290 }, 100, clip)).toBe('end');
  });

  it('anchors where MORE of the bubble is visible when neither side fits', () => {
    // Wider than the room on both sides, so no anchoring shows it whole.
    // A trigger near the clipper's left edge keeps more by growing rightward…
    expect(placeTip({ left: 10, right: 30 }, 400, clip)).toBe('start');
    // …and one near the right edge keeps more by growing leftward. This is the
    // case the first cut got wrong: it read "the centred box overflowed right"
    // as "anchor at the right edge", which is a different question.
    expect(placeTip({ left: 270, right: 290 }, 400, clip)).toBe('end');
  });

  it('never picks a side that does not fit, even when the centred box hid it', () => {
    // The defect this rule was rewritten for, at the geometry it was MEASURED
    // at: the layer-tree pane dragged to the 180px its own clamp allows, with
    // the 205px tooltip anchored 12px from its right edge. Choosing by which
    // way the centred box overflowed answers `end`, whose left edge lands at
    // -37 — 38px of the tooltip's FRONT gone, which is the exact failure the
    // whole change exists to remove.
    const narrow = { left: 0, right: 180 };
    const anchor = { left: 150, right: 168 };
    const placement = placeTip(anchor, 205.48, narrow);
    // `end` is still the answer here — but because it shows 168px against
    // `start`'s 30px, not because the overflow pointed that way.
    expect(placement).toBe('end');
    const visible = (side: TipPlacement) =>
      side === 'start' ? narrow.right - anchor.left : anchor.right - narrow.left;
    expect(visible('end')).toBeGreaterThan(visible('start'));
  });

  it('measures against the VISIBLE part of a trigger scrolled out of its clipper', () => {
    // The trigger's right edge is past the clipper. Read raw, `end` "fits" on
    // its left edge while placing the bubble entirely out of sight; clamped,
    // the bubble centres on the part of the trigger a user can actually see.
    expect(placeTip({ left: 200, right: 400 }, 100, clip)).toBe('center');
  });
});

/** Every geometry measured in the running Designer that a CENTRED bubble
 * overflowed, in clipper-relative pixels: the four containers that clip a
 * tooltip (the app root, the 239px layer-tree pane, the 280px property panel,
 * and a `Segmented` row's own `overflow-hidden`), on both edges.
 *
 * Read off the live app rather than derived from the overflow figures — the
 * anchor box and the bubble's width are the two inputs that do NOT change with
 * the side it hangs from, which is what makes measuring them after the fix
 * legitimate, and deriving them from rounded overflows would have been off by
 * a pixel in three rows. */
const MEASURED: readonly {
  readonly what: string;
  readonly clipWidth: number;
  readonly anchor: { readonly left: number; readonly right: number };
  readonly width: number;
  readonly side: TipPlacement;
}[] = [
  {
    what: 'app root, leftmost toolbar button',
    clipWidth: 1440,
    anchor: { left: 12, right: 48 },
    width: 64,
    side: 'start',
  },
  {
    what: 'app root, the document-settings back button',
    clipWidth: 1440,
    anchor: { left: 12, right: 48 },
    width: 110.92,
    side: 'start',
  },
  {
    what: 'layer-tree pane, its right-hand tool',
    clipWidth: 239,
    anchor: { left: 209, right: 227 },
    width: 205.48,
    side: 'end',
  },
  {
    what: 'property panel, content-kind hint',
    clipWidth: 280,
    anchor: { left: 47, right: 65 },
    width: 135.28,
    side: 'start',
  },
  {
    what: 'property panel, insert-field on the text row',
    clipWidth: 280,
    anchor: { left: 13, right: 43 },
    width: 112,
    side: 'start',
  },
  {
    what: 'property panel, insert-field on the link row',
    clipWidth: 280,
    anchor: { left: 13, right: 43 },
    width: 160,
    side: 'start',
  },
  {
    what: 'property panel, border help at the right edge',
    clipWidth: 280,
    anchor: { left: 250, right: 268 },
    width: 88,
    side: 'end',
  },
  {
    what: 'Segmented row, its left option',
    clipWidth: 251,
    anchor: { left: 1, right: 125 },
    width: 172,
    side: 'start',
  },
  {
    what: 'Segmented row, its right option',
    clipWidth: 251,
    anchor: { left: 125, right: 250 },
    width: 148,
    side: 'end',
  },
];

describe('placeTip over the geometries measured in the running app', () => {
  it('covers both edges and every container that clips a tooltip', () => {
    // The table is the evidence, so it has to be able to go stale loudly: a row
    // dropped from it would otherwise weaken the case below in silence.
    expect(MEASURED).toHaveLength(9);
    expect(new Set(MEASURED.map((m) => m.clipWidth))).toEqual(new Set([1440, 239, 280, 251]));
    expect(MEASURED.filter((m) => m.side === 'start')).toHaveLength(6);
    expect(MEASURED.filter((m) => m.side === 'end')).toHaveLength(3);
  });

  it('places every geometry measured in the running app inside its clipper', () => {
    for (const { what, clipWidth, anchor, width, side } of MEASURED) {
      const clip = { left: 0, right: clipWidth };
      expect(placeTip(anchor, width, clip), what).toBe(side);

      // The side is only half the claim: the placed box must LIE inside the
      // clipper. A rule that picked a plausible side and still overflowed
      // would satisfy the assertion above and ship the defect.
      const left = side === 'start' ? anchor.left : anchor.right - width;
      expect(left, `${what} (left edge)`).toBeGreaterThanOrEqual(clip.left);
      expect(left + width, `${what} (right edge)`).toBeLessThanOrEqual(clip.right);
    }
  });

  it('would clip every one of them if the bubble stayed centred (the control)', () => {
    // Without this, the suite above passes just as well against a rule that
    // never flips anything — every row would simply be reported as `center`.
    for (const { what, clipWidth, anchor, width } of MEASURED) {
      const centredLeft = (anchor.left + anchor.right) / 2 - width / 2;
      const overflows = centredLeft < 0 || centredLeft + width > clipWidth;
      expect(overflows, what).toBe(true);
    }
  });
});

describe('the one clipper that can be resized', () => {
  it('answers the same side at every width the pane clamp admits', () => {
    // The placement is measured once, on mount, and the sidebar pane is the
    // only clipper a user can resize — so "mount is enough" is a CLAIM about
    // this tooltip, and this is it. `MIN_SIDEBAR_WIDTH`..`MAX_SIDEBAR_WIDTH`,
    // with the tool anchored 12px in from the pane's right edge.
    const sides = [180, 200, 205, 240, 300, 480].map((pane) =>
      placeTip({ left: pane - 30, right: pane - 12 }, 205.48, { left: 0, right: pane }),
    );
    expect(new Set(sides)).toEqual(new Set(['end']));
  });

  it('cannot show a tooltip WIDER than the pane, and says so in the geometry', () => {
    // The honest residual: below roughly 217px the 205px bubble does not fit
    // the pane at all, so part of it is lost whatever side it hangs from. What
    // the rule guarantees is that the loss is the smallest available, not that
    // there is none.
    const pane = 180;
    const anchor = { left: pane - 30, right: pane - 12 };
    const left = anchor.right - 205.48;
    expect(placeTip(anchor, 205.48, { left: 0, right: pane })).toBe('end');
    // Only that it does not fit. The anchor here is a MODEL of where that tool
    // sits, so a precise pixel count off it would be arithmetic dressed as a
    // measurement — the measured figure (38px at this pane width) came from the
    // running app, and lives in the change's own record.
    expect(left).toBeLessThan(0);
  });
});

describe('tipAnchorClasses', () => {
  it('anchors left, right, or centred', () => {
    expect(tipAnchorClasses('start')).toBe('left-0');
    expect(tipAnchorClasses('end')).toBe('right-0');
    expect(tipAnchorClasses('center')).toBe('left-1/2 -translate-x-1/2');
  });
});

describe('clipperOf', () => {
  it('finds the nearest ancestor that clips', () => {
    const { container } = render(
      <div data-testid="outer" style={{ overflow: 'hidden' }}>
        <div style={{ overflowY: 'auto' }} data-rect="near">
          <span data-testid="leaf" />
        </div>
      </div>,
    );
    const leaf = container.querySelector('[data-testid="leaf"]') as HTMLElement;
    // `overflow-y: auto` alone: the property panel's own spelling, and the one
    // that cuts a bubble on the axis it does not name.
    expect(clipperOf(leaf).dataset.rect).toBe('near');
  });

  it('falls back to the document element when nothing on the way up clips', () => {
    const { container } = render(
      <div>
        <span data-testid="leaf" />
      </div>,
    );
    const leaf = container.querySelector('[data-testid="leaf"]') as HTMLElement;
    expect(clipperOf(leaf)).toBe(document.documentElement);
  });
});

describe('anchorOf', () => {
  it('finds the nearest positioned ancestor', () => {
    const { container } = render(
      <div style={{ position: 'relative' }} data-rect="far">
        <div style={{ position: 'absolute' }} data-rect="near">
          <span data-testid="leaf" />
        </div>
      </div>,
    );
    const leaf = container.querySelector('[data-testid="leaf"]') as HTMLElement;
    expect(anchorOf(leaf)?.dataset.rect).toBe('near');
  });

  it('reports none when nothing on the way up is positioned', () => {
    const { container } = render(
      <div>
        <span data-testid="leaf" />
      </div>,
    );
    const leaf = container.querySelector('[data-testid="leaf"]') as HTMLElement;
    expect(anchorOf(leaf)).toBeNull();
  });
});

/** A stand-in for `TipBubble`: the hook under test, on a span carrying the same
 * marker attribute the real bubble does, inside a clipper and an anchor. */
function Harness({ text }: { readonly text: string }) {
  const { placement, placeRef } = useTipPlacement(text);
  return (
    <div style={{ overflowY: 'auto' }} data-rect="clip">
      <span style={{ position: 'relative' }} data-rect="anchor">
        <span ref={placeRef} data-sj-tip data-testid="tip">
          {placement}
        </span>
      </span>
    </div>
  );
}

describe('useTipPlacement', () => {
  it('measures on mount and flips the bubble off the clipping edge', () => {
    RECTS.clip = { left: 0, right: 280, width: 280 };
    RECTS.anchor = { left: 13, right: 43, width: 30 };
    RECTS.tip = { left: 0, right: 160, width: 160 };
    stubRects();
    const { container } = render(<Harness text="リンクにデータ項目を挿入" />);
    expect(container.querySelector('[data-testid="tip"]')?.textContent).toBe('start');
  });

  it('flips to the far edge when the overflow is on the other side', () => {
    RECTS.clip = { left: 0, right: 239, width: 239 };
    RECTS.anchor = { left: 209, right: 227, width: 18 };
    RECTS.tip = { left: 0, right: 205, width: 205.48 };
    stubRects();
    const { container } = render(<Harness text="レイヤーの並べ替えとグループ移動" />);
    expect(container.querySelector('[data-testid="tip"]')?.textContent).toBe('end');
  });

  it('stays centred where the bubble fits', () => {
    RECTS.clip = { left: 0, right: 1440, width: 1440 };
    RECTS.anchor = { left: 700, right: 736, width: 36 };
    RECTS.tip = { left: 0, right: 64, width: 64 };
    stubRects();
    const { container } = render(<Harness text="元に戻す" />);
    expect(container.querySelector('[data-testid="tip"]')?.textContent).toBe('center');
  });

  it('re-measures when the text changes, because the width did', () => {
    // The one input that varies within a session: a label may interpolate a
    // document-derived name, and a longer name can need the other side.
    RECTS.clip = { left: 0, right: 280, width: 280 };
    RECTS.anchor = { left: 100, right: 130, width: 30 };
    RECTS.tip = { left: 0, right: 60, width: 60 };
    stubRects();
    const { container, rerender } = render(<Harness text="short" />);
    expect(container.querySelector('[data-testid="tip"]')?.textContent).toBe('center');
    RECTS.tip = { left: 0, right: 260, width: 260 };
    rerender(<Harness text="a very much longer label indeed" />);
    expect(container.querySelector('[data-testid="tip"]')?.textContent).toBe('start');
  });

  it('stays centred when there is no positioned ancestor to measure against', () => {
    // Nothing to anchor to is not a reason to guess: the bubble renders exactly
    // as it did before it was measured at all.
    RECTS.clip = { left: 0, right: 280, width: 280 };
    RECTS.tip = { left: 0, right: 160, width: 160 };
    stubRects();
    function Unpositioned() {
      const { placement, placeRef } = useTipPlacement('x');
      return (
        <div style={{ overflowY: 'auto' }} data-rect="clip">
          <span ref={placeRef} data-sj-tip data-testid="tip">
            {placement}
          </span>
        </div>
      );
    }
    const { container } = render(<Unpositioned />);
    expect(container.querySelector('[data-testid="tip"]')?.textContent).toBe('center');
  });

  it('returns to the unmeasured default when the bubble goes away', () => {
    RECTS.clip = { left: 0, right: 280, width: 280 };
    RECTS.anchor = { left: 13, right: 43, width: 30 };
    RECTS.tip = { left: 0, right: 160, width: 160 };
    stubRects();
    const seen: string[] = [];
    function Toggling({ show }: { readonly show: boolean }) {
      const { placement, placeRef } = useTipPlacement('x');
      seen.push(placement);
      return (
        <div style={{ overflowY: 'auto' }} data-rect="clip">
          <span style={{ position: 'relative' }} data-rect="anchor">
            {show ? <span ref={placeRef} data-sj-tip /> : null}
          </span>
        </div>
      );
    }
    const { rerender } = render(<Toggling show={true} />);
    expect(seen).toContain('start');
    rerender(<Toggling show={false} />);
    expect(seen[seen.length - 1]).toBe('center');
  });
});
