// One interactive box in the selection overlay: a <rect> sized to the laid-out
// box, directly clickable AND keyboard-focusable. This file is the RECT — its
// paint, its ARIA, and the dispatch of the gestures it receives; what a
// keypress or a pointer press MEANS (per the document's own classification)
// is the pure `overlayBoxGestures` model.
//
// Paint is inlined as the no-stylesheet fallback (an unfilled <rect> would
// default to BLACK and blot out the preview; `transparent` — not `none` —
// keeps the fill hit-testable under the default pointer-events); the
// stylesheet themes via the classNames when a host imports it.

import type { KeyboardEvent, RefObject } from 'react';
import type { PlacedBox } from '../engine/types';
import { scaleRect } from './geometry';
import { applyBoxKeyPlan, boxDragTask, boxKeyPlan } from './overlayBoxGestures';
import type { CanvasManipulate, DragTask } from './overlayDragModel';
import { boxCursor } from './overlayGeometry';
import type { UseDrag } from './useDrag';

export interface OverlayBoxProps {
  readonly box: PlacedBox;
  /** Device pixels per pt — the same scale the page was rasterized at. */
  readonly scale: number;
  readonly selected: boolean;
  /** This box carries a container mark, which draws its own dashed outline —
   * both plain strokes are suppressed (double-stroking reads as clutter). */
  readonly marked: boolean;
  /** This box is a member of the canvas-local multi-selection. */
  readonly inMultiSelection: boolean;
  /** This box is the one currently being dragged. */
  readonly dragging: boolean;
  /** The PRIMARY selection's ability — what this box's cursor should say. */
  readonly selectedAbility: { readonly kind: string } | null;
  readonly manipulate: CanvasManipulate | undefined;
  readonly drag: UseDrag<DragTask>;
  readonly onSelect: (path: string) => void;
  readonly onMultiToggle: ((path: string) => void) | undefined;
  readonly onEditRequest: ((path: string) => void) | undefined;
  readonly onContextMenu: ((path: string, x: number, y: number) => void) | undefined;
  /** The overlay-wide "already revealed" marker, so the scroll-into-view runs
   * once per SELECTION rather than once per render of the selected box. */
  readonly scrolledTo: RefObject<string | null>;
}

export function OverlayBox({
  box,
  scale,
  selected,
  marked,
  inMultiSelection,
  dragging,
  selectedAbility,
  manipulate,
  drag,
  onSelect,
  onMultiToggle,
  onEditRequest,
  onContextMenu,
  scrolledTo,
}: OverlayBoxProps) {
  const r = scaleRect(box.border, scale);
  const select = () => onSelect(box.path);
  const onKeyDown = (event: KeyboardEvent<SVGRectElement>) => {
    const plan = boxKeyPlan(event.key, event.altKey, {
      path: box.path,
      selected,
      manipulate,
    });
    // A null plan is a key this box does not own — leave the event alone.
    if (plan === null) {
      return;
    }
    event.preventDefault();
    if (plan.kind === 'edit') {
      onEditRequest?.(box.path);
    } else if (plan.kind === 'select') {
      select();
    } else if (plan.kind !== 'consume') {
      applyBoxKeyPlan(plan, box.path, manipulate);
    }
  };
  // The primary selection keeps the solid stroke (+ handles); a multi-set
  // member gets a lighter secondary stroke, no handles. A container mark
  // suppresses both (it draws its own dashed outline).
  const primaryStroke = selected && !marked;
  const multiStroke = !selected && !marked && inMultiSelection;
  // A `visible:` item whose predicate does not hold under the current sample
  // data reserved its box and painted nothing. Without a mark the canvas shows
  // an unexplained empty region, so an unselected hidden box carries a faint
  // dashed outline — enough to say "something lives here, the data is hiding
  // it" without competing with the selection stroke. A COLLAPSED item has no
  // box at all and is reachable from the layer tree instead.
  const ghost = box.hidden === true && !primaryStroke && !multiStroke && !marked;
  return (
    // biome-ignore lint/a11y/useSemanticElements: a native button cannot be SVG geometry; the rect carries the button role for the overlay.
    <rect
      ref={(el) => {
        // Reveal the selected box on canvas once per selection (jsdom
        // ships no scrollIntoView, hence the guarded call). `block/inline:
        // nearest` scrolls only when the box is not already visible.
        if (el !== null && selected && scrolledTo.current !== box.path) {
          scrolledTo.current = box.path;
          el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
        }
      }}
      x={r.x}
      y={r.y}
      width={r.w}
      height={r.h}
      fill="transparent"
      // The literal matches the default theme's light accent; the
      // stylesheet (when imported) overrides it with var(--sj-accent),
      // so this is only the no-stylesheet fallback (attributes cannot
      // reference CSS custom properties).
      stroke={primaryStroke || multiStroke || ghost ? '#c2402a' : 'none'}
      strokeWidth={primaryStroke || multiStroke ? 1.5 : ghost ? 1 : 0}
      strokeOpacity={multiStroke ? 0.55 : ghost ? 0.4 : 1}
      strokeDasharray={ghost ? '3 3' : undefined}
      style={{ cursor: boxCursor(selected, selectedAbility) }}
      role="button"
      tabIndex={0}
      aria-label={box.path}
      aria-pressed={selected}
      data-path={box.path}
      className={`sj-box${selected ? ' sj-box--selected' : ''}${
        multiStroke ? ' sj-box--multi' : ''
      }${dragging ? ' sj-box--dragging' : ''}${box.hidden === true ? ' sj-box--hidden' : ''}`}
      onClick={(event) => {
        // The trailing click of a completed/cancelled drag must not
        // re-select — the old path may now address a different item.
        if (drag.consumeClick()) {
          return;
        }
        // Shift-click toggles multi-selection (the Designer gates it to
        // movable items); a plain click is a fresh single selection.
        if (event.shiftKey && onMultiToggle !== undefined) {
          onMultiToggle(box.path);
          return;
        }
        select();
      }}
      onContextMenu={
        onContextMenu === undefined
          ? undefined
          : (event) => {
              // Select the box, then open our menu at the pointer instead
              // of the browser's native one.
              event.preventDefault();
              select();
              onContextMenu(box.path, event.clientX, event.clientY);
            }
      }
      onDoubleClick={() => onEditRequest?.(box.path)}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => {
        if (manipulate === undefined) {
          return;
        }
        drag.begin(boxDragTask(manipulate.read, box.path, event.clientX, event.clientY), event);
      }}
      onPointerMove={drag.move}
      onPointerUp={drag.up}
      onPointerCancel={drag.cancel}
    />
  );
}
