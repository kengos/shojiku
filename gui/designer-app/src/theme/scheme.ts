// The app's color-scheme wiring: the user's theme preference ('auto' follows
// the OS) resolved over an injected matchMedia-like source. Pure — main.tsx
// supplies the real `window.matchMedia('(prefers-color-scheme: dark)')`; the
// Designer component itself only ever receives the RESOLVED scheme (it never
// sniffs the OS preference).

import type { ColorScheme } from '@shojiku/designer';

/** The persisted preference: follow the OS, or force one scheme. */
export type ThemePreference = 'auto' | ColorScheme;

/** The matchMedia subset the resolver needs (injected; null = unavailable). */
export interface SchemeMedia {
  readonly matches: boolean;
  addEventListener(type: 'change', listener: () => void): void;
  removeEventListener(type: 'change', listener: () => void): void;
}

/** Validates a stored preference (localStorage is user-writable — anything
 * unknown degrades to 'auto', never throws, never reaches the chrome). */
export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'auto' || value === 'light' || value === 'dark';
}

/** The scheme a preference renders as right now. */
export function resolveScheme(pref: ThemePreference, media: SchemeMedia | null): ColorScheme {
  if (pref !== 'auto') {
    return pref;
  }
  return media?.matches ? 'dark' : 'light';
}

/** Follow OS scheme changes; returns the unsubscribe. A null source is a
 * no-op subscription (the scheme just stays as resolved). */
export function subscribeScheme(media: SchemeMedia | null, onChange: () => void): () => void {
  if (media === null) {
    return () => {};
  }
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}
