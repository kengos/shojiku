import { describe, expect, it } from 'vitest';
import { type KeyChord, shortcutAction } from './shortcuts';

const chord = (over: Partial<KeyChord>): KeyChord => ({
  key: 'a',
  meta: false,
  ctrl: false,
  shift: false,
  ...over,
});

describe('shortcutAction', () => {
  it('maps Escape to deselect', () => {
    expect(shortcutAction(chord({ key: 'Escape' }))).toBe('deselect');
  });

  it('maps ⌘/Ctrl+Z to undo and the shifted form to redo', () => {
    expect(shortcutAction(chord({ key: 'z', meta: true }))).toBe('undo');
    expect(shortcutAction(chord({ key: 'z', ctrl: true }))).toBe('undo');
    expect(shortcutAction(chord({ key: 'Z', meta: true, shift: true }))).toBe('redo');
  });

  it('maps ⌘/Ctrl+D to duplicate', () => {
    expect(shortcutAction(chord({ key: 'd', meta: true }))).toBe('duplicate');
    expect(shortcutAction(chord({ key: 'D', ctrl: true }))).toBe('duplicate');
  });

  it('maps Delete and Backspace to delete', () => {
    expect(shortcutAction(chord({ key: 'Delete' }))).toBe('delete');
    expect(shortcutAction(chord({ key: 'Backspace' }))).toBe('delete');
  });

  it('ignores a bare z/d without a modifier, and unrelated keys', () => {
    expect(shortcutAction(chord({ key: 'z' }))).toBeNull();
    expect(shortcutAction(chord({ key: 'd' }))).toBeNull();
    expect(shortcutAction(chord({ key: 'a', meta: true }))).toBeNull();
    expect(shortcutAction(chord({ key: 'ArrowUp' }))).toBeNull();
  });
});
