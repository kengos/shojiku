// ⌘V / Ctrl+V anywhere outside a text field: an image on the clipboard is
// imported through the SAME pipeline as the menu file-pick and the canvas drop
// (`useImageImport` owns that pipeline and calls this hook with it). Split out
// because the guard order below is the whole feature and reads better with the
// reason for each step beside it.

import { useCallback, useEffect } from 'react';
import { imageFileFromClipboard } from '../image/clipboard';
import type { ImageCodec } from '../image/import';
import type { InsertTarget } from '../insert/model';
import type { ImageAction } from './imageImportRun';
import { isEditableTarget } from './useSelectionShortcuts';

export interface PasteImageOptions {
  /** Absent = the host injected no codec; the paste route stays inert, exactly
   * as the menu entry and the drop handler do. */
  readonly imageCodec: ImageCodec | undefined;
  /** Where a fresh insert lands — an ACCESSOR, read at paste time: the
   * selection it derives from changes under this hook. */
  readonly insertTarget: () => InsertTarget;
  /** The shared import run (size gate, then the op). */
  readonly runImport: (file: File, action: ImageAction, codec: ImageCodec) => Promise<void>;
}

/** Register the window-level paste route for image import. */
export function usePasteImage({ imageCodec, insertTarget, runImport }: PasteImageOptions): void {
  const onPaste = useCallback(
    (event: ClipboardEvent) => {
      // The platform's own paste owns an editable target — a global handler
      // that preventDefaults there would eat the user's text paste.
      if (imageCodec === undefined || isEditableTarget(event.target)) {
        return;
      }
      // A paste carrying no file is not ours: plain text still belongs to
      // whatever the user was doing, and the insert menu's own "paste" entry
      // (clipboard TEXT → a data table) keeps meaning what it always did.
      const file = imageFileFromClipboard(event.clipboardData);
      if (file === null) {
        return;
      }
      // Only now, with a file in hand, is the event ours to consume.
      event.preventDefault();
      void runImport(file, { kind: 'insert', target: insertTarget() }, imageCodec);
    },
    [imageCodec, insertTarget, runImport],
  );
  useEffect(() => {
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [onPaste]);
}
