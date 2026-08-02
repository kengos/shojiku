// Designer-level tests for hooks/useIterableInsert.ts — the iterable dialog:
// params rows first, typed refusal, ONE insertItem, params committed only
// after success.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { outcomeStacked, THREE_ITEMS } from '../testkit/fixtures';
import { draw, makeTransport } from '../testkit/harness';

describe('Designer iterable scaffold', () => {
  const ARRAY_DEFS = [
    'properties:',
    '  order_items:',
    '    type: array',
    '    title: 明細',
    '    items:',
    '      type: object',
    '      properties:',
    '        name: { type: string, title: 品名 }',
    '        quantity: { type: number, title: 数量 }',
    '',
  ].join('\n');

  function openDialog() {
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Place list data…' }));
    return screen.getByRole('dialog');
  }

  it('hides the list-data menu entry when nothing arms it (schema without arrays, no workshop)', () => {
    const defs = [
      'properties:',
      '  order:',
      '    type: object',
      '    properties:',
      '      code: { type: string }',
      '',
    ].join('\n');
    draw(makeTransport(), { definitions: defs, sampleDataReadOnly: true });
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }));
    expect(screen.queryByRole('menuitem', { name: 'Place list data…' })).toBeNull();
  });

  it('inserts a group table scaffold through the dialog: one op, selected, dialog closed', async () => {
    const onChange = vi.fn();
    draw(makeTransport(), { source: THREE_ITEMS, definitions: ARRAY_DEFS, onChange });
    const dialog = openDialog();
    expect(within(dialog).getByText(/明細/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Insert list' }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const doc = String(onChange.mock.calls.at(-1)?.[0]);
    expect(doc).toContain('type: table');
    expect(doc).toContain('label: 品名');
    expect(doc).toContain('label: 数量');
    expect(doc.indexOf('third')).toBeLessThan(doc.indexOf('type: table'));
    expect(screen.queryByRole('dialog')).toBeNull();
    // The selection travelled to the new item: the deepest breadcrumb crumb is
    // the inserted table (tree label = its data.key).
    await waitFor(() =>
      expect(document.querySelector('[aria-current="true"]')?.textContent).toContain('order_items'),
    );
  });

  it('inserts the cards variant right after the selected body item', async () => {
    const onChange = vi.fn();
    const transport = makeTransport({
      renderRaw: vi.fn(async () =>
        outcomeStacked([
          'sections.body.items[0]',
          'sections.body.items[1]',
          'sections.body.items[2]',
        ]),
      ),
    });
    draw(transport, { source: THREE_ITEMS, definitions: ARRAY_DEFS, onChange });
    await waitFor(() => screen.getByRole('button', { name: 'sections.body.items[0]' }));
    fireEvent.click(screen.getByRole('button', { name: 'sections.body.items[0]' }));
    const dialog = openDialog();
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Cards' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Insert list' }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const doc = String(onChange.mock.calls.at(-1)?.[0]);
    const inserted = doc.indexOf('repeat_flow');
    expect(inserted).toBeGreaterThan(doc.indexOf('first'));
    expect(inserted).toBeLessThan(doc.indexOf('second'));
  });

  it('blank-start create: generates sample rows AND inserts the scaffold, selecting it', async () => {
    const onChange = vi.fn();
    const onParamsChange = vi.fn();
    draw(makeTransport(), { source: THREE_ITEMS, onChange, onParamsChange });
    const dialog = openDialog();
    fireEvent.change(within(dialog).getByLabelText('List name'), { target: { value: '明細' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Insert list' }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const doc = String(onChange.mock.calls.at(-1)?.[0]);
    expect(doc).toContain('type: table');
    expect(doc).toContain('label: Field 1');
    expect(onParamsChange).toHaveBeenCalledTimes(1);
    const params = JSON.parse(String(onParamsChange.mock.calls[0][0])) as Record<string, unknown>;
    const rows = params.明細;
    expect(Array.isArray(rows)).toBe(true);
    expect(rows).toHaveLength(3);
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() =>
      expect(document.querySelector('[aria-current="true"]')?.textContent).toContain('明細'),
    );
  });

  const JP_DEFS = [
    'properties:',
    '  order_items:',
    '    type: array',
    '    title: 明細',
    '    items:',
    '      type: object',
    '      properties:',
    '        品名: { type: string, title: 品名 }',
    '',
  ].join('\n');

  it('declares a charset-unsafe field so a list scaffold still shows it', async () => {
    const onChange = vi.fn();
    draw(makeTransport(), { source: THREE_ITEMS, definitions: JP_DEFS, onChange });
    const dialog = openDialog();
    fireEvent.click(within(dialog).getByRole('radio', { name: 'List' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Insert list' }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const doc = String(onChange.mock.calls.at(-1)?.[0]);
    expect(doc).toContain('type: list');
    expect(doc).toContain('bindings:');
    expect(doc).toContain('key: 品名');
  });

  it('degrades that list to bare entries against an engine without declarations', async () => {
    const onChange = vi.fn();
    draw(makeTransport(), {
      source: THREE_ITEMS,
      definitions: JP_DEFS,
      onChange,
      capabilities: ['binding.scope'],
    });
    const dialog = openDialog();
    fireEvent.click(within(dialog).getByRole('radio', { name: 'List' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Insert list' }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const doc = String(onChange.mock.calls.at(-1)?.[0]);
    expect(doc).toContain('type: list');
    expect(doc).not.toContain('bindings');
  });

  it('closes the dialog from its cancel button without touching the document', () => {
    const onChange = vi.fn();
    draw(makeTransport(), { source: THREE_ITEMS, definitions: ARRAY_DEFS, onChange });
    const dialog = openDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a failed insert commits NO params and reports the refusal in the dialog', () => {
    const onChange = vi.fn();
    const onParamsChange = vi.fn();
    const broken = ['sections:', '  body:', '    type: flow', '    items: 3', ''].join('\n');
    draw(makeTransport(), { source: broken, onChange, onParamsChange });
    const dialog = openDialog();
    fireEvent.change(within(dialog).getByLabelText('List name'), { target: { value: '明細' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Insert list' }));
    expect(screen.getByText('Could not insert here.')).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
    expect(onParamsChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('an existing sample key is refused before anything is inserted', () => {
    const onChange = vi.fn();
    draw(makeTransport(), { source: THREE_ITEMS, params: '{"明細": []}', onChange });
    const dialog = openDialog();
    // Workshop mode with data: the inferred stub already lists 明細 as a
    // group, so the dialog opens in group mode — switch to the create form.
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Create new data' }));
    fireEvent.change(within(dialog).getByLabelText('List name'), { target: { value: '明細' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Insert list' }));
    expect(screen.getByText('Sample data already has an entry with this name.')).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('drops an array-group heading on the canvas as its default table scaffold', async () => {
    const onChange = vi.fn();
    const paths = ['sections.body.items[0]', 'sections.body.items[1]', 'sections.body.items[2]'];
    const transport = makeTransport({ renderRaw: vi.fn(async () => outcomeStacked(paths)) });
    const { container } = draw(transport, {
      source: THREE_ITEMS,
      definitions: ARRAY_DEFS,
      onChange,
    });
    await waitFor(() => screen.getByRole('button', { name: 'sections.body.items[0]' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Data fields' }));
    const heading = screen.getByText('明細').closest('h3');
    expect(heading).not.toBeNull();
    if (heading === null) {
      return;
    }
    const svg = container.querySelector('.sj-box-overlay');
    expect(svg).not.toBeNull();
    if (svg !== null) {
      Object.defineProperty(svg, 'getBoundingClientRect', {
        value: () => ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200 }),
      });
    }
    fireEvent.pointerDown(heading, { pointerId: 9, isPrimary: true, clientX: 500, clientY: 500 });
    fireEvent.pointerMove(heading, { pointerId: 9, clientX: 100, clientY: 60 });
    fireEvent.pointerUp(heading, { pointerId: 9, clientX: 100, clientY: 60 });
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const doc = String(onChange.mock.calls.at(-1)?.[0]);
    const inserted = doc.indexOf('type: table');
    expect(inserted).toBeGreaterThan(doc.indexOf('first'));
    expect(inserted).toBeLessThan(doc.indexOf('second'));
    expect(doc).toContain('key: order_items');
    // The dropped scaffold is selected at its landing slot.
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'sections.body.items[1]' }).getAttribute('aria-pressed'),
      ).toBe('true'),
    );
    // A drop outside every page stays a no-op for the group payload too.
    onChange.mockClear();
    fireEvent.pointerDown(heading, { pointerId: 9, isPrimary: true, clientX: 500, clientY: 500 });
    fireEvent.pointerMove(heading, { pointerId: 9, clientX: 400, clientY: 400 });
    fireEvent.pointerUp(heading, { pointerId: 9, clientX: 400, clientY: 400 });
    expect(onChange).not.toHaveBeenCalled();
  });
});
