// Pure model for a table's ROW and PAGE settings as the wire carries them: the
// body-row height (auto with a floor, or fixed), the header row's height, the
// cell padding, what an empty array draws, empty-cell merging and the three
// pagination flags. Authored values only, read off the materialized table node;
// the write side is `tableSettingsOps`.
//
// The document is untrusted: a `row` that is a list, a `header` that is a
// string or a table that is not a map at all degrade to the engine defaults
// rather than throwing. Lengths are reported VERBATIM (a number stringified), so
// an authored `50%` stays on screen and is never rewritten by a field that only
// displayed it. The booleans are read STRICTLY against the engine's own default
// (`TableItem::auto_page_break` and its siblings): only a real `false` turns a
// default-on flag off, only a real `true` turns a default-off flag on.

/** The engine's auto-row floor when `row.minHeight` is unset
 * (`RowSpec::min_height`, 24pt). The height steppers start from it. */
export const DEFAULT_ROW_MIN_HEIGHT = 24;

/** The engine's `cellPadding` when unset (`TableItem::cell_padding`, 4pt). */
export const DEFAULT_CELL_PADDING = 4;

/** `emptyBehavior`'s two wire values, in the engine's declaration order. */
export const EMPTY_BEHAVIORS = ['collapse', 'reserve'] as const;
export type EmptyBehavior = (typeof EMPTY_BEHAVIORS)[number];

export interface TableSettingsView {
  /** `fixed` exactly when `row.height` is authored — the engine lets it win
   * over `row.minHeight`, so its presence is what the mode IS. */
  readonly rowMode: 'auto' | 'fixed';
  readonly rowHeight: string;
  readonly minHeight: string;
  /** Whether `row.minHeight` is present at all — a value the text cannot show
   * (a map, a boolean) still has to leave with the fixed switch. */
  readonly minHeightAuthored: boolean;
  readonly headerHeight: string;
  readonly cellPadding: string;
  readonly emptyBehavior: EmptyBehavior;
  readonly mergeEmptyCells: boolean;
  readonly autoPageBreak: boolean;
  readonly repeatHeader: boolean;
  readonly keepTogether: boolean;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** An own key's value, never one reached through the prototype. */
function own(map: Record<string, unknown> | undefined, key: string): unknown {
  return map !== undefined && Object.hasOwn(map, key) ? map[key] : undefined;
}

/** A length as its display text: a finite number stringified, a string as-is,
 * anything else (unset, garbage) `''`. */
function lengthText(value: unknown): string {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }
  return typeof value === 'string' ? value : '';
}

export function readTableSettings(raw: unknown): TableSettingsView {
  const table = record(raw);
  const row = record(own(table, 'row'));
  const header = record(own(table, 'header'));
  const rowHeight = own(row, 'height');
  return {
    rowMode: rowHeight === undefined ? 'auto' : 'fixed',
    rowHeight: lengthText(rowHeight),
    minHeight: lengthText(own(row, 'minHeight')),
    minHeightAuthored: own(row, 'minHeight') !== undefined,
    headerHeight: lengthText(own(header, 'height')),
    cellPadding: lengthText(own(table, 'cellPadding')),
    emptyBehavior: own(table, 'emptyBehavior') === 'reserve' ? 'reserve' : 'collapse',
    mergeEmptyCells: own(table, 'mergeEmptyCells') === true,
    autoPageBreak: own(table, 'autoPageBreak') !== false,
    repeatHeader: own(table, 'repeatHeader') !== false,
    keepTogether: own(table, 'keepTogether') === true,
  };
}
