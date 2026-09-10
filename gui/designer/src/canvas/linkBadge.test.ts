// Where the link badge lands, and — more often — where it does NOT: an engine
// that never heard of the flag, a link the engine gated away, and geometry a
// hostile inspect response could carry.

import { describe, expect, it } from 'vitest';
import type { PlacedBox, TextMetrics } from '../engine/types';
import { LINK_BADGE_PX, linkBadges } from './linkBadge';

const HALF = LINK_BADGE_PX / 2;
const GAP = 4;

const box = (over: Partial<PlacedBox> = {}): PlacedBox => ({
  path: 'sections.body.items[0]',
  border: { x: 10, y: 20, w: 100, h: 30 },
  content: { x: 10, y: 20, w: 100, h: 30 },
  linked: true,
  ...over,
});

const line = (x: number, width: number, emTop: number, emBottom: number) => ({
  x,
  width,
  baseline: emBottom - 2,
  capTop: emTop + 1,
  emTop,
  emBottom,
});

describe('where the badge lands', () => {
  it('anchors to the widest LINE, not the border box', () => {
    // The whole point of the ink anchor: the box is 100pt wide and the glyphs
    // stop at 46, so a corner badge would float 54pt out in empty margin.
    const metrics: TextMetrics = {
      lines: [line(10, 30, 20, 32), line(10, 36, 32, 44), line(10, 20, 44, 56)],
    };
    const [badge] = linkBadges([box({ text: metrics })], 2);
    // widest line ends at 10 + 36 = 46pt -> 92px, then the gap and the radius.
    expect(badge.cx).toBe(92 + GAP + HALF);
    // Vertically centred on the FIRST line's em band: (20 + 32) / 2 = 26pt.
    expect(badge.cy).toBe(52);
    expect(badge.path).toBe('sections.body.items[0]');
  });

  it('anchors a VERTICAL item to its rightmost column, at the text top', () => {
    // `vertical-rl` lays columns right to left, so the rightmost is where the
    // text starts — the badge belongs beside that, not halfway down.
    const metrics: TextMetrics = {
      columns: [
        { y: 20, height: 60, baseline: 40, emLeft: 34, emRight: 46 },
        { y: 24, height: 40, baseline: 26, emLeft: 20, emRight: 32 },
      ],
    };
    const [badge] = linkBadges([box({ text: metrics })], 2);
    expect(badge.cx).toBe(92 + GAP + HALF);
    expect(badge.cy).toBe(40);
  });

  it('falls back to the border box when there are no glyph metrics', () => {
    // An image: its ink IS its draw box.
    const [badge] = linkBadges([box()], 2);
    expect(badge.cx).toBe((10 + 100) * 2 + GAP + HALF);
    expect(badge.cy).toBe(40);
  });

  it('treats an EMPTY metrics list as no metrics', () => {
    const [badge] = linkBadges([box({ text: { lines: [] } })], 2);
    expect(badge.cx).toBe((10 + 100) * 2 + GAP + HALF);
    const [column] = linkBadges([box({ text: { columns: [] } })], 2);
    expect(column.cx).toBe((10 + 100) * 2 + GAP + HALF);
  });

  it('emits one badge per LINKED placement, in box order', () => {
    const badges = linkBadges(
      [box({ path: 'a' }), box({ path: 'b', linked: false }), box({ path: 'c' })],
      1,
    );
    expect(badges.map((b) => b.path)).toEqual(['a', 'c']);
  });
});

describe('what the badge refuses to draw', () => {
  it('draws nothing for an engine that never stamped the flag', () => {
    // The compatibility path, and the reason the canvas needs no capability
    // gate: an older engine simply omits the key.
    expect(linkBadges([box({ linked: undefined })], 1)).toEqual([]);
  });

  it('draws nothing when the engine said false', () => {
    // Which is also every link the URL gate rejected — the engine decides.
    expect(linkBadges([box({ linked: false })], 1)).toEqual([]);
  });

  it('drops a box whose geometry is not finite, and keeps its neighbours', () => {
    const bad = box({ path: 'bad', border: { x: 10, y: Number.NaN, w: 100, h: 30 } });
    const badLine = box({
      path: 'badline',
      text: { lines: [line(Number.POSITIVE_INFINITY, 30, 20, 32)] },
    });
    const badColumn = box({
      path: 'badcolumn',
      text: { columns: [{ y: Number.NaN, height: 10, baseline: 4, emLeft: 0, emRight: 8 }] },
    });
    const badges = linkBadges([bad, badLine, badColumn, box({ path: 'good' })], 1);
    expect(badges.map((b) => b.path)).toEqual(['good']);
  });

  it('draws nothing at all when the SCALE is not finite', () => {
    expect(linkBadges([box()], Number.NaN)).toEqual([]);
  });
});
