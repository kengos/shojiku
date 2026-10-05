// What a table column RENDERS per row — its kind — and which kinds the engine
// lets the panel offer. A column prints its bound value as text (the default),
// as a QR code or as an image (`type:`), or it carries a `cell:` sub-template of
// freely placed items instead of a binding. `cell` wins over `type`, the way the
// engine's layout draws the `cell` when a column authors both.
//
// The offered set follows the engine's capability keys, plus the kind the column
// ALREADY has: a column an older engine cannot author still shows what it is, so
// the control never claims a document the user can see is something else.
// `type` is a closed engine enum, so no other spelling reaches here as a valid
// document; a non-string or unknown one reads as the default text.

export type ColumnKind = 'text' | 'qr_code' | 'image' | 'cell';

/** The order the control lists the kinds in. */
export const COLUMN_KINDS: readonly ColumnKind[] = ['text', 'qr_code', 'image', 'cell'];

/** The capability that admits `type: qr_code | image` on a column. */
export const COLUMN_TYPE_CAPABILITY = 'table.column.type';
/** The capability that admits a column's `cell:` sub-template. */
export const COLUMN_CELL_CAPABILITY = 'table.column.cell';

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** The kind of one materialized column entry (hostile shapes read as text). */
export function columnKindOf(column: unknown): ColumnKind {
  const entry = record(column);
  if (entry === undefined) {
    return 'text';
  }
  if (Object.hasOwn(entry, 'cell') && record(entry.cell) !== undefined) {
    return 'cell';
  }
  const type = Object.hasOwn(entry, 'type') ? entry.type : undefined;
  return type === 'qr_code' || type === 'image' ? type : 'text';
}

/** The kinds the control offers for a column of kind `current`, in display
 * order. `undefined` capabilities = the bundled engine, which has them all. */
export function offeredKinds(
  current: ColumnKind,
  capabilities: readonly string[] | undefined,
): readonly ColumnKind[] {
  const has = (key: string) => capabilities === undefined || capabilities.includes(key);
  return COLUMN_KINDS.filter((kind) => {
    if (kind === current || kind === 'text') {
      return true;
    }
    return kind === 'cell' ? has(COLUMN_CELL_CAPABILITY) : has(COLUMN_TYPE_CAPABILITY);
  });
}
