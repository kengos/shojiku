import type { ReadFn } from '@shojiku/designer-core';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PlacedBox } from '../engine/types';
import { BoxOverlay } from './BoxOverlay';
import type { CanvasManipulate } from './overlayDragModel';
import { clientToPagePt } from './overlayGeometry';

const box = (path: string, x: number, y: number, w: number, h: number): PlacedBox => ({
  path,
  border: { x, y, w, h },
  content: { x, y, w, h },
});

const boxes = [box('a', 0, 0, 100, 100), box('a.b', 10, 10, 20, 20)];

function renderOverlay(
  selectedPath: string | null,
  onSelect: (path: string) => void,
  onDeselect: () => void = () => {},
  onEditRequest?: (path: string) => void,
) {
  return render(
    <BoxOverlay
      boxes={boxes}
      scale={2}
      width={200}
      height={200}
      selectedPath={selectedPath}
      onSelect={onSelect}
      onDeselect={onDeselect}
      onEditRequest={onEditRequest}
    />,
  );
}

describe('BoxOverlay', () => {
  it('renders a rect per box, scaled, and marks the selected one', () => {
    const { container } = renderOverlay('a.b', () => {});
    // The overlay must sit ON the underlay, not below it in normal flow.
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('style')).toContain('position: absolute');
    const rects = container.querySelectorAll('rect');
    expect(rects).toHaveLength(2);
    // No stylesheet ships with the component, so every rect MUST carry a
    // transparent fill inline — an unstyled SVG rect defaults to BLACK and
    // would blot out the preview underneath.
    for (let i = 0; i < rects.length; i += 1) {
      expect(rects[i].getAttribute('fill')).toBe('transparent');
    }
    const selected = container.querySelectorAll('.sj-box--selected');
    expect(selected).toHaveLength(1);
    expect(selected[0].getAttribute('data-path')).toBe('a.b');
    // scale 2: inner box (10,10,20,20) -> (20,20,40,40)
    expect(selected[0].getAttribute('x')).toBe('20');
    expect(selected[0].getAttribute('width')).toBe('40');
    // The selected box is visibly outlined without host CSS; others are not.
    expect(selected[0].getAttribute('stroke')).toBe('#c2402a');
    expect(container.querySelector('[data-path="a"]')?.getAttribute('stroke')).toBe('none');
  });

  it('escapes a hostile document path instead of injecting markup', () => {
    // Box paths are DOCUMENT-derived and reach three attributes. The overlay is
    // built from JSX only (never a string-built SVG), so React escapes them —
    // this pins that the path stays DATA even when it spells an element.
    const hostile = '"><script>alert(1)</script>';
    const { container } = render(
      <BoxOverlay
        boxes={[box(hostile, 0, 0, 10, 10)]}
        scale={1}
        width={100}
        height={100}
        selectedPath={null}
        onSelect={() => {}}
        onDeselect={() => {}}
      />,
    );
    expect(container.querySelector('script')).toBeNull();
    const rect = container.querySelector('rect');
    expect(rect?.getAttribute('data-path')).toBe(hostile);
    expect(rect?.getAttribute('aria-label')).toBe(hostile);
  });

  it('selects a box on click', () => {
    const onSelect = vi.fn();
    renderOverlay(null, onSelect);
    fireEvent.click(screen.getByRole('button', { name: 'a.b' }));
    expect(onSelect).toHaveBeenCalledWith('a.b');
  });

  it('right-click selects the box and reports the pointer position (native menu suppressed)', () => {
    const onSelect = vi.fn();
    const onContextMenu = vi.fn();
    render(
      <BoxOverlay
        boxes={boxes}
        scale={2}
        width={200}
        height={200}
        selectedPath={null}
        onSelect={onSelect}
        onDeselect={() => {}}
        onContextMenu={onContextMenu}
      />,
    );
    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 55,
      clientY: 66,
    });
    screen.getByRole('button', { name: 'a.b' }).dispatchEvent(event);
    expect(onSelect).toHaveBeenCalledWith('a.b');
    expect(onContextMenu).toHaveBeenCalledWith('a.b', 55, 66);
    expect(event.defaultPrevented).toBe(true);
  });

  it('selects a box on Enter and on Space', () => {
    const onSelect = vi.fn();
    renderOverlay(null, onSelect);
    fireEvent.keyDown(screen.getByRole('button', { name: 'a' }), { key: 'Enter' });
    fireEvent.keyDown(screen.getByRole('button', { name: 'a.b' }), { key: ' ' });
    expect(onSelect).toHaveBeenNthCalledWith(1, 'a');
    expect(onSelect).toHaveBeenNthCalledWith(2, 'a.b');
  });

  it('ignores other keys', () => {
    const onSelect = vi.fn();
    renderOverlay(null, onSelect);
    fireEvent.keyDown(screen.getByRole('button', { name: 'a' }), { key: 'Escape' });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('requests editing on double-click', () => {
    const onEditRequest = vi.fn();
    renderOverlay(
      null,
      () => {},
      () => {},
      onEditRequest,
    );
    fireEvent.doubleClick(screen.getByRole('button', { name: 'a.b' }));
    expect(onEditRequest).toHaveBeenCalledWith('a.b');
  });

  it('requests editing on Enter when the box is already selected, but selects it otherwise', () => {
    const onSelect = vi.fn();
    const onEditRequest = vi.fn();
    // 'a.b' is selected → Enter edits it; 'a' is not → Enter selects it.
    renderOverlay('a.b', onSelect, () => {}, onEditRequest);
    fireEvent.keyDown(screen.getByRole('button', { name: 'a.b' }), { key: 'Enter' });
    expect(onEditRequest).toHaveBeenCalledWith('a.b');
    expect(onSelect).not.toHaveBeenCalled();
    // Space always selects, never edits, even on the selected box.
    fireEvent.keyDown(screen.getByRole('button', { name: 'a.b' }), { key: ' ' });
    expect(onSelect).toHaveBeenCalledWith('a.b');
    fireEvent.keyDown(screen.getByRole('button', { name: 'a' }), { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('a');
  });

  it('tolerates double-click and Enter-on-selected without an onEditRequest handler', () => {
    const onSelect = vi.fn();
    renderOverlay('a.b', onSelect);
    fireEvent.doubleClick(screen.getByRole('button', { name: 'a.b' }));
    // Enter on the selected box with no handler is a no-op (not a select).
    fireEvent.keyDown(screen.getByRole('button', { name: 'a.b' }), { key: 'Enter' });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('clears the selection on a click in empty overlay space', () => {
    const onSelect = vi.fn();
    const onDeselect = vi.fn();
    const { container } = renderOverlay('a', onSelect, onDeselect);
    const svg = container.querySelector('svg');
    if (svg === null) throw new Error('overlay svg missing');
    fireEvent.click(svg);
    expect(onDeselect).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('does not clear the selection when a box is clicked', () => {
    const onSelect = vi.fn();
    const onDeselect = vi.fn();
    renderOverlay(null, onSelect, onDeselect);
    fireEvent.click(screen.getByRole('button', { name: 'a.b' }));
    expect(onSelect).toHaveBeenCalledWith('a.b');
    expect(onDeselect).not.toHaveBeenCalled();
  });

  it('paints shallower boxes before deeper ones regardless of input order', () => {
    // A repeat/table item fragment can arrive AFTER its cells in engine walk
    // order; the overlay must still paint the item first so its deeper cells
    // (later in the DOM = on top in SVG) are hit before the covering fragment.
    const unordered = [
      box('sections.body.items[0].cell.items[0]', 10, 10, 20, 20),
      box('sections.body.items[0]', 0, 0, 100, 100),
      box('sections.body.items[0].cell', 5, 5, 40, 40),
    ];
    const { container } = render(
      <BoxOverlay
        boxes={unordered}
        scale={1}
        width={100}
        height={100}
        selectedPath={null}
        onSelect={() => {}}
        onDeselect={() => {}}
      />,
    );
    const order = Array.from(container.querySelectorAll('rect')).map((r) =>
      r.getAttribute('data-path'),
    );
    expect(order).toEqual([
      'sections.body.items[0]',
      'sections.body.items[0].cell',
      'sections.body.items[0].cell.items[0]',
    ]);
  });

  it('keeps same-depth boxes in their original walk order (stable sort)', () => {
    const siblings = [box('x.a', 0, 0, 10, 10), box('x.b', 0, 0, 10, 10)];
    const { container } = render(
      <BoxOverlay
        boxes={siblings}
        scale={1}
        width={10}
        height={10}
        selectedPath={null}
        onSelect={() => {}}
        onDeselect={() => {}}
      />,
    );
    const order = Array.from(container.querySelectorAll('rect')).map((r) =>
      r.getAttribute('data-path'),
    );
    expect(order).toEqual(['x.a', 'x.b']);
  });
});

describe('BoxOverlay scroll-into-view', () => {
  it('scrolls the selected box into view once per selection', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      const view = render(
        <BoxOverlay
          boxes={boxes}
          scale={2}
          width={200}
          height={200}
          selectedPath="a.b"
          onSelect={() => {}}
          onDeselect={() => {}}
        />,
      );
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
      // A re-render with the SAME selection does not scroll again.
      view.rerender(
        <BoxOverlay
          boxes={boxes}
          scale={2}
          width={200}
          height={200}
          selectedPath="a.b"
          onSelect={() => {}}
          onDeselect={() => {}}
        />,
      );
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      // Selecting a DIFFERENT box reveals it.
      view.rerender(
        <BoxOverlay
          boxes={boxes}
          scale={2}
          width={200}
          height={200}
          selectedPath="a"
          onSelect={() => {}}
          onDeselect={() => {}}
        />,
      );
      expect(scrollIntoView).toHaveBeenCalledTimes(2);
    } finally {
      // Remove so the guarded-call's undefined arm stays covered by the other
      // tests (jsdom ships no scrollIntoView).
      (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView = undefined;
    }
  });

  it('does not scroll for a selection with no matching box (stale path)', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      // A selection whose box the render did not produce (a stale path after a
      // failed render): no rect matches, so nothing scrolls and nothing throws.
      render(
        <BoxOverlay
          boxes={boxes}
          scale={2}
          width={200}
          height={200}
          selectedPath="sections.body.items[99]"
          onSelect={() => {}}
          onDeselect={() => {}}
        />,
      );
      expect(scrollIntoView).not.toHaveBeenCalled();
    } finally {
      (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView = undefined;
    }
  });

  it('does not throw selecting a box when scrollIntoView is unavailable (jsdom)', () => {
    // No shim assigned — the guarded call must be a safe no-op.
    expect(() =>
      render(
        <BoxOverlay
          boxes={boxes}
          scale={2}
          width={200}
          height={200}
          selectedPath="a"
          onSelect={() => {}}
          onDeselect={() => {}}
        />,
      ),
    ).not.toThrow();
  });
});

describe('clientToPagePt', () => {
  it('divides by the render scale without an element', () => {
    expect(clientToPagePt(null, 100, 2, { x: 20, y: 40 })).toEqual({ x: 10, y: 20 });
  });

  it('factors the live bounding rect out (zoom transform)', () => {
    const el = {
      getBoundingClientRect: () => ({ left: 10, top: 20, width: 200 }),
    };
    // Rendered width 100 displayed at 200 CSS px → ratio 0.5; scale 2.
    expect(clientToPagePt(el, 100, 2, { x: 210, y: 220 })).toEqual({ x: 50, y: 50 });
  });

  it('falls back to ratio 1 over an unmeasurable rect (jsdom)', () => {
    const el = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 0 }) };
    expect(clientToPagePt(el, 100, 1, { x: 7, y: 9 })).toEqual({ x: 7, y: 9 });
  });
});

// A three-item flow stack: items[n] at y = n*40, each 100×30, scale 1 so
// client coordinates read directly as page pt under jsdom's zero rects.
const FLOW_BOXES = [
  box('sections.body.items[0]', 0, 0, 100, 30),
  box('sections.body.items[1]', 0, 40, 100, 30),
  box('sections.body.items[2]', 0, 80, 100, 30),
];

// A flow-body document matching FLOW_BOXES: three reorderable text items.
const FLOW_DOC: Record<string, unknown> = {
  'sections.body': { type: 'flow' },
  'sections.body.items[0]': { type: 'text' },
  'sections.body.items[1]': { type: 'text' },
  'sections.body.items[2]': { type: 'text' },
};

// An absolute-body document matching the same geometry: movable rects.
const ABS_DOC: Record<string, unknown> = {
  'sections.body': { type: 'absolute' },
  'sections.body.items[0]': { type: 'rect', box: { x: 0, y: 0, w: 100, h: 30 } },
  'sections.body.items[1]': { type: 'rect', box: { x: 0, y: 40, w: 100, h: 30 } },
  'sections.body.items[2]': { type: 'rect', box: { x: 0, y: 80, w: 100, h: 30 } },
};

const docRead =
  (entries: Record<string, unknown>): ReadFn =>
  (path) =>
    entries[path];

function makeManipulate(over: Partial<CanvasManipulate> = {}): CanvasManipulate {
  return {
    read: over.read ?? docRead(FLOW_DOC),
    onReorder: over.onReorder ?? (() => {}),
    onApply: over.onApply ?? (() => {}),
    onRefused: over.onRefused ?? (() => {}),
    grid: over.grid ?? 0,
  };
}

function renderReorder(
  onReorder: (op: unknown) => void = () => {},
  over: {
    boxes?: readonly PlacedBox[];
    onSelect?: (path: string) => void;
    read?: ReadFn;
  } = {},
) {
  const manipulate = makeManipulate({
    read: over.read,
    onReorder: onReorder as CanvasManipulate['onReorder'],
  });
  return render(
    <BoxOverlay
      boxes={over.boxes ?? FLOW_BOXES}
      scale={1}
      width={200}
      height={200}
      selectedPath={null}
      onSelect={over.onSelect ?? (() => {})}
      onDeselect={() => {}}
      manipulate={manipulate}
    />,
  );
}

const rectFor = (path: string) => screen.getByRole('button', { name: path });

const startDrag = (path: string, y: number) => {
  fireEvent.pointerDown(rectFor(path), {
    pointerId: 1,
    isPrimary: true,
    clientX: 50,
    clientY: y,
  });
};

const dragTo = (path: string, y: number) => {
  fireEvent.pointerMove(rectFor(path), { pointerId: 1, clientX: 50, clientY: y });
};

const dropAt = (path: string, y: number) => {
  fireEvent.pointerUp(rectFor(path), { pointerId: 1, clientX: 50, clientY: y });
};

describe('BoxOverlay drag reorder', () => {
  it('renders the ghost, indicator, and dragging state during a drag', () => {
    const { container } = renderReorder();
    startDrag('sections.body.items[0]', 10);
    dragTo('sections.body.items[0]', 76);
    const ghost = container.querySelector('.sj-drag-ghost');
    const indicator = container.querySelector('.sj-drop-indicator');
    expect(ghost).not.toBeNull();
    expect(ghost?.getAttribute('style')).toContain('pointer-events: none');
    // Inline fallback paint (no-stylesheet hosts): the ghost and indicator
    // must be visible without the package stylesheet.
    expect(ghost?.getAttribute('fill')).toBe('#c2402a');
    // The ghost travels with the pointer: source y 0 + delta 66.
    expect(ghost?.getAttribute('y')).toBe('66');
    expect(indicator).not.toBeNull();
    expect(indicator?.getAttribute('stroke')).toBe('#c2402a');
    // Pointer at y=76, past items[1]'s midpoint but short of items[2]'s: the
    // slot between them, drawn at the gap midpoint (70+80)/2 = 75.
    expect(indicator?.getAttribute('y1')).toBe('75');
    expect(container.querySelector('.sj-box--dragging')?.getAttribute('data-path')).toBe(
      'sections.body.items[0]',
    );
    expect(container.querySelector('svg')?.getAttribute('class')).toContain(
      'sj-box-overlay--dragging',
    );
  });

  it('dispatches ONE moveItem on drop and suppresses the trailing click', () => {
    const onReorder = vi.fn();
    const onSelect = vi.fn();
    renderReorder(onReorder, { onSelect });
    startDrag('sections.body.items[0]', 10);
    dragTo('sections.body.items[0]', 120);
    dropAt('sections.body.items[0]', 120);
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith({
      op: 'moveItem',
      path: 'sections.body.items',
      from: 0,
      to: 2,
    });
    // The trailing click of the completed drag must not re-select the old
    // path — it may now address a different item.
    fireEvent.click(rectFor('sections.body.items[0]'));
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(rectFor('sections.body.items[0]'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('emits no move on a no-op drop and falls back to selecting the pressed item', () => {
    const onReorder = vi.fn();
    const onSelect = vi.fn();
    renderReorder(onReorder, { onSelect });
    startDrag('sections.body.items[0]', 5);
    dragTo('sections.body.items[0]', 12);
    dropAt('sections.body.items[0]', 12);
    expect(onReorder).not.toHaveBeenCalled();
    // The drag crossed the threshold (so the trailing click is suppressed) but
    // produced no move — the item is selected explicitly instead.
    expect(onSelect).toHaveBeenCalledWith('sections.body.items[0]');
  });

  it('selects a single-child sequence item when its reorder drag has no destination', () => {
    const onReorder = vi.fn();
    const onSelect = vi.fn();
    const single = [box('sections.body.items[0]', 0, 0, 100, 30)];
    const soleRead = docRead({
      'sections.body': { type: 'flow' },
      'sections.body.items[0]': { type: 'text' },
    });
    render(
      <BoxOverlay
        boxes={single}
        scale={1}
        width={200}
        height={200}
        selectedPath={null}
        onSelect={onSelect}
        onDeselect={() => {}}
        manipulate={makeManipulate({
          read: soleRead,
          onReorder: onReorder as CanvasManipulate['onReorder'],
        })}
      />,
    );
    startDrag('sections.body.items[0]', 5);
    dragTo('sections.body.items[0]', 20);
    dropAt('sections.body.items[0]', 20);
    expect(onReorder).not.toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith('sections.body.items[0]');
  });

  it('shows nothing, drops nothing, and reports the refusal for a fixed box', () => {
    const onReorder = vi.fn();
    const onRefused = vi.fn();
    const { container } = render(
      <BoxOverlay
        boxes={FLOW_BOXES}
        scale={1}
        width={200}
        height={200}
        selectedPath={null}
        onSelect={() => {}}
        onDeselect={() => {}}
        manipulate={makeManipulate({
          read: docRead({}),
          onReorder: onReorder as CanvasManipulate['onReorder'],
          onRefused,
        })}
      />,
    );
    startDrag('sections.body.items[0]', 10);
    dragTo('sections.body.items[0]', 100);
    expect(container.querySelector('.sj-drag-ghost')).toBeNull();
    expect(container.querySelector('.sj-drop-indicator')).toBeNull();
    // The refusal reason surfaces ONCE per drag session.
    dragTo('sections.body.items[0]', 120);
    expect(onRefused).toHaveBeenCalledTimes(1);
    expect(onRefused).toHaveBeenCalledWith('unknown');
    dropAt('sections.body.items[0]', 120);
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('does not report a refusal for a below-threshold press on a fixed box', () => {
    const onRefused = vi.fn();
    const onSelect = vi.fn();
    render(
      <BoxOverlay
        boxes={FLOW_BOXES}
        scale={1}
        width={200}
        height={200}
        selectedPath={null}
        onSelect={onSelect}
        onDeselect={() => {}}
        manipulate={makeManipulate({ read: docRead({}), onRefused })}
      />,
    );
    startDrag('sections.body.items[0]', 10);
    dropAt('sections.body.items[0]', 11);
    expect(onRefused).not.toHaveBeenCalled();
    // A plain click (never a drag) still selects.
    fireEvent.click(rectFor('sections.body.items[0]'));
    expect(onSelect).toHaveBeenCalledWith('sections.body.items[0]');
  });

  it('degrades a drag whose path stops resolving (stale geometry never moves)', () => {
    const onReorder = vi.fn();
    const view = renderReorder(onReorder);
    startDrag('sections.body.items[0]', 10);
    dragTo('sections.body.items[0]', 100);
    expect(view.container.querySelector('.sj-drag-ghost')).not.toBeNull();
    // The document re-rendered mid-drag and the dragged item is no longer on
    // this page: the visual state clears and the release is a no-op.
    view.rerender(
      <BoxOverlay
        boxes={[box('sections.body.items[5]', 0, 0, 100, 30)]}
        scale={1}
        width={200}
        height={200}
        selectedPath={null}
        onSelect={() => {}}
        onDeselect={() => {}}
        manipulate={makeManipulate({ onReorder })}
      />,
    );
    expect(view.container.querySelector('.sj-drag-ghost')).toBeNull();
    expect(view.container.querySelector('.sj-drop-indicator')).toBeNull();
    dropAt('sections.body.items[5]', 100);
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('drops nothing when the reorder wiring is withdrawn mid-drag', () => {
    const onReorder = vi.fn();
    const view = renderReorder(onReorder);
    startDrag('sections.body.items[0]', 10);
    dragTo('sections.body.items[0]', 100);
    view.rerender(
      <BoxOverlay
        boxes={FLOW_BOXES}
        scale={1}
        width={200}
        height={200}
        selectedPath={null}
        onSelect={() => {}}
        onDeselect={() => {}}
      />,
    );
    dropAt('sections.body.items[0]', 100);
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('moves the item up with Alt+ArrowUp and Alt+ArrowLeft', () => {
    const onReorder = vi.fn();
    renderReorder(onReorder);
    fireEvent.keyDown(rectFor('sections.body.items[1]'), { key: 'ArrowUp', altKey: true });
    expect(onReorder).toHaveBeenNthCalledWith(1, {
      op: 'moveItem',
      path: 'sections.body.items',
      from: 1,
      to: 0,
    });
    fireEvent.keyDown(rectFor('sections.body.items[2]'), { key: 'ArrowLeft', altKey: true });
    expect(onReorder).toHaveBeenNthCalledWith(2, {
      op: 'moveItem',
      path: 'sections.body.items',
      from: 2,
      to: 1,
    });
  });

  it('moves the item down with Alt+ArrowDown and Alt+ArrowRight', () => {
    const onReorder = vi.fn();
    renderReorder(onReorder);
    fireEvent.keyDown(rectFor('sections.body.items[0]'), { key: 'ArrowDown', altKey: true });
    expect(onReorder).toHaveBeenNthCalledWith(1, {
      op: 'moveItem',
      path: 'sections.body.items',
      from: 0,
      to: 1,
    });
    fireEvent.keyDown(rectFor('sections.body.items[1]'), { key: 'ArrowRight', altKey: true });
    expect(onReorder).toHaveBeenNthCalledWith(2, {
      op: 'moveItem',
      path: 'sections.body.items',
      from: 1,
      to: 2,
    });
  });

  it('treats Alt+ArrowUp on the first item as a no-op', () => {
    const onReorder = vi.fn();
    renderReorder(onReorder);
    fireEvent.keyDown(rectFor('sections.body.items[0]'), { key: 'ArrowUp', altKey: true });
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('leaves Alt+arrows alone on a non-reorderable box (no preventDefault)', () => {
    const onReorder = vi.fn();
    renderReorder(onReorder, { read: docRead({}) });
    const undisturbed = fireEvent.keyDown(rectFor('sections.body.items[0]'), {
      key: 'ArrowDown',
      altKey: true,
    });
    expect(undisturbed).toBe(true);
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('is select-only without the reorder wiring (pointer and keyboard)', () => {
    const onSelect = vi.fn();
    const { container } = render(
      <BoxOverlay
        boxes={FLOW_BOXES}
        scale={1}
        width={200}
        height={200}
        selectedPath={null}
        onSelect={onSelect}
        onDeselect={() => {}}
      />,
    );
    startDrag('sections.body.items[0]', 10);
    dragTo('sections.body.items[0]', 100);
    expect(container.querySelector('.sj-drag-ghost')).toBeNull();
    fireEvent.keyDown(rectFor('sections.body.items[0]'), { key: 'ArrowDown', altKey: true });
    dropAt('sections.body.items[0]', 100);
    fireEvent.click(rectFor('sections.body.items[0]'));
    expect(onSelect).toHaveBeenCalledWith('sections.body.items[0]');
  });
});

// ---- absolute manipulation (move / resize / nudge / grid) ----

function renderAbsolute(
  over: {
    onApply?: (ops: unknown) => void;
    onRefused?: (reason: unknown) => void;
    onSelect?: (path: string) => void;
    grid?: number;
    selectedPath?: string | null;
    read?: ReadFn;
    boxes?: readonly PlacedBox[];
  } = {},
) {
  const manipulate = makeManipulate({
    read: over.read ?? docRead(ABS_DOC),
    onApply: (over.onApply ?? (() => {})) as CanvasManipulate['onApply'],
    onRefused: (over.onRefused ?? (() => {})) as CanvasManipulate['onRefused'],
    grid: over.grid ?? 0,
  });
  return render(
    <BoxOverlay
      boxes={over.boxes ?? FLOW_BOXES}
      scale={1}
      width={200}
      height={200}
      selectedPath={over.selectedPath ?? null}
      onSelect={over.onSelect ?? (() => {})}
      onDeselect={() => {}}
      manipulate={manipulate}
    />,
  );
}

describe('BoxOverlay absolute move', () => {
  it('paints the ghost and commits ONE changed-keys batch on drop', () => {
    const onApply = vi.fn();
    const { container } = renderAbsolute({ onApply });
    startDrag('sections.body.items[0]', 10);
    dragTo('sections.body.items[0]', 131.5);
    expect(container.querySelector('.sj-drag-ghost')).not.toBeNull();
    expect(container.querySelector('svg')?.getAttribute('class')).toContain(
      'sj-box-overlay--dragging',
    );
    dropAt('sections.body.items[0]', 131.5);
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith('sections.body.items[0]', [
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['box', 'y'], value: 121.5 },
    ]);
  });

  it('snaps the drop to the editor grid', () => {
    const onApply = vi.fn();
    renderAbsolute({ onApply, grid: 4 });
    startDrag('sections.body.items[0]', 10);
    dragTo('sections.body.items[0]', 131.5);
    dropAt('sections.body.items[0]', 131.5);
    expect(onApply).toHaveBeenCalledWith('sections.body.items[0]', [
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['box', 'y'], value: 120 },
    ]);
  });

  it('bypasses snapping while Alt is held', () => {
    const onApply = vi.fn();
    renderAbsolute({ onApply, grid: 4 });
    startDrag('sections.body.items[0]', 10);
    fireEvent.pointerMove(rectFor('sections.body.items[0]'), {
      pointerId: 1,
      clientX: 50,
      clientY: 131.5,
      altKey: true,
    });
    fireEvent.pointerUp(rectFor('sections.body.items[0]'), {
      pointerId: 1,
      clientX: 50,
      clientY: 131.5,
      altKey: true,
    });
    expect(onApply).toHaveBeenCalledWith('sections.body.items[0]', [
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['box', 'y'], value: 121.5 },
    ]);
  });

  it('shows the alignment guide when the drag lines up with a sibling', () => {
    const onApply = vi.fn();
    const { container } = renderAbsolute({ onApply });
    startDrag('sections.body.items[0]', 10);
    // Proposed top edge 108.5 — items[2]'s bottom edge (110) is within the
    // 6px threshold, so the guide line appears and the drop lands at 110.
    dragTo('sections.body.items[0]', 118.5);
    const guides = Array.from(container.querySelectorAll('.sj-guide'));
    const horizontal = guides.find((g) => g.getAttribute('y1') === g.getAttribute('y2'));
    expect(horizontal?.getAttribute('y1')).toBe('110');
    dropAt('sections.body.items[0]', 118.5);
    expect(onApply).toHaveBeenCalledWith('sections.body.items[0]', [
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['box', 'y'], value: 110 },
    ]);
  });

  it('cancels on Escape without committing', () => {
    const onApply = vi.fn();
    const { container } = renderAbsolute({ onApply });
    startDrag('sections.body.items[0]', 10);
    dragTo('sections.body.items[0]', 131.5);
    expect(container.querySelector('.sj-drag-ghost')).not.toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(container.querySelector('.sj-drag-ghost')).toBeNull();
    dropAt('sections.body.items[0]', 131.5);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('selects the pressed item when a move drag returns to its origin (zero delta)', () => {
    const onApply = vi.fn();
    const onSelect = vi.fn();
    renderAbsolute({ onApply, onSelect });
    startDrag('sections.body.items[0]', 10);
    // Cross the drag threshold, then release back at the start: no committed
    // change, so it falls back to a select.
    dragTo('sections.body.items[0]', 20);
    dropAt('sections.body.items[0]', 10);
    expect(onApply).not.toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith('sections.body.items[0]');
  });

  it('degrades when the document stops classifying the drag as reorder mid-drag', () => {
    const onReorder = vi.fn();
    const view = renderReorder(onReorder);
    startDrag('sections.body.items[0]', 10);
    dragTo('sections.body.items[0]', 100);
    expect(view.container.querySelector('.sj-drag-ghost')).not.toBeNull();
    // The document was swapped under the drag: the same path now classifies
    // fixed, so the visuals clear and the release is a no-op.
    view.rerender(
      <BoxOverlay
        boxes={FLOW_BOXES}
        scale={1}
        width={200}
        height={200}
        selectedPath={null}
        onSelect={() => {}}
        onDeselect={() => {}}
        manipulate={makeManipulate({ read: docRead({}), onReorder })}
      />,
    );
    expect(view.container.querySelector('.sj-drag-ghost')).toBeNull();
    dropAt('sections.body.items[0]', 100);
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('paints the base grid only when a step is set', () => {
    const withGrid = renderAbsolute({ grid: 4 });
    expect(withGrid.container.querySelector('.sj-grid')).not.toBeNull();
    expect(withGrid.container.querySelector('pattern')).not.toBeNull();
    withGrid.unmount();
    const withoutGrid = renderAbsolute({ grid: 0 });
    expect(withoutGrid.container.querySelector('.sj-grid')).toBeNull();
  });
});

describe('BoxOverlay resize handles', () => {
  it('renders 8 handles on the selected movable box only', () => {
    const { container } = renderAbsolute({ selectedPath: 'sections.body.items[0]' });
    expect(container.querySelectorAll('.sj-handle')).toHaveLength(8);
  });

  it('renders no handles for a reorderable or unselected box', () => {
    const reorderable = render(
      <BoxOverlay
        boxes={FLOW_BOXES}
        scale={1}
        width={200}
        height={200}
        selectedPath={'sections.body.items[0]'}
        onSelect={() => {}}
        onDeselect={() => {}}
        manipulate={makeManipulate()}
      />,
    );
    expect(reorderable.container.querySelector('.sj-handle')).toBeNull();
    reorderable.unmount();
    const unselected = renderAbsolute({ selectedPath: null });
    expect(unselected.container.querySelector('.sj-handle')).toBeNull();
  });

  it('renders no handles when the selected movable box is not on this page', () => {
    const { container } = renderAbsolute({
      selectedPath: 'sections.body.items[0]',
      boxes: [],
    });
    expect(container.querySelector('.sj-handle')).toBeNull();
  });

  it('hides the handles whose keys cannot be written back', () => {
    const read = docRead({
      'sections.body': { type: 'absolute' },
      'sections.body.items[0]': { type: 'text', box: { x: 0, y: 0, w: '100%', h: 30 } },
    });
    const { container } = renderAbsolute({ read, selectedPath: 'sections.body.items[0]' });
    const handles = Array.from(container.querySelectorAll('.sj-handle')).map((el) =>
      el.getAttribute('data-handle'),
    );
    expect(handles).toEqual(['n', 's']);
  });

  it('commits a corner resize as ONE batch', () => {
    const onApply = vi.fn();
    const { container } = renderAbsolute({ onApply, selectedPath: 'sections.body.items[0]' });
    const handle = container.querySelector('[data-handle="se"]');
    if (handle === null) throw new Error('se handle missing');
    fireEvent.pointerDown(handle, { pointerId: 1, isPrimary: true, clientX: 100, clientY: 30 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 120, clientY: 40 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 120, clientY: 40 });
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith('sections.body.items[0]', [
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['box', 'w'], value: 120 },
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['box', 'h'], value: 40 },
    ]);
  });

  it('commits an edge resize (s handle) as ONE batch', () => {
    const onApply = vi.fn();
    const { container } = renderAbsolute({ onApply, selectedPath: 'sections.body.items[0]' });
    const handle = container.querySelector('[data-handle="s"]');
    if (handle === null) throw new Error('s handle missing');
    // Edge lands at 47 — clear of every sibling alignment (>6pt away).
    fireEvent.pointerDown(handle, { pointerId: 1, isPrimary: true, clientX: 50, clientY: 30 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 50, clientY: 47 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 50, clientY: 47 });
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith('sections.body.items[0]', [
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['box', 'h'], value: 47 },
    ]);
  });

  it('states the drag meaning through the selected box cursor', () => {
    const movable = renderAbsolute({ selectedPath: 'sections.body.items[0]' });
    expect(movable.container.querySelector('.sj-box--selected')?.getAttribute('style')).toContain(
      'cursor: move',
    );
    movable.unmount();
    const reorderable = render(
      <BoxOverlay
        boxes={FLOW_BOXES}
        scale={1}
        width={200}
        height={200}
        selectedPath={'sections.body.items[0]'}
        onSelect={() => {}}
        onDeselect={() => {}}
        manipulate={makeManipulate()}
      />,
    );
    expect(
      reorderable.container.querySelector('.sj-box--selected')?.getAttribute('style'),
    ).toContain('cursor: grab');
  });
});

describe('BoxOverlay arrow nudge', () => {
  it('nudges a movable box by the grid step (1pt when off)', () => {
    const onApply = vi.fn();
    renderAbsolute({ onApply, grid: 4 });
    fireEvent.keyDown(rectFor('sections.body.items[0]'), { key: 'ArrowRight' });
    expect(onApply).toHaveBeenNthCalledWith(1, 'sections.body.items[0]', [
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['box', 'x'], value: 4 },
    ]);
    fireEvent.keyDown(rectFor('sections.body.items[1]'), { key: 'ArrowUp' });
    expect(onApply).toHaveBeenNthCalledWith(2, 'sections.body.items[1]', [
      { op: 'setScalar', path: 'sections.body.items[1]', keys: ['box', 'y'], value: 36 },
    ]);
    fireEvent.keyDown(rectFor('sections.body.items[2]'), { key: 'ArrowLeft' });
    expect(onApply).toHaveBeenNthCalledWith(3, 'sections.body.items[2]', [
      { op: 'setScalar', path: 'sections.body.items[2]', keys: ['box', 'x'], value: -4 },
    ]);
  });

  it('applies nothing when the committed nudge rounds back to the authored spelling', () => {
    const onApply = vi.fn();
    // 0.01pt on a mm-authored axis rounds back to the same authored value
    // (mm keeps one decimal), and the cross axis moves by zero — every axis
    // op degenerates, so the batch is empty and nothing dispatches.
    const mmDoc: Record<string, unknown> = {
      'sections.body': { type: 'absolute' },
      'sections.body.items[0]': { type: 'rect', box: { x: '10mm', y: 0, w: 100, h: 30 } },
    };
    renderAbsolute({ onApply, read: docRead(mmDoc), grid: 0.01 });
    fireEvent.keyDown(rectFor('sections.body.items[0]'), { key: 'ArrowRight' });
    expect(onApply).not.toHaveBeenCalled();
  });

  it('nudges by 1pt when the grid is off', () => {
    const onApply = vi.fn();
    renderAbsolute({ onApply, grid: 0 });
    fireEvent.keyDown(rectFor('sections.body.items[0]'), { key: 'ArrowDown' });
    expect(onApply).toHaveBeenCalledWith('sections.body.items[0]', [
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['box', 'y'], value: 1 },
    ]);
  });

  it('leaves plain arrows alone on a reorderable box', () => {
    const onApply = vi.fn();
    const onReorder = vi.fn();
    render(
      <BoxOverlay
        boxes={FLOW_BOXES}
        scale={1}
        width={200}
        height={200}
        selectedPath={null}
        onSelect={() => {}}
        onDeselect={() => {}}
        manipulate={makeManipulate({
          onApply: onApply as CanvasManipulate['onApply'],
          onReorder: onReorder as CanvasManipulate['onReorder'],
        })}
      />,
    );
    const undisturbed = fireEvent.keyDown(rectFor('sections.body.items[0]'), {
      key: 'ArrowDown',
    });
    expect(undisturbed).toBe(true);
    expect(onApply).not.toHaveBeenCalled();
    expect(onReorder).not.toHaveBeenCalled();
  });
});

describe('BoxOverlay — palette-drop wiring', () => {
  it('reports its SVG element through svgRef (and null on unmount)', () => {
    const reported: (SVGSVGElement | null)[] = [];
    const { unmount } = render(
      <BoxOverlay
        boxes={boxes}
        scale={2}
        width={200}
        height={200}
        selectedPath={null}
        onSelect={() => {}}
        onDeselect={() => {}}
        svgRef={(el) => reported.push(el)}
      />,
    );
    expect(reported.at(-1)).not.toBeNull();
    expect(reported.at(-1)?.tagName.toLowerCase()).toBe('svg');
    unmount();
    expect(reported.at(-1)).toBeNull();
  });

  it('paints an external insertion line in page-pixel space', () => {
    const { container } = render(
      <BoxOverlay
        boxes={boxes}
        scale={2}
        width={200}
        height={200}
        selectedPath={null}
        onSelect={() => {}}
        onDeselect={() => {}}
        insertLine={{ x1: 0, y1: 25, x2: 100, y2: 25 }}
      />,
    );
    const line = container.querySelector('.sj-drop-indicator');
    expect(line).not.toBeNull();
    expect(line?.getAttribute('y1')).toBe('50');
    expect(line?.getAttribute('x2')).toBe('200');
  });

  it('paints nothing without an insert line (unchanged default)', () => {
    const { container } = renderOverlay(null, () => {});
    expect(container.querySelector('.sj-drop-indicator')).toBeNull();
    expect(container.querySelector('.sj-drop-cell')).toBeNull();
  });

  it('outlines every fragment of a cell drop, decorative and never hit-testable', () => {
    // A row's cell is one authored sub-template drawn once per row, so the
    // indicator is an outline per fragment rather than a single slot line.
    const { container } = render(
      <BoxOverlay
        boxes={boxes}
        scale={2}
        width={200}
        height={200}
        selectedPath={null}
        onSelect={() => {}}
        onDeselect={() => {}}
        insertRects={[
          { x: 10, y: 20, w: 30, h: 8 },
          { x: 10, y: 40, w: 30, h: 8 },
        ]}
      />,
    );
    const cells = container.querySelectorAll('.sj-drop-cell');
    expect(cells).toHaveLength(2);
    // Page pt → device px through the same scale the boxes use.
    expect(cells[0]?.getAttribute('x')).toBe('20');
    expect(cells[0]?.getAttribute('y')).toBe('40');
    expect(cells[1]?.getAttribute('y')).toBe('80');
    for (const cell of cells) {
      expect((cell as SVGElement).style.pointerEvents).toBe('none');
      // Decorative: an aria-hidden/presentation SVG shape trips the a11y lint,
      // so it carries no ARIA at all — there is nothing to announce.
      expect(cell.getAttribute('aria-hidden')).toBeNull();
      expect(cell.getAttribute('role')).toBeNull();
    }
    // The two indicators are exclusive; a cell drop plans no line.
    expect(container.querySelector('.sj-drop-indicator')).toBeNull();
  });
});

describe('BoxOverlay container marks', () => {
  const containerBoxes = [
    box('sections.body.items[0]', 10, 20, 80, 40),
    box('sections.body.items[0].items[0]', 12, 22, 30, 36),
    box('sections.body.items[0].items[1]', 50, 22, 36, 36),
    // Deeper than a direct child — never a slot guide.
    box('sections.body.items[0].items[1].items[0]', 52, 24, 10, 10),
    box('sections.body.items[1]', 10, 70, 80, 20),
  ];

  function renderMarks(
    marks: readonly { path: string; label: string }[],
    selectedPath: string | null = null,
  ) {
    return render(
      <BoxOverlay
        boxes={containerBoxes}
        scale={2}
        width={200}
        height={300}
        selectedPath={selectedPath}
        onSelect={() => {}}
        onDeselect={() => {}}
        containerMarks={marks}
      />,
    );
  }

  it('draws a dashed outline, direct-child slot guides, and the kind chip', () => {
    const { container } = renderMarks([
      { path: 'sections.body.items[0]', label: 'コンテナ(横並び)' },
    ]);
    const mark = container.querySelector('.sj-container-mark');
    expect(mark).not.toBeNull();
    const dashed = mark?.querySelectorAll('rect[stroke-dasharray="5 3"]');
    expect(dashed).toHaveLength(1);
    // scale 2: (10,20,80,40) → (20,40,160,80).
    expect(dashed?.[0].getAttribute('x')).toBe('20');
    expect(dashed?.[0].getAttribute('y')).toBe('40');
    expect(dashed?.[0].getAttribute('width')).toBe('160');
    // Slot guides outline the two DIRECT children only (never the grandchild
    // or the sibling item).
    const slots = mark?.querySelectorAll('rect[stroke-dasharray="3 3"]');
    expect(slots).toHaveLength(2);
    // The chip renders the label text and never intercepts the pointer.
    expect(mark?.getAttribute('style')).toContain('pointer-events: none');
    expect(screen.getByText('コンテナ(横並び)')).toBeTruthy();
    expect(container.querySelector('.sj-container-chip')).not.toBeNull();
  });

  it('clamps the chip inside the page when the container sits at the top edge', () => {
    const topBoxes = [box('sections.body.items[0]', 0, 0, 80, 40)];
    const { container } = render(
      <BoxOverlay
        boxes={topBoxes}
        scale={1}
        width={200}
        height={300}
        selectedPath={null}
        onSelect={() => {}}
        onDeselect={() => {}}
        containerMarks={[{ path: 'sections.body.items[0]', label: 'X' }]}
      />,
    );
    const chip = container.querySelector('.sj-container-chip');
    expect(Number(chip?.getAttribute('y'))).toBeGreaterThanOrEqual(0);
  });

  it('suppresses the solid selection stroke on a marked path (dashed-only, per the mock)', () => {
    const { container } = renderMarks(
      [{ path: 'sections.body.items[0]', label: 'X' }],
      'sections.body.items[0]',
    );
    const selected = container.querySelector('[data-path="sections.body.items[0]"]');
    expect(selected?.getAttribute('stroke')).toBe('none');
    // An unmarked selection keeps the solid stroke.
    const plain = renderMarks([], 'sections.body.items[1]');
    expect(
      plain.container.querySelector('[data-path="sections.body.items[1]"]')?.getAttribute('stroke'),
    ).toBe('#c2402a');
  });

  it('draws nothing for a mark whose path has no box on this page', () => {
    const { container } = renderMarks([{ path: 'sections.header.items[0]', label: 'X' }]);
    expect(container.querySelector('.sj-container-mark')).toBeNull();
  });

  it('marks every fragment when a path appears on the page twice (repeat cells)', () => {
    const dup = [
      box('sections.body.items[0]', 0, 0, 40, 20),
      box('sections.body.items[0]', 0, 40, 40, 20),
    ];
    const { container } = render(
      <BoxOverlay
        boxes={dup}
        scale={1}
        width={100}
        height={100}
        selectedPath={null}
        onSelect={() => {}}
        onDeselect={() => {}}
        containerMarks={[{ path: 'sections.body.items[0]', label: 'X' }]}
      />,
    );
    expect(
      container.querySelectorAll('.sj-container-mark rect[stroke-dasharray="5 3"]'),
    ).toHaveLength(2);
  });
});

describe('BoxOverlay multi-select + marquee', () => {
  // FLOW_BOXES geometry classified as absolute (movable) via ABS_DOC.
  const renderMulti = (props: {
    selectedPath?: string | null;
    multiSelected?: ReadonlySet<string>;
    onSelect?: (path: string) => void;
    onMultiToggle?: (path: string) => void;
    onMarquee?: (paths: readonly string[], additive: boolean) => void;
    onDeselect?: () => void;
  }) =>
    render(
      <BoxOverlay
        boxes={FLOW_BOXES}
        scale={1}
        width={200}
        height={200}
        selectedPath={props.selectedPath ?? null}
        onSelect={props.onSelect ?? (() => {})}
        multiSelected={props.multiSelected}
        onMultiToggle={props.onMultiToggle}
        onMarquee={props.onMarquee}
        onDeselect={props.onDeselect ?? (() => {})}
        manipulate={makeManipulate({ read: docRead(ABS_DOC) })}
      />,
    );

  const onSvg = (svg: Element, type: 'pointerDown' | 'pointerMove' | 'pointerUp', init: object) =>
    fireEvent[type](svg, { pointerId: 1, isPrimary: true, ...init });

  it('paints the secondary stroke on a multi-selected box and a group frame', () => {
    const { container } = renderMulti({
      selectedPath: 'sections.body.items[0]',
      multiSelected: new Set(['sections.body.items[1]']),
    });
    expect(container.querySelector('.sj-box--selected')?.getAttribute('data-path')).toBe(
      'sections.body.items[0]',
    );
    const multi = container.querySelector('.sj-box--multi');
    expect(multi?.getAttribute('data-path')).toBe('sections.body.items[1]');
    expect(multi?.getAttribute('stroke')).toBe('#c2402a');
    expect(multi?.getAttribute('stroke-opacity')).toBe('0.55');
    // Two distinct selected paths → the dashed group frame is drawn.
    expect(container.querySelector('.sj-group-bounds')).not.toBeNull();
  });

  it('does not draw a group frame for a single selection', () => {
    const { container } = renderMulti({ selectedPath: 'sections.body.items[0]' });
    expect(container.querySelector('.sj-group-bounds')).toBeNull();
  });

  it('shift-click toggles multi-selection instead of a plain select', () => {
    const onSelect = vi.fn();
    const onMultiToggle = vi.fn();
    renderMulti({ onSelect, onMultiToggle });
    fireEvent.click(rectFor('sections.body.items[1]'), { shiftKey: true });
    expect(onMultiToggle).toHaveBeenCalledWith('sections.body.items[1]');
    expect(onSelect).not.toHaveBeenCalled();
    // A plain click still selects.
    fireEvent.click(rectFor('sections.body.items[2]'));
    expect(onSelect).toHaveBeenCalledWith('sections.body.items[2]');
  });

  it('rubber-band drag on the background selects the swept movable items', () => {
    const onMarquee = vi.fn();
    const { container } = renderMulti({ onMarquee });
    const svg = container.querySelector('svg') as SVGSVGElement;
    onSvg(svg, 'pointerDown', { clientX: 5, clientY: 5 });
    onSvg(svg, 'pointerMove', { clientX: 60, clientY: 50 });
    // The marquee rect is painted mid-drag.
    expect(container.querySelector('.sj-marquee')).not.toBeNull();
    onSvg(svg, 'pointerUp', { clientX: 60, clientY: 50 });
    expect(onMarquee).toHaveBeenCalledWith(
      ['sections.body.items[0]', 'sections.body.items[1]'],
      false,
    );
  });

  it('reports an additive marquee when Shift is held', () => {
    const onMarquee = vi.fn();
    const { container } = renderMulti({ onMarquee });
    const svg = container.querySelector('svg') as SVGSVGElement;
    onSvg(svg, 'pointerDown', { clientX: 5, clientY: 5, shiftKey: true });
    onSvg(svg, 'pointerMove', { clientX: 60, clientY: 50 });
    onSvg(svg, 'pointerUp', { clientX: 60, clientY: 50 });
    expect(onMarquee).toHaveBeenCalledWith(
      ['sections.body.items[0]', 'sections.body.items[1]'],
      true,
    );
  });

  it('a plain background click still deselects while marquee is wired', () => {
    const onDeselect = vi.fn();
    const onMarquee = vi.fn();
    const { container } = renderMulti({ onDeselect, onMarquee });
    const svg = container.querySelector('svg') as SVGSVGElement;
    onSvg(svg, 'pointerDown', { clientX: 5, clientY: 5 });
    onSvg(svg, 'pointerUp', { clientX: 5, clientY: 5 });
    fireEvent.click(svg);
    expect(onMarquee).not.toHaveBeenCalled();
    expect(onDeselect).toHaveBeenCalledTimes(1);
  });

  it('a completed marquee suppresses the trailing background click', () => {
    const onDeselect = vi.fn();
    const onMarquee = vi.fn();
    const { container } = renderMulti({ onDeselect, onMarquee });
    const svg = container.querySelector('svg') as SVGSVGElement;
    onSvg(svg, 'pointerDown', { clientX: 5, clientY: 5 });
    onSvg(svg, 'pointerMove', { clientX: 60, clientY: 50 });
    onSvg(svg, 'pointerUp', { clientX: 60, clientY: 50 });
    fireEvent.click(svg);
    expect(onDeselect).not.toHaveBeenCalled();
  });

  it('does not marquee when no marquee handler is wired', () => {
    const { container } = renderMulti({});
    const svg = container.querySelector('svg') as SVGSVGElement;
    onSvg(svg, 'pointerDown', { clientX: 5, clientY: 5 });
    onSvg(svg, 'pointerMove', { clientX: 60, clientY: 50 });
    // Nothing armed → no marquee rect.
    expect(container.querySelector('.sj-marquee')).toBeNull();
  });

  it('a marquee drop after the handler is withdrawn mid-drag is a safe no-op', () => {
    const onMarquee = vi.fn();
    const overlay = (handler?: (paths: readonly string[], additive: boolean) => void) => (
      <BoxOverlay
        boxes={FLOW_BOXES}
        scale={1}
        width={200}
        height={200}
        selectedPath={null}
        onSelect={() => {}}
        onMarquee={handler}
        onDeselect={() => {}}
        manipulate={makeManipulate({ read: docRead(ABS_DOC) })}
      />
    );
    const { container, rerender } = render(overlay(onMarquee));
    const svg = container.querySelector('svg') as SVGSVGElement;
    onSvg(svg, 'pointerDown', { clientX: 5, clientY: 5 });
    onSvg(svg, 'pointerMove', { clientX: 60, clientY: 50 });
    // The parent withdraws the handler while the drag is live.
    rerender(overlay(undefined));
    onSvg(svg, 'pointerUp', { clientX: 60, clientY: 50 });
    expect(onMarquee).not.toHaveBeenCalled();
  });
});

describe('a conditionally hidden item', () => {
  const hidden = { ...box('ghost', 0, 0, 40, 20), hidden: true };

  function drawWith(selectedPath: string | null) {
    return render(
      <BoxOverlay
        boxes={[hidden]}
        scale={1}
        width={100}
        height={100}
        selectedPath={selectedPath}
        onSelect={() => {}}
        onDeselect={() => {}}
      />,
    );
  }

  it('is ghosted with a dashed outline so the empty region is explained', () => {
    // The item reserved its box and painted nothing; without a mark the
    // canvas shows an unexplained gap.
    const { container } = drawWith(null);
    const rect = container.querySelector('rect.sj-box');
    expect(rect?.getAttribute('stroke-dasharray')).toBe('3 3');
    expect(rect?.classList.contains('sj-box--hidden')).toBe(true);
  });

  it('is still selectable, and the selection stroke wins over the ghost', () => {
    const { container } = drawWith('ghost');
    const rect = container.querySelector('rect.sj-box');
    // Selected: the solid selection stroke, no dashes competing with it.
    expect(rect?.getAttribute('stroke-dasharray')).toBeNull();
    expect(rect?.getAttribute('stroke-width')).toBe('1.5');
    // …and the class stays, so a stylesheet can still theme it.
    expect(rect?.classList.contains('sj-box--hidden')).toBe(true);
  });

  it('leaves an ordinary box unghosted', () => {
    const { container } = render(
      <BoxOverlay
        boxes={[box('plain', 0, 0, 10, 10)]}
        scale={1}
        width={100}
        height={100}
        selectedPath={null}
        onSelect={() => {}}
        onDeselect={() => {}}
      />,
    );
    const rect = container.querySelector('rect.sj-box');
    expect(rect?.getAttribute('stroke-dasharray')).toBeNull();
    expect(rect?.classList.contains('sj-box--hidden')).toBe(false);
  });
});

describe('BoxOverlay margin-box guide', () => {
  const guided = (extra: { margin?: readonly [number, number, number, number] | null }) =>
    render(
      <BoxOverlay
        boxes={[box('a', 0, 0, 100, 100)]}
        scale={1}
        width={200}
        height={200}
        selectedPath={null}
        onSelect={() => {}}
        onDeselect={() => {}}
        {...extra}
      />,
    );

  it('paints the guide UNDER the interactive layer', () => {
    const { container } = guided({ margin: [10, 10, 10, 10] });
    const painted = [...container.querySelectorAll('rect')];
    const guideIndex = painted.findIndex((r) => r.classList.contains('sj-margin-guide'));
    const firstBox = painted.findIndex((r) => r.classList.contains('sj-box'));
    expect(guideIndex).toBeGreaterThanOrEqual(0);
    // SVG paints in document order, so "under" means "earlier".
    expect(guideIndex).toBeLessThan(firstBox);
  });

  it('paints no guide without margins — the unchanged host default', () => {
    expect(guided({}).container.querySelector('.sj-margin-guide')).toBeNull();
    expect(guided({ margin: null }).container.querySelector('.sj-margin-guide')).toBeNull();
  });

  it('coexists with the snap grid', () => {
    const manipulate = makeManipulate({ grid: 8 });
    const { container } = render(
      <BoxOverlay
        boxes={[box('a', 0, 0, 100, 100)]}
        scale={1}
        width={200}
        height={200}
        selectedPath={null}
        onSelect={() => {}}
        onDeselect={() => {}}
        manipulate={manipulate}
        margin={[10, 10, 10, 10]}
      />,
    );
    expect(container.querySelector('.sj-grid')).not.toBeNull();
    expect(container.querySelector('.sj-margin-guide')).not.toBeNull();
  });

  it('never takes a click from the box beneath it', () => {
    const onSelect = vi.fn();
    const { container } = render(
      <BoxOverlay
        boxes={[box('a', 0, 0, 100, 100)]}
        scale={1}
        width={200}
        height={200}
        selectedPath={null}
        onSelect={onSelect}
        onDeselect={() => {}}
        margin={[10, 10, 10, 10]}
      />,
    );
    // The guide spans the same region as the box; a click there must reach it.
    fireEvent.click(container.querySelector('rect.sj-box') as SVGRectElement);
    expect(onSelect).toHaveBeenCalledWith('a');
    // And the guide itself is inert.
    const group = container.querySelector('.sj-margin-guide')?.parentElement;
    expect(group?.getAttribute('style')).toContain('pointer-events: none');
  });
});
