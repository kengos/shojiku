import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { EditorController } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import type { PaletteGroup } from '../palette/model';
import { TableColumnSheet } from './TableColumnSheet';

const TABLE = 'sections.body.items[0]';
const COLUMNS = `${TABLE}.columns`;

const GROUPS: readonly PaletteGroup[] = [
  {
    id: 'rows',
    label: '明細',
    description: '',
    isArray: true,
    fields: [
      { key: 'name', label: '品名', type: 'string', description: '', sample: 'A', enumOptions: [] },
      { key: 'qty', label: '数量', type: 'number', description: '', sample: '1', enumOptions: [] },
    ],
  },
];

// A bound column, a `cell:` sub-template column, a bound column with a width +
// format, an unbound (key '') non-cell column, and a hostile scalar entry — the
// index-true posture must survive all of them.
const TABLE_NODE = {
  type: 'table',
  data: { key: 'rows' },
  columns: [
    { label: '品名', data: { key: 'name' } },
    { label: '明細', cell: { items: [] } },
    { label: '数量', data: { key: 'qty', format: 'quantity' }, width: 40 },
    { label: '空' },
    7,
  ],
};

const PARAMS = '{"rows": [{"name": "アルパカ社", "qty": 3}]}';

/** The real `Editor.read` answers ANY structural path, and a column's cascade is
 * read at its own (`…columns[n]`). A stub answering only the table's would make
 * every column read as empty — a fixture limitation the panel would then be
 * blamed for. Drill the fixture the same way. */
