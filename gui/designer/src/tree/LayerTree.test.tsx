import { type Op, type OpResult, parseTemplate, readTemplate } from '@shojiku/designer-core';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/context';
import { LayerTree } from './LayerTree';
import { buildTree, type TreeView } from './model';
import { ROW_INDENT_PX, visiblePaths } from './rowDrop';
import { breadcrumbChain } from './selection';

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

/** The same document the view was built from, as the drop model reads it —
 * `readNode` semantics over the parsed template. */
const PARSED = readTemplate(parseTemplate(TEMPLATE)) as Record<string, unknown>;
const DOC_READ = (path: string): unknown => {
  let node: unknown = PARSED;
  for (const segment of path.split(/\.|\[|\]\.?/).filter((part) => part !== '')) {
    if (node === null || typeof node !== 'object') {
      return undefined;
    }
    node = (node as Record<string, unknown>)[segment];
  }
  return node;
};

interface DrawOptions {
  readonly view?: TreeView | null;
  readonly selection?: string | null;
  readonly onSelect?: (path: string) => void;
  readonly applyAll?: (ops: readonly Op[]) => OpResult;
  readonly read?: (path: string) => unknown;
  readonly onOpenDocument?: () => void;
}

function draw(options: DrawOptions = {}) {
  const onSelect = options.onSelect ?? vi.fn();
  const applyAll = options.applyAll ?? vi.fn((_ops: readonly Op[]): OpResult => ({ ok: true }));
  const read = options.read ?? DOC_READ;
  const onOpenDocument = options.onOpenDocument ?? vi.fn();
  const view = options.view === undefined ? VIEW : options.view;
  const utils = render(
    <I18nProvider locale="en">
      <LayerTree
        view={view}
        selection={options.selection ?? null}
        onSelect={onSelect}
        applyAll={applyAll}
        read={read}
        onOpenDocument={onOpenDocument}
      />
    </I18nProvider>,
  );
  return { ...utils, onSelect, applyAll, read, onOpenDocument };
}

function row(name: string): HTMLElement {
  return screen.getByRole('button', { name });
}

/** Stub the WHOLE visible tree's geometry (jsdom has no layout): 20px rows
 * stacked in tree order, indented one `ROW_INDENT_PX` per nesting level. The
 * drag reads every visible row now, not just the dragged row's siblings, so a
 * partial stub would leave the rest at jsdom's all-zero rect. */
const LAYOUT: readonly (readonly [string, number])[] = [
  ['Header', 0],
  ['Title', 1],
  ['Body', 0],
  ['First', 1],
  ['Second', 1],
  ['wrap', 1],
  ['Inner', 2],
];

function stackRows(): void {
  LAYOUT.forEach(([name, level], index) => {
    row(name).getBoundingClientRect = () =>
      ({ top: index * 20, height: 20, left: level * ROW_INDENT_PX }) as DOMRect;
  });
}

function startDrag(name: string, pointerId = 1): void {
  fireEvent.pointerDown(row(name), { pointerId, clientY: 10, isPrimary: true });
}

/** Move the active drag to a row-stack y, at an x that names the indent level
 * the drop should be read at. */
