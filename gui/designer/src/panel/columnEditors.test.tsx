import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { EditorController } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import type { PaletteGroup } from '../palette/model';
import { FORMAT_CATALOG } from '../testkit/formatCatalog';
import { swatchLabel } from '../testkit/swatchLabel';
import { unitHintsFor } from '../testkit/unitHint';
import { ColumnForm } from './ColumnForm';
import { IterableSourceSection } from './IterableSourceSection';
import { TableColumnsSection } from './TableColumnsSection';

const TABLE = 'sections.body.items[0]';

const GROUPS: readonly PaletteGroup[] = [
  {
    id: 'rows',
    label: '明細',
    description: '',
    isArray: true,
    fields: [
      {
        key: 'name',
        label: '品名',
        type: 'string',
        description: '',
        sample: 'Sample name',
        enumOptions: [],
      },
      {
        key: 'amount',
        label: '金額',
        type: 'currency',
        description: '',
        sample: '¥300,000',
        enumOptions: [],
      },
    ],
  },
  { id: 'order', label: '注文', description: '', isArray: false, fields: [] },
  // A label-less array group: the source picker's option label falls back to
  // the id.
  { id: 'tags', label: '', description: '', isArray: true, fields: [] },
];

const TABLE_NODE = {
  type: 'table',
  data: { key: 'rows' },
  columns: [{ label: '品名', data: { key: 'name' } }, { label: '明細', cell: { items: [] } }, 3],
};

