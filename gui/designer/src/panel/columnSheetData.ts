// What the column sheet READS, derived once per render: the picker options each
// column's binding offers, the format rows a bound column earns, and the sample
// value its preview cell shows. Split out of `TableColumnSheet.tsx` so that file
// stays the row layout and nothing else — the sheet grew a per-column alignment
// row and the derivation was the half that was not about laying out cells.
//
// It also resolves each column's CASCADE-EFFECTIVE alignment, because the sheet
// and the single-column form edit the same `columns[n].style.textAlign` and must
// agree about it: a column under a right-aligned row band is right-aligned in
// both, or the panel contradicts itself rather than the document. No floor is
// threaded — the sheet shows no origin, and the floor changes only an origin
// LABEL, never the shown value or the op.
//
// Every other rule here is the sheet's existing behaviour, moved verbatim: row-relative
// options resolve through the TABLE's own binding (an unbound table offers no row
// fields, so the wrong document-scope fields never leak in), the document-scope
// escape appears only when the engine can express it, and a `cell:`/unbound
// column has no row value to preview.

import type { ReadFn } from '@shojiku/designer-core';
import type { FormatCatalog } from '../engine/types';
import type { PaletteGroup } from '../palette/model';
import { parseParams } from '../sample/model';
import { cascadeContext } from '../toolbar/cascade';
import { type EffectiveValue, effectiveValueIn } from '../toolbar/effective';
import type { ColumnRow } from './columnsModel';
import { formatOptions } from './formatModel';
import { registryNames } from './itemView';
import { type PickerOption, pickerOptions, sampleValueFor, scopeAuthorable } from './pickerModel';

export interface ColumnSheetDataOptions {
  readonly read: ReadFn;
  /** The table's structural path — the root of each column's own path. */
  readonly tablePath: string;
  /** The table's own `data.key` — `''` for an unbound table. */
  readonly dataKey: string;
  readonly groups: readonly PaletteGroup[] | null;
  readonly params: string;
  readonly capabilities: readonly string[] | undefined;
  /** The engine's format catalog — what each pickable spelling RENDERS. */
  readonly formatCatalog: FormatCatalog | null;
}

export interface ColumnSheetData {
  /** The table binds a row source, so the columns resolve row-relatively. */
  readonly rowScoped: boolean;
  readonly rowOptions: readonly PickerOption[];
  /** The document-scope escape's options, or `undefined` when there is no
   * `scope:` to author (an older engine) or no row scope to escape from. */
  readonly documentOptions: readonly PickerOption[] | undefined;
  readonly formatRowsFor: (key: string) => ReturnType<typeof formatOptions>;
  readonly sampleFor: (column: ColumnRow) => unknown;
  /** Column `index`'s cascade-effective `textAlign` — its own key over the row
   * band, the table, and whatever they sit on. */
  readonly alignFor: (index: number) => EffectiveValue;
}

export function columnSheetData(options: ColumnSheetDataOptions): ColumnSheetData {
  const { read, tablePath, dataKey, groups, params, capabilities, formatCatalog } = options;
  const rowScoped = dataKey !== '';
  const rowOptions = rowScoped ? pickerOptions(groups, dataKey, params) : [];
  const documentOptions =
    rowScoped && scopeAuthorable(capabilities) ? pickerOptions(groups, null, params) : undefined;
  const sampleRoot = parseParams(params);
  const formatRegistry = registryNames(read('formats'));
  return {
    rowScoped,
    rowOptions,
    documentOptions,
    alignFor: (index: number) =>
      effectiveValueIn(cascadeContext(read, `${tablePath}.columns[${index}]`), 'textAlign'),
    formatRowsFor: (key: string) =>
      formatOptions(
        formatRegistry,
        rowOptions.find((option) => option.key === key)?.type,
        capabilities,
        formatCatalog,
      ),
    sampleFor: (column: ColumnRow) =>
      column.hasCell || column.key === '' || !rowScoped
        ? undefined
        : sampleValueFor(sampleRoot, dataKey, column.key),
  };
}
