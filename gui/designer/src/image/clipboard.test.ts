// Tests for clipboard.ts — what a paste offers the image import.
import { describe, expect, it } from 'vitest';
import { imageFileFromClipboard } from './clipboard';

function clipboard(files: readonly File[]): DataTransfer {
  return { files } as unknown as DataTransfer;
}

describe('imageFileFromClipboard', () => {
  it('takes the first file on the clipboard', () => {
    const first = new File(['a'], 'a.png');
    const second = new File(['b'], 'b.png');
    // Only one import per paste — the same bound the canvas drop keeps, so a
    // clipboard carrying a folder's worth of files is not unbounded work.
    expect(imageFileFromClipboard(clipboard([first, second]))).toBe(first);
  });

  it('takes a file whose DECLARED type is not an image', () => {
    // The MIME is never trusted here: `sniffImage` decides, and a genuine
    // image with a wrong/empty type must not be dropped before it is read.
    const file = new File(['x'], 'photo', { type: 'application/octet-stream' });
    expect(imageFileFromClipboard(clipboard([file]))).toBe(file);
  });

  it('reports no file for a text paste, so the caller leaves the event alone', () => {
    expect(imageFileFromClipboard(clipboard([]))).toBeNull();
  });

  it('reports no file for an event carrying no clipboard at all', () => {
    expect(imageFileFromClipboard(null)).toBeNull();
    expect(imageFileFromClipboard(undefined)).toBeNull();
    expect(imageFileFromClipboard({} as DataTransfer)).toBeNull();
  });
});
