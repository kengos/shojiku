// The table's "Rows and pages" section as a reader meets it: which controls a
// flow-body table and a bounded one get, which the engine's capabilities
// withhold, and that every control commits exactly one edit — or none, for a
// blur that changed nothing.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { EditorController } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import { applyRowMode } from './TableRowHeights';
import { TableSettingsSection } from './TableSettingsSection';
import { readTableSettings } from './tableSettingsModel';

const FLOW = 'sections.body.items[0]';
const NESTED = 'sections.body.items[0].items[1]';

const TABLE = {
  type: 'table',
  data: { key: 'rows' },
  columns: [{ label: 'A' }, { label: 'B' }, { label: 'C' }],
};

function makeController(path: string, node: unknown, bodyType = 'flow'): EditorController {
  const reads: Record<string, unknown> = {
    [path]: node,
    'sections.body': { type: bodyType, items: [] },
    'sections.body.items[0]': path === FLOW ? node : { type: 'container', items: [{}, node] },
  };
  return {
    text: '',
    revision: 0,
    selection: null,
    canUndo: false,
    canRedo: false,
    apply: vi.fn(() => ({ ok: true as const })),
    applyAll: vi.fn(() => ({ ok: true as const })),
    read: (p: string) => reads[p],
    undo: vi.fn(),
    redo: vi.fn(),
    select: vi.fn(),
    clearSelection: vi.fn(),
    setMaxBytes: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    replaceDocument: vi.fn(),
  };
}

function section(
  node: unknown = TABLE,
  options: {
    readonly path?: string;
    readonly capabilities?: readonly string[];
    readonly onSelectPath?: (path: string) => void;
    readonly apply?: EditorController['apply'];
    readonly bodyType?: string;
  } = {},
) {
  const path = options.path ?? FLOW;
  const controller = makeController(path, node, options.bodyType);
  if (options.apply !== undefined) {
    controller.apply = options.apply;
  }
  render(
    <I18nProvider locale="en">
      <TableSettingsSection
        context={{
          path,
          controller,
          capabilities: options.capabilities,
          onSelectPath: options.onSelectPath,
        }}
      />
    </I18nProvider>,
  );
  return controller;
}

function box(name: string): HTMLInputElement {
  return screen.getByRole('checkbox', { name }) as HTMLInputElement;
}

function field(name: string): HTMLInputElement {
  return screen.getByRole('textbox', { name }) as HTMLInputElement;
}

function commit(name: string, value: string) {
  const input = field(name);
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
}

