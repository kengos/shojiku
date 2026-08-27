// The DISPLAY list for the shortcuts help dialog: pure, so both platform
// variants are exhaustively unit-testable. Most of it mirrors the BEHAVIOR
// table in `../shortcuts.ts` (undo = Mod+Z, redo = Mod+Shift+Z, duplicate =
// Mod+D, delete = Delete/Backspace, deselect = Escape) — the two are kept in
// step by hand; a chord change there updates the combo strings here.
//
// The last row is NOT window-level: Alt+↑/↓ is the layer tree's own reorder
// chord (`tree/useRowReorder.ts`), listed because a keyboard path nothing
// names is a keyboard path nobody finds.

export interface ShortcutRow {
  /** The rendered chord (⌘ on macOS, Ctrl+ elsewhere). */
  readonly combo: string;
  /** The catalog key naming what the chord does. */
  readonly labelKey: string;
}

/** The five window-level shortcuts plus the layer tree's reorder chord, with
 * platform-appropriate chord glyphs. */
/** The chord's modifier glyph for a platform — `⌘` on macOS, `Ctrl+` elsewhere.
 * Exported so any OTHER surface naming a chord (the text field's key hint)
 * spells it the same way this dialog does; a second copy would drift, and the
 * two are two menus apart. */
export function modifierGlyph(mac: boolean): string {
  return mac ? '⌘' : 'Ctrl+';
}

export function shortcutRows(mac: boolean): ShortcutRow[] {
  const mod = modifierGlyph(mac);
  const shift = mac ? '⇧' : 'Shift+';
  const del = mac ? '⌫' : 'Delete';
  const alt = mac ? '⌥' : 'Alt+';
  return [
    { combo: `${mod}Z`, labelKey: 'shortcuts.action.undo' },
    { combo: `${mod}${shift}Z`, labelKey: 'shortcuts.action.redo' },
    { combo: `${mod}D`, labelKey: 'shortcuts.action.duplicate' },
    { combo: del, labelKey: 'shortcuts.action.delete' },
    { combo: 'Esc', labelKey: 'shortcuts.action.deselect' },
    { combo: `${alt}↑ / ${alt}↓`, labelKey: 'shortcuts.action.reorder' },
  ];
}

/** macOS detection for the chord glyphs — the only place the DOM leaks in. */
export function isMacPlatform(): boolean {
  return /Mac|iPhone|iPad|iPod/.test(`${navigator.platform} ${navigator.userAgent}`);
}