function readAt(node: unknown, path: string): unknown {
  if (!path.startsWith(TABLE)) {
    return undefined;
  }
  let cursor: unknown = node;
  for (const step of path
    .slice(TABLE.length)
    .split(/[.[\]]/)
    .filter((s) => s !== '')) {
    if (typeof cursor !== 'object' || cursor === null) {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[step];
  }
  return cursor;
}

function makeController(node: unknown): EditorController {
  return {
    text: '',
    revision: 0,
    selection: null,
    canUndo: false,
    canRedo: false,
    apply: vi.fn(() => ({ ok: true as const })),
    applyAll: vi.fn(() => ({ ok: true as const })),
    read: (path: string) => readAt(node, path),
    undo: vi.fn(),
    redo: vi.fn(),
    select: vi.fn(),
    clearSelection: vi.fn(),
    setMaxBytes: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    replaceDocument: vi.fn(),
  };
}

function draw(node: ReactElement) {
  return render(<I18nProvider locale="en">{node}</I18nProvider>);
}

function sheet(controller: EditorController, dataKey = 'rows') {
  return draw(
    <TableColumnSheet
      controller={controller}
      tablePath={TABLE}
      dataKey={dataKey}
      groups={GROUPS}
      params={PARAMS}
    />,
  );
}

/** Header handles, left→right, each given a 160px slot for the slot math. */
function headers(): HTMLElement[] {
  const hs = screen.getAllByLabelText('Reorder (drag, or Alt+Arrow)');
  hs.forEach((h, index) => {
    h.getBoundingClientRect = () => ({ left: index * 160, width: 160 }) as DOMRect;
  });
  return hs;
}

describe('TableColumnSheet', () => {
  it('renders one strip per column — hostile entry included — with a sample row', () => {
    const { container } = sheet(makeController(TABLE_NODE));
    const labels = screen.getAllByLabelText('Column label') as HTMLInputElement[];
    expect(labels.map((i) => i.value)).toEqual(['品名', '明細', '数量', '空', '']);
    // Data-key pickers only on the non-cell columns (品名/数量/空/hostile = 4).
    expect(screen.getAllByLabelText('Data key')).toHaveLength(4);
    // Sample row: bound columns sample the first row; cell/unbound are blank.
    const samples = Array.from(container.querySelectorAll('output')).map((o) => o.textContent);
    expect(samples).toEqual(['アルパカ社', '', '3', '', '']);
  });

  it('shows the empty note when the table carries no columns array', () => {
    // No `columns` key → readColumnsView returns null → the `?? []` fallback.
    sheet(makeController({ type: 'table' }));
    expect(screen.getByText('This table has no columns yet.')).toBeTruthy();
  });

  it('edits a label with one setScalar; an unchanged blur dispatches nothing', () => {
    const controller = makeController(TABLE_NODE);
    sheet(controller);
    const labels = screen.getAllByLabelText('Column label');
    fireEvent.blur(labels[0], { target: { value: '品目' } });
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: `${COLUMNS}[0]`,
      keys: ['label'],
      value: '品目',
    });
    fireEvent.blur(labels[2], { target: { value: '数量' } });
    expect(controller.apply).toHaveBeenCalledTimes(1);
  });

  it('an unchanged width blur dispatches nothing (tab-through safe)', () => {
    const controller = makeController(TABLE_NODE);
    sheet(controller);
    fireEvent.blur(screen.getAllByLabelText('Column width')[2], { target: { value: '40' } });
    expect(controller.apply).not.toHaveBeenCalled();
  });

  it('edits a width and a binding and a format through their controls', () => {
    const controller = makeController(TABLE_NODE);
    sheet(controller);
    fireEvent.blur(screen.getAllByLabelText('Column width')[2], { target: { value: '60' } });
    expect(controller.apply).toHaveBeenCalledWith(
      expect.objectContaining({ op: 'setScalar', path: `${COLUMNS}[2]`, keys: ['width'] }),
    );
    fireEvent.blur(screen.getAllByLabelText('Data key')[0], { target: { value: 'qty' } });
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: `${COLUMNS}[0]`,
      keys: ['data', 'key'],
      value: 'qty',
    });
    fireEvent.blur(screen.getAllByLabelText('Format')[1], { target: { value: 'currency' } });
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: `${COLUMNS}[2]`,
      keys: ['data', 'format'],
      value: 'currency',
    });
  });

  it('hides the format control on cell and unbound columns', () => {
    sheet(makeController(TABLE_NODE));
    // Formats: only the bound non-cell columns (品名 has no format yet, 数量 has
    // one) — [0] and [2]. The cell column and the unbound/hostile columns hide it.
    expect(screen.getAllByLabelText('Format')).toHaveLength(2);
  });

  it('formats sample values by type and clips a long one', () => {
    const node = {
      type: 'table',
      data: { key: 'rows' },
      columns: [
        { label: 'b', data: { key: 'flag' } },
        { label: 'o', data: { key: 'obj' } },
        { label: 'n', data: { key: 'nul' } },
        { label: 'long', data: { key: 'big' } },
        { label: 'miss', data: { key: 'absent' } },
      ],
    };
    const big = 'x'.repeat(120);
    const params = JSON.stringify({ rows: [{ flag: true, obj: { a: 1 }, nul: null, big }] });
    const { container } = draw(
      <TableColumnSheet
        controller={makeController(node)}
        tablePath={TABLE}
        dataKey="rows"
        groups={GROUPS}
        params={params}
      />,
    );
    const samples = Array.from(container.querySelectorAll('output')).map((o) => o.textContent);
    // boolean → 'true'; object → bounded JSON; null → blank; long → clipped to
    // 80 + ellipsis; a key absent from the row → blank (undefined).
    expect(samples).toEqual(['true', '{"a":1}', '', `${'x'.repeat(80)}…`, '']);
  });

  it('never resolves a hostile __proto__ column key through the prototype chain', () => {
    const node = {
      type: 'table',
      data: { key: 'rows' },
      columns: [{ label: 'p', data: { key: '__proto__' } }],
    };
    const { container } = draw(
      <TableColumnSheet
        controller={makeController(node)}
        tablePath={TABLE}
        dataKey="rows"
        groups={GROUPS}
        params='{"rows": [{}]}'
      />,
    );
    // sampleValueFor is own-property guarded — a `__proto__` key reads as
    // absent (blank), never Object.prototype.
    expect(container.querySelector('output')?.textContent).toBe('');
  });

  it('has no row fields nor samples for an unbound table', () => {
    const { container } = sheet(makeController(TABLE_NODE), '');
    // Unbound table → no row scope → every sample cell is blank.
    expect(
      Array.from(container.querySelectorAll('output')).every((o) => o.textContent === ''),
    ).toBe(true);
  });

  it('reorders by dragging a header — ONE moveItem with the post-splice index', () => {
    const controller = makeController(TABLE_NODE);
    sheet(controller);
    const hs = headers();
    hs[0].setPointerCapture = vi.fn();
    fireEvent.pointerDown(hs[0], { pointerId: 1, clientX: 0, isPrimary: true });
    // A foreign pointer DURING the active drag is ignored by both move and up.
    fireEvent.pointerMove(hs[0], { pointerId: 9, clientX: 900 });
    fireEvent.pointerUp(hs[0], { pointerId: 9, clientX: 900 });
    fireEvent.pointerMove(hs[0], { pointerId: 1, clientX: 900, isPrimary: true });
    fireEvent.pointerUp(hs[0], { pointerId: 1, clientX: 900 });
    expect(hs[0].setPointerCapture).toHaveBeenCalledWith(1);
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'moveItem',
      path: COLUMNS,
      from: 0,
      to: 4,
    });
  });

  it('dispatches nothing when a drag lands where the column already is', () => {
    const controller = makeController(TABLE_NODE);
    sheet(controller);
    const hs = headers();
    fireEvent.pointerDown(hs[0], { pointerId: 1, clientX: 0, isPrimary: true });
    // Past the threshold but still inside slot 0/1 → to === from → no op.
    fireEvent.pointerMove(hs[0], { pointerId: 1, clientX: 90, isPrimary: true });
    fireEvent.pointerUp(hs[0], { pointerId: 1, clientX: 90 });
    expect(controller.apply).not.toHaveBeenCalled();
  });

  it('does not reorder on a sub-threshold press, a non-primary press, or a foreign pointer', () => {
    const controller = makeController(TABLE_NODE);
    sheet(controller);
    const hs = headers();
    // Sub-threshold move → never started.
    fireEvent.pointerDown(hs[0], { pointerId: 1, clientX: 0, isPrimary: true });
    fireEvent.pointerMove(hs[0], { pointerId: 1, clientX: 2, isPrimary: true });
    fireEvent.pointerUp(hs[0], { pointerId: 1, clientX: 2 });
    // A foreign pointer id is ignored; a stray move/up with no active drag is inert.
    fireEvent.pointerMove(hs[1], { pointerId: 9, clientX: 500 });
    fireEvent.pointerUp(hs[1], { pointerId: 9, clientX: 500 });
    // A non-primary press never begins a drag.
    fireEvent.pointerDown(hs[1], { pointerId: 2, clientX: 0, isPrimary: false });
    fireEvent.pointerMove(hs[1], { pointerId: 2, clientX: 500, isPrimary: false });
    fireEvent.pointerUp(hs[1], { pointerId: 2, clientX: 500 });
    expect(controller.apply).not.toHaveBeenCalled();
  });

  it('reorders by keyboard: Alt+Arrow moves one slot, boundaries and plain arrows inert', () => {
    const controller = makeController(TABLE_NODE);
    sheet(controller);
    const hs = screen.getAllByLabelText('Reorder (drag, or Alt+Arrow)');
    fireEvent.keyDown(hs[0], { key: 'ArrowRight', altKey: true });
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'moveItem',
      path: COLUMNS,
      from: 0,
      to: 1,
    });
    (controller.apply as ReturnType<typeof vi.fn>).mockClear();
    // Left at the first column and right at the last are boundary no-ops; a
    // plain (no-Alt) arrow and a non-horizontal Alt+Arrow are inert.
    fireEvent.keyDown(hs[0], { key: 'ArrowLeft', altKey: true });
    fireEvent.keyDown(hs[4], { key: 'ArrowRight', altKey: true });
    fireEvent.keyDown(hs[0], { key: 'ArrowRight' });
    fireEvent.keyDown(hs[0], { key: 'ArrowUp', altKey: true });
    expect(controller.apply).not.toHaveBeenCalled();
  });
});

