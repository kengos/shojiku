// Designer-level tests for hooks/useBlocks.ts — the reusable-block library
// (host-owned list, band-aware insertBlock, save/manage dialogs).
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ABS_VARIED, outcomeAbs, THREE_ITEMS } from '../testkit/fixtures';
import { draw, makeTransport } from '../testkit/harness';

describe('Designer — reusable blocks', () => {
  const openInsert = () => fireEvent.click(screen.getByRole('button', { name: 'Insert' }));

  it('omits the reusable-block group when the host did not arm persistence', () => {
    draw(makeTransport(), { source: THREE_ITEMS });
    openInsert();
    expect(screen.queryByRole('menuitem', { name: /Save selection as block/ })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Manage blocks…' })).toBeNull();
  });

  it('shows the save row disabled with a reason when nothing is selected', () => {
    draw(makeTransport(), { source: THREE_ITEMS, onBlocksChange: vi.fn() });
    openInsert();
    const save = screen.getByRole('menuitem', { name: /Save selection as block/ });
    expect(save.textContent).toContain('Select one element first');
  });

  it('saves the selected node as a named block from the Insert menu', () => {
    const onBlocksChange = vi.fn();
    draw(makeTransport(), { source: THREE_ITEMS, onBlocksChange });
    fireEvent.click(screen.getByRole('button', { name: /second/ }));
    openInsert();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Save selection as block…' }));
    fireEvent.change(screen.getByLabelText('Block name'), { target: { value: '見出し' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onBlocksChange).toHaveBeenCalledWith([
      { id: 'block-1', name: '見出し', value: { type: 'text', text: 'second' } },
    ]);
  });

  it('surfaces a duplicate-name refusal and does not persist', () => {
    const onBlocksChange = vi.fn();
    const blocks = [{ id: 'block-1', name: '見出し', value: { type: 'text', text: 'x' } }];
    draw(makeTransport(), { source: THREE_ITEMS, onBlocksChange, blocks });
    fireEvent.click(screen.getByRole('button', { name: /second/ }));
    openInsert();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Save selection as block…' }));
    fireEvent.change(screen.getByLabelText('Block name'), { target: { value: '見出し' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('A block with this name already exists.')).toBeTruthy();
    expect(onBlocksChange).not.toHaveBeenCalled();
  });

  it('inserts a saved block at the body end via insertItem', () => {
    const onChange = vi.fn<(text: string) => void>();
    const blocks = [{ id: 'block-1', name: '社判', value: { type: 'text', text: 'seal' } }];
    draw(makeTransport(), { source: THREE_ITEMS, onBlocksChange: vi.fn(), blocks, onChange });
    openInsert();
    fireEvent.click(screen.getByRole('menuitem', { name: '社判' }));
    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls.at(-1)?.[0]).toContain('seal');
  });

  it('deletes a block from the manage dialog (two-step confirm)', () => {
    const onBlocksChange = vi.fn();
    const blocks = [{ id: 'block-1', name: '社判', value: { type: 'text', text: 'x' } }];
    draw(makeTransport(), { source: THREE_ITEMS, onBlocksChange, blocks });
    openInsert();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Manage blocks…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete?' }));
    expect(onBlocksChange).toHaveBeenCalledWith([]);
  });

  it('closes the save dialog on Cancel without persisting', () => {
    const onBlocksChange = vi.fn();
    draw(makeTransport(), { source: THREE_ITEMS, onBlocksChange });
    fireEvent.click(screen.getByRole('button', { name: /second/ }));
    openInsert();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Save selection as block…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('heading', { name: 'Save as reusable block' })).toBeNull();
    expect(onBlocksChange).not.toHaveBeenCalled();
  });

  it('closes the manage dialog on Close', () => {
    const blocks = [{ id: 'block-1', name: '社判', value: { type: 'text', text: 'x' } }];
    draw(makeTransport(), { source: THREE_ITEMS, onBlocksChange: vi.fn(), blocks });
    openInsert();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Manage blocks…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('heading', { name: 'Manage reusable blocks' })).toBeNull();
  });

  it('offers save on the right-click menu of a savable node (armed only)', () => {
    draw(makeTransport(), { source: THREE_ITEMS, onBlocksChange: vi.fn() });
    fireEvent.contextMenu(screen.getByRole('button', { name: /second/ }), {
      clientX: 10,
      clientY: 20,
    });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Save as block…' }));
    expect(screen.getByRole('heading', { name: 'Save as reusable block' })).toBeTruthy();
  });

  it('omits the right-click save when persistence is not armed', () => {
    draw(makeTransport(), { source: THREE_ITEMS });
    fireEvent.contextMenu(screen.getByRole('button', { name: /second/ }), {
      clientX: 10,
      clientY: 20,
    });
    expect(screen.queryByRole('menuitem', { name: 'Save as block…' })).toBeNull();
  });

  it('commits nothing when a block insert is refused by the op layer', () => {
    const onChange = vi.fn<(t: string) => void>();
    // `items: 3` — the insert target is not an array, so the insertItem fails.
    const broken = ['sections:', '  body:', '    type: flow', '    items: 3', ''].join('\n');
    const blocks = [{ id: 'block-1', name: '社判', value: { type: 'text', text: 'seal' } }];
    draw(makeTransport(), { source: broken, onBlocksChange: vi.fn(), blocks, onChange });
    openInsert();
    fireEvent.click(screen.getByRole('menuitem', { name: '社判' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('band-places a block inserted into a selected footer', async () => {
    const onChange = vi.fn<(t: string) => void>();
    const source = [
      'version: 0.1.0',
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: text',
      '        text: hello',
      '  footer:',
      '    repeat: every_page',
      '    items: []',
      '',
    ].join('\n');
    const blocks = [{ id: 'block-1', name: '社判', value: { type: 'text', text: 'seal' } }];
    draw(makeTransport(), { source, onBlocksChange: vi.fn(), blocks, onChange });
    fireEvent.click(await screen.findByRole('button', { name: /Footer/ }));
    openInsert();
    fireEvent.click(screen.getByRole('menuitem', { name: '社判' }));
    const written = onChange.mock.calls.at(-1)?.[0] as string;
    // Band children are coordinate-placed (x/y added); a body insert stays box-less.
    expect(written).toMatch(/seal[\s\S]*x: 0/);
  });

  it('disables the save row while a multi-selection is active (wrap first)', async () => {
    const paths = ['sections.body.items[0]', 'sections.body.items[1]', 'sections.body.items[2]'];
    const transport = makeTransport({ renderRaw: vi.fn(async () => outcomeAbs(paths)) });
    draw(transport, { source: ABS_VARIED, onBlocksChange: vi.fn() });
    await waitFor(() => screen.getByRole('button', { name: paths[0] }));
    fireEvent.click(screen.getByRole('button', { name: paths[0] }));
    fireEvent.click(screen.getByRole('button', { name: paths[1] }), { shiftKey: true });
    openInsert();
    const save = screen.getByRole('menuitem', { name: /Save selection as block/ });
    expect(save.textContent).toContain('Select one element first');
  });
});
