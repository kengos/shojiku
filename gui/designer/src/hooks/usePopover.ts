// A dismissable popover's shared state: open flag + a root ref, closing on
// Escape (WITHOUT letting the Designer's window-level Escape-deselect also
// fire) or a pointer press outside the root. One home for every popover-style
// control (format-toolbar menus, the binding field picker); mirrors the insert
// menu's dismiss rules.

import { useEffect, useRef, useState } from 'react';

export function usePopover() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (root !== null && event.target instanceof Node && !root.contains(event.target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Close the popover only — the window-level Escape must not also
        // clear the selection.
        event.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);
  return { open, setOpen, rootRef };
}