function makeController(reads: Record<string, unknown>): EditorController {
  return {
    text: '',
    revision: 0,
    selection: null,
    canUndo: false,
    canRedo: false,
    apply: vi.fn(() => ({ ok: true as const })),
    applyAll: vi.fn(() => ({ ok: true as const })),
    read: (path: string) => reads[path],
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

function section(controller: EditorController) {
  return draw(
    <TableColumnsSection
      controller={controller}
      tablePath={TABLE}
      dataKey="rows"
      dataScope=""
      groups={GROUPS}
      params='{"rows": [{"name": "live"}]}'
    />,
  );
}

describe('TableColumnsSection', () => {
  it('renders one row per column — hostile non-map entries included — hiding the picker on cell columns', () => {
    const controller = makeController({ [TABLE]: TABLE_NODE });
    section(controller);
    const labels = screen.getAllByLabelText('Column label') as HTMLInputElement[];
    expect(labels.map((input) => input.value)).toEqual(['品名', '明細', '']);
    // The source picker + a picker per non-cell row (the hostile scalar entry
    // included — its edits are typed refusals at the op layer); the cell
    // column alone hides the binding editor.
    expect(screen.getAllByLabelText('Data key')).toHaveLength(3);
  });

  it('edits a column label with one setScalar at the column path', () => {
    const controller = makeController({ [TABLE]: TABLE_NODE });
    section(controller);
    const label = screen.getAllByLabelText('Column label')[0];
    fireEvent.blur(label, { target: { value: '品目' } });
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: `${TABLE}.columns[0]`,
      keys: ['label'],
      value: '品目',
    });
  });

  it('does not dispatch on an unchanged label blur (tab-through safe)', () => {
    const controller = makeController({ [TABLE]: TABLE_NODE });
    section(controller);
    fireEvent.blur(screen.getAllByLabelText('Column label')[0], { target: { value: '品名' } });
    expect(controller.apply).not.toHaveBeenCalled();
  });

  it('rebinds the table source and a column key through the pickers (one op each)', () => {
    const controller = makeController({ [TABLE]: TABLE_NODE });
    section(controller);
    const pickers = screen.getAllByLabelText('Data key') as HTMLInputElement[];
    fireEvent.blur(pickers[0], { target: { value: 'order_lines' } });
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: TABLE,
      keys: ['data', 'key'],
      value: 'order_lines',
    });
    fireEvent.blur(pickers[1], { target: { value: 'quantity' } });
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: `${TABLE}.columns[0]`,
      keys: ['data', 'key'],
      value: 'quantity',
    });
  });

  it('adds a label-only column at the end with the localized default', () => {
    const controller = makeController({ [TABLE]: TABLE_NODE });
    section(controller);
    fireEvent.click(screen.getByRole('button', { name: 'Add column' }));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'insertItem',
      path: `${TABLE}.columns`,
      index: 3,
      value: { label: 'New column' },
    });
  });

  it('removes a column with one removeItem', () => {
    const controller = makeController({ [TABLE]: TABLE_NODE });
    section(controller);
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete column' })[1]);
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'removeItem',
      path: `${TABLE}.columns`,
      index: 1,
    });
  });

  it('reorders with one moveItem, disabling the boundary directions', () => {
    const controller = makeController({ [TABLE]: TABLE_NODE });
    section(controller);
    const ups = screen.getAllByRole('button', { name: 'Move column up' }) as HTMLButtonElement[];
    const downs = screen.getAllByRole('button', {
      name: 'Move column down',
    }) as HTMLButtonElement[];
    expect(ups[0].disabled).toBe(true);
    expect(downs[2].disabled).toBe(true);
    fireEvent.click(ups[1]);
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'moveItem',
      path: `${TABLE}.columns`,
      from: 1,
      to: 0,
    });
    fireEvent.click(downs[1]);
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'moveItem',
      path: `${TABLE}.columns`,
      from: 1,
      to: 2,
    });
  });

  it('shows a sheet opener only when the handler is supplied', () => {
    const controller = makeController({ [TABLE]: TABLE_NODE });
    const onOpenSheet = vi.fn();
    const { rerender } = section(controller);
    expect(screen.queryByRole('button', { name: 'Edit in a sheet' })).toBeNull();
    rerender(
      <I18nProvider locale="en">
        <TableColumnsSection
          controller={controller}
          tablePath={TABLE}
          dataKey="rows"
          dataScope=""
          groups={GROUPS}
          params='{"rows": [{"name": "live"}]}'
          onOpenSheet={onOpenSheet}
        />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit in a sheet' }));
    expect(onOpenSheet).toHaveBeenCalledTimes(1);
  });

  it('offers no row fields for an unbound table (free entry remains)', () => {
    const controller = makeController({ [TABLE]: { type: 'table', columns: [{ label: 'x' }] } });
    draw(
      <TableColumnsSection
        controller={controller}
        tablePath={TABLE}
        dataKey=""
        dataScope=""
        groups={GROUPS}
        params="{}"
      />,
    );
    // The section renders; the column picker simply has no options to offer.
    expect(screen.getAllByLabelText('Data key')).toHaveLength(2);
  });

  it('shows a per-column format picker only for bound columns, with currency-aware suggestions', () => {
    const node = {
      type: 'table',
      data: { key: 'rows' },
      columns: [
        { label: '金額', data: { key: 'amount', format: 'symbol' } },
        { label: '明細', cell: { items: [] } },
        3,
      ],
    };
    const controller = makeController({ [TABLE]: node, formats: {} });
    draw(
      <TableColumnsSection
        controller={controller}
        tablePath={TABLE}
        dataKey="rows"
        dataScope=""
        groups={GROUPS}
        params='{"rows":[{"amount":300000}]}'
      />,
    );
    // Only the bound `amount` column gets a format picker; the cell column and
    // the unbound scalar entry show none.
    const formatInputs = screen.getAllByLabelText('Format') as HTMLInputElement[];
    expect(formatInputs).toHaveLength(1);
    expect(formatInputs[0].value).toBe('symbol');
    // A currency-typed column offers the currency variants; picking one commits
    // ONE setScalar at the column's `data.format`.
    fireEvent.click(screen.getByRole('button', { name: 'Choose a format' }));
    expect(screen.getByRole('menu').textContent).toContain('Currency name');
    fireEvent.click(screen.getByRole('menuitem', { name: /Currency name/ }));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: `${TABLE}.columns[0]`,
      keys: ['data', 'format'],
      value: 'name',
    });
  });

  it('type-filters a bound column’s format names, given a catalog', () => {
    // A second entry point into the same picker model, so it gets the gate
    // asserted HERE — "it calls the same function" is not the bar. `amount` is
    // currency-typed and `tax` is a date-pattern registry entry, so the engine
    // lists none of the registry under `currency`.
    const node = {
      type: 'table',
      data: { key: 'rows' },
      columns: [{ label: '金額', data: { key: 'amount' } }],
    };
    const spellings = () =>
      screen.getAllByRole('menuitem').map((row) => row.querySelector('code')?.textContent);
    const withCatalog = draw(
      <TableColumnsSection
        controller={makeController({ [TABLE]: node, formats: { tax: {} } })}
        tablePath={TABLE}
        dataKey="rows"
        dataScope=""
        groups={GROUPS}
        params='{"rows":[{"amount":300000}]}'
        formatCatalog={FORMAT_CATALOG}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Choose a format' }));
    expect(spellings()).toEqual(['symbol', 'name']);
    withCatalog.unmount();
    // Without one there is nothing to filter by, and the same column offers it.
    draw(
      <TableColumnsSection
        controller={makeController({ [TABLE]: node, formats: { tax: {} } })}
        tablePath={TABLE}
        dataKey="rows"
        dataScope=""
        groups={GROUPS}
        params='{"rows":[{"amount":300000}]}'
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Choose a format' }));
    expect(spellings()).toEqual(['tax', 'symbol', 'name']);
  });

  it('renders an addable empty section when the table has no columns array', () => {
    const controller = makeController({ [TABLE]: { type: 'table' } });
    section(controller);
    expect(screen.queryAllByLabelText('Column label')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Add column' }));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'insertItem',
      path: `${TABLE}.columns`,
      index: 0,
      value: { label: 'New column' },
    });
  });
});

