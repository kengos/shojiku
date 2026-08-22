// Designer-level tests for hooks/usePdfAction.ts — the real-PDF render path
// (transport + host callback + capability gate, forced font load refusal).
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TransportError } from '../engine/transport';
import { SOURCE } from '../testkit/fixtures';
import { draw, makeTransport, pickMenu } from '../testkit/harness';

describe('the PDF action', () => {
  const PDF_CAP = ['wasm.render.pdf'];
  const pdfOutcome = (over: Record<string, unknown> = {}) => ({
    ok: true,
    pdf: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    diagnostics: { items: [] },
    ...over,
  });

  it('is absent when the engine does not advertise the capability', () => {
    draw(makeTransport({ renderPdf: vi.fn(async () => pdfOutcome()) }), {
      capabilities: [],
      menuActions: { onDownloadPdf: vi.fn() },
    });
    fireEvent.click(screen.getByRole('button', { name: 'File' }));
    expect(screen.queryByRole('menuitem', { name: 'Download as PDF…' })).toBeNull();
  });

  it('is absent when the transport cannot render PDFs', () => {
    draw(makeTransport(), { capabilities: PDF_CAP, menuActions: { onDownloadPdf: vi.fn() } });
    fireEvent.click(screen.getByRole('button', { name: 'File' }));
    expect(screen.queryByRole('menuitem', { name: 'Download as PDF…' })).toBeNull();
  });

  it('is absent when the host cannot save the bytes', () => {
    draw(makeTransport({ renderPdf: vi.fn(async () => pdfOutcome()) }), {
      capabilities: PDF_CAP,
    });
    fireEvent.click(screen.getByRole('button', { name: 'File' }));
    expect(screen.queryByRole('menuitem', { name: 'Download as PDF…' })).toBeNull();
  });

  it('renders the PDF and hands the bytes to the host on download', async () => {
    const onDownloadPdf = vi.fn();
    const renderPdf = vi.fn(async () => pdfOutcome());
    draw(makeTransport({ renderPdf }), {
      capabilities: PDF_CAP,
      menuActions: { onDownloadPdf },
    });
    pickMenu('File', 'Download as PDF…');
    await screen.findByRole('button', { name: 'Download' });
    expect(renderPdf).toHaveBeenCalledWith(SOURCE, '{}', undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(onDownloadPdf).toHaveBeenCalledWith(expect.any(Uint8Array));
  });

  it('renders from the COMMITTED text while a panel edit is still in progress', async () => {
    // The keyboard/menu route commits no blur, so the field keeps focus and its
    // draft stands. A draft that reached this call would export text the reader
    // never committed.
    const renderPdf = vi.fn(async () => pdfOutcome());
    const transport = makeTransport({ renderPdf });
    draw(transport, {
      capabilities: PDF_CAP,
      menuActions: { onDownloadPdf: vi.fn() },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'sections.body.items[0]' }));
    const field = screen.getByLabelText('Text');
    field.textContent = 'world';
    fireEvent.input(field);
    // The draft is DEBOUNCED, so exporting immediately would export from a
    // state where no draft exists — an assertion that holds for every
    // implementation, including one that leaks the draft into the export.
    await waitFor(() =>
      expect(transport.renderRaw).toHaveBeenCalledWith(
        expect.stringContaining('text: world'),
        expect.anything(),
        undefined,
        expect.anything(),
      ),
    );
    pickMenu('File', 'Download as PDF…');
    await screen.findByRole('button', { name: 'Download' });
    expect(renderPdf).toHaveBeenCalledWith(SOURCE, '{}', undefined);
  });

  it('is offered to a host that passes no capability list at all', async () => {
    draw(makeTransport({ renderPdf: vi.fn(async () => pdfOutcome()) }), {
      menuActions: { onDownloadPdf: vi.fn() },
    });
    pickMenu('File', 'Download as PDF…');
    expect(await screen.findByRole('button', { name: 'Download' })).not.toBeNull();
  });

  it('drops the rendered bytes when the preview is closed', async () => {
    draw(makeTransport({ renderPdf: vi.fn(async () => pdfOutcome()) }), {
      capabilities: PDF_CAP,
      menuActions: { onDownloadPdf: vi.fn() },
    });
    pickMenu('File', 'Download as PDF…');
    await screen.findByRole('button', { name: 'Download' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[0]);
    // The modal unmounts with its bytes, so the blob URL it held is revoked
    // rather than pinning the document for the tab's lifetime.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Download' })).toBeNull());
  });

  it('shows a notice instead of a document when the render fails', async () => {
    draw(
      makeTransport({
        renderPdf: vi.fn(async () => pdfOutcome({ ok: false, pdf: new Uint8Array() })),
      }),
      { capabilities: PDF_CAP, menuActions: { onDownloadPdf: vi.fn() } },
    );
    pickMenu('File', 'Download as PDF…');
    await screen.findByText(
      'The PDF could not be rendered. Fix the errors listed below the canvas and try again.',
    );
    expect(screen.queryByRole('button', { name: 'Download' })).toBeNull();
  });

  it('shows a connection-flavoured notice when the transport throws', async () => {
    // A transport throw (a failed font fetch, an engine throw) is not a
    // document error — the notice must NOT send the user to the diagnostics
    // panel, where there is nothing to fix.
    draw(
      makeTransport({
        renderPdf: vi.fn(async () => {
          throw new TransportError('font packs could not be loaded');
        }),
      }),
      { capabilities: PDF_CAP, menuActions: { onDownloadPdf: vi.fn() } },
    );
    pickMenu('File', 'Download as PDF…');
    await screen.findByText('The PDF could not be rendered. Check your connection and try again.');
  });
});
