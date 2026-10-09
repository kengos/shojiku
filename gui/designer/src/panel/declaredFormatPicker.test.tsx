// The placement format picker offers the bound field's declared display variants
// in every place it appears — a bound text, a table column in the item panel,
// and a column in the column sheet: first, under their own heading, named by
// their labels, and a pick writes the id as ONE op.
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { EditorController } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import type { PaletteGroup } from '../palette/model';
import { FORMAT_CATALOG } from '../testkit/formatCatalog';
import { FormatOptionList } from './FormatOptionList';
import { PropertyPanel } from './PropertyPanel';
import { TableColumnSheet } from './TableColumnSheet';
import { TableColumnsSection } from './TableColumnsSection';

const PATH = 'sections.body.items[0]';

/** Answers any structural path under `PATH`, and the registry at `formats`. */
function makeController(node: unknown, formats: unknown = {}): EditorController {
  const read = (path: string): unknown => {
    if (path === 'formats') {
      return formats;
    }
    if (!path.startsWith(PATH)) {
      return undefined;
    }
    let cursor: unknown = node;
    for (const step of path
      .slice(PATH.length)
      .split(/[.[\]]/)
      .filter((s) => s !== '')) {
      if (typeof cursor !== 'object' || cursor === null) {
        return undefined;
      }
      cursor = (cursor as Record<string, unknown>)[step];
    }
    return cursor;
  };
  return {
    text: '',
    revision: 0,
    selection: null,
    canUndo: false,
    canRedo: false,
    apply: vi.fn(() => ({ ok: true as const })),
    applyAll: vi.fn(() => ({ ok: true as const })),
    read,
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

const rows = () =>
  screen.getAllByRole('menuitem').map((row) => row.querySelector('code')?.textContent);

/** Opens the picker and checks the declared rows head it under their heading. */
function expectDeclaredFirst(expected: readonly string[]) {
  fireEvent.click(screen.getByRole('button', { name: 'Choose a format' }));
  expect(rows().slice(0, expected.length)).toEqual(expected);
  const heading = screen.getByText('From this data field');
  const first = screen.getAllByRole('menuitem')[0];
  expect(
    first !== undefined &&
      heading.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
}

const ROW_GROUPS: readonly PaletteGroup[] = [
  {
    id: 'rows',
    label: '明細',
    description: '',
    isArray: true,
    fields: [
      {
        key: 'shipped',
        label: '出荷日',
        type: 'date',
        description: '',
        sample: '',
        enumOptions: [],
        displayFormats: [
          { id: 'wareki', label: '和暦' },
          { id: 'stamp', label: '' },
        ],
      },
    ],
  },
];

describe('a bound text', () => {
  const defs = [
    'type: object',
    'properties:',
    '  issued:',
    '    type: string',
    '    format: date',
    '    displayFormats: [ { id: wareki, label: "<b>和暦</b>" }, { id: foo } ]',
    '',
  ].join('\n');

  it('offers the declared variants first, labelled verbatim, and commits a pick as one op', () => {
    const controller = makeController({ type: 'text', data: { key: 'issued' } }, { stamp: {} });
    draw(
      <PropertyPanel
        controller={controller}
        path={PATH}
        definitions={defs}
        formatCatalog={FORMAT_CATALOG}
      />,
    );
    expectDeclaredFirst(['wareki', 'foo']);
    // The label is the author's text, shown as text — never markup.
    const labelled = screen.getByRole('menuitem', { name: /<b>和暦<\/b>/ });
    expect(labelled.querySelector('b')).toBeNull();
    // The pack variant the list leaves out is gone; the registry entry and the
    // type override still pass.
    expect(rows()).toEqual(['wareki', 'foo', 'stamp', 'datetime']);
    fireEvent.click(labelled);
    expect(controller.apply).toHaveBeenCalledTimes(1);
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: PATH,
      keys: ['data', 'format'],
      value: 'wareki',
    });
  });
});

describe('a table column', () => {
  const table = { type: 'table', data: { key: 'rows' }, columns: [{ data: { key: 'shipped' } }] };

  it('in the item panel', () => {
    const controller = makeController(table, { stamp: {} });
    draw(
      <TableColumnsSection
        controller={controller}
        tablePath={PATH}
        dataKey="rows"
        dataScope=""
        groups={ROW_GROUPS}
        params="{}"
        formatCatalog={FORMAT_CATALOG}
      />,
    );
    expectDeclaredFirst(['wareki', 'stamp']);
    expect(rows()).toEqual(['wareki', 'stamp', 'datetime']);
    fireEvent.click(screen.getByRole('menuitem', { name: /和暦/ }));
    expect(controller.apply).toHaveBeenCalledTimes(1);
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: `${PATH}.columns[0]`,
      keys: ['data', 'format'],
      value: 'wareki',
    });
  });

  it('in the column sheet', () => {
    const controller = makeController(table, { stamp: {} });
    draw(
      <TableColumnSheet
        controller={controller}
        tablePath={PATH}
        dataKey="rows"
        groups={ROW_GROUPS}
        params="{}"
        formatCatalog={FORMAT_CATALOG}
      />,
    );
    expectDeclaredFirst(['wareki', 'stamp']);
    fireEvent.click(screen.getByRole('menuitem', { name: /和暦/ }));
    expect(controller.apply).toHaveBeenCalledTimes(1);
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: `${PATH}.columns[0]`,
      keys: ['data', 'format'],
      value: 'wareki',
    });
  });
});

describe('FormatOptionList', () => {
  it('heads the declared rows, and names an unlabelled one', () => {
    draw(
      <FormatOptionList
        options={[
          {
            spelling: 'wareki',
            labelKey: 'format.variant.wareki',
            samples: [],
            origin: 'declared',
            dropsTime: false,
          },
          {
            spelling: 'foo',
            labelKey: undefined,
            samples: [],
            origin: 'declared',
            dropsTime: false,
          },
          {
            spelling: 'currency',
            labelKey: 'format.label.currency',
            samples: [],
            origin: undefined,
            dropsTime: false,
          },
        ]}
        onPick={() => {}}
      />,
    );
    expect(screen.getAllByText('From this data field')).toHaveLength(1);
    const names = screen.getAllByRole('menuitem').map((row) => row.textContent);
    // The known spelling reads by its chrome label; an unknown id as itself.
    expect(names[0]).toContain('Japanese era');
    expect(names[1]).toBe('foofoo');
  });
});