describe('IterableSourceSection', () => {
  const LIST_PATH = 'sections.body.items[1]';

  it('rebinds a list source and edits its entry text — one op each', () => {
    const controller = makeController({});
    draw(
      <IterableSourceSection
        controller={controller}
        path={LIST_PATH}
        dataKey="rows"
        dataScope=""
        entryText="{name}"
        groups={GROUPS}
      />,
    );
    fireEvent.blur(screen.getByLabelText('Data key'), { target: { value: 'tags' } });
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: LIST_PATH,
      keys: ['data', 'key'],
      value: 'tags',
    });
    fireEvent.blur(screen.getByLabelText('Entry text'), { target: { value: '{name} ×{qty}' } });
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: LIST_PATH,
      keys: ['text'],
      value: '{name} ×{qty}',
    });
  });

  it('clears the entry text to direct printing, skipping an unchanged blur', () => {
    const controller = makeController({});
    draw(
      <IterableSourceSection
        controller={controller}
        path={LIST_PATH}
        dataKey="rows"
        dataScope=""
        entryText="{name}"
        groups={GROUPS}
      />,
    );
    const text = screen.getByLabelText('Entry text');
    fireEvent.blur(text, { target: { value: '{name}' } });
    expect(controller.apply).not.toHaveBeenCalled();
    fireEvent.blur(text, { target: { value: '' } });
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'removeKey',
      path: LIST_PATH,
      keys: ['text'],
    });
  });

  it('offers the enclosing row’s OWN array, row-relatively and unescaped', () => {
    // A list inside a `rows` cell binding that row's `parcels`: the engine
    // reads it from the ROW, so the picker must offer the row-relative key
    // and author it WITHOUT `scope: document` — which is what the top-level
    // groups beside it do need.
    const nested = [
      ...GROUPS,
      {
        id: 'rows.parcels',
        label: '荷物',
        description: '',
        isArray: true,
        rowScope: 'rows',
        fields: [],
      },
    ];
    const cellPath = `${TABLE}.columns[0].cell.items[0]`;
    const controller = makeController({ [TABLE]: { type: 'table', data: { key: 'rows' } } });
    draw(
      <IterableSourceSection
        controller={controller}
        path={cellPath}
        dataKey=""
        dataScope=""
        entryText="{code}"
        groups={nested}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /荷物/ }));
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'setScalar', path: cellPath, keys: ['data', 'key'], value: 'parcels' },
    ]);
  });

  it('offers no row-relative source to a repeat_flow, which layout would skip', () => {
    const nested = [
      ...GROUPS,
      {
        id: 'rows.parcels',
        label: '荷物',
        description: '',
        isArray: true,
        rowScope: 'rows',
        fields: [],
      },
    ];
    const controller = makeController({ [TABLE]: { type: 'table', data: { key: 'rows' } } });
    draw(
      <IterableSourceSection
        controller={controller}
        path={`${TABLE}.columns[0].cell.items[0]`}
        dataKey=""
        dataScope=""
        entryText={null}
        groups={nested}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    expect(screen.queryByRole('menuitem', { name: /荷物/ })).toBeNull();
  });

  it('hides the entry-text field for a repeat_flow (source picker only)', () => {
    const controller = makeController({});
    draw(
      <IterableSourceSection
        controller={controller}
        path={LIST_PATH}
        dataKey="rows"
        dataScope=""
        entryText={null}
        groups={GROUPS}
      />,
    );
    expect(screen.getByLabelText('Data key')).toBeTruthy();
    expect(screen.queryByLabelText('Entry text')).toBeNull();
  });
});

