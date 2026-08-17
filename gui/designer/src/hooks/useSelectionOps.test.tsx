// Designer-level tests for the right-click menu's selection actions
// (hooks/useSelectionOps.ts `deleteAt`/`duplicateAt`) and the border popover
// that its border row opens (shell/BorderPopover.tsx). The wrap and save-block
// rows are covered by useContainerInsert / useBlocks; these are the rows this
// menu gained.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DesignerProps } from '../Designer';
import { outcomeStacked, THREE_ITEMS } from '../testkit/fixtures';
import { draw, makeTransport } from '../testkit/harness';

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
