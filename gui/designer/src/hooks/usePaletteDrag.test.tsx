// Designer-level tests for hooks/usePaletteDrag.ts — palette drag-to-bind
// and drag-into-a-table-cell over real inspect geometry.
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { Mock } from 'vitest';
import { describe, expect, it, vi } from 'vitest';
import type { RenderOutcome } from '../engine/transport';
import { outcomeStacked, THREE_ITEMS } from '../testkit/fixtures';
import { draw, makeTransport } from '../testkit/harness';

describe('Designer palette drag — into a table cell', () => {
  const DEFS = [
    'properties:',
    '  store: { type: object, properties: { name: { type: string, title: 店舗名 } } }',
    '  items:',
    '    type: array',
    '    items:',
    '      type: object',
    '      properties:',
    '        qty: { type: number, title: 数量 }',
    '',
  ].join('\n');
  const CELL_DOC = [
    'sections:',
    '  body:',
    '    type: flow',
    '    items:',
    '      - type: text',
    '        text: first',
    '      - type: table',
    '        data: { key: items }',
    '        columns:',
    '          - label: 明細',
    '            cell:',
    '              items:',
    '                - type: text',
    '                  text: seed',
    '',
  ].join('\n');
  const TABLE = 'sections.body.items[1]';
  const COLUMN = `${TABLE}.columns[0]`;

  /** Page geometry: the body text at pt y=0, then the column cell drawn twice
   * (one fragment per row) at pt y=40 and y=70. */
  function cellOutcome(): RenderOutcome {
    const rect = (y: number) => ({ x: 0, y, w: 100, h: 20 });
    return {
      ok: true,
      pages: [{ width: 200, height: 200, rgba: new Uint8Array(200 * 200 * 4) }],
      inspect: {
        engine: { version: '0', capabilities: [], builtinLocales: [] },
        document: {},
        boxes: {
          pages: [
            [
              { path: 'sections.body.items[0]', border: rect(0), content: rect(0) },
              { path: COLUMN, border: rect(40), content: rect(40) },
              { path: COLUMN, border: rect(70), content: rect(70) },
            ],
          ],
        },
        margin: [0, 0, 0, 0],
      },
      diagnostics: { items: [] },
    };
  }

  function measureOverlay(container: HTMLElement) {
    const svg = container.querySelector('.sj-box-overlay');
    if (svg !== null) {
      Object.defineProperty(svg, 'getBoundingClientRect', {
        value: () => ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200 }),
      });
    }
  }

  async function drawCellDoc(onChange: Mock<(text: string) => void>, capabilities?: string[]) {
    const transport = makeTransport({ renderRaw: vi.fn(async () => cellOutcome()) });
    const utils = draw(transport, {
      source: CELL_DOC,
      definitions: DEFS,
      onChange,
      ...(capabilities === undefined ? {} : { capabilities }),
    });
    await waitFor(() => screen.getByRole('button', { name: 'sections.body.items[0]' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Data fields' }));
    measureOverlay(utils.container);
    return utils;
  }

  function fieldRow(label: string) {
    const row = screen.getByText(label).closest('.sj-palette-field');
    expect(row).not.toBeNull();
    return row as HTMLElement;
  }

  /** Drag `row` onto a client point (Designer renders at scale 2, so client
   * coordinates are twice the page pt). */
  function dragTo(row: HTMLElement, clientX: number, clientY: number) {
    fireEvent.pointerDown(row, { pointerId: 7, isPrimary: true, clientX: 500, clientY: 500 });
    fireEvent.pointerMove(row, { pointerId: 7, clientX, clientY });
  }

  it('drops a DOCUMENT field into the cell with `scope: document`, outlining every fragment', async () => {
    const onChange = vi.fn<(text: string) => void>();
    const { container } = await drawCellDoc(onChange);
    const row = fieldRow('店舗名');
    // pt (50, 50) → inside the first drawn fragment of the cell column.
    dragTo(row, 100, 100);
    // Both fragments outline — one authored cell, drawn once per row.
    expect(container.querySelectorAll('.sj-drop-cell')).toHaveLength(2);
    expect(container.querySelector('.sj-drop-indicator')).toBeNull();
    fireEvent.pointerUp(row, { pointerId: 7, clientX: 100, clientY: 100 });
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const doc = String(onChange.mock.calls.at(-1)?.[0]);
    expect(doc).toContain('key: store.name');
    expect(doc).toContain('scope: document');
    // It landed INSIDE the cell, after the seed item.
    expect(doc.indexOf('seed')).toBeLessThan(doc.indexOf('store.name'));
    // The selection travelled to the new item. The engine emitted no box for
    // it in this fixture, so the layer tree is where it shows.
    await waitFor(() =>
      expect(document.querySelector('[aria-current="true"]')?.textContent).toContain('store.name'),
    );
  });

  it('drops a ROW field into its own group’s cell without authoring a scope', async () => {
    const onChange = vi.fn<(text: string) => void>();
    await drawCellDoc(onChange);
    const row = fieldRow('数量');
    dragTo(row, 100, 100);
    fireEvent.pointerUp(row, { pointerId: 7, clientX: 100, clientY: 100 });
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const doc = String(onChange.mock.calls.at(-1)?.[0]);
    expect(doc).toContain('key: qty');
    // The row IS the ambient scope there — nothing to author.
    expect(doc).not.toContain('scope:');
  });

  it('paints nothing and inserts nothing for a row field over the BODY', async () => {
    const onChange = vi.fn<(text: string) => void>();
    const { container } = await drawCellDoc(onChange);
    const row = fieldRow('数量');
    // pt (50, 5) → over the body text item, outside every cell.
    dragTo(row, 100, 10);
    expect(container.querySelector('.sj-drop-indicator')).toBeNull();
    expect(container.querySelector('.sj-drop-cell')).toBeNull();
    fireEvent.pointerUp(row, { pointerId: 7, clientX: 100, clientY: 10 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('refuses a document field into a cell when the engine lacks `binding.scope`', async () => {
    const onChange = vi.fn<(text: string) => void>();
    const { container } = await drawCellDoc(onChange, ['binding.declarations']);
    const row = fieldRow('店舗名');
    dragTo(row, 100, 100);
    expect(container.querySelector('.sj-drop-cell')).toBeNull();
    fireEvent.pointerUp(row, { pointerId: 7, clientX: 100, clientY: 100 });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('Designer palette drag-to-bind', () => {
  const DEFS = [
    'properties:',
    '  order:',
    '    type: object',
    '    properties:',
    '      code: { type: string, title: 注文コード }',
    '',
  ].join('\n');

  /** jsdom cannot measure the overlay, so give the page SVG a real rect for
   * the Designer's hit-test (page pixels: 200×200 at scale 2). */
  function measureOverlay(container: HTMLElement) {
    const svg = container.querySelector('.sj-box-overlay');
    expect(svg).not.toBeNull();
    if (svg !== null) {
      Object.defineProperty(svg, 'getBoundingClientRect', {
        value: () => ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200 }),
      });
    }
    return svg as SVGSVGElement;
  }

  async function drawWithPalette(onChange: Mock<(text: string) => void>) {
    const paths = ['sections.body.items[0]', 'sections.body.items[1]', 'sections.body.items[2]'];
    const transport = makeTransport({
      renderRaw: vi.fn(async () => outcomeStacked(paths)),
    });
    const utils = draw(transport, { source: THREE_ITEMS, definitions: DEFS, onChange });
    await waitFor(() => screen.getByRole('button', { name: 'sections.body.items[0]' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Data fields' }));
    const row = screen.getByText('注文コード').closest('.sj-palette-field');
    expect(row).not.toBeNull();
    return { ...utils, row: row as HTMLElement };
  }

  it('drops a field on the canvas: ONE bound insertItem at the pointed slot, selected', async () => {
    const onChange = vi.fn<(text: string) => void>();
    const { container, row } = await drawWithPalette(onChange);
    measureOverlay(container);
    // Boxes stack at pt y=0/40/80 (h 30, midpoints 15/55/95); scale 2 halves
    // client coordinates, so client y=60 → pt 30 → the slot before items[1].
    fireEvent.pointerDown(row, { pointerId: 9, isPrimary: true, clientX: 500, clientY: 500 });
    fireEvent.pointerMove(row, { pointerId: 9, clientX: 100, clientY: 60 });
    // The live insertion indicator paints on the page while dragging.
    expect(container.querySelector('.sj-drop-indicator')).not.toBeNull();
    fireEvent.pointerUp(row, { pointerId: 9, clientX: 100, clientY: 60 });
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const doc = String(onChange.mock.calls.at(-1)?.[0]);
    // The bound text item landed between first and second.
    expect(doc).toContain('key: order.code');
    const inserted = doc.indexOf('order.code');
    expect(doc.indexOf('first')).toBeLessThan(inserted);
    expect(inserted).toBeLessThan(doc.indexOf('second'));
    // The selection travelled to the new item.
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'sections.body.items[1]' }).getAttribute('aria-pressed'),
      ).toBe('true'),
    );
  });

  it('a drop outside every page inserts nothing', async () => {
    const onChange = vi.fn<(text: string) => void>();
    const { container, row } = await drawWithPalette(onChange);
    measureOverlay(container);
    fireEvent.pointerDown(row, { pointerId: 9, isPrimary: true, clientX: 500, clientY: 500 });
    fireEvent.pointerMove(row, { pointerId: 9, clientX: 400, clientY: 400 });
    fireEvent.pointerUp(row, { pointerId: 9, clientX: 400, clientY: 400 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a drop whose insert is refused by the op layer commits nothing', async () => {
    const onChange = vi.fn<(text: string) => void>();
    // `items: 3` — the insert target is not an array, so the insertItem fails.
    const broken = ['sections:', '  body:', '    type: flow', '    items: 3', ''].join('\n');
    const paths = ['sections.body.items[0]', 'sections.body.items[1]', 'sections.body.items[2]'];
    const transport = makeTransport({
      renderRaw: vi.fn(async () => outcomeStacked(paths)),
    });
    const { container } = draw(transport, { source: broken, definitions: DEFS, onChange });
    await waitFor(() => screen.getByRole('button', { name: 'sections.body.items[0]' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Data fields' }));
    const row = screen.getByText('注文コード').closest('.sj-palette-field') as HTMLElement;
    measureOverlay(container);
    fireEvent.pointerDown(row, { pointerId: 9, isPrimary: true, clientX: 500, clientY: 500 });
    fireEvent.pointerMove(row, { pointerId: 9, clientX: 100, clientY: 60 });
    fireEvent.pointerUp(row, { pointerId: 9, clientX: 100, clientY: 60 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a page with no box geometry appends the bound item at the body end', async () => {
    const onChange = vi.fn();
    const transport = makeTransport({
      renderRaw: vi.fn(async () => ({
        ...outcomeStacked([]),
        inspect: {
          engine: { version: '0', capabilities: [], builtinLocales: [] },
          document: {},
          boxes: { pages: [] },
          margin: [0, 0, 0, 0] as [number, number, number, number],
        },
      })),
    });
    const { container } = draw(transport, { source: THREE_ITEMS, definitions: DEFS, onChange });
    await waitFor(() => expect(container.querySelector('.sj-box-overlay')).not.toBeNull());
    measureOverlay(container);
    fireEvent.click(screen.getByRole('tab', { name: 'Data fields' }));
    const row = screen.getByText('注文コード').closest('.sj-palette-field');
    expect(row).not.toBeNull();
    if (row !== null) {
      fireEvent.pointerDown(row, { pointerId: 9, isPrimary: true, clientX: 5, clientY: 5 });
      fireEvent.pointerMove(row, { pointerId: 9, clientX: 100, clientY: 60 });
      fireEvent.pointerUp(row, { pointerId: 9, clientX: 100, clientY: 60 });
    }
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const doc = String(onChange.mock.calls.at(-1)?.[0]);
    // Appended after the last authored item.
    expect(doc.indexOf('third')).toBeLessThan(doc.indexOf('order.code'));
  });

  it('a drop before any render completes is a safe no-op (no pages to hit)', async () => {
    const onChange = vi.fn();
    const transport = makeTransport({
      // A render that never resolves: no last-good snapshot ever exists.
      renderRaw: vi.fn(() => new Promise<never>(() => {})),
    });
    draw(transport, { source: THREE_ITEMS, definitions: DEFS, onChange });
    fireEvent.click(screen.getByRole('tab', { name: 'Data fields' }));
    const row = screen.getByText('注文コード').closest('.sj-palette-field');
    expect(row).not.toBeNull();
    if (row !== null) {
      fireEvent.pointerDown(row, { pointerId: 9, isPrimary: true, clientX: 5, clientY: 5 });
      fireEvent.pointerMove(row, { pointerId: 9, clientX: 100, clientY: 60 });
      fireEvent.pointerUp(row, { pointerId: 9, clientX: 100, clientY: 60 });
    }
    expect(onChange).not.toHaveBeenCalled();
  });

  it('an unmeasurable page (jsdom default) never hit-tests, so the drop is safe', async () => {
    const onChange = vi.fn<(text: string) => void>();
    const { row } = await drawWithPalette(onChange);
    fireEvent.pointerDown(row, { pointerId: 9, isPrimary: true, clientX: 500, clientY: 500 });
    fireEvent.pointerMove(row, { pointerId: 9, clientX: 100, clientY: 60 });
    fireEvent.pointerUp(row, { pointerId: 9, clientX: 100, clientY: 60 });
    expect(onChange).not.toHaveBeenCalled();
  });
});
