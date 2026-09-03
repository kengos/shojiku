// Shared Designer chrome className strings — Tailwind utilities over the
// `--sj-*` tokens. The panels are form-dense, so the recurring input / button
// / section-title / label chrome is centralized here (the old styles.css did
// this with element + descendant selectors); one-off chrome stays inline in
// its component. Effort goes to edit UX, not chrome — see docs/agents/gui.md
// § CSS foundation.

/** Default chrome button: toolbar, dialog buttons. */
export const BTN =
  'cursor-pointer rounded-md border border-border bg-surface px-3 py-1 text-text enabled:hover:border-muted disabled:cursor-default disabled:opacity-45';

/** Compact chrome button (panel actions — sample/variant/column rows), tighter
 * horizontal padding than the toolbar BTN. */
export const BTN_SM =
  'cursor-pointer rounded-md border border-border bg-surface px-2 py-1 text-text enabled:hover:border-muted disabled:cursor-default disabled:opacity-45';

/** A full-width panel form control (text/number input, select). */
export const INPUT = 'w-full rounded-md border border-border bg-surface px-2 py-1 text-text';

/** Compact toolbar select (zoom / grid step / sample variant). */
export const SELECT_SM = 'rounded-md border border-border bg-bg px-1 py-0.5 text-sm text-text';

/** The right-hand property panel shell (scrolling, chrome background). */
export const PANEL = 'min-w-0 overflow-y-auto border-l border-border bg-chrome p-3';

/** The panel shell WITHOUT padding — for surfaces that own their own edge-to-edge
 * chrome (the per-item tabs, the document-settings accordion) so tab strips and
 * disclosure headers span the full width. */
export const PANEL_FLUSH = 'min-w-0 overflow-y-auto border-l border-border bg-chrome';

/** A panel section heading (uppercase, tracked, muted). */
export const SECTION_TITLE =
  'm-0 mb-2 text-sm font-semibold uppercase tracking-[0.08em] text-muted';

/** The ▼ that opens a picker's popover. It STRETCHES to the row
 * (`SideButtonField` is `items-stretch`), so the glyph is centred rather than
 * the box being lined up on one edge of the input.
 *
 * It is a WHOLE button on its own, and `PICKER_TOGGLE_FLUSH` is what pairs it
 * with an input. Flushness belongs to the PAIRING, not to the toggle: three of
 * this constant's four call sites stand beside their own `<input>`, but
 * `FormatDefaultRow`'s ▼ stands alone in a `gap-2` row of text spans, where
 * squared left corners and a missing left border draw a three-sided open box. */
export const PICKER_TOGGLE =
  'flex shrink-0 cursor-pointer items-center rounded-md border border-border bg-chrome px-2 text-text';

/** `PICKER_TOGGLE` for the ▼ that fills an input: it shares that input's right
 * border rather than floating 4px off it, because an input and its ▼ are ONE
 * control (macOS/HIG, and the word processor's font box). The input beside it
 * squares its right corners (`rounded-r-none`) — the seam is one shared border,
 * the same shape as the stepper's ▲▼ column. */
export const PICKER_TOGGLE_FLUSH = `${PICKER_TOGGLE} rounded-l-none border-l-0`;

/** A field label above its control. */
export const FIELD_LABEL = 'mb-0.5 block text-sm text-muted';

/** A compact colour-swatch trigger for a panel's fill / text-colour rows —
 * shared by the item decoration tab and the document's default text colour. */
export const PANEL_SWATCH_TRIGGER =
  'inline-flex h-7 w-10 cursor-pointer items-center justify-center rounded-md border border-border bg-surface hover:border-muted';

/** An absolute-positioned popover panel (menus, pickers). Position the top
 * edge (`top-full`) and any offset at the call site. */
export const POPOVER =
  'absolute left-0 z-10 rounded-md border border-border bg-surface p-1 shadow-[0_4px_12px_rgb(0_0_0/0.15)]';

/** The binding field-picker popover (shared by the panel picker and the
 * canvas insert-field menu): a scrolling column of picker rows. */
export const PICKER_POPOVER =
  'absolute inset-x-0 top-full z-10 flex max-h-80 flex-col gap-px overflow-y-auto rounded-md border border-border bg-surface p-1 shadow-[0_4px_12px_rgb(0_0_0/0.15)]';

/** One field-picker row: label / key+type / sample, stacked. */
export const PICKER_ROW =
  'flex w-full cursor-pointer flex-col gap-px rounded-md border-0 bg-transparent px-2 py-1 text-left text-text hover:bg-chrome';
