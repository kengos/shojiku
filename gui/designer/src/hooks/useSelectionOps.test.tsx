// Designer-level tests for the right-click menu's selection actions
// (hooks/useSelectionOps.ts `deleteAt`/`duplicateAt`) and the border popover
// that its border row opens (shell/BorderPopover.tsx). The wrap and save-block
// rows are covered by useContainerInsert / useBlocks; these are the rows this
// menu gained, plus the wrap hook's own refusal, which no rendered row reaches.
import { act, fireEvent, renderHook, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DesignerProps } from '../Designer';
import { useEditor } from '../editor/useEditor';
import { outcomeStacked, THREE_ITEMS } from '../testkit/fixtures';
import { draw, makeTransport } from '../testkit/harness';
import { useSelectionOps } from './useSelectionOps';

const PATHS = ['sections.body.items[0]', 'sections.body.items[1]', 'sections.body.items[2]'];

async function drawCanvas(props: Partial<DesignerProps> = {}) {
  const onChange = vi.fn<(text: string) => void>();
  const transport = makeTransport({ renderRaw: vi.fn(async () => outcomeStacked(PATHS)) });
  const { container } = draw(transport, { source: THREE_ITEMS, onChange, ...props });
  await waitFor(() => expect(container.querySelectorAll('canvas')).toHaveLength(1));
  return { onChange };
}

/** Right-click the canvas box at `path` and return the open menu. */
function rightClickBox(path: string, clientX = 50, clientY = 70): HTMLElement {
  fireEvent.contextMenu(screen.getByRole('button', { name: path }), { clientX, clientY });
  return screen.getByRole('menu');
}

function rowNames(menu: HTMLElement): readonly (string | null)[] {
  return within(menu)
    .getAllByRole('menuitem')
    .map((item) => item.textContent);
}

function latest(onChange: ReturnType<typeof vi.fn>): string {
  return (onChange.mock.calls.at(-1)?.[0] ?? '') as string;
}

const GROUPED = (groups: string) => `sections:
  body:
    type: flow
    items:
      - type: table
        data: { key: rows }
        headerGroups: [${groups}]
        columns:
          - { label: A }
          - { label: B }
`;

describe('deleting a header group', () => {
  function mount(source: string) {
    return renderHook(() => {
      const editor = useEditor(source);
      const ops = useSelectionOps({
        editor,
        deselectClearing: vi.fn(),
        docViewOpenRef: { current: false },
        dataViewOpenRef: { current: false },
        closeDocView: vi.fn(),
        closeDataView: vi.fn(),
      });
      return { editor, ops };
    });
  }

  it('takes the key with the last group, exactly as the panel button does', () => {
    const hook = mount(GROUPED('{ label: X, span: 2 }'));
    act(() => hook.result.current.ops.deleteAt('sections.body.items[0].headerGroups[0]'));
    expect(hook.result.current.editor.text).not.toContain('headerGroups');
    expect(hook.result.current.editor.selection).toBe('sections.body.items[0]');
  });

  it('removes one of several groups and selects the one that slides in', () => {
    const hook = mount(GROUPED('{ label: X, span: 1 }, { label: Y, span: 1 }'));
    act(() => hook.result.current.ops.deleteAt('sections.body.items[0].headerGroups[0]'));
    const text = hook.result.current.editor.text;
    expect(text).toContain('headerGroups');
    expect(text).toContain('label: Y');
    expect(text).not.toContain('label: X');
    expect(hook.result.current.editor.selection).toBe('sections.body.items[0].headerGroups[0]');
  });
});

