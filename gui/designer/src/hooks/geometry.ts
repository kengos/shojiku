// Page-geometry helpers shared by the insert/image/block wiring: the content
// box recovered from the last-good render, and which band an item-list path
// belongs to. Pure, so their guard branches are unit-testable.

import type { PlacedBox } from '../engine/types';
import type { LastGoodPreview } from '../preview/reducer';

/** Which page a client point lands on, converted into that page's pt space
 * with its laid-out boxes — the shared result of the canvas hit-test that
 * the palette drag and the image file drop both plan over. */
export interface PageHit {
  readonly page: number;
  readonly boxes: readonly PlacedBox[];
  readonly point: { readonly x: number; readonly y: number };
}

/** The page content width (pt) an inserted image's default box is clamped to:
 * the first rendered page's point width (px ÷ render scale) minus the L/R
 * margins. A missing render / empty page / margin-less inspect falls back to a
 * common A4 content width. */
export function contentWidthPt(snapshot: LastGoodPreview | null): number {
  const page = snapshot?.pages[0];
  if (snapshot === null || page === undefined) {
    return 480;
  }
  const widthPt = page.width / snapshot.scale;
  const margin = snapshot.inspect?.margin;
  const inset = margin === undefined ? 0 : margin[1] + margin[3];
  return Math.max(1, widthPt - inset);
}

/** The page content HEIGHT (pt): the twin of `contentWidthPt`, used to place a
 * newly inserted band item near the band it belongs to. Pixel-derived geometry
 * is ceil-inflated, so callers floor it before authoring a coordinate. */
export function contentHeightPt(snapshot: LastGoodPreview | null): number {
  const page = snapshot?.pages[0];
  if (snapshot === null || page === undefined) {
    return 792;
  }
  const heightPt = page.height / snapshot.scale;
  const margin = snapshot.inspect?.margin;
  const inset = margin === undefined ? 0 : margin[0] + margin[2];
  return Math.max(1, heightPt - inset);
}

/** Which band an item-list path belongs to, or null for anything else. */
export function bandOf(path: string): 'header' | 'footer' | null {
  if (path.startsWith('sections.header')) {
    return 'header';
  }
  return path.startsWith('sections.footer') ? 'footer' : null;
}