describe('TableSettingsSection — a table in the flow body', () => {
  it('offers the row, padding, empty-data and page controls', () => {
    section();
    expect(screen.getByRole('heading', { name: 'Rows and pages' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Fit content' })).toBeTruthy();
    expect(field('Minimum height')).toBeTruthy();
    expect(field('Header row height').placeholder).toBe('Auto');
    expect(field('Cell padding').placeholder).toBe('4');
    expect(screen.getByRole('combobox', { name: 'When there is no data' })).toBeTruthy();
    expect(box('Join empty cells to the next one').checked).toBe(false);
    expect(box('Continue rows on the next page').checked).toBe(true);
    expect(box('Repeat the header row on each page').checked).toBe(true);
    expect(box('Keep the table on one page').checked).toBe(false);
    expect(screen.queryByText(/drawn as one block/)).toBeNull();
  });

  it('commits each switch as one edit', () => {
    const controller = section();
    fireEvent.click(box('Continue rows on the next page'));
    fireEvent.click(box('Repeat the header row on each page'));
    fireEvent.click(box('Keep the table on one page'));
    fireEvent.click(box('Join empty cells to the next one'));
    expect(vi.mocked(controller.apply).mock.calls.map(([op]) => op)).toEqual([
      { op: 'setScalar', path: FLOW, keys: ['autoPageBreak'], value: false },
      { op: 'setScalar', path: FLOW, keys: ['repeatHeader'], value: false },
      { op: 'setScalar', path: FLOW, keys: ['keepTogether'], value: true },
      { op: 'setScalar', path: FLOW, keys: ['mergeEmptyCells'], value: true },
    ]);
  });

  it('switches the rows to fixed in one batch, and shows the fixed field', () => {
    const controller = section({ ...TABLE, row: { minHeight: 30 } });
    fireEvent.click(screen.getByRole('radio', { name: 'Fixed' }));
    expect(controller.applyAll).toHaveBeenCalledTimes(1);
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'setScalar', path: FLOW, keys: ['row', 'height'], value: 30 },
      { op: 'removeKey', path: FLOW, keys: ['row', 'minHeight'] },
    ]);
  });

  it('shows a fixed height and returns to auto with one edit', () => {
    const controller = section({ ...TABLE, row: { height: '8mm' } });
    expect(field('Row height').value).toBe('8mm');
    fireEvent.blur(field('Row height'));
    expect(controller.apply).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: 'Minimum height' })).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'Fit content' }));
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'removeKey', path: FLOW, keys: ['row', 'height'] },
    ]);
  });

  it('commits typed heights and padding, and refuses what the wire should not get', () => {
    const controller = section();
    commit('Minimum height', '30');
    commit('Header row height', '-4');
    commit('Cell padding', '6');
    commit('Cell padding', '2mm');
    expect(vi.mocked(controller.apply).mock.calls.map(([op]) => op)).toEqual([
      { op: 'setScalar', path: FLOW, keys: ['row', 'minHeight'], value: 30 },
      { op: 'setScalar', path: FLOW, keys: ['cellPadding'], value: 6 },
    ]);
  });

  it('steps an empty height from where the rows really are', () => {
    const controller = section({ ...TABLE, row: { minHeight: 30 } });
    fireEvent.click(screen.getByRole('button', { name: 'Increase Header row height' }));
    fireEvent.click(screen.getByRole('button', { name: 'Increase Minimum height' }));
    fireEvent.click(screen.getByRole('button', { name: 'Decrease Cell padding' }));
    expect(vi.mocked(controller.apply).mock.calls.map(([op]) => op)).toEqual([
      { op: 'setScalar', path: FLOW, keys: ['header', 'height'], value: 31 },
      { op: 'setScalar', path: FLOW, keys: ['row', 'minHeight'], value: 31 },
      { op: 'setScalar', path: FLOW, keys: ['cellPadding'], value: 3 },
    ]);
  });

  it('steps a fixed height, and an empty header from the engine floor', () => {
    const controller = section({ ...TABLE, row: { height: 20, minHeight: '50%' } });
    fireEvent.click(screen.getByRole('button', { name: 'Decrease Row height' }));
    fireEvent.click(screen.getByRole('button', { name: 'Increase Header row height' }));
    expect(vi.mocked(controller.apply).mock.calls.map(([op]) => op)).toEqual([
      { op: 'setScalar', path: FLOW, keys: ['row', 'height'], value: 19 },
      { op: 'setScalar', path: FLOW, keys: ['header', 'height'], value: 25 },
    ]);
  });

  it('authors nothing when a field is left unchanged, a relative height included', () => {
    const controller = section({ ...TABLE, header: { height: '50%' }, cellPadding: 5 });
    for (const name of ['Minimum height', 'Header row height', 'Cell padding']) {
      fireEvent.blur(field(name));
    }
    expect(controller.apply).not.toHaveBeenCalled();
    expect(field('Header row height').value).toBe('50%');
    // The field's OWN reason: typing a percent is refused here too, so the
    // shared "type the value instead" hint would send the reader into a wall.
    expect(screen.getByText(/this field takes pt, mm, cm or in/)).toBeTruthy();
    expect(screen.queryByText(/Type the value instead/)).toBeNull();
    expect(
      (screen.getByRole('button', { name: 'Increase Header row height' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('picks what an empty array draws, and clears it back to the default', () => {
    const controller = section();
    fireEvent.change(screen.getByRole('combobox', { name: 'When there is no data' }), {
      target: { value: 'reserve' },
    });
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: FLOW,
      keys: ['emptyBehavior'],
      value: 'reserve',
    });
  });

  it('shows an authored reserve and removes it when the default is picked', () => {
    const controller = section({ ...TABLE, emptyBehavior: 'reserve' });
    fireEvent.change(screen.getByRole('combobox', { name: 'When there is no data' }), {
      target: { value: 'collapse' },
    });
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'removeKey',
      path: FLOW,
      keys: ['emptyBehavior'],
    });
  });
});

