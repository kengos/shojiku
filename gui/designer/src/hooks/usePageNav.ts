// Page-nav rail wiring (multi-page docs): each page's wrapper element (measured
// to find the page in view, scrolled to on a thumbnail click), the current page,
// and the jump action. Pure Designer-local view state — never in the template.

import { type UIEvent, useCallback, useRef, useState } from 'react';
import { mostVisiblePageIndex, scrollPageIntoView } from '../canvas/pageNav';

export interface PageNav {
  readonly pageRef: (index: number, el: HTMLDivElement | null) => void;
  readonly currentPage: number;
  readonly onCanvasScroll: (event: UIEvent<HTMLDivElement>) => void;
  readonly jumpToPage: (index: number) => void;
}

export function usePageNav(): PageNav {
  const pageWrapEls = useRef(new Map<number, HTMLDivElement>());
  const pageRef = useCallback((index: number, el: HTMLDivElement | null) => {
    if (el === null) {
      pageWrapEls.current.delete(index);
    } else {
      pageWrapEls.current.set(index, el);
    }
  }, []);
  const [currentPage, setCurrentPage] = useState(0);
  // The page in view, recomputed from the LIVE rects on every scroll
  // (getBoundingClientRect folds in the zoom transform); the pure model picks
  // the most-visible page. Empty (no wrappers yet) resolves to page 0.
  const onCanvasScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const view = event.currentTarget.getBoundingClientRect();
    const spans = [...pageWrapEls.current.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, el]) => {
        const rect = el.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom };
      });
    setCurrentPage(mostVisiblePageIndex(spans, view.top, view.bottom));
  }, []);
  const jumpToPage = useCallback((index: number) => {
    scrollPageIntoView(pageWrapEls.current.get(index));
  }, []);
  return { pageRef, currentPage, onCanvasScroll, jumpToPage };
}
