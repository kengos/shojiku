// Which way a popover hangs off its trigger, so it does not open off the edge of
// the window. Split out of `ui/ColorSwatchPicker` when a second popover needed it:
// any panel popover taller than a couple of rows has the problem, because the
// property panel scrolls but a popover is positioned out of its flow, so an
// overflowing one is reachable by nothing.
//
// Both inputs are independent of the ANSWER: the anchor is the trigger, which does
// not move, and the size is the popover's own extent, which is the same whichever
// way it hangs. Deriving the placement from the popover's CURRENT rect instead reads
// a position a previous answer already produced — it measures correctly and still
// lands wherever the render order happens to put it.

import { useCallback, useState } from 'react';

/** Which way a POPOVER opens. Not `Placement` — `panel/placementModel.ts` already
 * exports that name for an item's placement kind, an unrelated concept, and moving
 * this into `hooks/` would make it read as the package's general one. */
export interface PopoverPlacement {
  readonly up: boolean;
  readonly toLeft: boolean;
}

const DEFAULT_PLACEMENT: PopoverPlacement = { up: false, toLeft: false };

/** Flip an axis only when the default side overflows AND the other side has room. On
 * a window too small for either, the near edge stays put and the popover's own
 * max-height scrolls — moving the overflow off the top or the left would hide it
 * just as completely, and there it cannot even be scrolled to. */
export function placeIn(
  anchor: { top: number; bottom: number; left: number; right: number },
  size: { width: number; height: number },
  view: { width: number; height: number },
): PopoverPlacement {
  return {
    up: anchor.bottom + size.height > view.height && anchor.top - size.height > 0,
    toLeft: anchor.left + size.width > view.width && anchor.right - size.width > 0,
  };
}

/** Tailwind classes for a placement, for a popover positioned against a `relative`
 * trigger wrapper. `w-max` belongs on the popover too: an absolutely positioned box
 * shrink-to-fits against its containing block — the trigger wrapper, often only a
 * few dozen pixels wide — so without it the content is squeezed to min-content. */
export function placementClasses(placement: PopoverPlacement): string {
  const x = placement.toLeft ? 'right-0' : 'left-0';
  const y = placement.up
    ? 'bottom-[calc(100%+var(--sj-space-1))]'
    : 'top-[calc(100%+var(--sj-space-1))]';
  return `${x} ${y}`;
}

/** Measure once, through a CALLBACK ref: it runs with the element on mount and with
 * `null` on unmount, so the closed state is a real transition rather than a branch
 * nothing ever takes. Returns the placement and the ref to hand the popover.
 *
 * `anchorRef` is the positioned wrapper the popover is absolute within. */
export function usePopoverPlacement(anchorRef: { readonly current: HTMLElement | null }) {
  const [placement, setPlacement] = useState<PopoverPlacement>(DEFAULT_PLACEMENT);
  const placeRef = useCallback(
    (el: HTMLElement | null) => {
      const anchor = anchorRef.current;
      if (el === null || anchor === null) {
        setPlacement(DEFAULT_PLACEMENT);
        return;
      }
      setPlacement(
        placeIn(
          anchor.getBoundingClientRect(),
          { width: el.offsetWidth, height: el.offsetHeight },
          { width: window.innerWidth, height: window.innerHeight },
        ),
      );
    },
    [anchorRef],
  );
  return { placement, placeRef };
}
