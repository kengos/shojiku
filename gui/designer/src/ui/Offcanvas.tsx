// Bottom offcanvas sheet over Headless UI's Dialog — the library owns the hard
// parts (focus trap + restore, Escape, outside-click, ARIA, portal); the LOOK
// is ours (plain Tailwind utilities over the `--sj-*` tokens). Unlike Modal it
// anchors to the BOTTOM edge and keeps a LIGHT scrim, so the canvas stays
// visible above while the sheet is open (the horizontal table-column sheet). Controlled
// (`open`/`onClose`), so the flow stays a plain state change; entrance/exit
// motion rides Headless UI's `transition` prop + Tailwind `data-closed`
// variants (framework-native, reduced-motion-aware via the utilities).

import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react';
import type { ReactNode } from 'react';
import { IconButton } from './Button';
import { IconClose } from './icons';

export interface OffcanvasProps {
  /** Whether the sheet is shown. `false` renders nothing. */
  readonly open: boolean;
  /** Requested close (Escape / scrim / the × button). The caller flips
   * `open` to false. */
  readonly onClose: () => void;
  /** Heading (also the dialog's accessible name). */
  readonly title: string;
  /** Accessible name for the × close button (the caller's i18n string). */
  readonly closeLabel: string;
  readonly children: ReactNode;
}

export function Offcanvas({ open, onClose, title, closeLabel, children }: OffcanvasProps) {
  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      {/* A LIGHT scrim (not Modal's /40): the canvas stays clearly visible
          above the sheet, only signalling modality. */}
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-black/10 transition-opacity duration-150 data-closed:opacity-0"
      />
      <div className="fixed inset-x-0 bottom-0 flex justify-center">
        <DialogPanel
          transition
          className="flex max-h-[45vh] w-full flex-col overflow-hidden rounded-t-md border-t border-border bg-surface text-text shadow-2xl transition duration-150 data-closed:translate-y-full"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
            <DialogTitle className="m-0 text-base font-semibold">{title}</DialogTitle>
            <IconButton variant="ghost" label={closeLabel} onClick={onClose}>
              <IconClose />
            </IconButton>
          </div>
          {/* The scroll container: a table with many/narrow columns scrolls the
              SHEET horizontally, never the page. */}
          <div className="min-h-0 flex-1 overflow-auto p-3">{children}</div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
