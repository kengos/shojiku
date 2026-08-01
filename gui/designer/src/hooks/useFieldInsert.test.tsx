// Designer-level tests for hooks/useFieldInsert.ts — the create-data-field
// modal (工房モード).
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { outcomeStacked, THREE_ITEMS } from '../testkit/fixtures';
import { draw, makeTransport } from '../testkit/harness';

describe('Designer create-data-field', () => {
  const DATA_ITEM = [
    'sections:',
    '  body:',
    '    type: flow',
    '    items:',
    '      - type: text',
    '        data:',
    '          key: greeting',
    '',
  ].join('\n');

  function openFieldDialog() {
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Create data field…' }));
    return screen.getByRole('dialog');
  }

  it('insert-menu path: creates the field, inserts a bound text item, selects it', async () => {
    const onChange = vi.fn();
    const onParamsChange = vi.fn();
    draw(makeTransport(), { source: THREE_ITEMS, onChange, onParamsChange });
    const dialog = openFieldDialog();
    fireEvent.change(within(dialog).getByLabelText('Field name'), { target: { value: 'amount' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const doc = String(onChange.mock.calls.at(-1)?.[0]);
    expect(doc).toContain('key: amount');
    // A new bound text item appended after the existing three.
    expect(doc.indexOf('third')).toBeLessThan(doc.indexOf('key: amount'));
    expect(onParamsChange).toHaveBeenCalledTimes(1);
    const params = JSON.parse(String(onParamsChange.mock.calls[0][0])) as Record<string, unknown>;
    expect(Object.hasOwn(params, 'amount')).toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('carries the edited sample value into params as a typed value', async () => {
    const onParamsChange = vi.fn();
    draw(makeTransport(), { source: THREE_ITEMS, onParamsChange });
    const dialog = openFieldDialog();
    fireEvent.change(within(dialog).getByLabelText('Field name'), { target: { value: 'total' } });
    fireEvent.change(within(dialog).getByLabelText('Kind'), { target: { value: 'number' } });
    fireEvent.change(within(dialog).getByLabelText('Sample value'), { target: { value: '300' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(onParamsChange).toHaveBeenCalled());
    const params = JSON.parse(String(onParamsChange.mock.calls.at(-1)?.[0])) as Record<
      string,
      unknown
    >;
    expect(params.total).toBe(300);
  });

  it('gives a 通貨 field a symbol format on the inserted item', async () => {
    // The dialog is workshop-only, so the bound item carries
    // `format: symbol` — the engine coerces number + symbol to currency
    // and the field shows ¥ from its first preview.
    const onChange = vi.fn();
    draw(makeTransport(), { source: THREE_ITEMS, onChange });
    const dialog = openFieldDialog();
    fireEvent.change(within(dialog).getByLabelText('Field name'), { target: { value: '金額' } });
    fireEvent.change(within(dialog).getByLabelText('Kind'), { target: { value: 'currency' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const doc = String(onChange.mock.calls.at(-1)?.[0]);
    expect(doc).toContain('key: 金額');
    expect(doc).toContain('format: symbol');
  });

  it('hides the create-field entry with an engineer schema (not workshop)', () => {
    draw(makeTransport(), {
      definitions: 'properties:\n  a: { type: string }\n',
      sampleDataReadOnly: true,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }));
    expect(screen.queryByRole('menuitem', { name: 'Create data field…' })).toBeNull();
  });

  it('refuses an existing sample key before inserting anything', () => {
    const onChange = vi.fn();
    draw(makeTransport(), { source: THREE_ITEMS, params: '{"amount": 1}', onChange });
    const dialog = openFieldDialog();
    fireEvent.change(within(dialog).getByLabelText('Field name'), { target: { value: 'amount' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
    expect(screen.getByText('Sample data already has an entry with this name.')).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('reports a failed insert and commits no params', () => {
    const onChange = vi.fn();
    const onParamsChange = vi.fn();
    const broken = ['sections:', '  body:', '    type: flow', '    items: 3', ''].join('\n');
    draw(makeTransport(), { source: broken, onChange, onParamsChange });
    const dialog = openFieldDialog();
    fireEvent.change(within(dialog).getByLabelText('Field name'), { target: { value: 'amount' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
    expect(screen.getByText('Could not insert here.')).toBeTruthy();
    expect(onParamsChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('cancel closes the dialog without touching the document', () => {
    const onChange = vi.fn();
    draw(makeTransport(), { source: THREE_ITEMS, onChange });
    const dialog = openFieldDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('reports unreadable sample data and commits nothing', () => {
    const onChange = vi.fn();
    const onParamsChange = vi.fn();
    // Malformed params (not a JSON object) → extendParams refuses invalid_params.
    draw(makeTransport(), { source: THREE_ITEMS, params: 'not json', onChange, onParamsChange });
    const dialog = openFieldDialog();
    fireEvent.change(within(dialog).getByLabelText('Field name'), { target: { value: 'amount' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
    expect(screen.getByText('Sample data could not be read.')).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
    expect(onParamsChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('picker-tail path: creates the field and binds the CURRENT item, no new item', async () => {
    const onChange = vi.fn();
    const onParamsChange = vi.fn();
    const transport = makeTransport({
      renderRaw: vi.fn(async () => outcomeStacked(['sections.body.items[0]'])),
    });
    draw(transport, {
      source: DATA_ITEM,
      params: '{"greeting": "hi"}',
      onChange,
      onParamsChange,
    });
    // Select the data-bound text item via its canvas box, then open the
    // data.key picker and click the create-field tail.
    await waitFor(() => screen.getByRole('button', { name: 'sections.body.items[0]' }));
    fireEvent.click(screen.getByRole('button', { name: 'sections.body.items[0]' }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Create data field…' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Field name'), {
      target: { value: 'salutation' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const doc = String(onChange.mock.calls.at(-1)?.[0]);
    // The current item rebound to the new key; no second item was inserted.
    expect(doc).toContain('key: salutation');
    expect(doc.match(/type: text/g)?.length).toBe(1);
    const params = JSON.parse(String(onParamsChange.mock.calls.at(-1)?.[0])) as Record<
      string,
      unknown
    >;
    expect(Object.hasOwn(params, 'salutation')).toBe(true);
  });

  it('keeps a hostile field name inert (no prototype pollution)', async () => {
    const onParamsChange = vi.fn();
    draw(makeTransport(), { source: THREE_ITEMS, onParamsChange });
    const dialog = openFieldDialog();
    fireEvent.change(within(dialog).getByLabelText('Field name'), {
      target: { value: '__proto__' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(onParamsChange).toHaveBeenCalled());
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    // The key round-tripped as an own quoted key, never a prototype write.
    expect(String(onParamsChange.mock.calls.at(-1)?.[0])).toContain('__proto__');
  });
});
