import type { ReadFn } from '@shojiku/designer-core';
import type { MouseEvent, PointerEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { overlayBackground } from './overlayBackground';
import type { CanvasManipulate, MarqueeTask } from './overlayDragModel';
import type { UseDrag } from './useDrag';

const read: ReadFn = () => undefined;

function wiring(): CanvasManipulate {
  return { read, onReorder: vi.fn(), onApply: vi.fn(), onRefused: vi.fn(), grid: 0 };
}

/** A stand-in marquee machine: every entry point recorded, click never
 * suppressed unless a test says so. */
function machine(consumeClick = false): UseDrag<MarqueeTask> {
  return {
    session: null,
    begin: vi.fn(),
    move: vi.fn(),
    up: vi.fn(),
    cancel: vi.fn(),
    consumeClick: vi.fn(() => consumeClick),
  };
}

/** An event that landed on the <svg> ITSELF (not bubbled up from a box). */
const onSelf = { shiftKey: false, clientX: 30, clientY: 40 };
const selfEvent = <T>(over: Record<string, unknown> = {}): T => {
  const element = { tag: 'svg' };
  return { ...onSelf, ...over, target: element, currentTarget: element } as unknown as T;
};
/** An event bubbled up from a child box rect. */
const bubbledEvent = <T>(): T =>
  ({ ...onSelf, target: { tag: 'rect' }, currentTarget: { tag: 'svg' } }) as unknown as T;

describe('overlayBackground', () => {
  it('clears the selection on a click that lands on empty overlay space', () => {
    const onDeselect = vi.fn();
    const handlers = overlayBackground({
      marquee: machine(),
      manipulate: wiring(),
      onMarquee: vi.fn(),
      onDeselect,
    });
    handlers.onClick(selfEvent<MouseEvent<SVGSVGElement>>());
    expect(onDeselect).toHaveBeenCalledTimes(1);
  });

  it('leaves a click bubbled up from a box alone — that is the box gesture', () => {
    const onDeselect = vi.fn();
    const handlers = overlayBackground({
      marquee: machine(),
      manipulate: wiring(),
      onMarquee: vi.fn(),
      onDeselect,
    });
    handlers.onClick(bubbledEvent<MouseEvent<SVGSVGElement>>());
    expect(onDeselect).not.toHaveBeenCalled();
  });

  it('does NOT deselect on the trailing click a completed marquee fires', () => {
    const onDeselect = vi.fn();
    const handlers = overlayBackground({
      marquee: machine(true),
      manipulate: wiring(),
      onMarquee: vi.fn(),
      onDeselect,
    });
    handlers.onClick(selfEvent<MouseEvent<SVGSVGElement>>());
    expect(onDeselect).not.toHaveBeenCalled();
  });

  it('arms the rubber band on a press over empty space, carrying Shift', () => {
    const marquee = machine();
    const handlers = overlayBackground({
      marquee,
      manipulate: wiring(),
      onMarquee: vi.fn(),
      onDeselect: vi.fn(),
    });
    const event = selfEvent<PointerEvent<SVGSVGElement>>({ shiftKey: true });
    handlers.onPointerDown(event);
    expect(marquee.begin).toHaveBeenCalledWith({ startX: 30, startY: 40, additive: true }, event);
  });

  it('arms nothing on a press bubbled up from a box rect', () => {
    const marquee = machine();
    const handlers = overlayBackground({
      marquee,
      manipulate: wiring(),
      onMarquee: vi.fn(),
      onDeselect: vi.fn(),
    });
    handlers.onPointerDown(bubbledEvent<PointerEvent<SVGSVGElement>>());
    expect(marquee.begin).not.toHaveBeenCalled();
  });

  it('fails CLOSED: no marquee without direct manipulation or without a handler', () => {
    const withoutManipulate = machine();
    overlayBackground({
      marquee: withoutManipulate,
      manipulate: undefined,
      onMarquee: vi.fn(),
      onDeselect: vi.fn(),
    }).onPointerDown(selfEvent<PointerEvent<SVGSVGElement>>());
    expect(withoutManipulate.begin).not.toHaveBeenCalled();

    const withoutHandler = machine();
    overlayBackground({
      marquee: withoutHandler,
      manipulate: wiring(),
      onMarquee: undefined,
      onDeselect: vi.fn(),
    }).onPointerDown(selfEvent<PointerEvent<SVGSVGElement>>());
    expect(withoutHandler.begin).not.toHaveBeenCalled();
  });

  it('drives the marquee machine directly for move / up / cancel', () => {
    const marquee = machine();
    const handlers = overlayBackground({
      marquee,
      manipulate: wiring(),
      onMarquee: vi.fn(),
      onDeselect: vi.fn(),
    });
    expect(handlers.onPointerMove).toBe(marquee.move);
    expect(handlers.onPointerUp).toBe(marquee.up);
    expect(handlers.onPointerCancel).toBe(marquee.cancel);
  });
});
