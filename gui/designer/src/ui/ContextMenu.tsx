// A pointer-anchored context menu (right-click on a canvas box / tree row).
// Headless UI has no context-menu primitive — its Menu is trigger-anchored — so
// this is hand-rolled: a fixed-position role="menu" at the click point, closed
// on Escape / outside pointer-down / after a pick, with roving arrow-key focus
// and first-item focus on open. Items are plain role="menuitem" buttons whose
// label is CHROME text (i18n), never document content (no injection surface).
// It is an accelerator only: every item is mirrored by a keyboard-reachable
// panel action, so right-click is never the sole path (the a11y posture).

import { useEffect, useRef } from 'react';

export interface ContextMenuItem {
  readonly label: string;
  readonly onSelect: () => void;
}

export interface ContextMenuProps {
  /** Anchor in viewport (client) px — the pointer position. `null` = closed. */
  readonly at: { readonly x: number; readonly y: number } | null;
  readonly items: readonly ContextMenuItem[];
  readonly onClose: () => void;
}

const MENUITEM = '[role="menuitem"]';

export function ContextMenu({ at, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  // Focus the first item on open (keyboard entry; arrow keys then rove).
  useEffect(() => {
    if (at === null) {
      return;
    }
    ref.current?.querySelector<HTMLButtonElement>(MENUITEM)?.focus();
  }, [at]);

  // Close on Escape or an outside pointer-down, while open. Capture phase +
  // stopPropagation on Escape so it wins over the Designer's deselect handler
  // (the LayerTree drag-cancel precedent).
  useEffect(() => {
    if (at === null) {
      return;
    }
    const onDown = (event: PointerEvent) => {
      if (ref.current !== null && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [at, onClose]);

  if (at === null || items.length === 0) {
    return null;
  }

  // Roving focus reads the buttons off the event's own element (always
  // mounted when its keydown fires), so there is no nullable-ref branch. The
  // item list is non-empty here (the guard above), so `buttons` never is.
  const move = (root: HTMLElement, dir: 1 | -1) => {
    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>(MENUITEM));
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = (current + dir + buttons.length) % buttons.length;
    buttons[next].focus();
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-orientation="vertical"
      className="fixed z-50 min-w-[10rem] rounded-md border border-border bg-surface py-1 text-sm text-text shadow-lg"
      style={{ left: at.x, top: at.y }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          move(event.currentTarget, 1);
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          move(event.currentTarget, -1);
        }
      }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className="block w-full cursor-pointer border-0 bg-transparent px-3 py-1.5 text-left text-text hover:bg-bg"
          onClick={() => {
            item.onSelect();
            onClose();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
