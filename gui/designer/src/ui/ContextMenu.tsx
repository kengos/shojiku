// A pointer-anchored context menu (right-click on a canvas box / tree row).
// Headless UI has no context-menu primitive — its Menu is trigger-anchored — so
// this is hand-rolled over `AnchoredSurface`, which owns the position and the
// dismiss rules; what is left here is the menu itself: role="menuitem" buttons,
// first-item focus on open, and roving arrow-key focus. Item labels are CHROME
// text (i18n), never document content (no injection surface).
// It is an accelerator only: every item is mirrored by a keyboard-reachable
// panel or menubar action, so right-click is never the sole path (the a11y
// posture).

import { useEffect, useState } from 'react';
import { AnchoredSurface } from './AnchoredSurface';
import type { AnchorPoint } from './anchorPosition';

export interface ContextMenuItem {
  readonly label: string;
  readonly onSelect: () => void;
}

export interface ContextMenuProps {
  /** Anchor in viewport (client) px — the pointer position. `null` = closed. */
  readonly at: AnchorPoint | null;
  readonly items: readonly ContextMenuItem[];
  readonly onClose: () => void;
}

const MENUITEM = '[role="menuitem"]';

export function ContextMenu({ at, items, onClose }: ContextMenuProps) {
  // The first row, held in state so opening (or reopening at another point)
  // focuses it for keyboard entry. It is null exactly while the menu is closed.
  const [first, setFirst] = useState<HTMLButtonElement | null>(null);
  useEffect(() => {
    first?.focus();
  }, [first]);

  if (at === null || items.length === 0) {
    return null;
  }

  // Roving focus reads the buttons off the event's own element (always mounted
  // when its keydown fires), so there is no nullable-ref branch. The item list
  // is non-empty here (the guard above), so `buttons` never is.
  const move = (root: HTMLElement, dir: 1 | -1) => {
    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>(MENUITEM));
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = (current + dir + buttons.length) % buttons.length;
    buttons[next].focus();
  };

  return (
    <AnchoredSurface
      at={at}
      onClose={onClose}
      ariaOrientation="vertical"
      className="min-w-[10rem] rounded-md border border-border bg-surface py-1 text-sm text-text shadow-lg"
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
      {items.map((item, index) => (
        <button
          key={item.label}
          ref={index === 0 ? setFirst : undefined}
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
    </AnchoredSurface>
  );
}