describe('Designer right-click actions', () => {
  it('offers duplicate, delete, wrap and borders in menu order on a canvas box', async () => {
    await drawCanvas();
    expect(rowNames(rightClickBox(PATHS[1]))).toEqual([
      'Duplicate',
      'Delete',
      'Group into a container',
      'Borders…',
    ]);
  });

  it('offers the same rows from a layer-tree row', async () => {
    await drawCanvas();
    fireEvent.contextMenu(screen.getByRole('button', { name: /second/ }), {
      clientX: 10,
      clientY: 20,
    });
    expect(rowNames(screen.getByRole('menu'))).toEqual([
      'Duplicate',
      'Delete',
      'Group into a container',
      'Borders…',
    ]);
  });

  it('deletes the right-clicked item and travels the selection to its neighbour', async () => {
    const { onChange } = await drawCanvas();
    fireEvent.click(within(rightClickBox(PATHS[1])).getByRole('menuitem', { name: 'Delete' }));
    await waitFor(() => expect(latest(onChange)).not.toContain('text: second'));
    expect(latest(onChange)).toContain('text: first');
    expect(latest(onChange)).toContain('text: third');
    // The item shifted into the freed slot is now selected — the panel does not
    // snap back to page setup.
    await waitFor(() => expect(screen.getByLabelText('Text').textContent).toBe('third'));
  });

  it('duplicates the right-clicked item', async () => {
    const { onChange } = await drawCanvas();
    fireEvent.click(within(rightClickBox(PATHS[1])).getByRole('menuitem', { name: 'Duplicate' }));
    await waitFor(() => expect(latest(onChange).match(/text: second/g)).toHaveLength(2));
  });

  it('says above the canvas why a duplicate did not happen', async () => {
    const many = Array.from({ length: 256 }, (_, n) => `          - { type: text, id: t${n} }`);
    const source = [
      'sections:',
      '  body:',
      '    items:',
      '      - { type: text, text: first }',
      '      - type: container',
      '        items:',
      ...many,
      '      - { type: text, text: third }',
      '',
    ].join('\n');
    await drawCanvas({ source });
    fireEvent.click(within(rightClickBox(PATHS[1])).getByRole('menuitem', { name: 'Duplicate' }));
    expect(
      await screen.findByText('Nothing was added: too many names would need renumbering at once.'),
    ).toBeTruthy();
  });

  it('withholds the border row on an engine without borders', async () => {
    await drawCanvas({ capabilities: [] });
    expect(rowNames(rightClickBox(PATHS[1]))).toEqual([
      'Duplicate',
      'Delete',
      'Group into a container',
    ]);
  });
});

