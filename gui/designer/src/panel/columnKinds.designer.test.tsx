// Switching what a table column renders, through every surface that offers it:
// the column form's kind picker (with the fields each kind earns and the cell
// confirm), the column sheet's row, and the columns list's plain kind label.

import { Editor } from '@shojiku/designer-core';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EditorController } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import type { PaletteGroup } from '../palette/model';
import { ColumnForm } from './ColumnForm';
import { readColumnsView } from './columnsModel';
import { TableColumnSheet } from './TableColumnSheet';
import { TableColumnsSection } from './TableColumnsSection';

const TABLE = 'sections.body.items[0]';
const col = (n: number) => `${TABLE}.columns[${n}]`;

const GROUPS: readonly PaletteGroup[] = [
  {
    id: 'rows',
    label: 'Rows',
    description: '',
    isArray: true,
    fields: [
      { key: 'name', label: 'Name', type: 'string', description: '', sample: 'A', enumOptions: [] },
    ],
  },
];

const TABLE_NODE = {
  type: 'table',
  data: { key: 'rows' },
  columns: [
    { label: 'Name', data: { key: 'name', format: 'upper' } },
    { label: 'Code', type: 'qr_code', data: { key: 'url' } },
    { label: 'Photo', type: 'image', fit: 'cover', data: { key: 'photo', format: 'upper' } },
    {
      label: 'Detail',
      cell: {
        items: [
          { type: 'rect' },
          { type: 'text', data: { key: 'name' } },
          { type: 'text', text: 'x' },
        ],
      },
    },
    { label: 'Empty', cell: { items: [] } },
    { label: '', cell: { items: [{ type: 'rect' }] } },
    { label: 'Blank' },
    { label: 'Styled', type: 'image', data: { key: 'photo' }, style: { fontSize: 14 } },
  ],
};

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

function makeController(node: unknown = TABLE_NODE): EditorController {
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

function row(n: number, node: unknown = TABLE_NODE) {
  const rows = readColumnsView(readAt(node, TABLE));
  if (rows === null) {
    throw new Error('fixture has no columns');
  }
  return rows[n];
}

function form(
  n: number,
  options: { controller?: EditorController; capabilities?: readonly string[] } = {},
) {
  const controller = options.controller ?? makeController();
  draw(
    <ColumnForm
      fontFamilies={[]}
      controller={controller}
      path={col(n)}
      column={row(n)}
      groups={GROUPS}
      params="{}"
      capabilities={options.capabilities}
    />,
  );
  return controller;
}

/** The form's kind picker: its options, the picked one marked `*`. */
function kindOptions(): string[] {
  const picker = screen.getByRole('button', { name: 'Column type' });
  const picked = picker.textContent;
  fireEvent.click(picker);
  const names = screen.getAllByRole('option').map((o) => o.textContent ?? '');
  fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
  return names.map((name) => (name === picked ? `${name}*` : name));
}

/** Pick `kind` in the form's kind picker. */
function pickKind(kind: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Column type' }));
  fireEvent.click(screen.getByRole('option', { name: kind }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the column form’s kind picker', () => {
  it('offers every kind against the bundled engine, the current one picked', () => {
    form(0);
    expect(kindOptions()).toEqual(['Text*', 'QR code', 'Image', 'Free layout']);
  });

  it('follows the capability keys, keeping the kind the column already has', () => {
    form(1, { capabilities: ['table.column.cell'] });
    expect(kindOptions()).toEqual(['Text', 'QR code*', 'Free layout']);
  });

  it('is absent when it would offer text alone', () => {
    form(0, { capabilities: [] });
    expect(screen.queryByRole('button', { name: 'Column type' })).toBeNull();
  });

  it('switches between bound kinds as ONE batch', () => {
    const controller = form(2);
    pickKind('Text');
    expect(controller.applyAll).toHaveBeenCalledTimes(1);
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'removeKey', path: col(2), keys: ['type'] },
      { op: 'removeKey', path: col(2), keys: ['fit'] },
    ]);
  });

  it('says what a QR code column does, naming the rows section by its own title', () => {
    form(1);
    const hint = screen.getByText(/QR codes are drawn to the row height/);
    expect(hint.textContent).toContain('“Rows and cells”');
    const picker = screen.getByRole('button', { name: 'Column type' });
    expect(picker.getAttribute('aria-describedby')).toBe(hint.id);
  });

  it('pre-announces on an image column that leaving it drops the fit', () => {
    form(2);
    expect(screen.getByText(/removes the “Fit mode” setting/)).toBeTruthy();
  });

  it('a text column carries no kind hint', () => {
    form(0);
    expect(
      screen.getByRole('button', { name: 'Column type' }).getAttribute('aria-describedby'),
    ).toBeNull();
  });
});

