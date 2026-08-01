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
