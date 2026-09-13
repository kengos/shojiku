import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BoxIndex, RawPage } from '../engine/types';
import { DesignerCanvas } from './DesignerCanvas';

const page = (w: number, h: number): RawPage => ({
  width: w,
  height: h,
  rgba: new Uint8Array(w * h * 4),
});

describe('DesignerCanvas', () => {
  it('renders an underlay + overlay per page and tolerates a missing boxes entry', () => {
    const pages = [page(10, 10), page(10, 10)];
    // Only page 0 has a boxes entry; page 1 falls back to the empty list.
    const boxes: BoxIndex = {
      pages: [
        [{ path: 'a', border: { x: 0, y: 0, w: 1, h: 1 }, content: { x: 0, y: 0, w: 1, h: 1 } }],
      ],
    };
    const { container } = render(
      <DesignerCanvas
        pages={pages}
        boxes={boxes}
        scale={1}
        selectedPath={null}
        onSelect={() => {}}
        onDeselect={() => {}}
      />,
    );
    expect(container.querySelectorAll('canvas')).toHaveLength(2);
    expect(container.querySelectorAll('svg')).toHaveLength(2);
    expect(container.querySelectorAll('rect')).toHaveLength(1);
    // Default: an identity transform (no zoom applied).
    const canvas = container.querySelector('.sj-canvas') as HTMLElement;
    expect(canvas.style.transform).toBe('scale(1)');
  });

  it('lays the page out in CSS px while the raster stays in device px', () => {
    // A 2× screen: the engine rasterized 20×20 device px for a 10×10 CSS box.
    const { container } = render(
      <DesignerCanvas
        pages={[page(20, 20)]}
        boxes={{ pages: [[]] }}
        scale={1}
        pixelRatio={2}
        selectedPath={null}
        onSelect={() => {}}
        onDeselect={() => {}}
      />,
    );
    const underlay = container.querySelector('canvas') as HTMLCanvasElement;
    expect(underlay.width).toBe(20);
    expect(underlay.style.width).toBe('10px');
    const sheet = underlay.parentElement as HTMLElement;
    expect(sheet.style.width).toBe('10px');
    expect(sheet.style.height).toBe('10px');
    // The overlay is sized in the SAME units its `scale` is in, which is what
    // keeps `width / scale` pt on its side.
    const overlay = container.querySelector('svg') as SVGSVGElement;
    expect(overlay.getAttribute('width')).toBe('10');
    expect(overlay.getAttribute('height')).toBe('10');
  });

  it('sizes page and overlay from the raster when no pixel ratio is given', () => {
    // The default every caller written before the prop existed relies on.
    const { container } = render(
      <DesignerCanvas
        pages={[page(20, 20)]}
        boxes={{ pages: [[]] }}
        scale={1}
        selectedPath={null}
        onSelect={() => {}}
        onDeselect={() => {}}
      />,
    );
    const underlay = container.querySelector('canvas') as HTMLCanvasElement;
    expect(underlay.style.width).toBe('20px');
    expect(container.querySelector('svg')?.getAttribute('width')).toBe('20');
  });

  it('applies the zoom css factor as a transform', () => {
    const { container } = render(
      <DesignerCanvas
        pages={[page(10, 10)]}
        boxes={{ pages: [[]] }}
        scale={2}
        cssFactor={1.5}
        selectedPath={null}
        onSelect={() => {}}
        onDeselect={() => {}}
      />,
    );
    const canvas = container.querySelector('.sj-canvas') as HTMLElement;
    expect(canvas.style.transform).toBe('scale(1.5)');
    expect(canvas.style.transformOrigin).toBe('top left');
  });

  it('renders the inline editor over the editing box, positioned at its content rect', () => {
    const boxes: BoxIndex = {
      pages: [
        [{ path: 'a', border: { x: 0, y: 0, w: 4, h: 4 }, content: { x: 1, y: 2, w: 3, h: 3 } }],
      ],
    };
    const onCommit = vi.fn();
    const { container } = render(
      <DesignerCanvas
        pages={[page(10, 10)]}
        boxes={boxes}
        scale={2}
        selectedPath={null}
        onSelect={() => {}}
        onDeselect={() => {}}
        inlineEdit={{
          path: 'a',
          value: 'hi',
          ariaLabel: 'Edit text',
          onCommit,
          onCancel: () => {},
        }}
      />,
    );
    const editor = container.querySelector('.sj-inline-editor') as HTMLElement;
    // content rect (1,2,3,3) × scale 2 → (2,4,6,6).
    expect(editor.style.left).toBe('2px');
    expect(editor.style.top).toBe('4px');
    expect(editor.style.width).toBe('6px');
  });

  it('renders no inline editor when the editing box is absent from the page', () => {
    const boxes: BoxIndex = {
      pages: [
        [{ path: 'a', border: { x: 0, y: 0, w: 4, h: 4 }, content: { x: 0, y: 0, w: 4, h: 4 } }],
      ],
    };
    const { container } = render(
      <DesignerCanvas
        pages={[page(10, 10)]}
        boxes={boxes}
        scale={2}
        selectedPath={null}
        onSelect={() => {}}
        onDeselect={() => {}}
        inlineEdit={{
          path: 'missing',
          value: 'hi',
          ariaLabel: 'Edit text',
          onCommit: () => {},
          onCancel: () => {},
        }}
      />,
    );
    expect(container.querySelector('.sj-inline-editor')).toBeNull();
  });

  it('threads the reorder wiring per page, computing slots within that page', () => {
    const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
    const boxes: BoxIndex = {
      pages: [
        [
          {
            path: 'sections.body.items[0]',
            border: rect(0, 0, 100, 30),
            content: rect(0, 0, 100, 30),
          },
          {
            path: 'sections.body.items[1]',
            border: rect(0, 40, 100, 30),
            content: rect(0, 40, 100, 30),
          },
        ],
        [
          {
            path: 'sections.body.items[2]',
            border: rect(0, 0, 100, 30),
            content: rect(0, 0, 100, 30),
          },
          {
            path: 'sections.body.items[3]',
            border: rect(0, 40, 100, 30),
            content: rect(0, 40, 100, 30),
          },
        ],
      ],
    };
    const onReorder = vi.fn();
    render(
      <DesignerCanvas
        pages={[page(200, 200), page(200, 200)]}
        boxes={boxes}
        scale={1}
        selectedPath={null}
        onSelect={() => {}}
        onDeselect={() => {}}
        manipulate={{
          // A flow body whose four text items span the two pages.
          read: (path) => {
            if (path === 'sections.body') {
              return { type: 'flow' };
            }
            return /^sections\.body\.items\[\d+\]$/.test(path) ? { type: 'text' } : undefined;
          },
          onReorder,
          onApply: vi.fn(),
          onRefused: vi.fn(),
          grid: 0,
        }}
      />,
    );
    // Drag the second page's first item below its page-mate: the slot math
    // runs over page 2's sparse run ([2], [3]), so the drop lands at the
    // document tail index 4 → moveItem 2 → 3.
    const target = screen.getByRole('button', { name: 'sections.body.items[2]' });
    fireEvent.pointerDown(target, { pointerId: 1, isPrimary: true, clientX: 50, clientY: 10 });
    fireEvent.pointerMove(target, { pointerId: 1, clientX: 50, clientY: 120 });
    fireEvent.pointerUp(target, { pointerId: 1, clientX: 50, clientY: 120 });
    expect(onReorder).toHaveBeenCalledWith(
      [{ op: 'moveItem', path: 'sections.body.items', from: 2, to: 3 }],
      'sections.body.items[3]',
    );
  });
});

