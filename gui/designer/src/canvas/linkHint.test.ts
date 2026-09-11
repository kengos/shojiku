// Where the destination chip lands, and — more often — why there is none.
//
// It is driven with real `PlacedBox`es rather than badge coordinates, because
// the identity question is the point: a `repeat`'s rows share ONE path, so a
// chip looked up by path lands on the wrong row.

import { describe, expect, it } from 'vitest';
import type { PlacedBox, TextMetrics } from '../engine/types';
import { HINT_HEIGHT_PX, hintTextOrigin, type LinkHint, linkHintChip } from './linkHint';

const PAGE = { width: 600, height: 800 };
const PATH = 'sections.body.items[0]';
const URL = 'https://example.com';

/** A linked text box whose single line of ink fills its border box, so the
 * badge (and the chip under it) sits at a predictable x. */
const linked = (y: number, x = 100, path = PATH): PlacedBox => {
  const text: TextMetrics = {
    lines: [{ x, width: 80, baseline: y + 10, capTop: y + 2, emTop: y, emBottom: y + 12 }],
  };
  return {
    path,
    border: { x, y, w: 80, h: 12 },
    content: { x, y, w: 80, h: 12 },
    linked: true,
    text,
  };
};

const hints = (url: string, path = PATH): ReadonlyMap<string, LinkHint> =>
  new Map([[path, { url, description: `Links to ${url}` }]]);

describe('linkHintChip', () => {
  it('paints nothing with nothing hovered', () => {
    expect(linkHintChip(null, hints(URL), 1, PAGE)).toBeNull();
  });

  it('paints nothing when the host wired no hints at all', () => {
    // The documented "absent = unchanged" case, and where an older engine
    // lands: no `link.url` capability, so the host has nothing to say.
    expect(linkHintChip(linked(40), undefined, 1, PAGE)).toBeNull();
  });

  it('paints nothing for a hovered item that carries no link', () => {
    expect(linkHintChip(linked(40, 100, 'sections.body.items[9]'), hints(URL), 1, PAGE)).toBeNull();
  });

  it('paints nothing for a box the badge model itself will not mark', () => {
    // Hint and hover agree, and there is still no badge to sit under: the
    // engine never stamped this placement, so the overlay draws no mark and a
    // chip would explain one that is not there.
    const unstamped = { ...linked(40), linked: undefined };
    expect(linkHintChip(unstamped, hints(URL), 1, PAGE)).toBeNull();
  });

  it('follows the hovered ROW of a repeat, not the first one sharing its path', () => {
    // The case that makes this take a box rather than a path. Eight product
    // cards in the bundled `catalog-ja` preset share one item path; a lookup by
    // path would answer with the first card's badge whichever card the pointer
    // is on, putting the chip somewhere else entirely on the page.
    const first = linkHintChip(linked(40), hints(URL), 1, PAGE);
    const eighth = linkHintChip(linked(600), hints(URL), 1, PAGE);
    expect(first).not.toBeNull();
    expect(eighth?.y).toBeGreaterThan(first?.y ?? 0);
  });

  it('sits BELOW the badge, left-aligned to it', () => {
    // Below, not beside: beside, it lands on the item's own text whenever the
    // badge is near the sheet's edge — measured on the delivery-note preset,
    // where the chip covered the very words it was explaining.
    const chip = linkHintChip(linked(40), hints(URL), 1, PAGE);
    expect(chip).not.toBeNull();
    expect(chip?.y).toBeGreaterThan(40);
    expect(chip?.text).toBe(URL);
  });

  it('pulls back onto the sheet rather than running off its right edge', () => {
    // A badge is anchored to an item's INK, so a right-aligned or full-width
    // item puts it near the edge — the common case, not the corner one.
    const chip = linkHintChip(linked(40, 500), hints(URL), 1, PAGE);
    expect(chip).not.toBeNull();
    expect((chip?.x ?? 0) + (chip?.width ?? 0)).toBeLessThanOrEqual(PAGE.width);
    expect(chip?.x).toBeGreaterThanOrEqual(0);
  });

  it('flips ABOVE the badge at the foot of the page', () => {
    const chip = linkHintChip(linked(788), hints(URL), 1, PAGE);
    expect(chip?.y).toBeLessThan(788);
    expect(chip?.y).toBeGreaterThanOrEqual(0);
  });

  it('cuts a destination at the engine cap down to the page, and fast', () => {
    // 2048 bytes is `MAX_LINK_URL` — the acceptance criterion asks for the cap
    // itself, not a merely long string. The elapsed assertion is the guard on
    // the pre-slice: the naive shrink-and-remeasure loop is quadratic and cost
    // ~31 ms here, which is two dropped frames on every re-render a hover
    // survives.
    const atCap = `https://example.com/${'a'.repeat(2028)}`;
    expect(atCap.length).toBe(2048);
    const started = performance.now();
    const chip = linkHintChip(linked(40), hints(atCap), 1, PAGE);
    expect(performance.now() - started).toBeLessThan(20);
    expect(chip?.text.endsWith('…')).toBe(true);
    expect((chip?.x ?? 0) + (chip?.width ?? 0)).toBeLessThanOrEqual(PAGE.width);
  });

  it('stays on a page too small for it either way', () => {
    // Degenerate geometry must still be finite and non-negative rather than
    // painting off the sheet.
    const chip = linkHintChip(linked(5, 2), hints(URL), 1, { width: 10, height: 10 });
    expect(chip?.x).toBeGreaterThanOrEqual(0);
    expect(chip?.y).toBeGreaterThanOrEqual(0);
    expect(chip?.width).toBeGreaterThanOrEqual(0);
  });
});

describe('hintTextOrigin', () => {
  it('insets the text by the chip padding and drops it to the baseline', () => {
    const origin = hintTextOrigin({ x: 100, y: 30, width: 80, text: URL });
    expect(origin.x).toBe(108);
    expect(origin.y).toBeGreaterThan(30);
    expect(origin.y).toBeLessThan(30 + HINT_HEIGHT_PX);
  });
});