describe('TableColumnSheet — binding scope', () => {
  it('offers the document section per column strip and authors the scope', () => {
    const controller = makeController({
      type: 'table',
      data: { key: 'rows' },
      columns: [{ label: '品名', data: { key: 'name' } }],
    });
    const groups: readonly PaletteGroup[] = [
      ...GROUPS,
      {
        id: 'store',
        label: '店舗',
        description: '',
        isArray: false,
        fields: [
          {
            key: 'store.name',
            label: '店舗名',
            type: 'string',
            description: '',
            sample: '本店',
            enumOptions: [],
          },
        ],
      },
    ];
    draw(
      <TableColumnSheet
        controller={controller}
        tablePath={TABLE}
        dataKey="rows"
        groups={groups}
        params="{}"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    expect(screen.getByText('Document data')).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: /店舗名/ }));
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'setScalar', path: `${TABLE}.columns[0]`, keys: ['data', 'key'], value: 'store.name' },
      { op: 'setScalar', path: `${TABLE}.columns[0]`, keys: ['data', 'scope'], value: 'document' },
    ]);
  });

  it('hides the document section without `binding.scope`, keeping the badge', () => {
    const controller = makeController({
      type: 'table',
      data: { key: 'rows' },
      columns: [{ label: '店舗名', data: { key: 'store.name', scope: 'document' } }],
    });
    draw(
      <TableColumnSheet
        controller={controller}
        tablePath={TABLE}
        dataKey="rows"
        groups={GROUPS}
        params="{}"
        capabilities={['other.capability']}
      />,
    );
    expect(screen.getByText('Document')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    expect(screen.queryByText('Document data')).toBeNull();
  });
});

