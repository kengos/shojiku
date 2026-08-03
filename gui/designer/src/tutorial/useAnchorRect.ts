// Anchor tracking for the coach mark: where the pointed-at control is, kept
// current for as long as the step is showing.
//
// Measuring once, when the step opens, is not enough — the layout under a step
// keeps moving. Opening the document-settings page or the data-item editor
// replaces the whole editing grid, unmounting the very panel a step points at,
// and a rect captured before that swap leaves the spotlight ring hovering over
// a control that is no longer there. So the anchor is re-read every frame while
// a step shows, and the ring is dropped (null → the bubble centers) the moment
// its control leaves the DOM.
//
// A frame loop rather than an observer: the swaps that move an anchor happen in
// OTHER components' renders, which no observer on this side sees, and the loop
// runs only while a coach mark is on screen. Re-measuring keeps the same rect
// object when nothing moved, so an unchanged frame re-renders nothing.

import { useEffect, useState } from 'react';
import { type AnchorRect, anchorRect } from './anchors';

/** A rect as a comparison key: which pixels it would spotlight, or `none` for
 * an anchor that is not on screen. Compared rather than the objects themselves
 * — every measurement is a fresh object, and a frame that moved nothing must
 * keep the previous one or the overlay would re-render 60 times a second. */
function key(rect: AnchorRect | null): string {
  return rect === null ? 'none' : `${rect.left},${rect.top},${rect.width},${rect.height}`;
}

/** Track `selector`'s rectangle for as long as it is non-null. A null selector
 * — no session running, or a step that points at the page rather than at the
 * chrome — tracks nothing. */
export function useAnchorRect(selector: string | null): AnchorRect | null {
  const [rect, setRect] = useState<AnchorRect | null>(null);
  useEffect(() => {
    if (selector === null) {
      setRect(null);
      return;
    }
    let frame = 0;
    const tick = () => {
      setRect((prev) => {
        const next = anchorRect(selector);
        return key(prev) === key(next) ? prev : next;
      });
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [selector]);
  return rect;
}
