// The DISPLAY list for the shortcuts help dialog: pure, so both platform
// variants are exhaustively unit-testable. This mirrors the BEHAVIOR table in
// `../shortcuts.ts` (undo = Mod+Z, redo = Mod+Shift+Z, duplicate = Mod+D,
// delete = Delete/Backspace, deselect = Escape) — the two are kept in step by
// hand; a chord change there updates the combo strings here.

export interface ShortcutRow {
  /** The rendered chord (⌘ on macOS, Ctrl+ elsewhere). */
  readonly combo: string;
  /** The catalog key naming what the chord does. */
  readonly labelKey: string;
}

/** The five window-level shortcuts, with platform-appropriate chord glyphs. */
export function shortcutRows(mac: boolean): ShortcutRow[] {
  const mod = mac ? '⌘' : 'Ctrl+';
  const shift = mac ? '⇧' : 'Shift+';
  const del = mac ? '⌫' : 'Delete';
  return [
    { combo: `${mod}Z`, labelKey: 'shortcuts.action.undo' },
    { combo: `${mod}${shift}Z`, labelKey: 'shortcuts.action.redo' },
    { combo: `${mod}D`, labelKey: 'shortcuts.action.duplicate' },
    { combo: del, labelKey: 'shortcuts.action.delete' },
    { combo: 'Esc', labelKey: 'shortcuts.action.deselect' },
  ];
}

/** macOS detection for the chord glyphs — the only place the DOM leaks in. */
export function isMacPlatform(): boolean {
  return /Mac|iPhone|iPad|iPod/.test(`${navigator.platform} ${navigator.userAgent}`);
}
