// The frame a column's NEW `cell:` gets when its bound display moves inside it,
// so the page looks the same right after the switch. A text / QR code / image
// cell sits inside the table's `cellPadding` and takes the cell's vertical
// alignment; a `cell:` sub-template gets neither (its items are placed from the
// cell's own corner — `cell_container` is handed no padding, and
// `verticalAlign` does not inherit). So the carried frame states both itself:
// `box.padding` = the table's `cellPadding` (the engine's 4pt when unset), and
// `box.justifyContent` along the frame's default column direction = the
// column's effective vertical alignment (top → the default start, middle →
// center, bottom → end), resolved through the same table layers the engine's
// `cell_valign` walks. A per-row conditional rule's alignment is data-dependent
// and cannot be carried into one frame.

import type { ReadFn, SnippetValue } from '@shojiku/designer-core';
import { cascadeContext } from '../toolbar/cascade';
import { tableValignIn } from './bandCascade';
import { columnPathInfo } from './columnsModel';
import { DEFAULT_CELL_PADDING } from './tableSettingsModel';

function own(value: unknown, key: string): unknown {
  return typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.hasOwn(value, key)
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

/** The authored `cellPadding` when it is a usable length, else the default. */
function paddingOf(table: unknown): string | number {
  const raw = own(table, 'cellPadding');
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
    return raw;
  }
  return typeof raw === 'string' && raw.trim() !== '' ? raw : DEFAULT_CELL_PADDING;
}

/** The `box` for the cell a switch into free layout creates at `columnPath`. */
export function carriedCellFrame(
  read: ReadFn,
  columnPath: string,
): Readonly<Record<string, SnippetValue>> {
  const info = columnPathInfo(columnPath);
  const padding = paddingOf(info === null ? undefined : read(info.tablePath));
  const valign = tableValignIn(cascadeContext(read, columnPath)).value;
  if (valign === 'top') {
    return { padding };
  }
  return { padding, justifyContent: valign === 'bottom' ? 'end' : 'center' };
}
