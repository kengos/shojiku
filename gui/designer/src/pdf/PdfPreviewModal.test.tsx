import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/context';
import { PdfPreviewModal } from './PdfPreviewModal';

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

let created: string[];
let revoked: string[];

beforeEach(() => {
  created = [];
  revoked = [];
  let n = 0;
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => {
      n += 1;
      const url = `blob:pdf-${n}`;
      created.push(url);
      return url;
    }),
    revokeObjectURL: vi.fn((url: string) => {
      revoked.push(url);
    }),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function show(props: Partial<Parameters<typeof PdfPreviewModal>[0]> = {}) {
  const onClose = vi.fn();
  const onDownload = vi.fn();
  const view = render(
    <I18nProvider locale="en">
      <PdfPreviewModal open onClose={onClose} pdf={PDF} onDownload={onDownload} {...props} />
    </I18nProvider>,
  );
  return { ...view, onClose, onDownload };
}

describe('PdfPreviewModal', () => {
  it('shows the rendered PDF in a frame over a blob URL', () => {
    show();
    const frame = screen.getByTitle('PDF preview of the document');
    expect(frame.getAttribute('src')).toBe(created[0]);
  });

  it('revokes the blob URL when the bytes are dropped', () => {
    const { rerender } = show();
    expect(revoked).toEqual([]);
    rerender(
      <I18nProvider locale="en">
        <PdfPreviewModal open onClose={vi.fn()} pdf={null} onDownload={vi.fn()} />
      </I18nProvider>,
    );
    // The document must not linger in memory once its bytes are gone.
    expect(revoked).toEqual([created[0]]);
  });

  it('hands the bytes to the host on download and closes on request', () => {
    const { onDownload, onClose } = show();
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(onDownload).toHaveBeenCalledTimes(1);
    // Two close affordances (the footer button and the × ) — either one asks.
    fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('offers no download and explains itself when there are no bytes', () => {
    show({ pdf: null });
    const download = screen.getByRole('button', { name: 'Download' }) as HTMLButtonElement;
    expect(download.disabled).toBe(true);
    expect(screen.queryByTitle('PDF preview of the document')).toBeNull();
    expect(
      screen.queryByText('This browser cannot show the PDF inline. Download it to open it.'),
    ).not.toBeNull();
  });

  it('degrades to the no-preview state where object URLs are unavailable', () => {
    vi.stubGlobal('URL', { ...URL, createObjectURL: undefined, revokeObjectURL: vi.fn() });
    show();
    expect(screen.queryByTitle('PDF preview of the document')).toBeNull();
  });
});
