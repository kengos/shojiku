// The PDF action: render the real deliverable through the engine, then show it.
// Three conditions, all required: the transport implements `renderPdf` (the wasm
// adapter exposes it only when the MODULE does, so this alone already tracks the
// engine), the host can save the bytes, and — for a host that passes a
// capability list — the key is in it. Feature gate, never a version sniff.

import { useCallback, useMemo, useState } from 'react';
import type { EngineTransport } from '../engine/transport';

/** The engine capability the PDF action is gated on. */
const PDF_CAPABILITY = 'wasm.render.pdf';

export interface PdfActionOptions {
  readonly transport: EngineTransport;
  /** The host's PDF sink (absent = the action is not offered). */
  readonly onDownloadPdf: ((pdf: Uint8Array) => void) | undefined;
  readonly capabilities: readonly string[] | undefined;
  readonly text: string;
  readonly params: string;
  /** What the engine validates/renders against (the engineer definitions with
   * edits folded in, or undefined blank-start). */
  readonly definitions: string | undefined;
  /** Describe the page the document is CURRENTLY set to (`A4 — 210 × 297 mm`),
   * or `null` when this build cannot. Read once, at the moment the bytes are
   * produced — see `pdfPageLabel`. */
  readonly readPageLabel: () => string | null;
}

export interface PdfAction {
  readonly pdfBytes: Uint8Array | null;
  /** The page the CURRENT `pdfBytes` were rendered at — snapshotted with them,
   * never re-read while the preview is open.
   *
   * The window-level undo (`useSelectionShortcuts`) is guarded only against
   * EDITABLE targets, and a modal's close button is not one — so ⌘Z reaches
   * the document while the preview is open, and a live read would relabel the
   * bytes on screen with a page they were not rendered at. That is the exact
   * defect this label exists to fix, inverted. */
  readonly pdfPageLabel: string | null;
  readonly pdfOpen: boolean;
  readonly pdfNotice: string | null;
  /** Undefined = the action is unsupported (the menu entry stays absent). */
  readonly openPdf: (() => Promise<void>) | undefined;
  readonly closePdf: () => void;
}

export function usePdfAction({
  transport,
  onDownloadPdf,
  capabilities,
  text,
  params,
  definitions,
  readPageLabel,
}: PdfActionOptions): PdfAction {
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [pdfPageLabel, setPdfPageLabel] = useState<string | null>(null);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfNotice, setPdfNotice] = useState<string | null>(null);
  const renderPdf = transport.renderPdf;
  const pdfSupported =
    renderPdf !== undefined &&
    onDownloadPdf !== undefined &&
    (capabilities === undefined || capabilities.includes(PDF_CAPABILITY));

  const openPdf = useMemo(() => {
    if (!pdfSupported || renderPdf === undefined) {
      return undefined;
    }
    return async () => {
      setPdfNotice('pdf.notice.rendering');
      try {
        const outcome = await renderPdf(text, params, definitions);
        if (!outcome.ok) {
          // A document error: the diagnostics panel already lists the reasons,
          // so the notice points there instead of repeating them here.
          setPdfNotice('pdf.notice.failed');
          return;
        }
        setPdfNotice(null);
        setPdfBytes(outcome.pdf);
        // Read the page HERE, beside the bytes it belongs to — the two are one
        // snapshot from now until the modal closes.
        setPdfPageLabel(readPageLabel());
        setPdfOpen(true);
      } catch {
        // A transport failure (a font pack that could not be fetched, an
        // engine throw) — NOT a document error, so don't send the user to the
        // diagnostics panel; there is nothing there to fix.
        setPdfNotice('pdf.notice.error');
      }
    };
  }, [pdfSupported, renderPdf, text, params, definitions, readPageLabel]);

  // Closing drops the bytes with the modal, so the blob URL its effect holds is
  // revoked and the document does not linger in memory.
  const closePdf = useCallback(() => {
    setPdfOpen(false);
    setPdfBytes(null);
    setPdfPageLabel(null);
  }, []);

  return { pdfBytes, pdfPageLabel, pdfOpen, pdfNotice, openPdf, closePdf };
}
