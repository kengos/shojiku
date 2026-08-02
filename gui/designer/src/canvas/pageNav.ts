// The page-nav rail's pure model — DOM-free so the "which page is the user
// looking at" rule is unit-testable with fabricated numbers (the glue that
// reads live rects lives in the Designer, where jsdom returns zeroed rects).
//
// A span is one page's vertical extent in the SAME coordinate space as the
// viewport bounds the caller passes (client px, both from getBoundingClientRect
// — so the CSS zoom transform is already factored in).

/** One page's vertical extent `[top, bottom]` in viewport client px. */
export interface PageSpan {
  readonly top: number;
  readonly bottom: number;
}

/** Signed overlap of `[top, bottom]` with `[viewTop, viewBottom]` (≤0 = none). */
function overlap(span: PageSpan, viewTop: number, viewBottom: number): number {
  return Math.min(span.bottom, viewBottom) - Math.max(span.top, viewTop);
}

/**
 * Index of the page occupying the most of the viewport `[viewTop, viewBottom]`.
 * The page with the largest visible height wins; ties resolve to the EARLIEST
 * such page (a scroll position straddling two equal halves keeps the upper one
 * "current"). When no page overlaps the viewport (scrolled into a gap or past
 * the ends), the page whose CENTER is nearest the viewport center wins. Empty
 * input → 0 — the rail is never shown with zero pages, but the caller stays
 * total.
 */
export function mostVisiblePageIndex(
  spans: readonly PageSpan[],
  viewTop: number,
  viewBottom: number,
): number {
  const viewCenter = (viewTop + viewBottom) / 2;
  let best = 0;
  let bestOverlap = Number.NEGATIVE_INFINITY;
  let bestDistance = Number.POSITIVE_INFINITY;
  spans.forEach((span, index) => {
    const visible = Math.max(0, overlap(span, viewTop, viewBottom));
    const distance = Math.abs((span.top + span.bottom) / 2 - viewCenter);
    // Prefer more visible height; break exact ties (incl. the all-zero,
    // no-overlap case) by proximity to the viewport center.
    if (visible > bestOverlap || (visible === bestOverlap && distance < bestDistance)) {
      best = index;
      bestOverlap = visible;
      bestDistance = distance;
    }
  });
  return best;
}

/** Scroll a page's wrapper element to the top of the canvas viewport. Tolerates
 * a missing element (a stale index) and a `scrollIntoView`-less environment
 * (jsdom ships none) — both no-ops, so the caller stays a single branch-free
 * call. */
export function scrollPageIntoView(el: HTMLElement | undefined): void {
  el?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
}
