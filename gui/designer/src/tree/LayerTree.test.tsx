import type { Op, OpResult } from '@shojiku/designer-core';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/context';
import { LayerTree } from './LayerTree';
import { buildTree, type TreeView } from './model';

const TEMPLATE = [
  'sections:',
  '  header:',
  '    type: flow',
  '    items:',
  '      - type: text',
  '        text: Title',
  '  body:',
  '    type: flow',
  '    items:',
  '      - type: text',
  '        text: First',
  '      - type: text',
  '        text: Second',
  '      - type: container',
  '        id: wrap',
  '        items:',
  '          - type: text',
  '            text: Inner',
  '',
].join('\n');

const VIEW = buildTree(TEMPLATE);

interface DrawOptions {
  readonly view?: TreeView | null;
  readonly selection?: string | null;
  readonly onSelect?: (path: string) => void;
  readonly apply?: (op: Op) => OpResult;
  readonly onOpenDocument?: () => void;
}

function draw(options: DrawOptions = {}) {
  const onSelect = options.onSelect ?? vi.fn();
  const apply = options.apply ?? vi.fn((_op: Op): OpResult => ({ ok: true }));
  const onOpenDocument = options.onOpenDocument ?? vi.fn();
  const view = options.view === undefined ? VIEW : options.view;
  const utils = render(
    <I18nProvider locale="en">
      <LayerTree
        view={view}
        selection={options.selection ?? null}
        onSelect={onSelect}
        apply={apply}
        onOpenDocument={onOpenDocument}
      />
    </I18nProvider>,
  );
  return { ...utils, onSelect, apply, onOpenDocument };
}

function row(name: string): HTMLElement {
  return screen.getByRole('button', { name });
}

/** Stub sibling row geometry (jsdom has no layout): stacked 20px rows. */
function stackRows(names: readonly string[]): void {
  names.forEach((name, index) => {
    row(name).getBoundingClientRect = () => ({ top: index * 20, height: 20 }) as DOMRect;
  });
}

function startDrag(name: string, pointerId = 1): void {
  fireEvent.pointerDown(row(name), { pointerId, clientY: 10, isPrimary: true });
}