describe('TableSettingsSection — a table the engine draws as one block', () => {
  it('says the table does not continue, and offers no page switches', () => {
    section(TABLE, { path: NESTED });
    expect(screen.getByText(/drawn as one block/)).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: 'Continue rows on the next page' })).toBeNull();
    expect(
      screen.queryByRole('checkbox', { name: 'Repeat the header row on each page' }),
    ).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Keep the table on one page' })).toBeNull();
    expect(field('Cell padding')).toBeTruthy();
    expect(box('Join empty cells to the next one')).toBeTruthy();
  });

  it('says so for a table directly in an absolute body', () => {
    section(TABLE, { bodyType: 'absolute' });
    expect(screen.getByText(/drawn as one block/)).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: 'Continue rows on the next page' })).toBeNull();
  });

  it('says so for a table in a header or footer band', () => {
    section(TABLE, { path: 'sections.footer.items[0]' });
    expect(screen.getByText(/drawn as one block/)).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: 'Keep the table on one page' })).toBeNull();
  });

  it('says nothing about pages for a path that is no list entry', () => {
    section(TABLE, { path: 'sections.body' });
    expect(screen.queryByText(/drawn as one block/)).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Continue rows on the next page' })).toBeNull();
    expect(field('Cell padding')).toBeTruthy();
  });

  it('says nothing about pages when the parent list cannot be read', () => {
    const controller = makeController(FLOW, TABLE);
    const read = controller.read;
    controller.read = (p: string) => {
      if (p === 'sections.body.items') {
        throw new Error('alias bomb');
      }
      return read(p);
    };
    render(
      <I18nProvider locale="en">
        <TableSettingsSection context={{ path: FLOW, controller, capabilities: undefined }} />
      </I18nProvider>,
    );
    expect(screen.queryByText(/drawn as one block/)).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Continue rows on the next page' })).toBeNull();
  });
});

describe('TableSettingsSection — engine capabilities', () => {
  it('withholds each gated control against an engine that lacks its key', () => {
    section(TABLE, { capabilities: ['table'] });
    expect(screen.queryByRole('radio', { name: 'Fixed' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Header row height' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Keep the table on one page' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Join empty cells to the next one' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add header group' })).toBeNull();
    // Ungated: they ride on the table itself.
    expect(field('Cell padding')).toBeTruthy();
    expect(box('Continue rows on the next page')).toBeTruthy();
  });

  it('offers each gated control against an engine that declares it', () => {
    section(TABLE, {
      capabilities: [
        'table.row.height',
        'table.keepTogether',
        'table.mergeEmptyCells',
        'table.headerGroups',
      ],
    });
    expect(screen.getByRole('radio', { name: 'Fixed' })).toBeTruthy();
    expect(box('Keep the table on one page')).toBeTruthy();
    expect(box('Join empty cells to the next one')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add header group' })).toBeTruthy();
  });
});

describe('TableSettingsSection — header groups', () => {
  it('adds a group over the uncovered columns and selects it', () => {
    const onSelectPath = vi.fn();
    const controller = section(
      { ...TABLE, headerGroups: [{ label: 'X', span: 1 }] },
      { onSelectPath },
    );
    expect(screen.getByText('Header groups (1)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add header group' }));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'insertItem',
      path: `${FLOW}.headerGroups`,
      index: 1,
      value: { label: 'Group', span: 2 },
    });
    expect(onSelectPath).toHaveBeenCalledWith(`${FLOW}.headerGroups[1]`);
  });

  it('adds without a selection callback, and does not select after a refused insert', () => {
    section(TABLE);
    fireEvent.click(screen.getByRole('button', { name: 'Add header group' }));
    const onSelectPath = vi.fn();
    const refused = vi.fn(() => ({
      ok: false as const,
      error: { code: 'path_not_found' as const, message: 'x' },
    }));
    section(TABLE, { onSelectPath, apply: refused });
    fireEvent.click(screen.getAllByRole('button', { name: 'Add header group' })[1]);
    expect(refused).toHaveBeenCalledTimes(1);
    expect(onSelectPath).not.toHaveBeenCalled();
  });

  it('disables adding, and says why, when every column is grouped', () => {
    section({ ...TABLE, headerGroups: [{ label: 'X', span: 3 }] });
    const add = screen.getByRole('button', { name: 'Add header group' }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    expect(screen.getByText(/Every column is already under a group/)).toBeTruthy();
  });

  it('asks for a column first on a table that has none', () => {
    section({ type: 'table', data: { key: 'rows' }, columns: [] });
    expect(screen.getByText('Add a column first.')).toBeTruthy();
  });
});

describe('applyRowMode', () => {
  it('authors nothing for the mode already on screen', () => {
    const applyAll = vi.fn(() => ({ ok: true as const }));
    applyRowMode({ applyAll }, FLOW, readTableSettings(TABLE), 'auto');
    expect(applyAll).not.toHaveBeenCalled();
    applyRowMode({ applyAll }, FLOW, readTableSettings(TABLE), 'fixed');
    expect(applyAll).toHaveBeenCalledTimes(1);
  });
});