describe('TableColumnSheet — per-column alignment', () => {
  it('renders one alignment control per column, seeded from the wire', () => {
    sheet(
      makeController({
        ...TABLE_NODE,
        columns: [
          { label: '品名', data: { key: 'name' } },
          { label: '金額', data: { key: 'qty' }, style: { textAlign: 'right' } },
        ],
      }),
    );
    const groups = screen.getAllByRole('group', { name: 'Text alignment' });
    expect(groups).toHaveLength(2);
    const picked = screen
      .getAllByRole<HTMLInputElement>('radio', { name: 'Right' })
      .map((radio) => radio.checked);
    expect(picked).toEqual([false, true]);
  });

  // The sheet and the single-column form edit the SAME key; showing different
  // active options in the two would be the panel contradicting itself rather
  // than the document.
  it('shows what a column RENDERS with, not only what it authors', () => {
    sheet(
      makeController({
        ...TABLE_NODE,
        row: { style: { textAlign: 'right' } },
        columns: [{ label: '品名', data: { key: 'name' } }],
      }),
    );
    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'Right' }).checked).toBe(true);
  });

  it('reverts an own key when the pick matches what the row band supplies', () => {
    const controller = makeController({
      ...TABLE_NODE,
      row: { style: { textAlign: 'right' } },
      columns: [{ label: '品名', data: { key: 'name' }, style: { textAlign: 'center' } }],
    });
    sheet(controller);
    fireEvent.click(screen.getByRole('radio', { name: 'Right' }));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'removeKey',
      path: `${COLUMNS}[0]`,
      keys: ['style', 'textAlign'],
    });
  });

  it('authors the pick at THAT column’s style, leaving its siblings alone', () => {
    const controller = makeController({
      ...TABLE_NODE,
      columns: [
        { label: '品名', data: { key: 'name' } },
        { label: '金額', data: { key: 'qty' } },
      ],
    });
    sheet(controller);
    fireEvent.click(screen.getAllByRole('radio', { name: 'Right' })[1]);
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: `${COLUMNS}[1]`,
      keys: ['style', 'textAlign'],
      value: 'right',
    });
  });

  it('draws the sample row under the alignment it is showing', () => {
    // The sheet's job is comparing columns; the existing sample row doubles as
    // the preview of the row above it, which is why alignment belongs here.
    const { container } = sheet(
      makeController({
        ...TABLE_NODE,
        columns: [
          { label: '品名', data: { key: 'name' } },
          { label: '数量', data: { key: 'qty' }, style: { textAlign: 'right' } },
        ],
      }),
    );
    const samples = Array.from(container.querySelectorAll('output'));
    expect(samples[0].style.textAlign).toBe('');
    expect(samples[1].style.textAlign).toBe('right');
  });

  it('ignores an alignment keyword the engine does not have', () => {
    // `TextAlign` is three keywords; a document carrying `justify` (or anything
    // else) must not reach the DOM as a style.
    const { container } = sheet(
      makeController({
        ...TABLE_NODE,
        columns: [{ label: '品名', data: { key: 'name' }, style: { textAlign: 'justify' } }],
      }),
    );
    expect(container.querySelector('output')?.style.textAlign).toBe('');
  });
});