describe('Designer border popover', () => {
  async function openBorders(path = PATHS[1], clientX = 50, clientY = 70) {
    const drawn = await drawCanvas();
    fireEvent.click(
      within(rightClickBox(path, clientX, clientY)).getByRole('menuitem', { name: 'Borders…' }),
    );
    return drawn;
  }

  it('opens the shared border editor at the pointer and writes an edge in one undo step', async () => {
    const { onChange } = await openBorders();
    const popover = screen.getByRole('menu');
    expect(popover.style.left).toBe('50px');
    expect(popover.style.top).toBe('70px');
    fireEvent.click(within(popover).getByRole('button', { name: 'Top border' }));
    await waitFor(() => expect(latest(onChange)).toContain('borderWidth'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Undo' })[0]);
    await waitFor(() => expect(latest(onChange)).not.toContain('borderWidth'));
  });

  it('closes on Escape without clearing the selection', async () => {
    await openBorders();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    // The item is still selected: its property panel is still the item's.
    expect(screen.getByRole('tab', { name: 'Content' })).toBeTruthy();
  });

  it('closes on a pointer press outside it', async () => {
    await openBorders();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('renders nothing once its target is gone underneath it', async () => {
    // The LAST item: removing it makes its path unreadable rather than shifting
    // another item into it.
    const { onChange } = await openBorders(PATHS[2]);
    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Delete' });
    await waitFor(() => expect(latest(onChange)).not.toContain('text: third'));
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('useSelectionOps — wrapSelected', () => {
  // Every wrap affordance is withheld from an item the wrap would erase, so the
  // hook's own refusal is reachable only when the document changes between the
  // row being built and being clicked — driven directly here.
  const FOOTER = [
    'sections:',
    '  body:',
    '    type: flow',
    '    items: []',
    '  footer:',
    '    repeat: every_page',
    '    items:',
    '      - type: page_number',
    '      - type: text',
    '        text: hello',
    '',
  ].join('\n');

  function mount() {
    return renderHook(() => {
      const editor = useEditor(FOOTER);
      const ops = useSelectionOps({
        editor,
        deselectClearing: vi.fn(),
        docViewOpenRef: { current: false },
        dataViewOpenRef: { current: false },
        closeDocView: vi.fn(),
        closeDataView: vi.fn(),
      });
      return { editor, ops };
    });
  }

  it('writes nothing for an item a container would skip', () => {
    const hook = mount();
    act(() => hook.result.current.ops.wrapSelected('sections.footer.items[0]'));
    expect(hook.result.current.editor.text).toBe(FOOTER);
    expect(hook.result.current.editor.selection).toBeNull();
  });

  it('wraps an item a container holds, and selects the new container (the control)', () => {
    const hook = mount();
    act(() => hook.result.current.ops.wrapSelected('sections.footer.items[1]'));
    expect(hook.result.current.editor.text).toContain('type: container');
    expect(hook.result.current.editor.selection).toBe('sections.footer.items[1]');
  });
});

// ⌘D's copy takes fresh ids in the same batch (`ids/copyIds`): a copied group
// circles its OWN answer, the original keeps its names, and one undo removes
// the copy whole. The exhaustive renaming rules are the model suite's; this
// pins the hook's wiring of them.
describe('duplicating a named item', () => {
  const NAMED = `sections:
  body:
    items:
      - type: container
        id: answer
        items:
          - { type: text, id: yes, text: "Yes" }
          - { type: ellipse, anchor: yes }
`;

  function mount(source: string) {
    return renderHook(() => {
      const editor = useEditor(source);
      const ops = useSelectionOps({
        editor,
        deselectClearing: vi.fn(),
        docViewOpenRef: { current: false },
        dataViewOpenRef: { current: false },
        closeDocView: vi.fn(),
        closeDataView: vi.fn(),
      });
      return { editor, ops };
    });
  }

  it('renames the copy and rewires its anchor, in one undo step', () => {
    const hook = mount(NAMED);
    const before = hook.result.current.editor.text;
    act(() => hook.result.current.ops.duplicateAt('sections.body.items[0]'));
    const { editor } = hook.result.current;
    expect(editor.read('sections.body.items[1]')).toEqual({
      type: 'container',
      id: 'answer_2',
      items: [
        { type: 'text', id: 'yes_2', text: 'Yes' },
        { type: 'ellipse', anchor: 'yes_2' },
      ],
    });
    expect(editor.read('sections.body.items[0]')).toMatchObject({ id: 'answer' });
    expect(editor.selection).toBe('sections.body.items[1]');
    act(() => hook.result.current.editor.undo());
    expect(hook.result.current.editor.text).toBe(before);
  });

  it('duplicates nothing when the copy would overrun the batch cap, and says why until the next edit', () => {
    const many = Array.from({ length: 256 }, (_, n) => `          - { type: text, id: t${n} }`);
    const source = [
      'sections:',
      '  body:',
      '    items:',
      '      - type: container',
      '        items:',
      ...many,
      '',
    ].join('\n');
    const hook = mount(source);
    act(() => hook.result.current.ops.duplicateAt('sections.body.items[0]'));
    expect(hook.result.current.editor.text).toBe(source);
    expect(hook.result.current.editor.canUndo).toBe(false);
    expect(hook.result.current.ops.copyNotice).toBe('copy.notice.too_many');
    // The next committed edit clears it: the user has moved on.
    act(() => {
      hook.result.current.editor.apply({
        op: 'setScalar',
        path: 'sections.body.items[0]',
        keys: ['id'],
        value: 'g',
      });
    });
    expect(hook.result.current.ops.copyNotice).toBeNull();
  });
});
