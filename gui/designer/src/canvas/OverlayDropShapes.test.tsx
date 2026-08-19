// Tests for OverlayDropShapes.tsx — the four layers that answer "where would
// this land, and at what cost", and the one gesture shape that carries text.
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { BoxRect } from '../engine/types';
import { DropIndicators } from './OverlayDropShapes';

const REGION: BoxRect = { x: 10, y: 40, w: 100, h: 60 };
const LINE = { x1: 10, y1: 50, x2: 110, y2: 50 };

function draw(props: Partial<Parameters<typeof DropIndicators>[0]> = {}) {
  const { container } = render(
    <svg aria-label="overlay">
      <title>overlay</title>
      <DropIndicators
        region={null}
        line={null}
        insertRects={[]}
        warning={undefined}
        ghost={null}
        scale={1}
        {...props}
      />
    </svg>,
  );
  return container;
}

describe('DropIndicators', () => {
  it('paints nothing at all when there is no landing', () => {
    expect(draw().querySelectorAll('rect, line, text')).toHaveLength(0);
  });

  it('outlines the receiving owner and draws the insertion line inside it', () => {
    const container = draw({ region: REGION, line: LINE });
    expect(container.querySelectorAll('.sj-drop-cell')).toHaveLength(1);
    expect(container.querySelector('.sj-drop-indicator')).not.toBeNull();
  });

  it('paints the externally planned cell rects alongside', () => {
    expect(draw({ insertRects: [REGION, REGION] }).querySelectorAll('.sj-drop-cell')).toHaveLength(
      2,
    );
  });

  it('says what the drop COSTS, above the item being dragged', () => {
    const container = draw({ ghost: REGION, warning: '座標 (x/y) は外れます' });
    const chip = container.querySelector('.sj-drop-warning');
    expect(chip).not.toBeNull();
    expect(container.querySelector('text')?.textContent).toBe('座標 (x/y) は外れます');
    // Sits ABOVE the ghost's top edge (20px chip + 2px gap).
    expect(chip?.getAttribute('y')).toBe('18');
  });

  it('says it for a receiver with NO outline of its own — the flow body', () => {
    // The body has no box, so a region-anchored chip would vanish for exactly
    // the drops that unposition an item into the body.
    const container = draw({ region: null, ghost: REGION, warning: 'x' });
    expect(container.querySelector('.sj-drop-warning')).not.toBeNull();
  });

  it('clamps the chip onto the page when the ghost hugs the top edge', () => {
    const container = draw({ ghost: { ...REGION, y: 2 }, warning: 'x' });
    expect(container.querySelector('.sj-drop-warning')?.getAttribute('y')).toBe('0');
  });

  it('sizes the chip by script — a CJK sentence is wider than the same count of Latin', () => {
    const cjk = draw({ ghost: REGION, warning: '座標は外れま' });
    const latin = draw({ ghost: REGION, warning: 'abcdef' });
    const width = (c: Element) =>
      Number(c.querySelector('.sj-drop-warning')?.getAttribute('width'));
    expect(width(cjk)).toBeGreaterThan(width(latin));
  });

  it('says nothing when no item is in flight to say it about', () => {
    expect(draw({ region: REGION, warning: 'x' }).querySelector('.sj-drop-warning')).toBeNull();
  });
});
