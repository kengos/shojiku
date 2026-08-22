import { afterEach, describe, expect, it, vi } from 'vitest';
import { isMacPlatform, shortcutRows } from './shortcutsModel';

describe('shortcutRows', () => {
  it('names the five window shortcuts, then the tree reorder chord', () => {
    expect(shortcutRows(false).map((r) => r.labelKey)).toEqual([
      'shortcuts.action.undo',
      'shortcuts.action.redo',
      'shortcuts.action.duplicate',
      'shortcuts.action.delete',
      'shortcuts.action.deselect',
      'shortcuts.action.reorder',
    ]);
  });

  it('uses ⌘/⇧/⌫/⌥ glyphs on macOS', () => {
    const combos = shortcutRows(true).map((r) => r.combo);
    expect(combos).toEqual(['⌘Z', '⌘⇧Z', '⌘D', '⌫', 'Esc', '⌥↑ / ⌥↓']);
  });

  it('uses Ctrl+/Shift+/Delete/Alt+ words off macOS', () => {
    const combos = shortcutRows(false).map((r) => r.combo);
    expect(combos).toEqual(['Ctrl+Z', 'Ctrl+Shift+Z', 'Ctrl+D', 'Delete', 'Esc', 'Alt+↑ / Alt+↓']);
  });

  // The layer tree's reorder chord is the one row here that is NOT
  // window-level. It is listed because a keyboard path nothing names is a
  // keyboard path nobody finds — the same reason the tree grew a drag hint.
  it('spells the reorder chord with the platform Alt glyph on both platforms', () => {
    const row = (mac: boolean) =>
      shortcutRows(mac).find((r) => r.labelKey === 'shortcuts.action.reorder');
    expect(row(true)?.combo).toBe('⌥↑ / ⌥↓');
    expect(row(false)?.combo).toBe('Alt+↑ / Alt+↓');
  });
});

describe('isMacPlatform', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is true for a Mac platform string', () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel', userAgent: '' });
    expect(isMacPlatform()).toBe(true);
  });

  it('is false for a non-Mac platform string', () => {
    vi.stubGlobal('navigator', { platform: 'Win32', userAgent: 'Windows' });
    expect(isMacPlatform()).toBe(false);
  });
});
