// Designer-level tests for hooks/useImageImport.ts — menu entry, canvas file
// drop and panel replace routed through ONE pipeline (size gate, cap raise,
// topbar notices).
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ImageCodec } from '../image/import';
import type { ImageBudgets } from '../image/model';
import { outcomeStacked, SOURCE, THREE_ITEMS } from '../testkit/fixtures';
import { draw, makeTransport } from '../testkit/harness';

describe('Designer image import', () => {
  const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

  function pngBytes(len = 32): Uint8Array {
    const bytes = new Uint8Array(Math.max(8, len));
    bytes.set(PNG_SIG, 0);
    return bytes;
  }

  /** The dropped/picked File — its bytes never matter (the fake codec.read
   * decides what the pipeline sees), only that a File is present. */
  function imageFile(name = 'logo.png'): File {
    return new File([new Uint8Array(4)], name, { type: 'image/png' });
  }

  function fakeCodec(over: Partial<ImageCodec> = {}): ImageCodec {
    return {
      read: over.read ?? (async () => pngBytes(32)),
      probe: over.probe ?? (async () => ({ w: 100, h: 60 })),
      reencode: over.reencode ?? (async () => pngBytes(16)),
    };
  }

  const LOOSE_BUDGETS: ImageBudgets = {
    maxImageBytes: 8 * 1024 * 1024,
    downscaleEdge: 2048,
    jpegQuality: 0.85,
    maxPixels: 100_000_000,
  };

  function fileInput(container: HTMLElement): HTMLInputElement {
    return container.querySelector('input[type="file"]') as HTMLInputElement;
  }

  function pickImage(container: HTMLElement, file: File = imageFile()) {
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Place image…' }));
    fireEvent.change(fileInput(container), { target: { files: [file] } });
  }

  /** jsdom has no DragEvent, so `fireEvent.drop` drops `clientX`/`clientY` (like
   * the PointerEvent gap). Dispatch a MouseEvent that carries the drop point and
   * a synthetic dataTransfer so the handler sees a real file + coordinates. */
  function dropFile(canvas: HTMLElement, files: File[], clientX: number, clientY: number) {
    const event = new MouseEvent('drop', { bubbles: true, cancelable: true, clientX, clientY });
    Object.defineProperty(event, 'dataTransfer', { value: { files, types: ['Files'] } });
    canvas.dispatchEvent(event);
  }

  it('inserts an imported image from the menu, selects it, and shows the headroom indicator', async () => {
    const onChange = vi.fn();
    const { container } = draw(makeTransport(), { imageCodec: fakeCodec(), onChange });
    pickImage(container);
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const doc = String(onChange.mock.calls.at(-1)?.[0]);
    expect(doc).toContain('type: image');
    expect(doc).toContain('data:image/png;base64,');
    // The new image is selected (the panel shows its image section), and the
    // headroom indicator now shows because the template holds an image.
    expect(await screen.findByRole('heading', { name: 'Image' })).toBeTruthy();
    expect(screen.getByText(/Template size/)).toBeTruthy();
  });

  it('shows the downscale notice when an over-budget raster is shrunk', async () => {
    const codec = fakeCodec({
      read: async () => pngBytes(4000),
      probe: async () => ({ w: 4000, h: 2000 }),
      reencode: async () => pngBytes(500),
    });
    const { container } = draw(makeTransport(), {
      imageCodec: codec,
      imageBudgets: { ...LOOSE_BUDGETS, maxImageBytes: 1000 },
    });
    pickImage(container);
    expect(await screen.findByText('The image was shrunk to fit.')).toBeTruthy();
  });

  it('refuses an unsupported file with a localized notice and no insert', async () => {
    const onChange = vi.fn();
    const codec = fakeCodec({ read: async () => new TextEncoder().encode('<html></html>') });
    const { container } = draw(makeTransport(), { imageCodec: codec, onChange });
    pickImage(container);
    expect(
      await screen.findByText('That file type is not supported (PNG, JPEG, or SVG).'),
    ).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('refuses an over-cap import with a raise prompt, then imports after raising', async () => {
    const onChange = vi.fn();
    const onCap = vi.fn();
    // A ~1.6 MiB raster accepted whole → ~2.1 MiB data URI, over the 2 MiB cap.
    const codec = fakeCodec({
      read: async () => pngBytes(1_600_000),
      probe: async () => ({ w: 80, h: 80 }),
    });
    const { container } = draw(makeTransport(), {
      imageCodec: codec,
      imageBudgets: LOOSE_BUDGETS,
      onChange,
      onTemplateMaxBytesChange: onCap,
    });
    pickImage(container);
    expect(
      await screen.findByText('Adding this image would exceed the template size limit.'),
    ).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Raise the limit?' }));
    expect(onCap).toHaveBeenCalledWith(4 * 1024 * 1024);
    pickImage(container);
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(String(onChange.mock.calls.at(-1)?.[0])).toContain('type: image');
  });

  it('drops an image file at the planned canvas slot', async () => {
    const onChange = vi.fn();
    const paths = ['sections.body.items[0]', 'sections.body.items[1]', 'sections.body.items[2]'];
    const transport = makeTransport({ renderRaw: vi.fn(async () => outcomeStacked(paths)) });
    const { container } = draw(transport, {
      source: THREE_ITEMS,
      imageCodec: fakeCodec(),
      onChange,
    });
    await waitFor(() => screen.getByRole('button', { name: 'sections.body.items[0]' }));
    const svg = container.querySelector('.sj-box-overlay');
    Object.defineProperty(svg, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200 }),
    });
    const canvas = container.querySelector('.sj-designer-canvas') as HTMLElement;
    // client y=60 → pt 30 (scale 2): the slot before items[1].
    dropFile(canvas, [imageFile()], 100, 60);
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const doc = String(onChange.mock.calls.at(-1)?.[0]);
    const img = doc.indexOf('type: image');
    expect(doc.indexOf('first')).toBeLessThan(img);
    expect(img).toBeLessThan(doc.indexOf('second'));
  });

  it('allows a Files drag-over but not a non-file one, and ignores drops without a codec', () => {
    const onChange = vi.fn();
    const { container } = draw(makeTransport(), { onChange });
    // No codec → no image menu entry.
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }));
    expect(screen.queryByRole('menuitem', { name: 'Place image…' })).toBeNull();
    const canvas = container.querySelector('.sj-designer-canvas') as HTMLElement;
    fireEvent.dragOver(canvas, { dataTransfer: { types: ['Files'] } });
    dropFile(canvas, [imageFile()], 10, 10);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('prevents default only for a Files drag-over when a codec is present', () => {
    const { container } = draw(makeTransport(), { imageCodec: fakeCodec() });
    const canvas = container.querySelector('.sj-designer-canvas') as HTMLElement;
    const files = fireEvent.dragOver(canvas, { dataTransfer: { types: ['Files'] } });
    const text = fireEvent.dragOver(canvas, { dataTransfer: { types: ['text/plain'] } });
    // fireEvent returns false when the event's default was prevented.
    expect(files).toBe(false);
    expect(text).toBe(true);
  });

  it('ignores a drop that carries no file', () => {
    const onChange = vi.fn();
    const { container } = draw(makeTransport(), { imageCodec: fakeCodec(), onChange });
    const canvas = container.querySelector('.sj-designer-canvas') as HTMLElement;
    dropFile(canvas, [], 5, 5);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('ignores a file input change with no pending action or no file', () => {
    const onChange = vi.fn();
    const { container } = draw(makeTransport(), { imageCodec: fakeCodec(), onChange });
    // No menu click → no pending action.
    fireEvent.change(fileInput(container), { target: { files: [imageFile()] } });
    // A change with no file at all.
    fireEvent.change(fileInput(container), { target: { files: [] } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('replaces a src image via the panel, keeping its box and dropping the old src', async () => {
    const onChange = vi.fn();
    const SRC_IMAGE = [
      'sections:',
      '  body:',
      '    items:',
      '      - type: image',
      '        box: { w: 40, h: 40 }',
      '        src: data:image/png;base64,QUJDRA',
      '',
    ].join('\n');
    const { container } = draw(makeTransport(), {
      source: SRC_IMAGE,
      imageCodec: fakeCodec(),
      onChange,
    });
    await waitFor(() => screen.getByRole('button', { name: 'sections.body.items[0]' }));
    fireEvent.click(screen.getByRole('button', { name: 'sections.body.items[0]' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Replace image…' }));
    fireEvent.change(fileInput(container), { target: { files: [imageFile()] } });
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const doc = String(onChange.mock.calls.at(-1)?.[0]);
    expect(doc).toContain('data:image/png;base64,');
    expect(doc).not.toContain('QUJDRA');
    expect(doc).toContain('w: 40');
  });

  it('shows the at-max notice (no raise) for an over-cap import already at the ceiling', async () => {
    const onChange = vi.fn();
    // ~6.6 MiB raster accepted whole → ~8.8 MiB data URI, over the 8 MiB ceiling.
    const codec = fakeCodec({
      read: async () => pngBytes(6_600_000),
      probe: async () => ({ w: 80, h: 80 }),
    });
    const { container } = draw(makeTransport(), {
      imageCodec: codec,
      imageBudgets: LOOSE_BUDGETS,
      templateMaxBytes: 8 * 1024 * 1024,
      onChange,
    });
    pickImage(container);
    expect(
      await screen.findByText('The template is at its maximum size — use a smaller image.'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Raise the limit?' })).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('raises the cap from the headroom indicator when an image nears the limit', async () => {
    const onCap = vi.fn();
    // ~1.45 MiB raster → ~1.93 MiB data URI: fits under 2 MiB but pushes the
    // headroom ratio past the warn threshold, so the indicator offers the raise.
    const codec = fakeCodec({
      read: async () => pngBytes(1_450_000),
      probe: async () => ({ w: 80, h: 80 }),
    });
    const { container } = draw(makeTransport(), {
      imageCodec: codec,
      imageBudgets: LOOSE_BUDGETS,
      onTemplateMaxBytesChange: onCap,
    });
    pickImage(container);
    await waitFor(() => expect(screen.getByText(/Template size/)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Raise the limit?' }));
    fireEvent.click(screen.getByRole('button', { name: 'Raise' }));
    expect(onCap).toHaveBeenCalledWith(4 * 1024 * 1024);
  });

  it('raises the cap from the over-cap notice even without a host persist callback', async () => {
    const onChange = vi.fn();
    const codec = fakeCodec({
      read: async () => pngBytes(1_600_000),
      probe: async () => ({ w: 80, h: 80 }),
    });
    const { container } = draw(makeTransport(), {
      imageCodec: codec,
      imageBudgets: LOOSE_BUDGETS,
      onChange,
    });
    pickImage(container);
    expect(
      await screen.findByText('Adding this image would exceed the template size limit.'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Raise the limit?' }));
    // The notice cleared and the re-import now fits under the raised cap.
    pickImage(container);
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(String(onChange.mock.calls.at(-1)?.[0])).toContain('type: image');
  });

  it('projects the cap gate in UTF-8 bytes, not UTF-16 units (CJK template)', async () => {
    const onChange = vi.fn();
    // ~690K CJK chars: UTF-16 length ~0.69M units but UTF-8 ~2.07 MiB. The
    // mount seed grows the cap to the source's BYTE size; a ~700 KB image then
    // fits by UTF-16 arithmetic (0.69M + 0.7M < 2.07M) but NOT by bytes
    // (2.07Mi + 0.7Mi > 2.07Mi) — admitting it would make the next undo
    // re-parse throw. The gate must count bytes and refuse.
    const source = `# ${'漢'.repeat(690_000)}\n${SOURCE}`;
    const codec = fakeCodec({
      read: async () => pngBytes(500_000),
      probe: async () => ({ w: 80, h: 80 }),
    });
    const { container } = draw(makeTransport(), {
      imageCodec: codec,
      imageBudgets: LOOSE_BUDGETS,
      source,
      onChange,
    });
    pickImage(container);
    expect(
      await screen.findByText('Adding this image would exceed the template size limit.'),
    ).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('mounts a large image-bearing source without a matching cap pref (seed fits the source)', () => {
    const bigSrc = `data:image/png;base64,${'A'.repeat(2 * 1024 * 1024 + 1000)}`;
    const source = [
      'sections:',
      '  body:',
      '    items:',
      '      - type: image',
      '        box: { w: 10, h: 10 }',
      `        src: ${bigSrc}`,
      '',
    ].join('\n');
    // No templateMaxBytes → default 2 MiB pref; the seed must still bump to hold
    // the 2+ MiB source, or Editor.create throws on mount (a reopened big draft).
    expect(() => draw(makeTransport(), { source })).not.toThrow();
    expect(screen.getByRole('button', { name: 'Insert' })).toBeTruthy();
  });

  it('shows the headroom indicator with no raise option once at the ceiling', async () => {
    const { container } = draw(makeTransport(), {
      imageCodec: fakeCodec(),
      templateMaxBytes: 8 * 1024 * 1024,
    });
    pickImage(container);
    await waitFor(() => expect(screen.getByText(/Template size/)).toBeTruthy());
    // nextCap === null at the ceiling → the indicator carries no raise action.
    expect(screen.queryByRole('button', { name: 'Raise the limit?' })).toBeNull();
  });

  it('appends an image dropped outside any page to the body (fallback target)', async () => {
    const onChange = vi.fn();
    const { container } = draw(makeTransport(), { imageCodec: fakeCodec(), onChange });
    await waitFor(() => screen.getByRole('button', { name: 'sections.body.items[0]' }));
    const canvas = container.querySelector('.sj-designer-canvas') as HTMLElement;
    // No overlay measured → the hit-test misses → append at the body end.
    dropFile(canvas, [imageFile()], 999, 999);
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const doc = String(onChange.mock.calls.at(-1)?.[0]);
    expect(doc.indexOf('hello')).toBeLessThan(doc.indexOf('type: image'));
  });

  it('undoes an image insert in one step and redoes it', async () => {
    const onChange = vi.fn();
    const { container } = draw(makeTransport(), { imageCodec: fakeCodec(), onChange });
    pickImage(container);
    await waitFor(() => expect(String(onChange.mock.calls.at(-1)?.[0])).toContain('type: image'));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() =>
      expect(String(onChange.mock.calls.at(-1)?.[0])).not.toContain('type: image'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    await waitFor(() => expect(String(onChange.mock.calls.at(-1)?.[0])).toContain('type: image'));
  });
});
