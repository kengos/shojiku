// Designer-level tests for hooks/useBlocks.ts — the reusable-block library
// (host-owned list, band-aware insertBlock, the owner gate on a block's node,
// save/manage dialogs).
import { act, fireEvent, renderHook, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useEditor } from '../editor/useEditor';
import type { SavedBlock } from '../insert/blockModel';
import { ABS_VARIED, outcomeAbs, outcomeStacked, THREE_ITEMS } from '../testkit/fixtures';
import { draw, makeTransport } from '../testkit/harness';
import { useBlocks } from './useBlocks';

/** A repeat (flow-only), a page number (band-only), a table wrapped in a
 * container (cell-refused, and wrapped so the walk has to reach it) and a plain
 * text block. */
const GATED_BLOCKS: SavedBlock[] = [
  { id: 'repeat', name: '明細', value: { type: 'repeat_flow', data: { key: 'rows' } } },
  { id: 'pageNumber', name: '頁番号', value: { type: 'page_number' } },
  {
    id: 'table',
    name: '表ブロック',
    value: { type: 'container', items: [{ type: 'table', data: { key: 'rows' } }] },
  },
  { id: 'text', name: '社判', value: { type: 'text', text: 'seal' } },
];

const ABSOLUTE_BODY = ['sections:', '  body:', '    type: absolute', '    items: []', ''].join(
  '\n',
);

/** A `repeat` whose cell holds one text — the only shape from which the insert
 * target resolves INSIDE a data-scoped cell. */
const REPEAT_CELL = [
  'sections:',
  '  body:',
  '    type: flow',
  '    items:',
  '      - type: repeat',
  '        data: { key: rows }',
  '        grid: { columns: 1, rows: 2 }',
  '        cell:',
  '          items:',
  '            - type: text',
  '              text: row',
  '',
].join('\n');
const CELL_CHILD = 'sections.body.items[0].cell.items[0]';