describe('the fields each kind earns', () => {
  it('a bound text column: format and the blank placeholder', () => {
    const controller = form(0);
    expect(screen.getByRole('button', { name: 'Choose a format' })).toBeTruthy();
    const field = screen.getByLabelText('Blank placeholder') as HTMLInputElement;
    fireEvent.change(field, { target: { value: '—' } });
    fireEvent.blur(field);
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: col(0),
      keys: ['data', 'placeholder'],
      value: '—',
    });
    expect(screen.queryByLabelText('Fit mode')).toBeNull();
  });

  it('a QR code column: the placeholder says it becomes a QR code', () => {
    form(1);
    expect(screen.getByLabelText('Blank-row QR content')).toBeTruthy();
    expect(screen.queryByLabelText('Blank placeholder')).toBeNull();
    expect(screen.getByText(/get a QR code that scans as this text/)).toBeTruthy();
  });

  it('an unbound column offers no placeholder (it would need a key)', () => {
    form(6);
    expect(screen.queryByLabelText('Blank placeholder')).toBeNull();
  });

  it('no placeholder against an engine without the key', () => {
    form(0, { capabilities: ['table.column.type'] });
    expect(screen.queryByLabelText('Blank placeholder')).toBeNull();
  });

  it('an image column: the fit picker, and no format or placeholder', () => {
    const controller = form(2);
    expect(screen.queryByRole('button', { name: 'Choose a format' })).toBeNull();
    expect(screen.queryByLabelText('Blank placeholder')).toBeNull();
    const fit = screen.getByRole('button', { name: 'Fit mode' });
    expect(fit.textContent).toContain('Fill the box (overflow is cut)');
    fireEvent.click(fit);
    fireEvent.click(screen.getByRole('option', { name: 'Stretch (the proportions change)' }));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: col(2),
      keys: ['fit'],
      value: 'stretch',
    });
  });

  it('picking the default fit clears the key', () => {
    const controller = form(2);
    fireEvent.click(screen.getByRole('button', { name: 'Fit mode' }));
    fireEvent.click(screen.getByRole('option', { name: '(Default: fit inside)' }));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'removeKey',
      path: col(2),
      keys: ['fit'],
    });
  });

  it('a free-layout column: no binding fields at all', () => {
    form(3);
    expect(screen.queryByLabelText('Data key')).toBeNull();
    expect(screen.queryByLabelText('Blank placeholder')).toBeNull();
    expect(screen.queryByLabelText('Fit mode')).toBeNull();
  });
});

