// Shared app-shell chrome className strings — Tailwind utilities over the
// `--sj-*` tokens. Co-located so the toolbar / draft prompt / font picker /
// project-list buttons and the status banners stay ONE definition each (the
// old app.css did this with descendant selectors). Effort goes to edit UX,
// not chrome — see docs/agents/gui.md § CSS foundation.

/** The default app-shell button: toolbar, draft prompt, font picker, project
 * list, error retry, templates back. Same chrome as the Designer's default
 * button, at the app shell's tighter padding. */
export const APP_BUTTON =
  'cursor-pointer rounded-md border border-border bg-surface px-3 py-1 text-text enabled:hover:border-muted disabled:cursor-default disabled:opacity-45';

/** An error banner line (invalid save, open failure, …). */
export const APP_BANNER = 'm-0 bg-error-bg px-4 py-2 text-sm text-error-text';

/** A transient status line (font fetching, saving) — the warn palette. */
export const APP_STATUS = 'm-0 bg-warn-bg px-4 py-2 text-sm text-warn-text';

/** A catalog / project-list section heading. */
export const APP_TITLE = 'mx-4 mt-4 mb-2 text-[18px] font-bold';

/** A header/filter `<select>` (theme, locale, font subset). */
export const APP_SELECT = 'rounded-md border border-border bg-surface px-2 py-0.5 text-text';

/** A full-width list entry in the mounted host's project/template list. */
export const APP_LIST_BUTTON =
  'w-full cursor-pointer rounded-md border border-border bg-surface px-3 py-2 text-left text-text hover:border-accent';
