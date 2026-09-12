import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { placeTip } from '../hooks/useTipPlacement';
import { TipBubble } from './TipBubble';

describe('TipBubble', () => {
  it('is decorative — the enclosing control keeps the accessible name', () => {
    const { container } = render(<TipBubble text="Undo" />);
    const tip = container.querySelector('[data-sj-tip]');
    expect(tip?.getAttribute('aria-hidden')).toBe('true');
    expect(tip?.textContent).toBe('Undo');
  });

  // The `id` is the ONE opt-in, and it turns on both channels together: the
  // bubble becomes readable by assistive tech AND reveals on keyboard focus.
  // The negative half matters more than the positive one — a decorative bubble
  // that revealed on focus would sit open over the rows below for as long as a
  // text input is being typed into, and four panel primitives wrap an input in
  // the tip group.
  it('becomes a DESCRIPTION target when given an id, and reveals on focus', () => {
    const { container } = render(<TipBubble text="From document defaults" id="origin-1" />);
    const tip = container.querySelector('[data-sj-tip]') as HTMLElement;
    expect(tip.id).toBe('origin-1');
    expect(tip.getAttribute('aria-hidden')).toBeNull();
    expect(tip.className).toContain('group-focus-within/tip:opacity-100');
  });

  it('stays hover-only while it is decorative, so no tooltip parks over a field', () => {
    const { container } = render(<TipBubble text="Undo" />);
    const tip = container.querySelector('[data-sj-tip]') as HTMLElement;
    expect(tip.className).toContain('group-hover/tip:opacity-100');
    expect(tip.className).not.toContain('group-focus-within');
  });

  it('takes no side from its caller — the side it hangs from is measured', () => {
    // This replaces an `align` prop. Three call sites used to pass `start` for
    // a narrow control near the panel's left edge, and measuring the running
    // app showed why a prop cannot be the answer: bubbles overflow BOTH edges
    // (the worst in the app, 82px, is a right-hand one), and a `Segmented`
    // row's two options overflow in opposite directions inside one 251px row —
    // so the value depends on where an instance landed, which no call site
    // knows. `hooks/useTipPlacement` decides it; here we pin that nothing is
    // passed in and that an unmeasured bubble looks exactly as it always did.
    // That no caller CAN pass one is `tsc`'s to enforce, not this file's.
    const { container } = render(<TipBubble text="x" />);
    const tip = container.querySelector('[data-sj-tip]') as HTMLElement;
    expect(tip.className).toContain('-translate-x-1/2');
  });

  // BOTH sides, because the primitive's job is to render whatever the
  // measurement says and one side proves only that it renders something. jsdom
  // lays nothing out, so the geometry is supplied; what this pins is the WIRING
  // — that the primitive consults the measurement rather than always rendering
  // the centred spelling. The decision itself, over the geometries read off the
  // running app, is pinned in the hook's own suite (`places every geometry
  // measured in the running app inside its clipper`).
  for (const { side, anchor, expected } of [
    { side: 'the near edge', anchor: { left: 13, right: 43, width: 30 }, expected: 'left-0' },
    { side: 'the far edge', anchor: { left: 250, right: 268, width: 18 }, expected: 'right-0' },
  ]) {
    it(`hangs off ${side} when that is the side that fits`, () => {
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: Element,
      ) {
        const box = this.hasAttribute('data-sj-tip')
          ? { left: 0, right: 160, width: 160 }
          : (this as HTMLElement).dataset.rect === 'clip'
            ? { left: 0, right: 280, width: 280 }
            : anchor;
        return { ...box, top: 0, bottom: 0, x: box.left, y: 0, height: 0, toJSON: () => ({}) };
      });
      const { container } = render(
        <div style={{ overflowY: 'auto' }} data-rect="clip">
          <span style={{ position: 'relative' }} data-rect="anchor">
            <TipBubble text="リンクにデータ項目を挿入" />
          </span>
        </div>,
      );
      const tip = container.querySelector('[data-sj-tip]') as HTMLElement;
      expect(tip.className).toContain(expected);
      expect(tip.className).not.toContain('-translate-x-1/2');
      vi.restoreAllMocks();
    });
  }

  it('renders document-derived text inertly, never as markup', () => {
    const { container } = render(<TipBubble text="<img src=x onerror=alert(1)>" />);
    const tip = container.querySelector('[data-sj-tip]');
    expect(tip?.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(tip?.querySelector('img')).toBeNull();
  });

  it('bounds its width so a hostile label cannot paint off the viewport', () => {
    // A label may interpolate a DOCUMENT-derived name (the styles-list row
    // menu carries the style's own name), and the bubble is `whitespace-nowrap`
    // — the width bound is the load-bearing part, so it is pinned here at the
    // primitive rather than at each of the ~30 consumers.
    const { container } = render(<TipBubble text={'あ'.repeat(500)} />);
    const tip = container.querySelector('[data-sj-tip]');
    expect(tip?.className).toContain('max-w-64');
    expect(tip?.className).toContain('truncate');
  });

  it('never CENTRES a label too wide for its clipper, whatever the label', () => {
    // `max-w-64` and `truncate` bound the width; they do not bound it by the
    // box the bubble sits in, so a hostile document-derived name still produces
    // a bubble wider than the property panel. Centring that straddles BOTH
    // edges — the arrangement that loses the start of the text as well as the
    // end — so what is pinned here is that it never happens. Which edge it
    // anchors to is the hook's call and is pinned there; jsdom cannot show a
    // straddling box, so this is asserted at the decision.
    for (const anchor of [
      { left: 0, right: 20 },
      { left: 140, right: 160 },
      { left: 260, right: 280 },
    ]) {
      expect(placeTip(anchor, 4000, { left: 0, right: 280 }), JSON.stringify(anchor)).not.toBe(
        'center',
      );
    }
  });
});
