// Clipboard-paste import, end to end: a parsed grid (`pasteGrid.ts`) plus its
// typed columns (`pasteColumns.ts`) become ONE `insertItem` table plus the
// params rows the preview shows immediately. The pasted rows are verbatim (not
// synth-generated), so this rides `scaffoldSnippet` + `extendParamsValue`, not
// the schema-driven `extendParams`. Framework-free.

import { analyzeColumns, coerceCell } from './pasteColumns';
import type { PasteGrid } from './pasteGrid';
import type { ScaffoldColumn, ScaffoldSpec } from './scaffold';

export type PasteRefusal =
  | 'empty'
  | 'no_columns'
  | 'no_rows'
  | 'key_exists'
  | 'invalid_params'
  | 'insert_failed';

/** A fresh top-level params key not already taken (`table`, `table_2`, …). */
export function freshSourceKey(base: string, existing: Iterable<string>): string {
  const taken = new Set(existing);
  if (!taken.has(base)) {
    return base;
  }
  let n = 2;
  while (taken.has(`${base}_${n}`)) {
    n += 1;
  }
  return `${base}_${n}`;
}

export interface PasteScaffold {
  /** The table `insertItem` spec (money columns carry a `symbol` format —
   * the pasted cells HAD a currency symbol, so the display reproduces it). */
  readonly spec: ScaffoldSpec;
  /** The verbatim sample rows for `extendParamsValue` (row objects keyed by the
   * derived keys — proto-safe: keys are ASCII slugs, never `__proto__`). */
  readonly rows: readonly Record<string, unknown>[];
}

/** Build the table spec + verbatim param rows from a parsed grid. The source key
 * is derived fresh against the existing params so `extendParamsValue` never
 * refuses on a collision. */
export function buildPasteScaffold(grid: PasteGrid, existingKeys: Iterable<string>): PasteScaffold {
  const columns = analyzeColumns(grid);
  const sourceKey = freshSourceKey('table', existingKeys);
  const specColumns: ScaffoldColumn[] = columns.map((column) => ({
    key: column.key,
    label: column.label === '' ? column.key : column.label,
    ...(column.kind === 'currency' ? { format: 'symbol' } : {}),
  }));
  const rows = grid.rows.map((cells) => {
    let out: Record<string, unknown> = {};
    columns.forEach((column, index) => {
      out = { ...out, [column.key]: coerceCell(cells[index] ?? '', column.kind) };
    });
    return out;
  });
  return { spec: { sourceKey, columns: specColumns }, rows };
}