describe('DesignerCanvas — palette-drop threading', () => {
  it('reports page SVG elements and paints the indicator only on its page', () => {
    const pages = [
      { width: 100, height: 100, rgba: new Uint8Array(100 * 100 * 4) },
      { width: 100, height: 100, rgba: new Uint8Array(100 * 100 * 4) },
    ];
    const reported = new Map<number, unknown>();
    const { container } = render(
      <DesignerCanvas
        pages={pages}
        boxes={{ pages: [[], []] }}
        scale={1}
        selectedPath={null}
        onSelect={() => {}}
        onDeselect={() => {}}
        pageSvgRef={(index, el) => reported.set(index, el)}
        insertIndicator={{ page: 1, line: { x1: 0, y1: 10, x2: 50, y2: 10 }, rects: [] }}
      />,
    );
    expect(reported.get(0)).not.toBeNull();
    expect(reported.get(1)).not.toBeNull();
    const overlays = container.querySelectorAll('svg');
    expect(overlays).toHaveLength(2);
    expect(overlays[0].querySelector('.sj-drop-indicator')).toBeNull();
    expect(overlays[1].querySelector('.sj-drop-indicator')).not.toBeNull();
  });

  it('reports each page wrapper element to pageRef and clears it on unmount', () => {
    const pages = [page(10, 10), page(10, 10)];
    const reported = new Map<number, HTMLDivElement | null>();
    const { unmount } = render(
      <DesignerCanvas
        pages={pages}
        boxes={{ pages: [[], []] }}
        scale={1}
        selectedPath={null}
        onSelect={() => {}}
        onDeselect={() => {}}
        pageRef={(index, el) => reported.set(index, el)}
      />,
    );
    expect(reported.get(0)).not.toBeNull();
    expect(reported.get(1)).not.toBeNull();
    unmount();
    expect(reported.get(0)).toBeNull();
    expect(reported.get(1)).toBeNull();
  });
});

describe('DesignerCanvas margin-box guide', () => {
  it('paints the guide on EVERY page, not just the first', () => {
    // One page geometry per document (no per-section page setup), so every
    // page has the same origin — a guide on page 1 alone leaves the rest
    // unexplained.
    const { container } = render(
      <DesignerCanvas
        pages={[page(200, 200), page(200, 200), page(200, 200)]}
        boxes={{ pages: [] }}
        scale={1}
        selectedPath={null}
        onSelect={() => {}}
        onDeselect={() => {}}
        margin={[10, 10, 10, 10]}
      />,
    );
    expect(container.querySelectorAll('.sj-margin-guide')).toHaveLength(3);
  });

  it('paints none when the host passes no margins', () => {
    const { container } = render(
      <DesignerCanvas
        pages={[page(200, 200)]}
        boxes={{ pages: [] }}
        scale={1}
        selectedPath={null}
        onSelect={() => {}}
        onDeselect={() => {}}
      />,
    );
    expect(container.querySelector('.sj-margin-guide')).toBeNull();
  });
});
