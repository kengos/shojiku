import { afterEach, describe, expect, it, vi } from 'vitest';
import { isMacPlatform, shortcutRows } from './shortcutsModel';

describe('shortcutRows', () => {
  it('names all five window shortcuts in order', () => {
    expect(shortcutRows(false).map((r) => r.labelKey)).toEqual([
      'shortcuts.action.undo',
      'shortcuts.action.redo',
      'shortcuts.action.duplicate',
      'shortcuts.action.delete',
      'shortcuts.action.deselect',
    ]);
  });

  it('uses ⌘/⇧/⌫ glyphs on macOS', () => {
    const combos = shortcutRows(true).map((r) => r.combo);
    expect(combos).toEqual(['⌘Z', '⌘⇧Z', '⌘D', '⌫', 'Esc']);
  });

  it('uses Ctrl+/Shift+/Delete words off macOS', () => {
    const combos = shortcutRows(false).map((r) => r.combo);
    expect(combos).toEqual(['Ctrl+Z', 'Ctrl+Shift+Z', 'Ctrl+D', 'Delete', 'Esc']);
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
