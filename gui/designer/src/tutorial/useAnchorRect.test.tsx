import { render, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AnchorRect } from './anchors';
import { useAnchorRect } from './useAnchorRect';

/** A chrome control at a known rectangle. jsdom lays nothing out, so the rect
 * is stated rather than measured. */
function anchor(id: string, rect: AnchorRect): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute('data-tour', id);
  el.getBoundingClientRect = () => rect as DOMRect;
  document.body.append(el);
  return el;
}

/** Mount the hook over a selector and expose its latest value. */
function mount(selector: string | null) {
  const seen: { current: AnchorRect | null } = { current: null };
  function Probe() {
    seen.current = useAnchorRect(selector);
    return null;
  }
  const view = render(<Probe />);
  return { seen, view };
}

describe('useAnchorRect', () => {
  it('tracks nothing without a selector', () => {
    const { seen } = mount(null);
    expect(seen.current).toBeNull();
  });

  it('reports the anchor’s rectangle', () => {
    const el = anchor('panel', { left: 5, top: 6, width: 7, height: 8 });
    const { seen } = mount('panel');
    expect(seen.current).toEqual({ left: 5, top: 6, width: 7, height: 8 });
    el.remove();
  });

  // The bug this hook exists for: opening the document-settings page unmounts
  // the property panel a step points at, and the ring must leave with it
  // rather than stay behind on the layout the reader no longer sees.
  it('drops the rect when the anchor leaves the DOM mid-step', async () => {
    const el = anchor('panel', { left: 5, top: 6, width: 7, height: 8 });
    const { seen } = mount('panel');
    expect(seen.current).not.toBeNull();
    el.remove();
    await waitFor(() => expect(seen.current).toBeNull());
  });

  it('follows an anchor that moves', async () => {
    let top = 6;
    const el = anchor('panel', { left: 5, top: 6, width: 7, height: 8 });
    el.getBoundingClientRect = () => ({ left: 5, top, width: 7, height: 8 }) as DOMRect;
    const { seen } = mount('panel');
    const first = seen.current;
    top = 40;
    await waitFor(() => expect(seen.current?.top).toBe(40));
    expect(seen.current).not.toBe(first);
    el.remove();
  });

  // An unchanged frame must hand back the SAME object: the overlay re-renders
  // on identity, and re-measuring is a per-frame loop.
  it('keeps the same rect object while nothing moves', async () => {
    const el = anchor('panel', { left: 5, top: 6, width: 7, height: 8 });
    const { seen } = mount('panel');
    const first = seen.current;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(seen.current).toBe(first);
    el.remove();
  });

  it('stops measuring once unmounted', async () => {
    const el = anchor('panel', { left: 5, top: 6, width: 7, height: 8 });
    const { view } = mount('panel');
    view.unmount();
    let measured = false;
    el.getBoundingClientRect = () => {
      measured = true;
      return { left: 5, top: 6, width: 7, height: 8 } as DOMRect;
    };
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(measured).toBe(false);
    el.remove();
  });
});