describe('the column style on a QR code or image column', () => {
  it('keeps only what reaches the page, and says where alignment goes', () => {
    const controller = form(7);
    expect(screen.queryByRole('checkbox', { name: 'Bold' })).toBeNull();
    expect(screen.getByText('Background')).toBeTruthy();
    expect(screen.getByText(/drawn centred in the cell/)).toBeTruthy();
    // The authored size stays in the file: nothing wrote to it.
    expect(controller.apply).not.toHaveBeenCalled();
    expect(controller.applyAll).not.toHaveBeenCalled();
  });

  it('an unrelated edit leaves the hidden type keys in the file', () => {
    const editor = Editor.create(`sections:
  body:
    type: flow
    items:
      - type: table
        data: { key: rows }
        columns:
          - label: Photo
            type: image
            data: { key: photo }
            style: { fontSize: 14 }
`);
    const controller: EditorController = {
      ...makeController(),
      read: (path) => editor.read(path),
      apply: vi.fn((op) => editor.apply(op)),
      applyAll: vi.fn((ops) => editor.applyAll(ops)),
    };
    const node = editor.read(TABLE);
    draw(
      <ColumnForm
        fontFamilies={[]}
        controller={controller}
        path={col(0)}
        column={row(0, node)}
        groups={GROUPS}
        params="{}"
      />,
    );
    const label = screen.getByLabelText('Column label') as HTMLInputElement;
    fireEvent.change(label, { target: { value: 'Picture' } });
    fireEvent.blur(label);
    expect(editor.text()).toContain('label: Picture');
    expect(editor.text()).toContain('style: { fontSize: 14 }');
  });

  it('leaves vertical alignment out of the hint where the engine offers none', () => {
    form(7, { capabilities: ['table.column.type'] });
    const hint = screen.getByText(/drawn centred in the cell/);
    expect(hint.textContent).toContain('Text alignment applies to this column’s header label');
    expect(hint.textContent).not.toContain('Vertical alignment');
  });

  it('a text column keeps the type controls', () => {
    form(0);
    expect(screen.getByRole('checkbox', { name: 'Bold' })).toBeTruthy();
    expect(screen.queryByText(/drawn centred in the cell/)).toBeNull();
  });
});

describe('switching out of a free-layout column', () => {
  it('asks first, naming the column, what goes and what the column keeps', () => {
    const controller = form(3);
    pickKind('Image');
    expect(controller.applyAll).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', { name: 'Switch column “Detail” to Image?' });
    expect(dialog.textContent).toContain('Everything in the cell (Rectangle ×1 and Text ×2)');
    expect(dialog.textContent).toContain('takes the data key “name”');
    expect(dialog.textContent).toContain('Undo (Ctrl+Z)');
    expect(screen.getByRole('button', { name: 'Remove items and switch' })).toBeTruthy();
  });

  it('cancel changes nothing', () => {
    const controller = form(3);
    pickKind('Text');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(controller.applyAll).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('confirm applies the one batch', () => {
    const controller = form(3);
    pickKind('Text');
    fireEvent.click(screen.getByRole('button', { name: 'Remove items and switch' }));
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'removeKey', path: col(3), keys: ['cell'] },
      { op: 'putValue', path: col(3), keys: ['data'], value: { key: 'name' } },
    ]);
  });

  it('an empty cell switches at once', () => {
    const controller = form(4);
    pickKind('QR code');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'removeKey', path: col(4), keys: ['cell'] },
      { op: 'setScalar', path: col(4), keys: ['type'], value: 'qr_code' },
    ]);
  });

  it('an unnamed column with no data says so, with the Mac undo key on a Mac', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    form(5);
    pickKind('Text');
    const dialog = screen.getByRole('dialog', { name: 'Switch this column to Text?' });
    expect(dialog.textContent).toContain('Pick a data key after switching');
    expect(dialog.textContent).toContain('Undo (⌘Z)');
  });

  it('names an item whose type is no string as “Other”', () => {
    const node = {
      type: 'table',
      data: { key: 'rows' },
      columns: [{ label: 'Odd', cell: { items: [{ type: 5 }, { type: 'rect' }] } }],
    };
    const controller = makeController(node);
    draw(
      <ColumnForm
        fontFamilies={[]}
        controller={controller}
        path={col(0)}
        column={row(0, node)}
        groups={GROUPS}
        params="{}"
      />,
    );
    pickKind('Text');
    expect(screen.getByRole('dialog').textContent).toContain('(Other ×1 and Rectangle ×1)');
  });

  it('switching INTO a cell needs no confirm', () => {
    const controller = form(0);
    pickKind('Free layout');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(controller.applyAll).toHaveBeenCalledTimes(1);
  });
});

