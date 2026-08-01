// Designer-level tests for hooks/usePasteInsert.ts — the paste import
// (scaffold + verbatim params rows + ONE table insert).
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { THREE_ITEMS } from '../testkit/fixtures';
import { draw, makeTransport } from '../testkit/harness';

describe('Designer paste import', () => {
  function openPaste() {
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Paste table…' }));
    return screen.getByRole('dialog');
  }

  it('inserts a NEW table with verbatim rows and commits the pasted params', async () => {
    const onChange = vi.fn();
    const onParamsChange = vi.fn();
    draw(makeTransport(), { source: THREE_ITEMS, onChange, onParamsChange });
    const dialog = openPaste();
    fireEvent.change(within(dialog).getByLabelText('Pasted data'), {
      target: { value: '品目\t金額\nりんご\t¥300\nみかん\t¥120' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Insert table' }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const doc = String(onChange.mock.calls.at(-1)?.[0]);
    expect(doc).toContain('type: table');
    expect(doc).toContain('label: 品目');
    expect(doc).toContain('label: 金額');
    // The money column carries a symbol format on its data binding (the
    // pasted cells had ¥, so the display reproduces it).
    expect(doc).toContain('format: symbol');
    // Params carry the verbatim rows under a fresh top-level key.
    expect(onParamsChange).toHaveBeenCalledTimes(1);
    const params = JSON.parse(String(onParamsChange.mock.calls[0][0])) as Record<string, unknown>;
    const rows = params.table as Record<string, unknown>[];
    expect(rows).toEqual([
      { col1: 'りんご', col2: 300 },
      { col1: 'みかん', col2: 120 },
    ]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('derives a fresh source key when `table` is already taken', async () => {
    const onParamsChange = vi.fn();
    draw(makeTransport(), { source: THREE_ITEMS, params: '{"table": 1}', onParamsChange });
    const dialog = openPaste();
    fireEvent.change(within(dialog).getByLabelText('Pasted data'), {
      target: { value: 'a\n1' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Insert table' }));
    await waitFor(() => expect(onParamsChange).toHaveBeenCalled());
    const params = JSON.parse(String(onParamsChange.mock.calls[0][0])) as Record<string, unknown>;
    expect(params.table).toBe(1); // untouched
    expect(params.table_2).toBeTruthy(); // the fresh key
  });

  it('refuses on unreadable params without inserting', () => {
    const onChange = vi.fn();
    draw(makeTransport(), { source: THREE_ITEMS, params: '"not an object"', onChange });
    const dialog = openPaste();
    fireEvent.change(within(dialog).getByLabelText('Pasted data'), { target: { value: 'a\n1' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Insert table' }));
    expect(screen.getByText('Sample data could not be read.')).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('reports a failed insert and commits no params', () => {
    const onChange = vi.fn();
    const onParamsChange = vi.fn();
    const broken = ['sections:', '  body:', '    type: flow', '    items: 3', ''].join('\n');
    draw(makeTransport(), { source: broken, onChange, onParamsChange });
    const dialog = openPaste();
    fireEvent.change(within(dialog).getByLabelText('Pasted data'), { target: { value: 'a\n1' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Insert table' }));
    expect(screen.getByText('Could not insert here.')).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
    expect(onParamsChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('closes from Cancel without touching the document', () => {
    const onChange = vi.fn();
    draw(makeTransport(), { source: THREE_ITEMS, onChange });
    const dialog = openPaste();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});
