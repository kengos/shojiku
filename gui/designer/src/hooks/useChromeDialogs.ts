// The Designer-local dialog flags: the horizontal column-editor sheet and the
// Help menu's self-contained dialogs. UI state that never reaches the template
// (like zoom or the grid step); the help dialogs are read-only chrome — no
// document mutation, no op.

import { useState } from 'react';

export interface ChromeDialogs {
  readonly columnSheetOpen: boolean;
  readonly openColumnSheet: () => void;
  readonly closeColumnSheet: () => void;
  readonly shortcutsOpen: boolean;
  readonly openShortcuts: () => void;
  readonly closeShortcuts: () => void;
  readonly glossaryOpen: boolean;
  /** Shared by the Help menu's glossary item AND a HelpHint's "learn more". */
  readonly openGlossary: () => void;
  readonly closeGlossary: () => void;
}

export function useChromeDialogs(): ChromeDialogs {
  const [columnSheetOpen, setColumnSheetOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  return {
    columnSheetOpen,
    openColumnSheet: () => setColumnSheetOpen(true),
    closeColumnSheet: () => setColumnSheetOpen(false),
    shortcutsOpen,
    openShortcuts: () => setShortcutsOpen(true),
    closeShortcuts: () => setShortcutsOpen(false),
    glossaryOpen,
    openGlossary: () => setGlossaryOpen(true),
    closeGlossary: () => setGlossaryOpen(false),
  };
}