describe('ColumnForm', () => {
  const COLUMN_PATH = `${TABLE}.columns[0]`;

  function form(
    controller: EditorController,
    column = {
      label: '品名',
      key: 'name',
      width: '15%',
      format: '',
      scope: '',
      hasCell: false,
      textAlign: '',
    },
  ) {
    return draw(
      <ColumnForm
        controller={controller}
        path={COLUMN_PATH}
        column={column}
        groups={GROUPS}
        params="{}"
      />,
    );
  }

  // A bare width: the shipped fixture uses `15%`, which states its own unit,
  // so the badge — and the invitation that rides it — are both absent there.
  it('invites another unit on a bare column width', () => {
    form(makeController({}), {
      label: '品名',
      key: 'name',
      width: '120',
      format: '',
      scope: '',
      hasCell: false,
      textAlign: '',
    });
    expect(unitHintsFor('Column width').length).toBeGreaterThan(0);
  });

  // Same key, same answer as the column SHEET: a column under a right-aligned
  // row band is right-aligned in both surfaces, or the panel contradicts itself
  // rather than the document. The cascade needs no composing here — a column has
  // a path, so `toolbar/cascade` already puts the row band and the table under it.
  it('shows the alignment and weight the row band gives the column', () => {
    const controller = makeController({
      [TABLE]: { ...TABLE_NODE, row: { style: { textAlign: 'right', fontWeight: 'bold' } } },
      [COLUMN_PATH]: { label: '品名', data: { key: 'name' } },
    });
    form(controller);
    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'Right' }).checked).toBe(true);
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Bold' }).checked).toBe(true);
  });

  it('authors the minimal wire against that cascade', () => {
    const controller = makeController({
      [TABLE]: { ...TABLE_NODE, row: { style: { fontWeight: 'bold' } } },
      [COLUMN_PATH]: { label: '品名', data: { key: 'name' } },
    });
    form(controller);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Bold' }));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: COLUMN_PATH,
      keys: ['style', 'fontWeight'],
      value: 'normal',
    });
  });

  it('an unchanged label blur dispatches nothing (tab-through safe)', () => {
    const controller = makeController({ [TABLE]: TABLE_NODE });
    form(controller);
    fireEvent.blur(screen.getByLabelText('Column label'), { target: { value: '品名' } });
    expect(controller.apply).not.toHaveBeenCalled();
  });

  it('edits label, binding, and width — one op each', () => {
    const controller = makeController({ [TABLE]: TABLE_NODE });
    form(controller);
    fireEvent.blur(screen.getByLabelText('Column label'), { target: { value: '品目' } });
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: COLUMN_PATH,
      keys: ['label'],
      value: '品目',
    });
    fireEvent.blur(screen.getByLabelText('Data key'), { target: { value: 'quantity' } });
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: COLUMN_PATH,
      keys: ['data', 'key'],
      value: 'quantity',
    });
    fireEvent.blur(screen.getByLabelText('Column width'), { target: { value: '20%' } });
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: COLUMN_PATH,
      keys: ['width'],
      value: '20%',
    });
  });

  it('clears the width when emptied and skips an unchanged blur', () => {
    const controller = makeController({ [TABLE]: TABLE_NODE });
    form(controller);
    const width = screen.getByLabelText('Column width');
    fireEvent.blur(width, { target: { value: '15%' } });
    expect(controller.apply).not.toHaveBeenCalled();
    fireEvent.blur(width, { target: { value: '' } });
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'removeKey',
      path: COLUMN_PATH,
      keys: ['width'],
    });
  });

  it('hides the binding picker for a cell column', () => {
    const controller = makeController({ [TABLE]: TABLE_NODE });
    form(controller, {
      label: '明細',
      key: '',
      width: '',
      format: '',
      scope: '',
      hasCell: true,
      textAlign: '',
    });
    expect(screen.queryByLabelText('Data key')).toBeNull();
  });

  it('edits the column format through the picker (currency variants for a money column)', () => {
    const controller = makeController({ [TABLE]: TABLE_NODE, formats: {} });
    form(controller, {
      label: '金額',
      key: 'amount',
      width: '',
      format: '',
      scope: '',
      hasCell: false,
      textAlign: '',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Choose a format' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Currency symbol/ }));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: COLUMN_PATH,
      keys: ['data', 'format'],
      value: 'symbol',
    });
  });

  it('hides the format picker for an unbound column', () => {
    const controller = makeController({ [TABLE]: TABLE_NODE });
    form(controller, {
      label: '新',
      key: '',
      width: '',
      format: '',
      scope: '',
      hasCell: false,
      textAlign: '',
    });
    expect(screen.queryByLabelText('Format')).toBeNull();
  });

  describe('the column’s own cell style', () => {
    it('authors an alignment at the column’s style, which is what a money column needs', () => {
      const controller = makeController({ [TABLE]: TABLE_NODE, [COLUMN_PATH]: {} });
      form(controller);
      fireEvent.click(screen.getByRole('radio', { name: 'Right' }));
      expect(controller.apply).toHaveBeenCalledWith({
        op: 'setScalar',
        path: COLUMN_PATH,
        keys: ['style', 'textAlign'],
        value: 'right',
      });
    });

    it('authors a fill from the swatch palette', () => {
      const controller = makeController({ [TABLE]: TABLE_NODE, [COLUMN_PATH]: {} });
      form(controller);
      fireEvent.click(screen.getByRole('button', { name: 'Background' }));
      fireEvent.click(screen.getByRole('menuitem', { name: swatchLabel('#b91c1c') }));
      expect(controller.apply).toHaveBeenCalledWith({
        op: 'setScalar',
        path: COLUMN_PATH,
        keys: ['style', 'backgroundColor'],
        value: '#b91c1c',
      });
    });

    it('authors a TEXT COLOUR at the column’s style', () => {
      const controller = makeController({ [TABLE]: TABLE_NODE, [COLUMN_PATH]: {} });
      form(controller);
      fireEvent.click(screen.getByRole('button', { name: 'Color' }));
      fireEvent.click(screen.getByRole('menuitem', { name: swatchLabel('#b91c1c') }));
      expect(controller.apply).toHaveBeenCalledWith({
        op: 'setScalar',
        path: COLUMN_PATH,
        keys: ['style', 'color'],
        value: '#b91c1c',
      });
    });

    it('clears a style property rather than authoring an engine default', () => {
      const controller = makeController({
        [TABLE]: TABLE_NODE,
        [COLUMN_PATH]: { style: { fontWeight: 'bold' } },
      });
      form(controller);
      fireEvent.click(screen.getByRole('checkbox', { name: 'Bold' }));
      expect(controller.apply).toHaveBeenCalledWith({
        op: 'removeKey',
        path: COLUMN_PATH,
        keys: ['style', 'fontWeight'],
      });
    });

    it('seeds the controls from the column’s authored style', () => {
      const controller = makeController({
        [TABLE]: TABLE_NODE,
        [COLUMN_PATH]: { style: { textAlign: 'center', fontWeight: 'bold' } },
      });
      form(controller);
      expect(screen.getByRole<HTMLInputElement>('radio', { name: 'Center' }).checked).toBe(true);
      expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Bold' }).checked).toBe(true);
    });

    it('says the alignment also wins for this column’s own header label', () => {
      // Not decoration trivia: the engine gives a column's `textAlign` precedence
      // over the header row's for that column's LABEL, so the control reaches two
      // places and the form has to say which.
      const controller = makeController({ [TABLE]: TABLE_NODE, [COLUMN_PATH]: {} });
      form(controller);
      expect(screen.getByText(/wins over the header row/)).not.toBeNull();
    });
  });
});

