// Scheme resolution: explicit preferences win outright, 'auto' follows the
// injected media source (dark when it matches, light otherwise, light when
// there is no source), and hostile stored preferences fail validation.

import { describe, expect, it, vi } from 'vitest';
import { isThemePreference, resolveScheme, type SchemeMedia, subscribeScheme } from './scheme';

function fakeMedia(matches: boolean): SchemeMedia & { fire: () => void } {
  const listeners = new Set<() => void>();
  return {
    matches,
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
    fire: () => {
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

describe('isThemePreference', () => {
  it('accepts exactly the three preferences', () => {
    expect(isThemePreference('auto')).toBe(true);
    expect(isThemePreference('light')).toBe(true);
    expect(isThemePreference('dark')).toBe(true);
  });

  it('rejects anything else (user-writable storage)', () => {
    for (const value of [null, undefined, '', 'DARK', 'blue; }', 42, {}]) {
      expect(isThemePreference(value)).toBe(false);
    }
  });
});

describe('resolveScheme', () => {
  it('returns an explicit preference regardless of the media source', () => {
    expect(resolveScheme('light', fakeMedia(true))).toBe('light');
    expect(resolveScheme('dark', fakeMedia(false))).toBe('dark');
    expect(resolveScheme('dark', null)).toBe('dark');
  });

  it("follows the media source under 'auto'", () => {
    expect(resolveScheme('auto', fakeMedia(true))).toBe('dark');
    expect(resolveScheme('auto', fakeMedia(false))).toBe('light');
  });

  it("renders light under 'auto' without a media source", () => {
    expect(resolveScheme('auto', null)).toBe('light');
  });
});

describe('subscribeScheme', () => {
  it('subscribes to change events and unsubscribes cleanly', () => {
    const media = fakeMedia(false);
    const onChange = vi.fn();
    const unsubscribe = subscribeScheme(media, onChange);
    media.fire();
    expect(onChange).toHaveBeenCalledTimes(1);
    unsubscribe();
    media.fire();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('is a no-op without a media source', () => {
    const unsubscribe = subscribeScheme(null, vi.fn());
    expect(() => unsubscribe()).not.toThrow();
  });
});
