// What the canvas can say about a link, and where it says it.
//
// The badge (`linkBadge.ts`) says an item HAS a link. This says WHERE it goes —
// the half the badge deliberately left out, because the box index carries only
// a `linked` flag and the URL lives in the document. So the destination ARRIVES
// from the host, keyed by path, the way `dropWarning` arrives: the canvas is
// presentational and carries no i18n of its own.
//
// Two channels, because two audiences: the chip a pointer summons, and the
// description a screen reader reads without hovering at all. They ride one
// entry so a host cannot wire half of it.

import type { PlacedBox } from '../engine/types';
import { chipSafeText, chipWidth, fitChipText } from './chipText';
import { LINK_BADGE_PX, linkBadges } from './linkBadge';

/** What the host says about one linked item. `url` is shown VERBATIM — a URL is
 * not translated — and `description` is the host's own localized sentence for
 * the accessibility channel, so what a screen reader hears is the host's call
 * rather than this component's. */
export interface LinkHint {
  readonly url: string;
  readonly description: string;
}

export const HINT_FONT_PX = 11;
export const HINT_HEIGHT_PX = 20;
const HINT_PAD_PX = 8;
/** Clear space between the badge's edge and the chip. */
const HINT_GAP_PX = 4;

/** A destination chip to paint: its box in overlay px and the text to put in
 * it, already cut to fit. */
export interface LinkHintChip {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly text: string;
}

/** The chip for the hovered PLACEMENT, or null when nothing is hovered or the
 * hovered item carries no link.
 *
 * It takes the hovered BOX, not its path, and that distinction is the whole
 * reason this signature is not simpler: a `repeat`'s rows share ONE path
 * (`linkBadge.ts` says so, and it is why that file produces one badge per
 * PLACEMENT). Looking a badge up by path would answer with the first row's
 * badge whichever row the pointer is on — eight product cards in the bundled
 * `catalog-ja` preset, hover the eighth, the chip appears beside the first.
 *
 * BELOW the badge, not beside it, and the reason is not taste. Beside it, the
 * chip runs out of page on exactly the items that need it most: a badge is
 * anchored to the item's INK, so a right-aligned or full-width item puts it
 * near the sheet's edge, and a chip that then flips to the left lands squarely
 * on the item's own text. That was measured on the delivery-note preset before
 * this comment was written — the chip covered the words it was explaining.
 *
 * Clamped horizontally so it stays on the sheet, and flipped ABOVE when the
 * badge is near the bottom edge. The text is cut to the page's width — the
 * destination is authored, so its length is bounded by nothing this side owns.
 */
export function linkHintChip(
  hovered: PlacedBox | null,
  hints: ReadonlyMap<string, LinkHint> | undefined,
  scale: number,
  page: { readonly width: number; readonly height: number },
): LinkHintChip | null {
  if (hovered === null || hints === undefined) {
    return null;
  }
  const hint = hints.get(hovered.path);
  // The SAME pure function the badge layer paints from, over the one box: the
  // chip and the badge cannot disagree about where the badge is.
  const badge = linkBadges([hovered], scale)[0];
  if (hint === undefined || badge === undefined) {
    return null;
  }
  const text = fitChipText(chipSafeText(hint.url), HINT_FONT_PX, HINT_PAD_PX, page.width);
  const width = Math.min(chipWidth(text, HINT_FONT_PX, HINT_PAD_PX), page.width);
  const below = badge.cy + LINK_BADGE_PX / 2 + HINT_GAP_PX;
  const above = badge.cy - LINK_BADGE_PX / 2 - HINT_GAP_PX - HINT_HEIGHT_PX;
  return {
    // Left-aligned to the badge, then pulled back onto the sheet.
    x: Math.max(0, Math.min(badge.cx - LINK_BADGE_PX / 2, page.width - width)),
    y: below + HINT_HEIGHT_PX <= page.height ? below : Math.max(0, above),
    width,
    text,
  };
}

/** Where the text sits inside the chip. */
export function hintTextOrigin(chip: LinkHintChip): { readonly x: number; readonly y: number } {
  return { x: chip.x + HINT_PAD_PX, y: chip.y + HINT_HEIGHT_PX / 2 + HINT_FONT_PX * 0.36 };
}
