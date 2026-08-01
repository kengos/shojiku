// The PDF preview modal: the REAL deliverable, shown in the app before it is
// downloaded. The bytes come from the engine (`transport.renderPdf`) — the GUI
// never renders a PDF itself; it hands the bytes to the browser's own viewer
// through a blob URL in an `<iframe>`, which is why no PDF library is needed.
//
// The blob URL is created for the CURRENT bytes and revoked when they change
// or the modal unmounts: an un-revoked URL keeps the whole document alive in
// memory for the tab's lifetime.

import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/context';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

export interface PdfPreviewModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** The rendered PDF bytes, or `null` while nothing has been rendered. */
  readonly pdf: Uint8Array | null;
  /** Hand the bytes to the host to save. The Designer never builds a download
   * anchor itself — file writing (and naming) is a host concern, the same seam
   * the YAML export rides. */
  readonly onDownload: () => void;
}

/** The object URL for `pdf`, revoked on change/unmount. `null` until bytes
 * exist (and in a jsdom-like environment without `createObjectURL`, which the
 * component then renders as the no-preview state rather than crashing). */
function useBlobUrl(pdf: Uint8Array | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (pdf === null || typeof URL.createObjectURL !== 'function') {
      setUrl(null);
      return;
    }
    // Copy into a fresh buffer: the engine's view may be backed by wasm memory
    // that a later render reuses, and a Blob must own stable bytes.
    const next = URL.createObjectURL(new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }));
    setUrl(next);
    return () => {
      URL.revokeObjectURL(next);
    };
  }, [pdf]);
  return url;
}

export function PdfPreviewModal({ open, onClose, pdf, onDownload }: PdfPreviewModalProps) {
  const { t } = useI18n();
  // The URL's life is the component's: the Designer mounts this only while it
  // holds bytes and unmounts it on close, so there is no closed-but-holding
  // state to guard against here.
  const url = useBlobUrl(pdf);
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="wide"
      title={t('pdf.title')}
      closeLabel={t('pdf.close')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('pdf.close')}
          </Button>
          <Button variant="primary" onClick={onDownload} disabled={pdf === null}>
            {t('pdf.download')}
          </Button>
        </>
      }
    >
      <p className="m-0 text-sm text-muted">{t('pdf.help')}</p>
      {url === null ? (
        <p className="m-0 text-sm text-muted">{t('pdf.unavailable')}</p>
      ) : (
        // `title` on an iframe is its ACCESSIBLE NAME (required by the a11y
        // lint), not a native tooltip on a control — which is what the chrome
        // convention bans; that guard excludes `<iframe>` for this reason.
        <iframe
          src={url}
          title={t('pdf.frameTitle')}
          className="h-[70vh] w-full rounded-md border border-border bg-bg"
        />
      )}
    </Modal>
  );
}
