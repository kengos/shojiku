import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/context';
import type { PickerOption } from '../panel/pickerModel';
import type { ChipContext } from './chipContext';
import { InsertFieldMenu } from './InsertFieldMenu';

const OPTIONS: readonly PickerOption[] = [
  { key: 'customer.name', label: '顧客名', type: 'string', sample: '山田太郎', enumValues: [] },
  { key: 'total', label: 'Total', type: 'number', sample: '5000', enumValues: [] },
  { key: 'memo', label: 'Memo', type: 'mystery', sample: '', enumValues: [] },
  { key: 'bad key', label: 'Unsafe', type: 'string', sample: '', enumValues: [] },
];

const DOCUMENT_OPTIONS: readonly PickerOption[] = [
  { key: 'store_name', label: '店舗名', type: 'string', sample: '青山店', enumValues: [] },
];

function context(over: Partial<ChipContext> = {}): ChipContext {
  return {
    options: OPTIONS,
    documentOptions: OPTIONS,
    scope: null,
    declared: new Map(),
    canDeclare: false,
    otherNames: [],
    ...over,
  };
}

function draw(chips: ChipContext, onInsert = vi.fn()) {
  render(
    <I18nProvider locale="en">
      <InsertFieldMenu chips={chips} onInsert={onInsert} />
    </I18nProvider>,
  );
  return onInsert;
}

function open(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Insert a data field' }));
}

describe('InsertFieldMenu', () => {
  it('opens a menu of safe fields with label, key, type, and sample', () => {
    draw(context());
    open();
    const rows = screen.getAllByRole('menuitem');
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain('顧客名');
    expect(rows[0].textContent).toContain('customer.name');
    expect(rows[0].textContent).toContain('山田太郎');
    // An unregistered wire type shows verbatim, and an empty sample shows
    // no sample cell at all.
    expect(rows[2].textContent).toContain('mystery');
    expect(rows[2].querySelector('.sj-field-picker-sample')).toBeNull();
    // Without declarations the charset-unsafe key would print literal braces
    // on the page, so it is not offered as a chip.
    expect(screen.queryByRole('menuitem', { name: /Unsafe/ })).toBeNull();
    // At document scope there is only one kind of field, so no headings.
    expect(screen.queryByText("This row's data")).toBeNull();
    expect(screen.queryByText('Document data')).toBeNull();
  });

  it('picking a row fires onInsert with the option and its section, then closes', () => {
    const onInsert = draw(context());
    open();
    fireEvent.click(screen.getByRole('menuitem', { name: /Total/ }));
    expect(onInsert).toHaveBeenCalledWith(OPTIONS[1], false);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('offers a charset-unsafe key once the engine understands declarations', () => {
    const onInsert = draw(context({ canDeclare: true }));
    open();
    expect(screen.getAllByRole('menuitem')).toHaveLength(4);
    fireEvent.click(screen.getByRole('menuitem', { name: /Unsafe/ }));
    expect(onInsert).toHaveBeenCalledWith(OPTIONS[3], false);
  });

  it('adds a labeled document-data section inside a row scope', () => {
    const onInsert = draw(
      context({ scope: 'items', documentOptions: DOCUMENT_OPTIONS, canDeclare: true }),
    );
    open();
    expect(screen.getByText("This row's data")).toBeDefined();
    expect(screen.getByText('Document data')).toBeDefined();
    // The document row is offered even though the row scope cannot reach it
    // with the bare grammar — the declaration is what makes it expressible.
    fireEvent.click(screen.getByRole('menuitem', { name: /店舗名/ }));
    expect(onInsert).toHaveBeenCalledWith(DOCUMENT_OPTIONS[0], true);
  });

  it('hides the document section against an engine without declarations', () => {
    draw(context({ scope: 'items', documentOptions: DOCUMENT_OPTIONS }));
    open();
    // The row's own fields stay labeled as such; the fields it could only
    // reach through a declaration are not offered at all.
    expect(screen.getByText("This row's data")).toBeDefined();
    expect(screen.queryByText('Document data')).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /店舗名/ })).toBeNull();
  });

  it('filters rows by the search query and resets it per pick', () => {
    const onInsert = draw(context());
    open();
    fireEvent.change(screen.getByLabelText('Search data fields'), { target: { value: 'tot' } });
    expect(screen.getAllByRole('menuitem')).toHaveLength(1);
    fireEvent.click(screen.getByRole('menuitem', { name: /Total/ }));
    expect(onInsert).toHaveBeenCalledTimes(1);
    open();
    expect(screen.getAllByRole('menuitem')).toHaveLength(3);
  });

  it('filters both sections and drops the heading of an emptied one', () => {
    draw(context({ scope: 'items', documentOptions: DOCUMENT_OPTIONS, canDeclare: true }));
    open();
    fireEvent.change(screen.getByLabelText('Search data fields'), { target: { value: 'store' } });
    expect(screen.getAllByRole('menuitem')).toHaveLength(1);
    expect(screen.queryByText("This row's data")).toBeNull();
    expect(screen.getByText('Document data')).toBeDefined();
  });

  it('shows the no-matches state when the query excludes everything', () => {
    draw(context());
    open();
    fireEvent.change(screen.getByLabelText('Search data fields'), { target: { value: 'zzz' } });
    expect(screen.queryAllByRole('menuitem')).toHaveLength(0);
    expect(screen.getByText('No fields match.')).toBeDefined();
  });

  it('shows the empty state when there are no fields at all', () => {
    draw(context({ options: [], documentOptions: [] }));
    open();
    expect(screen.getByText('No data fields to choose from.')).toBeDefined();
  });
});