function dragTo(name: string, clientY: number, level: number, pointerId = 1): void {
  fireEvent.pointerMove(row(name), {
    pointerId,
    clientY,
    clientX: level * ROW_INDENT_PX,
    isPrimary: true,
  });
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
          applyAll={vi.fn((_ops: readonly Op[]): OpResult => ({ ok: true }))}
          read={DOC_READ}
          onOpenDocument={vi.fn()}
        />
      </I18nProvider>,
    );
    expect(row('Inner')).toBeTruthy();
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it('moves a row up with Alt+ArrowUp and keeps the selection on it', () => {
    const { onSelect, applyAll } = draw();
    fireEvent.keyDown(row('Second'), { key: 'ArrowUp', altKey: true });
    expect(applyAll).toHaveBeenCalledWith([
      { op: 'moveItem', path: 'sections.body.items', from: 1, to: 0 },
    ]);
    expect(onSelect).toHaveBeenCalledWith('sections.body.items[0]');
  });

  it('moves a row down with Alt+ArrowDown', () => {
    const { applyAll } = draw();
    fireEvent.keyDown(row('First'), { key: 'ArrowDown', altKey: true });
    expect(applyAll).toHaveBeenCalledWith([
      { op: 'moveItem', path: 'sections.body.items', from: 0, to: 1 },
    ]);
  });

  it('does not emit a move above the first row or on a section row', () => {
    const { applyAll } = draw();
    fireEvent.keyDown(row('First'), { key: 'ArrowUp', altKey: true });
    fireEvent.keyDown(row('Body'), { key: 'ArrowUp', altKey: true });
    expect(applyAll).not.toHaveBeenCalled();
  });

  it('leaves the selection alone when the op layer rejects a move', () => {
    const applyAll = vi.fn(
      (_ops: readonly Op[]): OpResult => ({
        ok: false,
        error: { code: 'index_out_of_range', message: 'out of range' },
      }),
    );
    const { onSelect } = draw({ applyAll });
    fireEvent.keyDown(row('Inner'), { key: 'ArrowDown', altKey: true });
    expect(applyAll).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('drag-reorders within the parent sequence as one moveItem', () => {
    const { onSelect, applyAll } = draw();
    stackRows();
    startDrag('First');
    // Past the last row, at the OUTER indent: the shallow reading of that
    // gap, which is the body's own tail.
    dragTo('First', 135, 0);
    expect(document.querySelector('.sj-tree-row--drop-after')).not.toBeNull();
    expect(document.querySelector('.sj-tree-row--dragging')).not.toBeNull();
    fireEvent.pointerUp(row('First'), { pointerId: 1, clientY: 135 });
    expect(applyAll).toHaveBeenCalledWith([
      { op: 'moveItem', path: 'sections.body.items', from: 0, to: 2 },
    ]);
    expect(onSelect).toHaveBeenCalledWith('sections.body.items[2]');
    // The drag swallowed the click that follows the pointer sequence.
    fireEvent.click(row('First'));
    expect(onSelect).not.toHaveBeenCalledWith('sections.body.items[0]');
  });

  it('reads the SAME gap at the inner indent as a move INTO the container', () => {
    const { onSelect, applyAll } = draw();
    stackRows();
    startDrag('First');
    dragTo('First', 135, 2);
    fireEvent.pointerUp(row('First'), { pointerId: 1, clientY: 135 });
    expect(applyAll).toHaveBeenCalledWith([
      {
        op: 'moveItem',
        path: 'sections.body.items',
        from: 0,
        to: 1,
        toPath: 'sections.body.items[2].items',
      },
    ]);
    // Lifting items[0] out drops the container from items[2] to items[1].
    expect(onSelect).toHaveBeenCalledWith('sections.body.items[1].items[1]');
  });

  it('shows the before-line on the row under the active slot', () => {
    draw();
    stackRows();
    startDrag('wrap');
    // Between the body section row and its first item: the one reading is
    // "first item of the body".
    dragTo('wrap', 65, 1);
    const marked = document.querySelector('.sj-tree-row--drop-before');
    expect(marked?.textContent).toContain('First');
  });

  it('treats a drop back onto the origin slot as no edit', () => {
    const { applyAll } = draw();
    stackRows();
    startDrag('Second');
    dragTo('Second', 85, 1);
    fireEvent.pointerUp(row('Second'), { pointerId: 1, clientY: 85 });
    expect(applyAll).not.toHaveBeenCalled();
  });

  it('releases as a no-op where nothing can take the row', () => {
    const { onSelect, applyAll } = draw();
    stackRows();
    startDrag('First');
    // Above the first row there is no item list — the section root is not a
    // sequence entry — so the drag resolves to no drop at all.
    dragTo('First', -5, 0);
    expect(document.querySelector('.sj-tree-row--drop-before')).toBeNull();
    fireEvent.pointerUp(row('First'), { pointerId: 1, clientY: -5 });
    expect(applyAll).not.toHaveBeenCalled();
    // The drag still swallowed its trailing click.
    fireEvent.click(row('First'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('stays a click below the drag threshold', () => {
    const { onSelect, applyAll } = draw();
    stackRows();
    startDrag('First');
    dragTo('First', 11, 1);
    fireEvent.pointerUp(row('First'), { pointerId: 1, clientY: 11 });
    fireEvent.click(row('First'));
    expect(applyAll).not.toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith('sections.body.items[0]');
  });

  it('cancels an active drag on Escape without touching the selection', () => {
    const { onSelect, applyAll } = draw();
    const outer = vi.fn();
    window.addEventListener('keydown', outer);
    stackRows();
    startDrag('First');
    dragTo('First', 135, 0);
    fireEvent.keyDown(row('First'), { key: 'Escape' });
    // The capture-phase cancel stopped the Designer-level bubble listener.
    expect(outer).not.toHaveBeenCalled();
    fireEvent.pointerUp(row('First'), { pointerId: 1, clientY: 45 });
    expect(applyAll).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
    window.removeEventListener('keydown', outer);
  });

  it('carries a row OUT of the header band into a body container', () => {
    const { onSelect, applyAll } = draw();
    stackRows();
    startDrag('Title');
    dragTo('Title', 135, 2);
    fireEvent.pointerUp(row('Title'), { pointerId: 1, clientY: 135 });
    // The band item authors no coordinates, so nothing is cleared — the batch
    // is the move alone, and the tree passes no drop point.
    expect(applyAll).toHaveBeenCalledWith([
      {
        op: 'moveItem',
        path: 'sections.header.items',
        from: 0,
        to: 1,
        toPath: 'sections.body.items[2].items',
      },
    ]);
    expect(onSelect).toHaveBeenCalledWith('sections.body.items[2].items[1]');
  });

  it('captures the pointer when the platform supports it', () => {
    const { applyAll } = draw();
    stackRows();
    const capture = vi.fn();
    row('First').setPointerCapture = capture;
    startDrag('First');
    expect(capture).toHaveBeenCalledWith(1);
    fireEvent.pointerUp(row('First'), { pointerId: 1, clientY: 10 });
    expect(applyAll).not.toHaveBeenCalled();
  });

  it('never starts a drag from a section row', () => {
    const { applyAll } = draw();
    fireEvent.pointerDown(row('Body'), { pointerId: 1, clientY: 10, isPrimary: true });
    fireEvent.pointerMove(row('Body'), { pointerId: 1, clientY: 90, isPrimary: true });
    fireEvent.pointerUp(row('Body'), { pointerId: 1, clientY: 90 });
    expect(applyAll).not.toHaveBeenCalled();
    expect(document.querySelector('.sj-tree-row--dragging')).toBeNull();
  });

  it('ignores non-Escape keys while dragging', () => {
    const { applyAll } = draw();
    stackRows();
    startDrag('First');
    dragTo('First', 135, 0);
    fireEvent.keyDown(row('First'), { key: 'a' });
    expect(document.querySelector('.sj-tree-row--dragging')).not.toBeNull();
    fireEvent.pointerUp(row('First'), { pointerId: 1, clientY: 135 });
    expect(applyAll).toHaveBeenCalled();
  });

  it('ignores non-primary presses, foreign pointer ids, and pointer cancel', () => {
    const { applyAll } = draw();
    stackRows();
    fireEvent.pointerDown(row('First'), { pointerId: 1, clientY: 10, isPrimary: false });
    fireEvent.pointerMove(row('First'), { pointerId: 1, clientY: 135, isPrimary: false });
    fireEvent.pointerUp(row('First'), { pointerId: 1, clientY: 135 });
    expect(applyAll).not.toHaveBeenCalled();
    startDrag('First', 2);
    fireEvent.pointerMove(row('First'), { pointerId: 9, clientY: 135 });
    fireEvent.pointerUp(row('First'), { pointerId: 9, clientY: 135 });
    fireEvent.pointerCancel(row('First'), { pointerId: 2 });
    fireEvent.pointerUp(row('First'), { pointerId: 2, clientY: 135 });
    expect(applyAll).not.toHaveBeenCalled();
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
          applyAll={vi.fn((_ops: readonly Op[]): OpResult => ({ ok: true }))}
          read={DOC_READ}
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
    const { applyAll } = draw();
    const button = row('Document');
    fireEvent.pointerDown(button, { pointerId: 9, clientY: 5, isPrimary: true });
    fireEvent.pointerMove(button, { pointerId: 9, clientY: 80 });
    fireEvent.pointerUp(button, { pointerId: 9, clientY: 80 });
    // No moveItem op — the row carries no drag handlers.
    expect(applyAll).not.toHaveBeenCalled();
  });

  it('has no context-menu handler on the root row', () => {
    const onContextMenu = vi.fn();
    render(
      <I18nProvider locale="en">
        <LayerTree
          view={VIEW}
          selection={null}
          onSelect={vi.fn()}
          applyAll={vi.fn((_ops: readonly Op[]): OpResult => ({ ok: true }))}
          read={DOC_READ}
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

describe('a conditionally shown item', () => {
  const CONDITIONAL = buildTree(
    [
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: text',
      '        text: Stamp',
      '        visible: { key: approved, collapse: true }',
      '      - type: text',
      '        text: Always',
    ].join('\n'),
  );

  it('carries a badge, so a row that highlights nothing on canvas is explained', () => {
    // A COLLAPSED item emits no placed box, so selecting its row highlights
    // nothing — without the badge that reads as a broken editor rather than
    // as the document doing what the data told it.
    draw({ view: CONDITIONAL });
    const marked = screen.getByRole('button', { name: /Stamp/ });
    expect(marked.textContent).toContain('if');
    const plain = screen.getByRole('button', { name: /Always/ });
    expect(plain.textContent).not.toContain('if');
  });

  it('explains the badge to a screen reader', () => {
    draw({ view: CONDITIONAL });
    expect(screen.getByText(/Shown only when the data matches/)).toBeTruthy();
  });
});

describe('LayerTree gesture hint', () => {
  const HINT = 'Drag rows to reorder or regroup.';

  // GD9 shipped cross-parent drag and a walkthrough found it BY ACCIDENT:
  // nothing on screen said a row could be dragged to change its owner, and no
  // `tree.*` or `sidebar.*` string mentioned dragging at all.
  it('says what a row can do', () => {
    draw();
    expect(screen.getByText(HINT)).toBeTruthy();
  });

  // The horizontal half of the gesture is the part the walkthrough could not
  // guess, so it is the part the detail has to carry.
  it('explains regrouping and the keyboard chord behind its help hint', () => {
    draw();
    fireEvent.click(screen.getByRole('button', { name: 'Moving and regrouping layers' }));
    const body = screen.getByText(/drag it sideways/i);
    expect(body.textContent).toContain('into or out of a group');
    expect(body.textContent).toContain('Alt+↑');
  });

  it.each([
    ['a document with nothing in it', { roots: [], truncated: false }],
    ['no view at all', null],
  ])('says nothing about dragging for %s', (_case, view) => {
    draw({ view });
    expect(screen.queryByText(HINT)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Moving and regrouping layers' })).toBeNull();
  });

  // A BLANK document: one root (the body section) and nothing inside it.
  // Sections do not move, so nothing here can be dragged anywhere — a hint
  // would be describing a gesture that does nothing. Found by opening the
  // real app on the blank preset; the shipped fixtures all have items.
  it('says nothing while the only rows are sections with nothing in them', () => {
    const empty = VIEW?.roots.map((node) => ({ ...node, children: [] })) ?? [];
    draw({ view: { roots: empty, truncated: false } });
    expect(empty.length).toBeGreaterThan(0);
    expect(screen.queryByText(HINT)).toBeNull();
  });
});

describe('bands the document does not have', () => {
  const BODY_ONLY = 'sections:\n  body:\n    type: flow\n    items: []\n';

  /** The tree's rows, in the order they are rendered — the placeholders have
   * to land in `sections:` order, not merely be present somewhere. */
  function rowNames(): string[] {
    return screen
      .getAllByRole('button')
      .map((button) => button.textContent ?? '')
      .filter((text) => text !== '');
  }

  it('offers a placeholder for each absent band, in the slot it would occupy', () => {
    draw({ view: buildTree(BODY_ONLY) });
    const names = rowNames();
    const header = names.findIndex((name) => name.startsWith('Header'));
    const body = names.findIndex((name) => name.startsWith('Body'));
    const footer = names.findIndex((name) => name.startsWith('Footer'));
    expect(header).toBeGreaterThanOrEqual(0);
    expect(header).toBeLessThan(body);
    expect(body).toBeLessThan(footer);
  });

  it('says the band has nothing in it rather than naming an action', () => {
    draw({ view: buildTree(BODY_ONLY) });
    expect(screen.getAllByText('Nothing in it yet')).toHaveLength(2);
  });

  it('shows no placeholder for a band the document already authors', () => {
    // The fixture has a header and no footer.
    draw();
    expect(screen.getAllByText('Nothing in it yet')).toHaveLength(1);
  });

  it('creates the band as ONE op and selects it', () => {
    const { applyAll, onSelect } = draw({ view: buildTree(BODY_ONLY), read: () => undefined });
    fireEvent.click(screen.getByRole('button', { name: /^Footer/ }));
    expect(applyAll).toHaveBeenCalledWith([
      {
        op: 'putValue',
        keys: ['sections', 'footer'],
        value: { repeat: 'every_page', height: 40, items: [] },
      },
    ]);
    expect(onSelect).toHaveBeenCalledWith('sections.footer');
  });

  it('is CHROME, not a node: a placeholder never joins the drag-hint count', () => {
    // One movable item and two placeholders. The hint promises reordering and
    // regrouping, so a single item must not light it up just because two extra
    // rows are on screen.
    const oneItem =
      'sections:\n  body:\n    type: flow\n    items:\n      - type: text\n        text: Only\n';
    draw({ view: buildTree(oneItem) });
    expect(screen.getAllByText('Nothing in it yet')).toHaveLength(2);
    expect(screen.queryByText('Drag rows to reorder or regroup.')).toBeNull();
  });

  it('is CHROME, not a node: a placeholder is in no structural walk', () => {
    // The three walks a fake `TreeNode` would have leaked into.
    const view = buildTree(BODY_ONLY);
    expect(visiblePaths(view, new Set())).toEqual(['sections.body']);
    expect(breadcrumbChain(view, 'sections.footer')).toEqual([]);
    expect(view?.roots.map((node) => node.path)).toEqual(['sections.body']);
  });

  it('offers no placeholder over an empty or unreadable tree', () => {
    draw({ view: null });
    expect(screen.queryByText('Nothing in it yet')).toBeNull();
  });
});