describe('LayerTree', () => {
  it('renders localized section rows and content-derived labels', () => {
    draw();
    expect(row('Header')).toBeTruthy();
    expect(row('Body')).toBeTruthy();
    expect(row('First')).toBeTruthy();
    expect(row('Inner')).toBeTruthy();
  });

  it('selects a row on click through the shared selection', () => {
    const { onSelect } = draw();
    fireEvent.click(row('Second'));
    expect(onSelect).toHaveBeenCalledWith('sections.body.items[1]');
  });

  it('marks the selected row', () => {
    draw({ selection: 'sections.body.items[0]' });
    expect(row('First').getAttribute('aria-current')).toBe('true');
    expect(row('Second').getAttribute('aria-current')).toBeNull();
  });

  it('collapses and expands via the toggle button', () => {
    draw();
    fireEvent.click(screen.getAllByRole('button', { name: 'Collapse' })[2]);
    expect(screen.queryByRole('button', { name: 'Inner' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Expand' }));
    expect(row('Inner')).toBeTruthy();
  });

  it('turns the twisty chevron by data-collapsed, and keeps it out of the row text', () => {
    draw();
    const toggle = screen.getAllByRole('button', { name: 'Collapse' })[2] as HTMLElement;
    const chevron = toggle.querySelector('svg');
    // `data-collapsed` is the stable hook the rotation utility keys off — the
    // marks are SVG now, so a row's text content is exactly its label.
    expect(chevron?.getAttribute('aria-hidden')).toBe('true');
    expect(chevron?.hasAttribute('data-collapsed')).toBe(false);
    expect(row('First').textContent).toBe('First');
    fireEvent.click(toggle);
    const collapsed = screen.getByRole('button', { name: 'Expand' });
    expect(collapsed.getAttribute('aria-expanded')).toBe('false');
    expect(collapsed.querySelector('svg')?.hasAttribute('data-collapsed')).toBe(true);
  });

  it('collapses with ArrowLeft and expands with ArrowRight on the row', () => {
    draw();
    fireEvent.keyDown(row('wrap'), { key: 'ArrowLeft' });
    expect(screen.queryByRole('button', { name: 'Inner' })).toBeNull();
    fireEvent.keyDown(row('wrap'), { key: 'ArrowRight' });
    expect(row('Inner')).toBeTruthy();
    // Redundant directions, leaf rows, and unrelated keys are inert.
    fireEvent.keyDown(row('wrap'), { key: 'ArrowRight' });
    fireEvent.keyDown(row('First'), { key: 'ArrowLeft' });
    fireEvent.keyDown(row('wrap'), { key: 'ArrowUp' });
    expect(row('Inner')).toBeTruthy();
    fireEvent.keyDown(row('wrap'), { key: 'ArrowLeft' });
    fireEvent.keyDown(row('wrap'), { key: 'ArrowLeft' });
    expect(screen.queryByRole('button', { name: 'Inner' })).toBeNull();
  });

  it('reveals a selection arriving from another surface', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const { rerender } = draw();
    fireEvent.keyDown(row('wrap'), { key: 'ArrowLeft' });
    expect(screen.queryByRole('button', { name: 'Inner' })).toBeNull();
    rerender(
      <I18nProvider locale="en">
        <LayerTree
          view={VIEW}
          selection="sections.body.items[2].items[0]"
          onSelect={vi.fn()}
          apply={vi.fn((_op: Op): OpResult => ({ ok: true }))}
          onOpenDocument={vi.fn()}
        />
      </I18nProvider>,
    );
    expect(row('Inner')).toBeTruthy();
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it('moves a row up with Alt+ArrowUp and keeps the selection on it', () => {
    const { onSelect, apply } = draw();
    fireEvent.keyDown(row('Second'), { key: 'ArrowUp', altKey: true });
    expect(apply).toHaveBeenCalledWith({
      op: 'moveItem',
      path: 'sections.body.items',
      from: 1,
      to: 0,
    });
    expect(onSelect).toHaveBeenCalledWith('sections.body.items[0]');
  });

  it('moves a row down with Alt+ArrowDown', () => {
    const { apply } = draw();
    fireEvent.keyDown(row('First'), { key: 'ArrowDown', altKey: true });
    expect(apply).toHaveBeenCalledWith({
      op: 'moveItem',
      path: 'sections.body.items',
      from: 0,
      to: 1,
    });
  });

  it('does not emit a move above the first row or on a section row', () => {
    const { apply } = draw();
    fireEvent.keyDown(row('First'), { key: 'ArrowUp', altKey: true });
    fireEvent.keyDown(row('Body'), { key: 'ArrowUp', altKey: true });
    expect(apply).not.toHaveBeenCalled();
  });

  it('leaves the selection alone when the op layer rejects a move', () => {
    const apply = vi.fn(
      (_op: Op): OpResult => ({
        ok: false,
        error: { code: 'index_out_of_range', message: 'out of range' },
      }),
    );
    const { onSelect } = draw({ apply });
    fireEvent.keyDown(row('Inner'), { key: 'ArrowDown', altKey: true });
    expect(apply).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('drag-reorders within the parent sequence as one moveItem', () => {
    const { onSelect, apply } = draw();
    stackRows(['First', 'Second', 'wrap']);
    startDrag('First');
    fireEvent.pointerMove(row('First'), { pointerId: 1, clientY: 58, isPrimary: true });
    expect(document.querySelector('.sj-tree-row--drop-after')).not.toBeNull();
    expect(document.querySelector('.sj-tree-row--dragging')).not.toBeNull();
    fireEvent.pointerUp(row('First'), { pointerId: 1, clientY: 58 });
    expect(apply).toHaveBeenCalledWith({
      op: 'moveItem',
      path: 'sections.body.items',
      from: 0,
      to: 2,
    });
    expect(onSelect).toHaveBeenCalledWith('sections.body.items[2]');
    // The drag swallowed the click that follows the pointer sequence.
    fireEvent.click(row('First'));
    expect(onSelect).not.toHaveBeenCalledWith('sections.body.items[0]');
  });

  it('shows the before-line on the row under the active slot', () => {
    draw();
    stackRows(['First', 'Second', 'wrap']);
    startDrag('wrap');
    fireEvent.pointerMove(row('wrap'), { pointerId: 1, clientY: 2, isPrimary: true });
    const marked = document.querySelector('.sj-tree-row--drop-before');
    expect(marked?.textContent).toContain('First');
  });

  it('treats a drop back onto the origin slot as no edit', () => {
    const { apply } = draw();
    stackRows(['First', 'Second', 'wrap']);
    startDrag('Second');
    fireEvent.pointerMove(row('Second'), { pointerId: 1, clientY: 30, isPrimary: true });
    fireEvent.pointerUp(row('Second'), { pointerId: 1, clientY: 30 });
    expect(apply).not.toHaveBeenCalled();
  });

  it('stays a click below the drag threshold', () => {
    const { onSelect, apply } = draw();
    stackRows(['First', 'Second', 'wrap']);
    startDrag('First');
    fireEvent.pointerMove(row('First'), { pointerId: 1, clientY: 11, isPrimary: true });
    fireEvent.pointerUp(row('First'), { pointerId: 1, clientY: 11 });
    fireEvent.click(row('First'));
    expect(apply).not.toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith('sections.body.items[0]');
  });

  it('cancels an active drag on Escape without touching the selection', () => {
    const { onSelect, apply } = draw();
    const outer = vi.fn();
    window.addEventListener('keydown', outer);
    stackRows(['First', 'Second', 'wrap']);
    startDrag('First');
    fireEvent.pointerMove(row('First'), { pointerId: 1, clientY: 45, isPrimary: true });
    fireEvent.keyDown(row('First'), { key: 'Escape' });
    // The capture-phase cancel stopped the Designer-level bubble listener.
    expect(outer).not.toHaveBeenCalled();
    fireEvent.pointerUp(row('First'), { pointerId: 1, clientY: 45 });
    expect(apply).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
    window.removeEventListener('keydown', outer);
  });

  it('keeps a drag inside its own parent even when the pointer leaves it', () => {
    const { apply } = draw();
    row('Title').getBoundingClientRect = () => ({ top: 0, height: 20 }) as DOMRect;
    startDrag('Title');
    fireEvent.pointerMove(row('Title'), { pointerId: 1, clientY: 300, isPrimary: true });
    fireEvent.pointerUp(row('Title'), { pointerId: 1, clientY: 300 });
    // The only header row's slots collapse to its own position: no op, and
    // never a reparent into the body rows the pointer crossed.
    expect(apply).not.toHaveBeenCalled();
  });

  it('captures the pointer when the platform supports it', () => {
    const { apply } = draw();
    stackRows(['First', 'Second', 'wrap']);
    const capture = vi.fn();
    row('First').setPointerCapture = capture;
    startDrag('First');
    expect(capture).toHaveBeenCalledWith(1);
    fireEvent.pointerUp(row('First'), { pointerId: 1, clientY: 10 });
    expect(apply).not.toHaveBeenCalled();
  });

  it('never starts a drag from a section row', () => {
    const { apply } = draw();
    fireEvent.pointerDown(row('Body'), { pointerId: 1, clientY: 10, isPrimary: true });
    fireEvent.pointerMove(row('Body'), { pointerId: 1, clientY: 90, isPrimary: true });
    fireEvent.pointerUp(row('Body'), { pointerId: 1, clientY: 90 });
    expect(apply).not.toHaveBeenCalled();
    expect(document.querySelector('.sj-tree-row--dragging')).toBeNull();
  });

  it('ignores non-Escape keys while dragging', () => {
    const { apply } = draw();
    stackRows(['First', 'Second', 'wrap']);
    startDrag('First');
    fireEvent.pointerMove(row('First'), { pointerId: 1, clientY: 45, isPrimary: true });
    fireEvent.keyDown(row('First'), { key: 'a' });
    expect(document.querySelector('.sj-tree-row--dragging')).not.toBeNull();
    fireEvent.pointerUp(row('First'), { pointerId: 1, clientY: 45 });
    expect(apply).toHaveBeenCalled();
  });

  it('ignores non-primary presses, foreign pointer ids, and pointer cancel', () => {
    const { apply } = draw();
    stackRows(['First', 'Second', 'wrap']);
    fireEvent.pointerDown(row('First'), { pointerId: 1, clientY: 10, isPrimary: false });
    fireEvent.pointerMove(row('First'), { pointerId: 1, clientY: 58, isPrimary: false });
    fireEvent.pointerUp(row('First'), { pointerId: 1, clientY: 58 });
    expect(apply).not.toHaveBeenCalled();
    startDrag('First', 2);
    fireEvent.pointerMove(row('First'), { pointerId: 9, clientY: 58 });
    fireEvent.pointerUp(row('First'), { pointerId: 9, clientY: 58 });
    fireEvent.pointerCancel(row('First'), { pointerId: 2 });
    fireEvent.pointerUp(row('First'), { pointerId: 2, clientY: 58 });
    expect(apply).not.toHaveBeenCalled();
  });

  it('shows the empty state for a null or empty view', () => {
    draw({ view: null });
    expect(screen.getByText('No items to show.')).toBeTruthy();
  });

  it('shows the truncation notice when the walk was cut short', () => {
    const roots = VIEW?.roots ?? [];
    draw({ view: { roots, truncated: true } });
    expect(screen.getByText('Large document — some items are hidden.')).toBeTruthy();
  });

  it('renders hostile template strings as inert text', () => {
    const hostile = buildTree(
      [
        'sections:',
        '  body:',
        '    type: flow',
        '    items:',
        '      - type: text',
        '        text: "<img src=x onerror=alert(1)>"',
        '',
      ].join('\n'),
    );
    const { container } = draw({ view: hostile });
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
  });

  it('right-click selects the row and reports the pointer position (native menu suppressed)', () => {
    const onSelect = vi.fn();
    const onContextMenu = vi.fn();
    render(
      <I18nProvider locale="en">
        <LayerTree
          view={VIEW}
          selection={null}
          onSelect={onSelect}
          apply={vi.fn((_op: Op): OpResult => ({ ok: true }))}
          onContextMenu={onContextMenu}
          onOpenDocument={vi.fn()}
        />
      </I18nProvider>,
    );
    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 33,
      clientY: 44,
    });
    row('First').dispatchEvent(event);
    expect(onSelect).toHaveBeenCalledWith('sections.body.items[0]');
    expect(onContextMenu).toHaveBeenCalledWith('sections.body.items[0]', 33, 44);
    expect(event.defaultPrevented).toBe(true);
  });
});

describe('LayerTree — the 全体 document root row', () => {
  it('renders the fixed root row with a populated view', () => {
    draw();
    expect(row('Document')).toBeTruthy();
  });

  it('renders the root row even when the view is null (blank-start reachable)', () => {
    draw({ view: null });
    expect(row('Document')).toBeTruthy();
    // The tree body still shows its empty state alongside the row.
    expect(screen.getByText('No items to show.')).toBeTruthy();
  });

  it('renders the root row when the view has no roots (empty document)', () => {
    draw({ view: { roots: [], truncated: false } });
    expect(row('Document')).toBeTruthy();
  });

  it('marks the root row active (aria-current) exactly when nothing is selected', () => {
    draw({ selection: null });
    expect(row('Document').getAttribute('aria-current')).toBe('true');
  });

  it('drops aria-current on the root row when an item is selected', () => {
    draw({ selection: 'sections.body.items[0]' });
    expect(row('Document').getAttribute('aria-current')).toBeNull();
  });

  it('opens the document view on click', () => {
    const { onOpenDocument } = draw();
    fireEvent.click(row('Document'));
    expect(onOpenDocument).toHaveBeenCalledTimes(1);
  });

  it('activates the root row from the keyboard (a plain button)', () => {
    const { onOpenDocument } = draw();
    const button = row('Document');
    // A native <button> fires click on Enter/Space; assert the element is a
    // focusable button (no custom key handling needed).
    expect(button.tagName).toBe('BUTTON');
    fireEvent.click(button);
    expect(onOpenDocument).toHaveBeenCalledTimes(1);
  });

  it('does not start a drag from the root row (it is not a tree row)', () => {
    const { apply } = draw();
    const button = row('Document');
    fireEvent.pointerDown(button, { pointerId: 9, clientY: 5, isPrimary: true });
    fireEvent.pointerMove(button, { pointerId: 9, clientY: 80 });
    fireEvent.pointerUp(button, { pointerId: 9, clientY: 80 });
    // No moveItem op — the row carries no drag handlers.
    expect(apply).not.toHaveBeenCalled();
  });

  it('has no context-menu handler on the root row', () => {
    const onContextMenu = vi.fn();
    render(
      <I18nProvider locale="en">
        <LayerTree
          view={VIEW}
          selection={null}
          onSelect={vi.fn()}
          apply={vi.fn((_op: Op): OpResult => ({ ok: true }))}
          onContextMenu={onContextMenu}
          onOpenDocument={vi.fn()}
        />
      </I18nProvider>,
    );
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    row('Document').dispatchEvent(event);
    expect(onContextMenu).not.toHaveBeenCalled();
    // Native menu not suppressed on the root row.
    expect(event.defaultPrevented).toBe(false);
  });
});