describe('Designer — reusable blocks', () => {
  const openInsert = () => fireEvent.click(screen.getByRole('button', { name: 'Insert' }));

  it('omits the reusable-block group when the host did not arm persistence', () => {
    draw(makeTransport(), { source: THREE_ITEMS });
    openInsert();
    expect(screen.queryByRole('menuitem', { name: /Save as reusable block/ })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Manage reusable blocks…' })).toBeNull();
  });

  it('shows the save row disabled with a reason when nothing is selected', () => {
    draw(makeTransport(), { source: THREE_ITEMS, onBlocksChange: vi.fn() });
    openInsert();
    const save = screen.getByRole('menuitem', { name: /Save as reusable block/ });
    expect(save.textContent).toContain('Select one element first');
  });

  it('saves the selected node as a named block from the Insert menu', () => {
    const onBlocksChange = vi.fn();
    draw(makeTransport(), { source: THREE_ITEMS, onBlocksChange });
    fireEvent.click(screen.getByRole('button', { name: /second/ }));
    openInsert();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Save as reusable block…' }));
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
    fireEvent.click(screen.getByRole('menuitem', { name: 'Save as reusable block…' }));
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
    fireEvent.click(screen.getByRole('menuitem', { name: 'Manage reusable blocks…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete?' }));
    expect(onBlocksChange).toHaveBeenCalledWith([]);
  });

  it('closes the save dialog on Cancel without persisting', () => {
    const onBlocksChange = vi.fn();
    draw(makeTransport(), { source: THREE_ITEMS, onBlocksChange });
    fireEvent.click(screen.getByRole('button', { name: /second/ }));
    openInsert();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Save as reusable block…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('heading', { name: 'Save as reusable block' })).toBeNull();
    expect(onBlocksChange).not.toHaveBeenCalled();
  });

  it('closes the manage dialog on Close', () => {
    const blocks = [{ id: 'block-1', name: '社判', value: { type: 'text', text: 'x' } }];
    draw(makeTransport(), { source: THREE_ITEMS, onBlocksChange: vi.fn(), blocks });
    openInsert();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Manage reusable blocks…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('heading', { name: 'Manage reusable blocks' })).toBeNull();
  });

  it('offers save on the right-click menu of a savable node (armed only)', () => {
    draw(makeTransport(), { source: THREE_ITEMS, onBlocksChange: vi.fn() });
    fireEvent.contextMenu(screen.getByRole('button', { name: /second/ }), {
      clientX: 10,
      clientY: 20,
    });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Save as reusable block…' }));
    expect(screen.getByRole('heading', { name: 'Save as reusable block' })).toBeTruthy();
  });

  it('omits the right-click save when persistence is not armed', () => {
    draw(makeTransport(), { source: THREE_ITEMS });
    fireEvent.contextMenu(screen.getByRole('button', { name: /second/ }), {
      clientX: 10,
      clientY: 20,
    });
    expect(screen.queryByRole('menuitem', { name: 'Save as reusable block…' })).toBeNull();
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

  it('does not band-place a block inserted into a container INSIDE a footer', async () => {
    // The container places its own children; band coordinates would pin the
    // block against the page margin box and pull it out of the column.
    const onChange = vi.fn<(t: string) => void>();
    const source = [
      'sections:',
      '  body:',
      '    type: flow',
      '    items: []',
      '  footer:',
      '    repeat: every_page',
      '    items:',
      '      - type: container',
      '        items: []',
      '',
    ].join('\n');
    const paths = ['sections.footer.items[0]'];
    const transport = makeTransport({ renderRaw: vi.fn(async () => outcomeStacked(paths)) });
    const blocks = [{ id: 'block-1', name: '社判', value: { type: 'text', text: 'seal' } }];
    draw(transport, { source, onBlocksChange: vi.fn(), blocks, onChange });
    fireEvent.click(await screen.findByRole('button', { name: paths[0] }));
    openInsert();
    fireEvent.click(screen.getByRole('menuitem', { name: '社判' }));
    const written = onChange.mock.calls.at(-1)?.[0] as string;
    expect(written).toMatch(/type: container[\s\S]*text: seal/);
    expect(written).not.toMatch(/x: 0/);
  });

  it('refuses a FLOW-ONLY block into a band, naming the reason', async () => {
    // A `repeat_flow` band-placed into a footer would not even parse (`box:` is
    // unknown to it), so the whole document would stop rendering — not just
    // that item. The hook's own lock is pinned directly in the suite below.
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
    const blocks: SavedBlock[] = [
      { id: 'block-1', name: '明細', value: { type: 'repeat_flow', data: { key: 'rows' } } },
      { id: 'block-2', name: '社判', value: { type: 'text', text: 'seal' } },
    ];
    draw(makeTransport(), { source, onBlocksChange: vi.fn(), blocks, onChange });
    fireEvent.click(await screen.findByRole('button', { name: /Footer/ }));
    openInsert();
    // The row says why instead of acting…
    const blocked = screen.getByRole('menuitem', { name: /明細/ });
    expect(blocked.textContent).toContain('only directly in a flow body');
    fireEvent.click(blocked);
    expect(onChange).not.toHaveBeenCalled();
    // …and the CONTROL: the ordinary block in the same library still inserts
    // into the same band, so the refusal is about the kind, not the target.
    fireEvent.click(screen.getByRole('menuitem', { name: '社判' }));
    expect(onChange.mock.calls.at(-1)?.[0]).toMatch(/seal[\s\S]*x: 0/);
  });

  it('refuses a flow-only block in an ABSOLUTE body, where no band is involved', () => {
    // The résumé and certificate presets ship an absolute body: the insert used
    // to succeed there and the engine skipped the item, so nothing drew.
    const onChange = vi.fn<(t: string) => void>();
    draw(makeTransport(), {
      source: ABSOLUTE_BODY,
      onBlocksChange: vi.fn(),
      blocks: GATED_BLOCKS,
      onChange,
    });
    openInsert();
    const row = screen.getByRole('menuitem', { name: /明細/ });
    expect(row.textContent).toContain('only directly in a flow body');
    expect(row.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(row);
    expect(onChange).not.toHaveBeenCalled();
    // The control: the unrestricted block in the same library inserts here.
    fireEvent.click(screen.getByRole('menuitem', { name: '社判' }));
    expect(onChange.mock.calls.at(-1)?.[0]).toContain('seal');
  });

  it('refuses a flow-only block inside a container of the flow body', async () => {
    const source = [
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: container',
      '        items: []',
      '',
    ].join('\n');
    const paths = ['sections.body.items[0]'];
    const transport = makeTransport({ renderRaw: vi.fn(async () => outcomeStacked(paths)) });
    const onChange = vi.fn<(t: string) => void>();
    draw(transport, { source, onBlocksChange: vi.fn(), blocks: GATED_BLOCKS, onChange });
    fireEvent.click(await screen.findByRole('button', { name: 'sections.body.items[0]' }));
    openInsert();
    // The body IS a flow here, which is why the reason says DIRECTLY.
    const row = screen.getByRole('menuitem', { name: /明細/ });
    expect(row.textContent).toContain('only directly in a flow body');
    expect(row.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(row);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('refuses a page-number block outside a band and inserts it into one', async () => {
    const onChange = vi.fn<(t: string) => void>();
    const source = [
      'sections:',
      '  body:',
      '    type: flow',
      '    items: []',
      '  footer:',
      '    repeat: every_page',
      '    items: []',
      '',
    ].join('\n');
    draw(makeTransport(), { source, onBlocksChange: vi.fn(), blocks: GATED_BLOCKS, onChange });
    openInsert();
    const inBody = screen.getByRole('menuitem', { name: /頁番号/ });
    expect(inBody.textContent).toContain('only directly in a header or footer');
    expect(inBody.getAttribute('aria-disabled')).toBe('true');
    openInsert(); // the menu button toggles: close it before reaching the tree
    // The control: the same block is an ordinary row once the footer is the target.
    fireEvent.click(await screen.findByRole('button', { name: /Footer/ }));
    openInsert();
    const inFooter = screen.getByRole('menuitem', { name: '頁番号' });
    expect(inFooter.getAttribute('aria-disabled')).not.toBe('true');
    fireEvent.click(inFooter);
    expect(onChange.mock.calls.at(-1)?.[0]).toMatch(/footer:[\s\S]*type: page_number/);
  });

  it('shows a table block disabled with its reason inside a repeat cell', async () => {
    const transport = makeTransport({ renderRaw: vi.fn(async () => outcomeAbs([CELL_CHILD])) });
    const onChange = vi.fn<(text: string) => void>();
    draw(transport, {
      source: REPEAT_CELL,
      onChange,
      onBlocksChange: vi.fn(),
      blocks: GATED_BLOCKS,
    });
    await waitFor(() => screen.getByRole('button', { name: CELL_CHILD }));
    fireEvent.click(screen.getByRole('button', { name: CELL_CHILD }));
    openInsert();
    const row = screen.getByRole('menuitem', { name: /表ブロック/ });
    expect(row.textContent).toContain('not inside a repeat, a card or a table cell');
    // The reason and the DISABLED state are separate assertions, and the three
    // gate tests above carry both for the same reason this one does: a row
    // that states why and still acts is the failure, and a test that checks
    // only the words cannot see it.
    expect(row.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(row);
    expect(onChange).not.toHaveBeenCalled();
    // The control: the plain block beside it stays an ordinary row, so the
    // reason belongs to the block and not to the selection.
    const plain = screen.getByRole('menuitem', { name: /社判/ });
    expect(plain.textContent).toBe('社判');
    expect(plain.getAttribute('aria-disabled')).not.toBe('true');
  });

  it('disables the save row while a multi-selection is active (wrap first)', async () => {
    const paths = ['sections.body.items[0]', 'sections.body.items[1]', 'sections.body.items[2]'];
    const transport = makeTransport({ renderRaw: vi.fn(async () => outcomeAbs(paths)) });
    draw(transport, { source: ABS_VARIED, onBlocksChange: vi.fn() });
    await waitFor(() => screen.getByRole('button', { name: paths[0] }));
    fireEvent.click(screen.getByRole('button', { name: paths[0] }));
    fireEvent.click(screen.getByRole('button', { name: paths[1] }), { shiftKey: true });
    openInsert();
    const save = screen.getByRole('menuitem', { name: /Save as reusable block/ });
    expect(save.textContent).toContain('Select one element first');
  });
});

describe('useBlocks — the insert lock', () => {
  // The menu disables a row the target cannot hold, and insertBlock refuses the
  // same write on its own: the two disagree only when the selection moves
  // between the menu being built and the row being clicked, which a rendered
  // menu cannot stage — so the lock is driven directly here.
  function mount(source: string) {
    return renderHook(() => {
      const editor = useEditor(source);
      const blocks = useBlocks({
        blocks: GATED_BLOCKS,
        onBlocksChange: vi.fn(),
        editor,
        multiSel: new Set(),
        previewRef: { current: null },
      });
      return { editor, blocks };
    });
  }

  it('writes nothing for a node the resolved owner cannot hold', () => {
    const hook = mount(ABSOLUTE_BODY);
    act(() => hook.result.current.blocks.insertBlock('repeat'));
    act(() => hook.result.current.blocks.insertBlock('pageNumber'));
    expect(hook.result.current.editor.text).toBe(ABSOLUTE_BODY);
  });

  it('inserts an unrestricted node into the same owner (the control)', () => {
    const hook = mount(ABSOLUTE_BODY);
    act(() => hook.result.current.blocks.insertBlock('text'));
    expect(hook.result.current.editor.text).toContain('seal');
    expect(hook.result.current.editor.selection).toBe('sections.body.items[0]');
  });

  it('writes nothing for a block carrying a table when the target is a cell', () => {
    const hook = mount(REPEAT_CELL);
    act(() => hook.result.current.editor.select(CELL_CHILD));
    act(() => hook.result.current.blocks.insertBlock('table'));
    expect(hook.result.current.editor.text).toBe(REPEAT_CELL);
  });

  it('inserts the SAME table block into the flow body, and a text block into the cell', () => {
    // Two controls in one: the refusal above is about the pairing, not about
    // the block (it lands in the body) and not about the target (a text block
    // lands in the cell).
    const body = mount(REPEAT_CELL);
    act(() => body.result.current.blocks.insertBlock('table'));
    expect(body.result.current.editor.text).toContain('type: table');

    const cell = mount(REPEAT_CELL);
    act(() => cell.result.current.editor.select(CELL_CHILD));
    act(() => cell.result.current.blocks.insertBlock('text'));
    expect(cell.result.current.editor.text).toContain('seal');
    expect(cell.result.current.editor.selection).toBe('sections.body.items[0].cell.items[1]');
  });
});
