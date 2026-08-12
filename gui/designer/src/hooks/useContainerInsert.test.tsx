// Designer-level tests for hooks/useContainerInsert.ts (the container picker,
// placeholder slot replaced as ONE applyAll) and hooks/useContainerMarks.ts
// (selection/hover container highlights with kind chips).
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { outcomeStacked, THREE_ITEMS } from '../testkit/fixtures';
import { draw, makeTransport, pickMenu } from '../testkit/harness';

describe('Designer container insert + marks', () => {
  function pickCell(c: number, r: number) {
    const cell = document.querySelector<HTMLButtonElement>(`[data-cell="${c}x${r}"]`);
    expect(cell).not.toBeNull();
    fireEvent.click(cell as HTMLButtonElement);
  }

  it('inserts a row scaffold from the picker as ONE op, selects it, and one undo removes it', async () => {
    const onChange = vi.fn<(text: string) => void>();
    draw(makeTransport(), { onChange });
    pickMenu('Insert', 'Container…');
    pickCell(3, 1);
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(expect.stringContaining('type: container')),
    );
    const text = onChange.mock.calls.at(-1)?.[0] as string;
    expect(text).toContain('direction: row');
    expect(text).toContain('gap: 8');
    // Three placeholder slots.
    expect(text.match(/text: Text/g)).toHaveLength(3);
    // The new container is selected — its 配置 tab carries the 子の並べ方
    // section. (The picker's disappearance is not asserted here: a Headless
    // UI Dialog with `transition` stays mounted through its exit transition
    // in jsdom; the close WIRING is covered in the dialog's own tests.)
    fireEvent.click(screen.getByRole('tab', { name: 'Layout' }));
    expect(screen.getByText('Child layout')).toBeTruthy();
    // ONE undo step reverts the whole scaffold.
    fireEvent.click(screen.getAllByRole('button', { name: 'Undo' })[0]);
    await waitFor(() => {
      const latest = onChange.mock.calls.at(-1)?.[0] as string;
      expect(latest.includes('type: container')).toBe(false);
    });
  });

  it('inserts a grid scaffold with the traced column count', async () => {
    const onChange = vi.fn<(text: string) => void>();
    draw(makeTransport(), { onChange });
    pickMenu('Insert', 'Container…');
    pickCell(3, 2);
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(expect.stringContaining('type: grid')),
    );
    const text = onChange.mock.calls.at(-1)?.[0] as string;
    expect(text).toContain('columns: 3');
    expect(text.match(/text: Text/g)).toHaveLength(6);
  });

  it('inserts INSIDE a selected container (the resolved target)', async () => {
    const onChange = vi.fn<(text: string) => void>();
    const source = [
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: container',
      '        items:',
      '          - type: text',
      '            text: keep',
      '',
    ].join('\n');
    const paths = ['sections.body.items[0]', 'sections.body.items[0].items[0]'];
    const transport = makeTransport({ renderRaw: vi.fn(async () => outcomeStacked(paths)) });
    const { container } = draw(transport, { source, onChange });
    await waitFor(() => expect(container.querySelectorAll('canvas')).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'sections.body.items[0]' }));
    pickMenu('Insert', 'Container…');
    pickCell(1, 2);
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(expect.stringContaining('direction: column')),
    );
    const text = onChange.mock.calls.at(-1)?.[0] as string;
    // The nested scaffold landed inside the existing container's items.
    expect(text.indexOf('direction: column')).toBeGreaterThan(text.indexOf('text: keep'));
  });

  it('closes the picker without an edit when the dialog is dismissed', () => {
    const onChange = vi.fn();
    draw(makeTransport(), { onChange });
    pickMenu('Insert', 'Container…');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onChange).not.toHaveBeenCalled();
  });

  /** A column container whose first slot is an untouched placeholder and whose
   * second carries content — the nest-into-slot fixtures. */
  const SLOT_SOURCE = [
    'sections:',
    '  body:',
    '    type: flow',
    '    items:',
    '      - type: container',
    '        box: { direction: column, gap: 6 }',
    '        items:',
    '          - type: text',
    '            text: Text',
    '          - type: text',
    '            text: keep',
    '',
  ].join('\n');
  const SLOT_PATHS = [
    'sections.body.items[0]',
    'sections.body.items[0].items[0]',
    'sections.body.items[0].items[1]',
  ];

  it('REPLACES a selected placeholder slot (nest-into-slot), one undo restores it', async () => {
    const onChange = vi.fn<(text: string) => void>();
    const transport = makeTransport({ renderRaw: vi.fn(async () => outcomeStacked(SLOT_PATHS)) });
    const { container } = draw(transport, { source: SLOT_SOURCE, onChange });
    await waitFor(() => expect(container.querySelectorAll('canvas')).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'sections.body.items[0].items[0]' }));
    pickMenu('Insert', 'Container…');
    // The destination preview names the replace-the-slot rule before it fires.
    expect(screen.getByText('Inserts into the selected slot')).toBeTruthy();
    pickCell(2, 1);
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(expect.stringContaining('direction: row')),
    );
    const text = onChange.mock.calls.at(-1)?.[0] as string;
    // The row scaffold sits where the placeholder slot was; the content slot
    // survives; the replaced placeholder is gone (2 fresh slots + keep).
    expect(text).toContain('direction: row');
    expect(text).toContain('text: keep');
    expect(text.match(/text: Text/g)).toHaveLength(2);
    // ONE undo restores the placeholder slot and removes the nested row.
    fireEvent.click(screen.getAllByRole('button', { name: 'Undo' })[0]);
    await waitFor(() => {
      const latest = onChange.mock.calls.at(-1)?.[0] as string;
      expect(latest.includes('direction: row')).toBe(false);
      expect(latest.match(/text: Text/g)).toHaveLength(1);
    });
  });

  it('appends (never replaces) when the selected slot carries content — no nest hint', async () => {
    const onChange = vi.fn<(text: string) => void>();
    const transport = makeTransport({ renderRaw: vi.fn(async () => outcomeStacked(SLOT_PATHS)) });
    const { container } = draw(transport, { source: SLOT_SOURCE, onChange });
    await waitFor(() => expect(container.querySelectorAll('canvas')).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'sections.body.items[0].items[1]' }));
    pickMenu('Insert', 'Container…');
    expect(screen.queryByText('Inserts into the selected slot')).toBeNull();
    pickCell(2, 1);
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(expect.stringContaining('direction: row')),
    );
    const text = onChange.mock.calls.at(-1)?.[0] as string;
    // Both original children survive — the scaffold appended after the content
    // slot instead of replacing anything.
    expect(text).toContain('text: keep');
    expect(text.match(/text: Text/g)).toHaveLength(3);
  });

  it('survives a picker insert the op layer rejects (hostile items shape)', () => {
    const onChange = vi.fn();
    const broken = ['sections:', '  body:', '    items:', '      broken: true', ''].join('\n');
    draw(makeTransport(), { source: broken, onChange });
    pickMenu('Insert', 'Container…');
    pickCell(2, 1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('right-click on a canvas box opens the context menu; まとめる wraps in place, one undo', async () => {
    const onChange = vi.fn<(text: string) => void>();
    const paths = ['sections.body.items[0]', 'sections.body.items[1]', 'sections.body.items[2]'];
    const transport = makeTransport({ renderRaw: vi.fn(async () => outcomeStacked(paths)) });
    const { container } = draw(transport, { source: THREE_ITEMS, onChange });
    await waitFor(() => expect(container.querySelectorAll('canvas')).toHaveLength(1));
    fireEvent.contextMenu(screen.getByRole('button', { name: 'sections.body.items[1]' }), {
      clientX: 50,
      clientY: 70,
    });
    const menu = screen.getByRole('menu');
    expect(menu.style.left).toBe('50px');
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Group into a container' }));
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(expect.stringContaining('type: container')),
    );
    const text = onChange.mock.calls.at(-1)?.[0] as string;
    // The wrapped item sits inside the new column container, in place: the
    // container appears after `first` and holds `second`, with `third` after.
    expect(text).toContain('direction: column');
    expect(text.indexOf('type: container')).toBeGreaterThan(text.indexOf('text: first'));
    expect(text.indexOf('text: second')).toBeGreaterThan(text.indexOf('type: container'));
    expect(text.indexOf('text: third')).toBeGreaterThan(text.indexOf('text: second'));
    // The menu closed after the pick.
    expect(screen.queryByRole('menu')).toBeNull();
    // ONE undo reverts the wrap entirely.
    fireEvent.click(screen.getAllByRole('button', { name: 'Undo' })[0]);
    await waitFor(() => {
      const latest = onChange.mock.calls.at(-1)?.[0] as string;
      expect(latest.includes('type: container')).toBe(false);
    });
  });

  it('right-click on a tree row offers the same wrap; Escape closes without an edit', async () => {
    const onChange = vi.fn<(text: string) => void>();
    draw(makeTransport(), { source: THREE_ITEMS, onChange });
    fireEvent.contextMenu(screen.getByRole('button', { name: /second/ }), {
      clientX: 10,
      clientY: 20,
    });
    expect(screen.getByRole('menuitem', { name: 'Group into a container' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('wrap on a malformed (non-map) entry is a safe no-op (the ops-null arm)', () => {
    const onChange = vi.fn();
    // The scalar entry still gets a tree row (indices stay true), and its path
    // IS an items-list entry — so the menu offers wrap, and the op builder
    // refuses at the read (not a map).
    const source = [
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - broken',
      '',
    ].join('\n');
    draw(makeTransport(), { source, onChange });
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Item' }), {
      clientX: 5,
      clientY: 5,
    });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Group into a container' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('wrap on an oversized subtree rolls back whole (the snippet validator refuses)', () => {
    const onChange = vi.fn();
    // A container with 300 children reads fine but exceeds the insertItem
    // snippet node cap when re-authored — the batch must fail atomically.
    const children = Array.from(
      { length: 300 },
      () => '          - type: text\n            text: x',
    );
    const source = [
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: container',
      '        items:',
      ...children,
      '',
    ].join('\n');
    draw(makeTransport(), { source, onChange });
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Container' }), {
      clientX: 5,
      clientY: 5,
    });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Group into a container' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  // This used to assert an EMPTY menu on a table column, back when wrap and
  // save-as-block were the only rows: a column is unwrappable and carries no
  // savable snippet, so nothing rendered. It still offers no wrap row — but a
  // column IS a sequence entry, so the duplicate/delete rows apply to it, and
  // the delete row issues exactly the `removeItem` the column editor's own
  // delete button does.
  it('right-click on a table column offers the sequence rows but never wrap', async () => {
    const source = [
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: table',
      '        data: { key: rows }',
      '        columns:',
      '          - id: name',
      '            label: 品目',
      '            data: { key: name }',
      '',
    ].join('\n');
    draw(makeTransport(), { source });
    // The tree exposes the column row; right-click selects it and opens the menu.
    fireEvent.contextMenu(screen.getByRole('button', { name: /品目/ }), {
      clientX: 5,
      clientY: 5,
    });
    const menu = screen.getByRole('menu');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Duplicate', 'Delete']);
  });

  it('marks a selected container on canvas: dashed outline, slot guides, kind chip', async () => {
    const source = [
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: container',
      '        box: { direction: row, gap: 8 }',
      '        items:',
      '          - type: text',
      '            text: a',
      '          - type: text',
      '            text: b',
      '',
    ].join('\n');
    const paths = [
      'sections.body.items[0]',
      'sections.body.items[0].items[0]',
      'sections.body.items[0].items[1]',
    ];
    const transport = makeTransport({ renderRaw: vi.fn(async () => outcomeStacked(paths)) });
    const { container } = draw(transport, { source });
    await waitFor(() => expect(container.querySelectorAll('canvas')).toHaveLength(1));
    expect(container.querySelector('.sj-container-mark')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'sections.body.items[0]' }));
    await waitFor(() => expect(container.querySelector('.sj-container-mark')).not.toBeNull());
    expect(screen.getByText('Container (side by side)')).toBeTruthy();
    // Selecting a non-container child clears the mark.
    fireEvent.click(screen.getByRole('button', { name: 'sections.body.items[0].items[0]' }));
    await waitFor(() => expect(container.querySelector('.sj-container-mark')).toBeNull());
  });

  it('marks BOTH the selected inner container and its hovered parent card (nested containers)', async () => {
    const source = [
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: container',
      '        box: { direction: column }',
      '        items:',
      '          - type: container',
      '            box: { direction: row }',
      '            items:',
      '              - type: text',
      '                text: a',
      '',
    ].join('\n');
    const paths = [
      'sections.body.items[0]',
      'sections.body.items[0].items[0]',
      'sections.body.items[0].items[0].items[0]',
    ];
    const transport = makeTransport({ renderRaw: vi.fn(async () => outcomeStacked(paths)) });
    const { container } = draw(transport, { source });
    await waitFor(() => expect(container.querySelectorAll('canvas')).toHaveLength(1));
    // Select the INNER container: one mark.
    fireEvent.click(screen.getByRole('button', { name: 'sections.body.items[0].items[0]' }));
    await waitFor(() => expect(container.querySelectorAll('.sj-container-mark')).toHaveLength(1));
    // Hovering the parent card adds the parent's mark beside the selection's.
    fireEvent.click(screen.getByRole('tab', { name: 'Layout' }));
    const card = screen.getByText('Parent container (stacked)').closest('section');
    fireEvent.mouseEnter(card as HTMLElement);
    expect(container.querySelectorAll('.sj-container-mark')).toHaveLength(2);
    fireEvent.mouseLeave(card as HTMLElement);
    expect(container.querySelectorAll('.sj-container-mark')).toHaveLength(1);
  });

  it('highlights the parent container while its panel card is hovered, and clears on leave', async () => {
    const source = [
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: container',
      '        box: { direction: row }',
      '        items:',
      '          - type: text',
      '            text: a',
      '',
    ].join('\n');
    const paths = ['sections.body.items[0]', 'sections.body.items[0].items[0]'];
    const transport = makeTransport({ renderRaw: vi.fn(async () => outcomeStacked(paths)) });
    const { container } = draw(transport, { source });
    await waitFor(() => expect(container.querySelectorAll('canvas')).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'sections.body.items[0].items[0]' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Layout' }));
    const card = screen.getByText('Parent container (side by side)').closest('section');
    expect(container.querySelector('.sj-container-mark')).toBeNull();
    fireEvent.mouseEnter(card as HTMLElement);
    expect(container.querySelector('.sj-container-mark')).not.toBeNull();
    fireEvent.mouseLeave(card as HTMLElement);
    expect(container.querySelector('.sj-container-mark')).toBeNull();
  });
});
