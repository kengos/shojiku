// Which side a tooltip hangs off its trigger, so it is not cut off by whatever
// scrolls or clips around it. Sibling of `usePopoverPlacement`, and the same
// three parts — a pure decision, a callback-ref measurement, the classes — but
// it answers a different question and so cannot reuse it: a popover asks
// whether it fits the WINDOW, and a tooltip is cut long before that. Every
// bubble in the property panel sits well inside the viewport and is still
// unreadable, because the panel is 280px wide and scrolls.
//
// The bound is therefore the nearest CLIPPING ancestor. It has to be found at
// runtime, and that is the whole reason this is measured rather than passed in
// by the call site. Two facts, both measured in the running Designer: one
// `Segmented` row's two options overflow in OPPOSITE directions inside a single
// 251px row, so no one value serves even one component; and the panel's bubbles
// arrive through `Button`/`IconButton`, `Menu`, `Segmented` and
// `ColorSwatchPicker`, none of which takes a side or forwards one, so a panel
// call site has nothing to pass it through even if it knew the answer.
//
// An overhang before the clipper's scroll origin is not merely hidden, it is
// unreachable — `scrollLeft` clamps at 0 — so a centred bubble on a narrow
// left-hand control loses its first characters for good. Measured in the panel:
// 「リンクにデータ項目を挿入」 lost exactly four and rendered as
// 「データ項目を挿入」, which is another control's tooltip on the same screen.

import { useCallback, useState } from 'react';

/** Which side of its trigger a tooltip hangs from. `center` is the default and
 * right wherever there is room on both sides. */
export type TipPlacement = 'center' | 'start' | 'end';

/** A horizontal span. Both inputs are independent of the ANSWER — the anchor is
 * the trigger, which does not move, and the width is the bubble's own extent,
 * which is the same whichever side it hangs from (it is `whitespace-nowrap`, so
 * it shrink-to-fits to its text rather than to the box it is positioned in).
 * Deciding from the bubble's CURRENT position instead would read back an answer
 * a previous measurement already produced. */
export interface Span {
  readonly left: number;
  readonly right: number;
}

/** Hang the bubble centred when it fits, and otherwise from whichever edge of
 * the trigger keeps it inside `clip`.
 *
 * Each side is tested by whether it FITS, not by which way the centred box
 * overflowed. Those are different questions, and the first cut asked the second
 * one: a trigger near the clipper's right edge overflows to the right, which
 * says nothing about whether anchoring at that edge leaves room on the left. It
 * does not, once the bubble is wider than the distance to the near edge — the
 * layer-tree tooltip is 205px, and at the 180px the sidebar may be dragged to
 * it was still losing 38px off its FRONT, measured in the running app.
 *
 * When neither side fits, the bubble is wider than the room on both sides and
 * no anchoring can show it whole; the side that leaves more of it visible wins.
 * `placeIn`'s near-edge rule does not transfer here — a popover keeps its near
 * edge because the rest can be SCROLLED to, and a tooltip's cannot. */
export function placeTip(anchor: Span, width: number, clip: Span): TipPlacement {
  // Anchor to the VISIBLE part of the trigger. A trigger scrolled half out of
  // its own clipper would otherwise let a side "fit" on the edge that is inside
  // while the opposite edge is already outside — `end` against a trigger whose
  // right edge is past the clipper puts the whole bubble out of sight. Clamping
  // first is also what makes the three tests below exhaustive: with the anchor
  // inside the clip, there is no geometry where both sides fit and the centre
  // does not.
  const left = Math.max(anchor.left, clip.left);
  const right = Math.min(anchor.right, clip.right);
  const centredLeft = (left + right) / 2 - width / 2;
  if (centredLeft >= clip.left && centredLeft + width <= clip.right) {
    return 'center';
  }
  if (left + width <= clip.right) {
    return 'start';
  }
  if (right - width >= clip.left) {
    return 'end';
  }
  return clip.right - left >= right - clip.left ? 'start' : 'end';
}

/** Tailwind anchor classes for a placement. `center` keeps the spelling the
 * bubble shipped with, so an unmeasured bubble renders exactly as before. */
export function tipAnchorClasses(placement: TipPlacement): string {
  if (placement === 'start') {
    return 'left-0';
  }
  return placement === 'end' ? 'right-0' : 'left-1/2 -translate-x-1/2';
}

/** The overflow values that establish a clipping box. Written as the set that
 * DOES clip rather than as "not `visible`": an unset property reads back as the
 * empty string in some engines, and a not-equal test would then call every
 * element a clipper — silently, and in the direction that looks like it works. */
const CLIPS = /^(?:auto|scroll|hidden|clip|overlay)$/;

/** The position values that make an element a containing block for an absolute
 * child. Positive set for the same reason as `CLIPS`. */
const POSITIONED = /^(?:relative|absolute|fixed|sticky)$/;

/** The first ancestor that clips. A clipping value on EITHER axis clips BOTH,
 * which is why the property panel's `overflow-y: auto` cuts a bubble
 * horizontally — so the test is over both axes, not over the one the overflow
 * is named for. */
export function clipperOf(el: HTMLElement): HTMLElement {
  for (let node = el.parentElement; node !== null; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (CLIPS.test(style.overflowX) || CLIPS.test(style.overflowY)) {
      return node;
    }
  }
  return el.ownerDocument.documentElement;
}

/** The box the bubble is positioned against — its containing block, i.e. the
 * nearest positioned ancestor. Read by walking rather than through
 * `offsetParent`, which jsdom always reports as `null`: the walk is the same
 * answer and is testable in the environment the gate runs in. */
export function anchorOf(el: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node !== null; node = node.parentElement) {
    if (POSITIONED.test(getComputedStyle(node).position)) {
      return node;
    }
  }
  return null;
}

/** Measure once, through a CALLBACK ref: it runs with the element on mount and
 * with `null` on unmount, so the unmeasured state is a real transition rather
 * than a branch nothing takes.
 *
 * Re-measuring is keyed on `text`, the one input that changes a bubble's width
 * within a session — a label may interpolate a document-derived name. Nothing
 * else needs watching: of the surfaces that clip a bubble, only the sidebar
 * pane is resizable, and its bubble is anchored at that pane's right edge, so
 * the side that fits is the same at every width.
 *
 * A bubble with no positioned ancestor cannot be placed against anything and
 * stays centred, which is what it did before it was measured at all. */
export function useTipPlacement(text: string) {
  const [placement, setPlacement] = useState<TipPlacement>('center');
  // `text` is not READ below — it is what makes React re-attach the callback
  // ref, and so re-measure, when the bubble's width can have changed. The rule
  // reads that as a surplus dependency; it is the whole mechanism.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure key
  const placeRef = useCallback(
    (el: HTMLElement | null) => {
      const anchor = el === null ? null : anchorOf(el);
      if (el === null || anchor === null) {
        setPlacement('center');
        return;
      }
      setPlacement(
        placeTip(
          anchor.getBoundingClientRect(),
          el.getBoundingClientRect().width,
          clipperOf(el).getBoundingClientRect(),
        ),
      );
    },
    [text],
  );
  return { placement, placeRef };
}
