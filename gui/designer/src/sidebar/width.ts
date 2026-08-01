// The left tool-pane width bounds + a hostile-safe clamp. Pure so the Designer
// seeds/clamps its resizable-pane state and a host's persistence layer (the
// user-writable localStorage pref) share ONE authority — mirrors
// `normalizeGridStep`/`clampTemplateMaxBytes`: absent / garbage / hostile
// input degrades to the default, valid input clamps to [MIN, MAX].

/** Narrowest the pane may be dragged (px): keeps the three sidebar tabs
 * readable — below this they wrap to a second row rather than clip. */
export const MIN_SIDEBAR_WIDTH = 180;
/** Widest the pane may be dragged (px): past this the canvas is starved. */
export const MAX_SIDEBAR_WIDTH = 480;
/** The default pane width (px) — the pre-resize fixed column. */
export const DEFAULT_SIDEBAR_WIDTH = 240;

/** Clamp a requested pane width to `[MIN, MAX]`; a non-finite / absent value
 * (unset pref, hostile storage) degrades to the default. */
export function clampSidebarWidth(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return DEFAULT_SIDEBAR_WIDTH;
  }
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, value));
}
