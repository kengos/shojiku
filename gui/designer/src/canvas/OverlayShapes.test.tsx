import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { MarginGuide } from './marginGuide';
import { MarginGuideShape } from './OverlayShapes';

const GUIDE: MarginGuide = { rect: { x: 25, y: 25, w: 545, h: 792 }, origin: true };

function paint(guide: MarginGuide) {
  // An SVG shape needs an <svg> parent to be a valid tree.
  return render(
    <svg aria-label="page">
      <title>page</title>
      <MarginGuideShape guide={guide} />
    </svg>,
  );
}

describe('MarginGuideShape', () => {
  it('paints the margin box dashed, with its stroke INLINE', () => {
    const { container } = paint(GUIDE);
    const rect = container.querySelector('rect.sj-margin-guide');
    expect(rect?.getAttribute('x')).toBe('25');
    expect(rect?.getAttribute('y')).toBe('25');
    expect(rect?.getAttribute('width')).toBe('545');
    expect(rect?.getAttribute('height')).toBe('792');
    // Dashed is what separates the guide from document ink — nothing the
    // engine draws is dashed.
    expect(rect?.getAttribute('stroke-dasharray')).toBe('4 3');
    // No stylesheet ships with the component, so the paint must be inline or
    // the rect renders as a black-filled block.
    expect(rect?.getAttribute('fill')).toBe('none');
    expect(rect?.getAttribute('stroke')).toBeTruthy();
  });

  it('is not hit-testable — it can never take a click from a box', () => {
    const { container } = paint(GUIDE);
    const group = container.querySelector('g');
    expect(group?.getAttribute('style')).toContain('pointer-events: none');
  });

  it('marks the origin corner with a tick and a chrome-constant label', () => {
    const { container } = paint(GUIDE);
    const tick = container.querySelector('path.sj-margin-origin');
    // The L starts ORIGIN_MARKER_PX above the corner and turns at it.
    expect(tick?.getAttribute('d')).toBe('M 25 15 V 25 H 35');
    expect(container.querySelector('text.sj-margin-origin-text')?.textContent).toBe('0,0');
  });

  it('drops the origin marker when the model says the band has no room', () => {
    const { container } = paint({ rect: { x: 4, y: 4, w: 500, h: 700 }, origin: false });
    expect(container.querySelector('path.sj-margin-origin')).toBeNull();
    expect(container.querySelector('text.sj-margin-origin-text')).toBeNull();
    // The rectangle still carries the meaning on its own.
    expect(container.querySelector('rect.sj-margin-guide')).not.toBeNull();
  });
});
