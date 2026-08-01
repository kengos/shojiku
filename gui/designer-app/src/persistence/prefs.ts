// The user's persisted preferences (locale override, theme, editor grid
// step), over an injected `Storage`. Kept separate from drafts: preferences,
// not document content. Reads degrade to their default and writes swallow
// quota failures — a lost preference is not worth surfacing an error for.

import {
  clampSidebarWidth,
  clampTemplateMaxBytes,
  normalizeGridStep,
  type TutorialStore,
} from '@shojiku/designer';
import { isThemePreference, type ThemePreference } from '../theme/scheme';

const LOCALE_KEY = 'shojiku.locale';
const THEME_KEY = 'shojiku.theme';
const GRID_KEY = 'shojiku.gridStep';
const TEMPLATE_MAX_BYTES_KEY = 'shojiku.templateMaxBytes';
const SIDEBAR_WIDTH_KEY = 'shojiku.sidebarWidth';
const TUTORIAL_KEY = 'shojiku.tutorial.progress';

export class Prefs {
  private readonly storage: Storage;

  constructor(storage: Storage) {
    this.storage = storage;
  }

  /** The stored locale tag, or `null` when unset (auto-detect). */
  localeOverride(): string | null {
    return this.storage.getItem(LOCALE_KEY);
  }

  /** Persist a chosen locale tag; a quota failure is silently ignored. */
  setLocaleOverride(tag: string): void {
    try {
      this.storage.setItem(LOCALE_KEY, tag);
    } catch {
      // a lost preference is acceptable; do not surface it
    }
  }

  /** The stored theme preference; anything unknown (including hostile
   * user-written storage) degrades to `'auto'`. */
  themePref(): ThemePreference {
    const value = this.storage.getItem(THEME_KEY);
    return isThemePreference(value) ? value : 'auto';
  }

  /** Persist the theme preference; a quota failure is silently ignored. */
  setThemePref(pref: ThemePreference): void {
    try {
      this.storage.setItem(THEME_KEY, pref);
    } catch {
      // a lost preference is acceptable; do not surface it
    }
  }

  /** The stored editor grid step (pt; 0 = off). User-writable storage, so it
   * is clamped to the component's offered steps; anything else — absent,
   * garbage, hostile — degrades to the default. */
  gridStep(): number {
    const raw = this.storage.getItem(GRID_KEY);
    // A blank string would Number() to 0 ("off") — degrade it to the default
    // like any other non-value instead.
    return normalizeGridStep(raw === null || raw.trim() === '' ? undefined : Number(raw));
  }

  /** Persist the editor grid step; a quota failure is silently ignored. */
  setGridStep(step: number): void {
    try {
      this.storage.setItem(GRID_KEY, String(step));
    } catch {
      // a lost preference is acceptable; do not surface it
    }
  }

  /** The stored template-size cap (bytes; raised to hold inline images).
   * User-writable storage, so it is clamped to `[MAX_TEMPLATE_BYTES,
   * MAX_TEMPLATE_BYTES_CEILING]`; absent / garbage / hostile degrades to the
   * default. */
  templateMaxBytes(): number {
    const raw = this.storage.getItem(TEMPLATE_MAX_BYTES_KEY);
    return clampTemplateMaxBytes(raw === null || raw.trim() === '' ? undefined : Number(raw));
  }

  /** Persist the template-size cap; a quota failure is silently ignored. */
  setTemplateMaxBytes(bytes: number): void {
    try {
      this.storage.setItem(TEMPLATE_MAX_BYTES_KEY, String(clampTemplateMaxBytes(bytes)));
    } catch {
      // a lost preference is acceptable; do not surface it
    }
  }

  /** The stored left-pane width (px). User-writable storage, so it is clamped
   * to the pane bounds; absent / garbage / hostile degrades to the default. */
  sidebarWidth(): number {
    const raw = this.storage.getItem(SIDEBAR_WIDTH_KEY);
    return clampSidebarWidth(raw === null || raw.trim() === '' ? undefined : Number(raw));
  }

  /** Persist the left-pane width; a quota failure is silently ignored. */
  setSidebarWidth(width: number): void {
    try {
      this.storage.setItem(SIDEBAR_WIDTH_KEY, String(clampSidebarWidth(width)));
    } catch {
      // a lost preference is acceptable; do not surface it
    }
  }

  /** The tutorial store the Designer reads as its launcher opens. The RAW
   * string is handed over: the component owns the shape guard, because the
   * value is user-writable storage and only it knows which steps are real. */
  tutorialStore(): TutorialStore {
    return {
      load: () => this.storage.getItem(TUTORIAL_KEY),
      save: (progress) => {
        try {
          this.storage.setItem(TUTORIAL_KEY, JSON.stringify(progress));
        } catch {
          // losing tutorial progress is acceptable; do not surface it
        }
      },
    };
  }
}