describe('column editors — binding scope', () => {
  // The base fixture's document group carries no fields, so the escape has
  // nothing to offer; this one gives it one.
  const SCOPED_GROUPS: readonly PaletteGroup[] = GROUPS.map((group) =>
    group.id === 'order'
      ? {
          ...group,
          fields: [
            {
              key: 'order.code',
              label: '発注番号',
              type: 'string',
              description: '',
              sample: 'PO-1',
              enumOptions: [],
            },
          ],
        }
      : group,
  );
  const SCOPED_TABLE = {
    type: 'table',
    data: { key: 'rows' },
    columns: [
      { label: '品名', data: { key: 'name' } },
      { label: '発注番号', data: { key: 'order.code', scope: 'document' } },
    ],
  };

  function scopedSection(
    controller: EditorController,
    capabilities?: readonly string[],
    dataKey = 'rows',
  ) {
    return draw(
      <TableColumnsSection
        controller={controller}
        tablePath={TABLE}
        dataKey={dataKey}
        dataScope=""
        groups={SCOPED_GROUPS}
        params='{"rows": [{"name": "live"}], "order": {"code": "PO-9"}}'
        capabilities={capabilities}
      />,
    );
  }

  it('offers the document section on a column picker and authors the scope on a pick', () => {
    const controller = makeController({ [TABLE]: SCOPED_TABLE });
    scopedSection(controller);
    // The first column's picker (index 1 — the source picker is index 0).
    fireEvent.click(screen.getAllByRole('button', { name: 'Choose a data field' })[1]);
    expect(screen.getByText("This row's data")).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: /発注番号/ }));
    expect(controller.applyAll).toHaveBeenCalledWith([
      {
        op: 'setScalar',
        path: `${TABLE}.columns[0]`,
        keys: ['data', 'key'],
        value: 'order.code',
      },
      {
        op: 'setScalar',
        path: `${TABLE}.columns[0]`,
        keys: ['data', 'scope'],
        value: 'document',
      },
    ]);
  });

  it('hides the document section without `binding.scope`, but KEEPS the badge', () => {
    // Reading stays honest about the open file; only authoring is gated.
    const controller = makeController({ [TABLE]: SCOPED_TABLE });
    scopedSection(controller, ['other.capability']);
    expect(screen.getByText('Document')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Choose a data field' })[1]);
    expect(screen.queryByRole('menuitem', { name: /発注番号/ })).toBeNull();
    expect(screen.queryByText('Document data')).toBeNull();
  });

  it('offers no scope choice at all when the table is unbound (no row scope)', () => {
    const controller = makeController({
      [TABLE]: { type: 'table', columns: [{ label: '品名', data: { key: 'name' } }] },
    });
    scopedSection(controller, undefined, '');
    expect(screen.queryByText('Document')).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'Choose a data field' })[1]);
    expect(screen.queryByText('Document data')).toBeNull();
  });

  it('badges a scoped column in the ColumnForm and authors through it', () => {
    const columnPath = `${TABLE}.columns[1]`;
    // The ops read the DOCUMENT (not the view prop), so the node must carry
    // the scope the form displays.
    const controller = makeController({
      [TABLE]: SCOPED_TABLE,
      [columnPath]: { label: '発注番号', data: { key: 'order.code', scope: 'document' } },
    });
    draw(
      <ColumnForm
        controller={controller}
        path={columnPath}
        column={{
          label: '発注番号',
          key: 'order.code',
          width: '',
          format: '',
          scope: 'document',
          hasCell: false,
          textAlign: '',
        }}
        groups={SCOPED_GROUPS}
        params="{}"
      />,
    );
    expect(screen.getByText('Document')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /品名/ }));
    // Back to a row field: the key changes AND the now-wrong scope is dropped.
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'setScalar', path: columnPath, keys: ['data', 'key'], value: 'name' },
      { op: 'removeKey', path: columnPath, keys: ['data', 'scope'] },
    ]);
  });

  it('offers no scope choice on a column of an UNBOUND table', () => {
    // No row scope exists there, so document and element resolve identically —
    // the picker stays exactly today's, and nothing can author a scope.
    const columnPath = `${TABLE}.columns[0]`;
    const controller = makeController({
      [TABLE]: { type: 'table', columns: [{ label: '品名', data: { key: 'name' } }] },
      [columnPath]: { label: '品名', data: { key: 'name' } },
    });
    draw(
      <ColumnForm
        controller={controller}
        path={columnPath}
        column={{
          label: '品名',
          key: '',
          width: '',
          format: '',
          scope: '',
          hasCell: false,
          textAlign: '',
        }}
        groups={SCOPED_GROUPS}
        params="{}"
      />,
    );
    expect(screen.queryByText('Document')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    expect(screen.queryByText('Document data')).toBeNull();
    // With no row scope the picker offers the DOCUMENT groups' fields, as a
    // plain unlabeled list.
    fireEvent.click(screen.getByRole('menuitem', { name: /発注番号/ }));
    // A plain one-op commit — `data.scope` is left exactly as the file has it.
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: columnPath,
      keys: ['data', 'key'],
      value: 'order.code',
    });
    expect(controller.applyAll).not.toHaveBeenCalled();
  });

  it('hides the ColumnForm document section without `binding.scope`', () => {
    const columnPath = `${TABLE}.columns[0]`;
    const controller = makeController({ [TABLE]: SCOPED_TABLE, [columnPath]: {} });
    draw(
      <ColumnForm
        controller={controller}
        path={columnPath}
        column={{
          label: '品名',
          key: 'name',
          width: '',
          format: '',
          scope: '',
          hasCell: false,
          textAlign: '',
        }}
        groups={SCOPED_GROUPS}
        params="{}"
        capabilities={['other.capability']}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    expect(screen.queryByText('Document data')).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /発注番号/ })).toBeNull();
  });

  it('lets a NESTED iterable reach a top-level array with an explicit scope', () => {
    // The sharpest case: the offered groups are all top-level, so picking one
    // inside a cell used to author a binding that read the ROW.
    const listPath = `${TABLE}.columns[0].cell.items[0]`;
    const controller = makeController({
      [TABLE]: { type: 'table', data: { key: 'rows' }, columns: [{ cell: { items: [] } }] },
      [listPath]: { type: 'list', data: {} },
    });
    draw(
      <IterableSourceSection
        controller={controller}
        path={listPath}
        dataKey=""
        dataScope=""
        entryText={null}
        groups={SCOPED_GROUPS}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    // One list, no headings — every offer here escapes the row, and each says
    // so with its own badge.
    expect(screen.queryByText('Document data')).toBeNull();
    expect(screen.getAllByText('Document').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('menuitem', { name: /明細/ }));
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'setScalar', path: listPath, keys: ['data', 'key'], value: 'rows' },
      { op: 'setScalar', path: listPath, keys: ['data', 'scope'], value: 'document' },
    ]);
  });

  it('keeps a TOP-LEVEL iterable picker exactly as it was', () => {
    const controller = makeController({
      [TABLE]: { type: 'list', data: { key: 'rows' } },
    });
    draw(
      <IterableSourceSection
        controller={controller}
        path={TABLE}
        dataKey="rows"
        dataScope=""
        entryText={null}
        groups={SCOPED_GROUPS}
      />,
    );
    expect(screen.queryByText('Document')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /tags/ }));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: TABLE,
      keys: ['data', 'key'],
      value: 'tags',
    });
    expect(controller.applyAll).not.toHaveBeenCalled();
  });

  it('offers a nested iterable the plain list when the engine cannot scope', () => {
    const listPath = `${TABLE}.columns[0].cell.items[0]`;
    const controller = makeController({
      [TABLE]: { type: 'table', data: { key: 'rows' }, columns: [{ cell: { items: [] } }] },
      [listPath]: { type: 'list', data: {} },
    });
    draw(
      <IterableSourceSection
        controller={controller}
        path={listPath}
        dataKey=""
        dataScope=""
        entryText={null}
        groups={SCOPED_GROUPS}
        capabilities={['other.capability']}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    expect(screen.queryByText('Document')).toBeNull();
    expect(screen.getByRole('menuitem', { name: /明細/ })).toBeTruthy();
  });
});

// The unit affordance (`stepper.unitHint`) is OPT-IN per field, because the
// WIRE decides which keys take `25mm`. Pinned AT the site: an optional prop
// whose default is the disabled value can be dropped in a refactor with no
// type error, no lint and no red test.
