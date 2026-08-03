import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/context';
import { FieldPicker } from './FieldPicker';
import type { PickerOption } from './pickerModel';

const OPTIONS: readonly PickerOption[] = [
  { key: 'order.code', label: '注文コード', type: 'string', sample: 'ORD-9', enumValues: [] },
  { key: 'amount.total', label: 'amount.total', type: 'currency', sample: '1200', enumValues: [] },
  { key: 'order.logo', label: 'ロゴ', type: 'weird-type', sample: '', enumValues: [] },
];

function draw(value: string, options: readonly PickerOption[], onCommit = vi.fn()) {
  render(
    <I18nProvider locale="en">
      <FieldPicker label="Data key" value={value} options={options} onCommit={onCommit} />
    </I18nProvider>,
  );
  return onCommit;
}

describe('FieldPicker', () => {
  it('renders the current key in a free-entry input with the picker closed', () => {
    draw('order.code', OPTIONS);
    expect((screen.getByLabelText('Data key') as HTMLInputElement).value).toBe('order.code');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('says what the bound key IS without opening the popover', () => {
    // The key alone is a spelling nobody can check: `order.code` names neither
    // the field nor what it prints.
    draw('order.code', OPTIONS);
    const control = screen.getByLabelText('Data key').closest('div');
    expect(control?.textContent).toContain('注文コード');
    expect(control?.textContent).toContain('Text');
    expect(control?.textContent).toContain('ORD-9');
  });

  it('shows no such line for a key nothing offers, or a field with no sample', () => {
    draw('typo.key', OPTIONS);
    // An undeclared key is what the live diagnostic is for; the panel does not
    // invent an identity for it.
    expect(screen.getByLabelText('Data key').closest('div')?.textContent).not.toContain(
      '注文コード',
    );
    cleanup();
    draw('order.logo', OPTIONS);
    const control = screen.getByLabelText('Data key').closest('div');
    expect(control?.textContent).toContain('ロゴ');
    expect(control?.textContent).toContain('weird-type');
  });

  it('opens the popover with label, key, localized type, and sample per row', () => {
    draw('', OPTIONS);
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    const menu = screen.getByRole('menu');
    expect(menu.textContent).toContain('注文コード');
    expect(menu.textContent).toContain('order.code');
    expect(menu.textContent).toContain('Currency');
    expect(menu.textContent).toContain('ORD-9');
    // An unknown type name displays verbatim (never a composed catalog key).
    expect(menu.textContent).toContain('weird-type');
  });

  it('commits ONE key on pick and closes', () => {
    const onCommit = draw('', OPTIONS);
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /注文コード/ }));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('order.code');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('does not commit when picking the already-current key', () => {
    const onCommit = draw('order.code', OPTIONS);
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /注文コード/ }));
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('filters rows by the search query (plain text, case-insensitive)', () => {
    draw('', OPTIONS);
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    fireEvent.change(screen.getByLabelText('Search data fields'), {
      target: { value: 'AMOUNT' },
    });
    expect(screen.queryByRole('menuitem', { name: /注文コード/ })).toBeNull();
    expect(screen.getByRole('menuitem', { name: /amount\.total/ })).toBeTruthy();
    // A regex metacharacter query is plain text — no match, no throw.
    fireEvent.change(screen.getByLabelText('Search data fields'), { target: { value: '.*' } });
    expect(screen.getByText('No fields match.')).toBeTruthy();
  });

  it('shows the empty state when there are no options at all', () => {
    draw('', []);
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    expect(screen.getByText('No data fields to choose from.')).toBeTruthy();
  });

  it('free entry commits on blur only when changed', () => {
    const onCommit = draw('order.code', OPTIONS);
    const input = screen.getByLabelText('Data key') as HTMLInputElement;
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.blur(input, { target: { value: 'custom.key' } });
    expect(onCommit).toHaveBeenCalledWith('custom.key');
  });

  it('closes on Escape without committing', () => {
    const onCommit = draw('', OPTIONS);
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('resets the query after a pick (reopening shows every row)', () => {
    draw('', OPTIONS);
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    fireEvent.change(screen.getByLabelText('Search data fields'), {
      target: { value: 'amount' },
    });
    fireEvent.click(screen.getByRole('menuitem', { name: /amount\.total/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    expect(screen.getByRole('menuitem', { name: /注文コード/ })).toBeTruthy();
  });

  it('shows no create-field tail when onCreateField is absent', () => {
    draw('', OPTIONS);
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    expect(screen.queryByRole('menuitem', { name: /Create data field/i })).toBeNull();
  });

  it('offers a create-field tail that hands the commit up and closes the popover', () => {
    const onCommit = vi.fn();
    const onCreateField = vi.fn();
    render(
      <I18nProvider locale="en">
        <FieldPicker
          label="Data key"
          value=""
          options={OPTIONS}
          onCommit={onCommit}
          onCreateField={onCreateField}
        />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Create data field/i }));
    expect(onCreateField).toHaveBeenCalledTimes(1);
    // The picker hands its OWN commit up, so a created field binds this item.
    expect(onCreateField).toHaveBeenCalledWith(onCommit);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('shows the create-field tail even in the empty state', () => {
    render(
      <I18nProvider locale="en">
        <FieldPicker
          label="Data key"
          value=""
          options={[]}
          onCommit={vi.fn()}
          onCreateField={vi.fn()}
        />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    expect(screen.getByText('No data fields to choose from.')).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Create data field/i })).toBeTruthy();
  });
});

describe('FieldPicker — binding scope', () => {
  const ROW_OPTIONS: readonly PickerOption[] = [
    { key: 'name', label: '品名', type: 'string', sample: 'りんご', enumValues: [] },
  ];

  function drawScoped(
    props: {
      readonly value?: string;
      readonly options?: readonly PickerOption[];
      readonly documentOptions?: readonly PickerOption[];
      readonly scope?: string;
      readonly onPick?: (key: string, documentScoped: boolean) => void;
      readonly onCommit?: (key: string) => void;
    } = {},
  ) {
    const onPick = props.onPick ?? vi.fn();
    const onCommit = props.onCommit ?? vi.fn();
    const view = render(
      <I18nProvider locale="en">
        <FieldPicker
          label="Data key"
          value={props.value ?? ''}
          options={props.options ?? ROW_OPTIONS}
          documentOptions={props.documentOptions ?? OPTIONS}
          scope={props.scope}
          onPick={onPick}
          onCommit={onCommit}
        />
      </I18nProvider>,
    );
    return { ...view, onPick, onCommit };
  }

  it('splits the popover into a row section and a document section', () => {
    drawScoped();
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    expect(screen.getByText("This row's data")).toBeTruthy();
    expect(screen.getByText('Document data')).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /品名/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /注文コード/ })).toBeTruthy();
    // Only the document rows carry the scope badge — it says WHY that row
    // resolves differently from the ones above it.
    expect(screen.getAllByText('Document')).toHaveLength(OPTIONS.length);
  });

  it('shows NO headings when only one section has offers', () => {
    // Two shapes reach this: an item at document scope (no document section),
    // and a data-SOURCE picker whose only offers are document-scope arrays.
    const { unmount } = drawScoped({ documentOptions: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    expect(screen.queryByText("This row's data")).toBeNull();
    expect(screen.queryByText('Document data')).toBeNull();
    unmount();
    drawScoped({ options: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    expect(screen.queryByText("This row's data")).toBeNull();
    expect(screen.queryByText('Document data')).toBeNull();
    // The rows are still badged, which is what says they escape the row.
    expect(screen.getAllByText('Document')).toHaveLength(OPTIONS.length);
  });

  it('reports a document pick and a row pick with the scope they came from', () => {
    const { onPick, onCommit } = drawScoped();
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /注文コード/ }));
    expect(onPick).toHaveBeenCalledWith('order.code', true);
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /品名/ }));
    expect(onPick).toHaveBeenCalledWith('name', false);
    // A pick never goes through the free-entry commit — that one cannot carry
    // a scope, so routing a pick through it would silently keep a stale one.
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('authors NOTHING when the pick changes neither key nor scope', () => {
    // Re-picking the row already bound is not an edit; it must not mint an
    // undo step (the free-entry commit has always guarded this).
    const rowBound = drawScoped({ value: 'name', scope: '' });
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /品名/ }));
    expect(rowBound.onPick).not.toHaveBeenCalled();
    cleanup();
    const docBound = drawScoped({ value: 'order.code', scope: 'document' });
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /注文コード/ }));
    expect(docBound.onPick).not.toHaveBeenCalled();
  });

  it('re-picks the SAME key from the other section to move the scope', () => {
    // `store.name` bound at row scope, re-picked from the document section:
    // the key does not change but the scope must.
    const options = [
      { key: 'order.code', label: '注文コード', type: 'string', sample: '', enumValues: [] },
    ];
    const { onPick } = drawScoped({ value: 'order.code', scope: '', options });
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    // The document section's row (the row section carries the same key).
    const rows = screen.getAllByRole('menuitem', { name: /注文コード/ });
    fireEvent.click(rows[rows.length - 1]);
    expect(onPick).toHaveBeenCalledWith('order.code', true);
  });

  it('keeps free entry on the plain commit, so typing never re-scopes', () => {
    const { onPick, onCommit } = drawScoped({ value: 'order.code', scope: 'document' });
    fireEvent.blur(screen.getByLabelText('Data key'), { target: { value: 'other.key' } });
    expect(onCommit).toHaveBeenCalledWith('other.key');
    expect(onPick).not.toHaveBeenCalled();
  });

  it('badges the CLOSED control for an authored document scope only', () => {
    const { unmount } = drawScoped({ value: 'order.code', scope: 'document' });
    expect(screen.getByText('Document')).toBeTruthy();
    unmount();
    // Unset, an authored non-document scope, and "no scope shown here" (the
    // caller passing nothing outside a row scope) all render no badge.
    for (const scope of ['', 'element', undefined]) {
      const view = drawScoped({ value: 'order.code', scope, documentOptions: [] });
      expect(view).toBeTruthy();
      expect(screen.queryByText('Document')).toBeNull();
      cleanup();
    }
  });

  it('filters BOTH sections with one query', () => {
    drawScoped();
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    fireEvent.change(screen.getByLabelText('Search data fields'), { target: { value: 'order' } });
    expect(screen.queryByRole('menuitem', { name: /品名/ })).toBeNull();
    expect(screen.getByRole('menuitem', { name: /注文コード/ })).toBeTruthy();
    // A query that matches nothing in either section reads as "no matches",
    // not as "no fields" (which would be a lie about what is offerable).
    fireEvent.change(screen.getByLabelText('Search data fields'), { target: { value: 'zzz' } });
    expect(screen.getByText('No fields match.')).toBeTruthy();
  });

  it('falls back to the plain commit when no scope choice is offered', () => {
    // `onPick` absent = this picker has no scope to choose, so a pick is a
    // plain key commit and `data.scope` is left exactly as the file has it.
    const onCommit = vi.fn();
    render(
      <I18nProvider locale="en">
        <FieldPicker label="Data key" value="" options={OPTIONS} onCommit={onCommit} />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /注文コード/ }));
    expect(onCommit).toHaveBeenCalledWith('order.code');
  });
});
