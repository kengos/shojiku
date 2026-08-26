import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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

  it('anchors at the start when asked, for a narrow control near a clipping edge', () => {
    const centred = render(<TipBubble text="x" />).container.querySelector(
      '[data-sj-tip]',
    ) as HTMLElement;
    expect(centred.className).toContain('-translate-x-1/2');
    const started = render(<TipBubble text="x" align="start" />).container.querySelector(
      '[data-sj-tip]',
    ) as HTMLElement;
    expect(started.className).toContain('left-0');
    expect(started.className).not.toContain('-translate-x-1/2');
  });

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
});
