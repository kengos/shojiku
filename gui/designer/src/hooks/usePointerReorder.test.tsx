// Tests for hooks/usePointerReorder.ts — the shared list-reorder gesture
// (threshold along the axis, Escape, pointercancel, click swallow, the
// pending result) and `useSlotRefs`' measuring along either axis. The three
// surfaces that drive it are covered by their own component suites.
import { act, renderHook } from '@testing-library/react';
import type { PointerEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { type ReorderAxis, usePointerReorder, useSlotRefs } from './usePointerReorder';

interface Init {
  readonly pointerId?: number;
  readonly x?: number;
  readonly y?: number;
  readonly isPrimary?: boolean;
  readonly capture?: (id: number) => void;
}

/** A React pointer event carrying only the fields the machine reads. */
function ev({ pointerId = 1, x = 0, y = 0, isPrimary = true, capture }: Init = {}) {
  return {
    pointerId,
    clientX: x,
    clientY: y,
    isPrimary,
    currentTarget: { setPointerCapture: capture },
  } as unknown as PointerEvent<HTMLElement>;
}

/** A machine over a numeric drop (the pointer's coordinate along the axis),
 * resolving to `drop` unless it is 0. */
function machine(axis: ReorderAxis = 'y') {
  const onDrop = vi.fn();
  const view = renderHook(() =>
    usePointerReorder<string, number, number>({
      axis,
      dropAt: (_key, point) => (axis === 'x' ? point.x : point.y),
      resolve: (_key, drop) => (drop === 0 ? null : drop),
      onDrop,
    }),
  );
  return { onDrop, view };
}

/** Press, then travel `to` along the axis. */
function drag(view: ReturnType<typeof machine>['view'], to: Init) {
  act(() => view.result.current.onPointerDown('k')(ev()));
  act(() => view.result.current.onPointerMove(ev(to)));
}

function pressEscape() {
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  act(() => {
    document.body.dispatchEvent(event);
  });
}

describe('usePointerReorder', () => {
  it('starts only past the threshold ALONG its axis — off-axis travel never starts', () => {
    const { view } = machine('y');
    drag(view, { x: 500, y: 3 });
    expect(view.result.current.active).toBeNull();
    expect(view.result.current.pending).toBeNull();
    act(() => view.result.current.onPointerMove(ev({ y: 7 })));
    expect(view.result.current.active).toEqual({ key: 'k', drop: 7 });
    // Once started, any move re-reads the drop, even inside the threshold.
    act(() => view.result.current.onPointerMove(ev({ y: 1 })));
    expect(view.result.current.active).toEqual({ key: 'k', drop: 1 });
  });

  it('measures the threshold on x for a horizontal list', () => {
    const { view } = machine('x');
    drag(view, { x: 3, y: 500 });
    expect(view.result.current.active).toBeNull();
    act(() => view.result.current.onPointerMove(ev({ x: 9 })));
    expect(view.result.current.active?.drop).toBe(9);
  });

  it('reports pending as resolve over the active drop, null where nothing moves', () => {
    const { view } = machine();
    drag(view, { y: 20 });
    expect(view.result.current.pending).toBe(20);
    act(() => view.result.current.onPointerMove(ev({ y: 0 })));
    expect(view.result.current.active).toEqual({ key: 'k', drop: 0 });
    expect(view.result.current.pending).toBeNull();
  });

  it('commits a release through onDrop and swallows the click it leaves, once', () => {
    const { view, onDrop } = machine();
    drag(view, { y: 20 });
    act(() => view.result.current.onPointerUp(ev({ y: 20 })));
    expect(onDrop).toHaveBeenCalledWith(20);
    expect(view.result.current.active).toBeNull();
    expect(view.result.current.consumeClick()).toBe(true);
    expect(view.result.current.consumeClick()).toBe(false);
  });

  it('a release where nothing moves commits nothing but still swallows the click', () => {
    const { view, onDrop } = machine();
    drag(view, { y: 20 });
    act(() => view.result.current.onPointerMove(ev({ y: 0 })));
    act(() => view.result.current.onPointerUp(ev()));
    expect(onDrop).not.toHaveBeenCalled();
    expect(view.result.current.consumeClick()).toBe(true);
  });

  it('a release before the threshold is a plain click: nothing commits, nothing swallowed', () => {
    const { view, onDrop } = machine();
    drag(view, { y: 2 });
    act(() => view.result.current.onPointerUp(ev({ y: 2 })));
    expect(onDrop).not.toHaveBeenCalled();
    expect(view.result.current.consumeClick()).toBe(false);
  });

  it('Escape after the start cancels, stops propagation, and arms the click swallow', () => {
    const { view, onDrop } = machine();
    const outer = vi.fn();
    window.addEventListener('keydown', outer);
    drag(view, { y: 20 });
    // A non-Escape key is ignored.
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    });
    expect(view.result.current.active).not.toBeNull();
    expect(outer).toHaveBeenCalledTimes(1);
    pressEscape();
    expect(outer).toHaveBeenCalledTimes(1);
    expect(view.result.current.active).toBeNull();
    // The pointer's own release after the cancel commits nothing.
    act(() => view.result.current.onPointerUp(ev({ y: 20 })));
    expect(onDrop).not.toHaveBeenCalled();
    expect(view.result.current.consumeClick()).toBe(true);
    window.removeEventListener('keydown', outer);
  });

  it('Escape before the threshold is not captured — the Designer keeps its own Escape', () => {
    const { view } = machine();
    const outer = vi.fn();
    window.addEventListener('keydown', outer);
    drag(view, { y: 2 });
    pressEscape();
    expect(outer).toHaveBeenCalledTimes(1);
    expect(view.result.current.consumeClick()).toBe(false);
    window.removeEventListener('keydown', outer);
  });

  it('its own pointercancel clears the gesture and does NOT swallow the next click', () => {
    const { view, onDrop } = machine();
    drag(view, { y: 20 });
    act(() => view.result.current.onPointerCancel(ev()));
    expect(view.result.current.active).toBeNull();
    act(() => view.result.current.onPointerUp(ev({ y: 20 })));
    expect(onDrop).not.toHaveBeenCalled();
    expect(view.result.current.consumeClick()).toBe(false);
  });

  it('ignores a foreign pointer on move, up and cancel, and a non-primary press', () => {
    const { view, onDrop } = machine();
    act(() => view.result.current.onPointerDown('k')(ev({ isPrimary: false })));
    act(() => view.result.current.onPointerMove(ev({ y: 20 })));
    expect(view.result.current.active).toBeNull();
    drag(view, { y: 20 });
    act(() => view.result.current.onPointerMove(ev({ pointerId: 9, y: 40 })));
    act(() => view.result.current.onPointerCancel(ev({ pointerId: 9 })));
    act(() => view.result.current.onPointerUp(ev({ pointerId: 9, y: 40 })));
    expect(view.result.current.active).toEqual({ key: 'k', drop: 20 });
    act(() => view.result.current.onPointerUp(ev({ y: 20 })));
    expect(onDrop).toHaveBeenCalledWith(20);
  });

  it('is inert with no gesture running', () => {
    const { view, onDrop } = machine();
    act(() => {
      view.result.current.onPointerMove(ev({ y: 20 }));
      view.result.current.onPointerUp(ev({ y: 20 }));
      view.result.current.onPointerCancel(ev());
    });
    expect(view.result.current.active).toBeNull();
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('captures the pointer where the element supports it, and tolerates where it does not', () => {
    const { view } = machine();
    const capture = vi.fn();
    act(() => view.result.current.onPointerDown('k')(ev({ pointerId: 3, capture })));
    expect(capture).toHaveBeenCalledWith(3);
    // `drag` presses with no setPointerCapture at all — no throw.
    expect(() => drag(view, { y: 20 })).not.toThrow();
  });
});

/** An element with a fixed client rect and offset box. */
function el(rect: { left: number; top: number; width: number; height: number }) {
  const node = document.createElement('div');
  node.getBoundingClientRect = () => rect as DOMRect;
  Object.defineProperties(node, {
    offsetLeft: { value: rect.left - 100 },
    offsetTop: { value: rect.top - 50 },
    offsetWidth: { value: rect.width },
    offsetHeight: { value: rect.height },
  });
  return node;
}

describe('useSlotRefs', () => {
  it('slots along x off the client rects; the edge is in offset-parent space', () => {
    const { result } = renderHook(() => useSlotRefs('x'));
    act(() => {
      result.current.setRef(0, el({ left: 100, top: 0, width: 50, height: 10 }));
      result.current.setRef(1, el({ left: 150, top: 0, width: 50, height: 10 }));
    });
    expect(result.current.slotAt({ x: 110, y: 999 })).toEqual({ index: 0, tail: false, edge: 0 });
    expect(result.current.slotAt({ x: 190, y: 0 })).toEqual({ index: 2, tail: true, edge: 100 });
    expect(result.current.slotAt({ x: 130, y: 0 })).toEqual({ index: 1, tail: false, edge: 50 });
  });

  it('slots along y, and an unmounted element (null ref) leaves the run', () => {
    const { result } = renderHook(() => useSlotRefs('y'));
    act(() => {
      result.current.setRef(0, el({ left: 0, top: 50, width: 10, height: 20 }));
      result.current.setRef(1, el({ left: 0, top: 70, width: 10, height: 20 }));
    });
    expect(result.current.slotAt({ x: 999, y: 75 })).toEqual({ index: 1, tail: false, edge: 20 });
    // Past the second element's middle: the tail, after BOTH elements.
    expect(result.current.slotAt({ x: 0, y: 85 })).toEqual({ index: 2, tail: true, edge: 40 });
    act(() => result.current.setRef(1, null));
    // Only index 0 is left, so the same point is the tail after it alone.
    expect(result.current.slotAt({ x: 0, y: 85 })).toEqual({ index: 1, tail: true, edge: 20 });
  });
});