describe('the column sheet’s kind row', () => {
  function sheet(controller: EditorController, capabilities?: readonly string[]) {
    return draw(
      <TableColumnSheet
        controller={controller}
        tablePath={TABLE}
        dataKey="rows"
        groups={GROUPS}
        params="{}"
        capabilities={capabilities}
      />,
    );
  }

  it('shows each column’s kind and switches through the same door', () => {
    const controller = makeController();
    sheet(controller);
    const pickers = screen.getAllByRole('button', { name: /^Type of column|^Column type$/ });
    // Each picker is named for its column; the unnamed one falls back.
    expect(pickers.map((p) => p.getAttribute('aria-label'))).toEqual([
      'Type of column “Name”',
      'Type of column “Code”',
      'Type of column “Photo”',
      'Type of column “Detail”',
      'Type of column “Empty”',
      'Column type',
      'Type of column “Blank”',
      'Type of column “Styled”',
    ]);
    expect(pickers.map((p) => p.textContent)).toEqual([
      'Text',
      'QR code',
      'Image',
      'Free layout',
      'Free layout',
      'Free layout',
      'Text',
      'Image',
    ]);
    fireEvent.click(pickers[0]);
    fireEvent.click(screen.getByRole('option', { name: 'Image' }));
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'setScalar', path: col(0), keys: ['type'], value: 'image' },
    ]);
  });

  it('asks before emptying a free-layout column from the sheet too', () => {
    const controller = makeController();
    sheet(controller);
    fireEvent.click(screen.getByRole('button', { name: 'Type of column “Detail”' }));
    fireEvent.click(screen.getByRole('option', { name: 'Text' }));
    expect(controller.applyAll).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Switch column “Detail” to Text?' })).toBeTruthy();
  });

  it('re-picking a column’s own kind changes nothing', () => {
    const controller = makeController();
    sheet(controller);
    fireEvent.click(screen.getByRole('button', { name: 'Type of column “Code”' }));
    fireEvent.click(screen.getByRole('option', { name: 'QR code' }));
    expect(controller.applyAll).not.toHaveBeenCalled();
  });

  it('mutes an image column’s format cell, and carries no placeholder or fit', () => {
    sheet(makeController());
    expect(screen.queryByLabelText('Blank placeholder')).toBeNull();
    expect(screen.queryByLabelText('Blank-row QR content')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Fit mode' })).toBeNull();
    // Name and Code print text; Photo, the cells, Blank (unbound) and Styled do not.
    expect(screen.getAllByRole('button', { name: 'Choose a format' })).toHaveLength(2);
  });

  it('drops the row when the engine offers no kind and every column is text', () => {
    const node = { ...TABLE_NODE, columns: [TABLE_NODE.columns[0], TABLE_NODE.columns[6]] };
    sheet(makeController(node), []);
    expect(screen.queryByText('Column type')).toBeNull();
  });

  it('keeps the row for an authored kind, as plain text where nothing else is offered', () => {
    const node = { ...TABLE_NODE, columns: [TABLE_NODE.columns[0], TABLE_NODE.columns[1]] };
    sheet(makeController(node), []);
    expect(screen.getByText('Column type')).toBeTruthy();
    // The text column has nothing to switch to; the QR column can go back to text.
    expect(screen.getAllByRole('button', { name: /^Type of column/ })).toHaveLength(1);
    expect(screen.getByText('Text', { selector: 'span.self-center' })).toBeTruthy();
  });
});

describe('the columns list', () => {
  it('names a non-text column’s kind as plain text, nothing pressable', () => {
    draw(
      <TableColumnsSection
        controller={makeController()}
        tablePath={TABLE}
        dataKey="rows"
        dataScope=""
        groups={GROUPS}
        params="{}"
      />,
    );
    const items = screen.getAllByRole('listitem');
    const label = { selector: 'span.text-xs' };
    expect(within(items[0]).queryByText(/^Type:/, label)).toBeNull();
    const code = within(items[1]).getByText('Type: QR code', label);
    expect(code.tagName).toBe('SPAN');
    expect(code.closest('button')).toBeNull();
    expect(within(items[2]).getByText('Type: Image', label)).toBeTruthy();
    expect(within(items[3]).getByText('Type: Free layout', label)).toBeTruthy();
    // No kind switch in the list.
    expect(screen.queryByRole('button', { name: 'Column type' })).toBeNull();
    // The fields a kind earns live in the column form, not here.
    expect(screen.queryByLabelText('Blank placeholder')).toBeNull();
    expect(screen.queryByLabelText('Blank-row QR content')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Fit mode' })).toBeNull();
    // The image row has its key picker and no format picker.
    expect(within(items[2]).queryByRole('button', { name: 'Choose a format' })).toBeNull();
  });
});
