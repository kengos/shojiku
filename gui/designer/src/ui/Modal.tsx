// Modal primitive over Headless UI's Dialog — the library owns the hard parts
// (focus trap + restore, Escape, outside-click, ARIA, portal); the LOOK is
// entirely ours: plain Tailwind utilities over the `--sj-*` tokens, visually
// matching the rest of the chrome. Controlled (`open`/`onClose`), so the flow
// stays a plain state change. Entrance/exit motion rides Headless UI's
// `transition` prop + Tailwind `data-closed` variants (framework-native; no
// hand keyframes), and respects reduced motion via the transition utilities.

import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react';
import type { ReactNode } from 'react';
import { IconButton } from './Button';
import { IconClose } from './icons';

export interface ModalProps {
  /** Whether the modal is shown. `false` renders nothing. */
  readonly open: boolean;
  /** Requested close (Escape / backdrop / the × button). The caller flips
   * `open` to false. */
  readonly onClose: () => void;
  /** Optional heading (also the dialog's accessible name). */
  readonly title?: string;
  /** Accessible name for the × close button (the caller's i18n string). */
  readonly closeLabel: string;
  /** Optional footer, typically the action buttons. */
  readonly footer?: ReactNode;
  /** Panel width. `default` is the form-dialog width; `roomy` is for a form
   * that also shows a live PREVIEW of what it will create (the paste importer's
   * column chips wrap into an unreadable stack at the default width); `wide` is
   * for a surface that shows a DOCUMENT (the PDF preview) and needs page-sized
   * room. */
  readonly size?: ModalSize;
  readonly children: ReactNode;
}

type ModalSize = 'default' | 'roomy' | 'wide';

const PANEL_WIDTH: Record<ModalSize, string> = {
  default: 'w-[460px]',
  roomy: 'w-[560px]',
  wide: 'w-[900px]',
};

export function Modal({
  open,
  onClose,
  title,
  closeLabel,
  footer,
  size = 'default',
  children,
}: ModalProps) {
  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-black/40 transition-opacity duration-150 data-closed:opacity-0"
      />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel
          transition
          className={`flex ${PANEL_WIDTH[size]} max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] flex-col overflow-y-auto rounded-md border border-border bg-surface p-6 text-text shadow-2xl transition duration-150 data-closed:translate-y-2 data-closed:opacity-0`}
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            {title === undefined ? (
              <span />
            ) : (
              <DialogTitle className="m-0 text-lg font-semibold">{title}</DialogTitle>
            )}
            <IconButton variant="ghost" label={closeLabel} onClick={onClose}>
              <IconClose />
            </IconButton>
          </div>
          <div className="flex flex-col gap-3">{children}</div>
          {footer === undefined ? null : (
            <div className="mt-4 flex justify-end gap-2">{footer}</div>
          )}
        </DialogPanel>
      </div>
    </Dialog>
  );
}
