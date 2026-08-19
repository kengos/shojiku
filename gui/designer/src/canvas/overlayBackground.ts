// What the overlay's own EMPTY SPACE does: a click between boxes clears the
// selection, and a press there arms the rubber-band marquee. Both act only on
// events that land on the <svg> ITSELF (`target === currentTarget`) — anything
// bubbled up from a box rect is that box's gesture, already handled.
//
// A pure factory: the handlers close over the CURRENT props every render, the
// same way the inline arrows they replaced did. Never memoize this — the
// marquee machine and the wiring are re-created upstream per render, and a
// cached handler set would act on a stale one.

import type { MouseEvent, PointerEvent } from 'react';
import type { CanvasManipulate } from './overlayDragModel';
import type { MarqueeTask } from './overlayMarquee';
import type { UseDrag } from './useDrag';

export interface OverlayBackgroundContext {
  /** The rubber-band machine (its own, so bubbling box events miss it). */
  readonly marquee: UseDrag<MarqueeTask>;
  /** Absent = direct manipulation is off, so no marquee can be armed. */
  readonly manipulate: CanvasManipulate | undefined;
  /** Absent = the host wants no marquee gesture. */
  readonly onMarquee: ((paths: readonly string[], additive: boolean) => void) | undefined;
  readonly onDeselect: () => void;
}

export interface OverlayBackgroundHandlers {
  readonly onClick: (event: MouseEvent<SVGSVGElement>) => void;
  readonly onPointerDown: (event: PointerEvent<SVGSVGElement>) => void;
  readonly onPointerMove: (event: PointerEvent<SVGSVGElement>) => void;
  readonly onPointerUp: (event: PointerEvent<SVGSVGElement>) => void;
  readonly onPointerCancel: () => void;
}

export function overlayBackground({
  marquee,
  manipulate,
  onMarquee,
  onDeselect,
}: OverlayBackgroundContext): OverlayBackgroundHandlers {
  return {
    // A click that lands on the overlay itself (empty space between boxes),
    // not bubbled up from a box rect, clears the selection. A completed
    // marquee drag suppresses this trailing click (so a swept selection
    // survives), while a plain background click still deselects.
    onClick: (event) => {
      if (event.target === event.currentTarget && !marquee.consumeClick()) {
        onDeselect();
      }
    },
    // A press on empty overlay space arms the rubber band on its OWN drag
    // machine; travel past the threshold turns it into a range select, a plain
    // click falls through to the deselect above. Only when direct manipulation
    // AND a marquee handler are wired — otherwise the press does nothing.
    onPointerDown: (event) => {
      if (
        event.target === event.currentTarget &&
        manipulate !== undefined &&
        onMarquee !== undefined
      ) {
        marquee.begin(
          { startX: event.clientX, startY: event.clientY, additive: event.shiftKey },
          event,
        );
      }
    },
    // The move/up handlers drive the marquee machine only — a box drag captures
    // to its rect, so its bubbling events find no active marquee session.
    onPointerMove: marquee.move,
    onPointerUp: marquee.up,
    onPointerCancel: marquee.cancel,
  };
}
