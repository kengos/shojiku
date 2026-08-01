// Pure model for table column editing: the columns view read from the
// materialized table node, the column-path recognizer (a canvas click on a
// column cell selects `…columns[n]`), and the add/remove/reorder op builders.
// Every edit is ONE designer-core op (AI parity); label/width/binding edits
// reuse the shared `panel/model` builders at the column's structural path.
// The document is untrusted — a hostile column entry (non-map, missing keys)
// still yields a row so indices stay true (the layer-tree posture), and
// display strings are bounded by the palette's display cap upstream of the
// DOM (inputs render verbatim; React escapes).

import type { Op } from '@shojiku/designer-core';
import { formatPath, parsePath } from '@shojiku/designer-core';

export interface ColumnRow {
  /** The header label ('' when unset/not a string). */
  readonly label: string;
  /** The row-relative `data.key` ('' when unset/not a string). */
  readonly key: string;
  /** The authored width's display form ('' when unset; numbers stringified,
   * length strings verbatim — the GUI never re-parses a length). */
  readonly width: string;
  /** The column binding's `data.format` ('' when unset/not a string) — the
   * per-column format combo edits it. */
  readonly format: string;
  /** The column binding's authored `data.scope` ('' when unset — the engine's
   * `element` default, i.e. the row). Drives the picker's scope badge. */
  readonly scope: string;
  /** A `cell:` column — its content is a sub-template, so the binding
   * editor is hidden (label/width/order still edit). */
  readonly hasCell: boolean;
}

function displayLength(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** The columns of a materialized table node; `null` when the node carries no
 * columns array (nothing to edit). Malformed entries still produce a row so
 * the view's indices match the document's. */
export function readColumnsView(tableNode: unknown): readonly ColumnRow[] | null {
  const columns = record(tableNode)?.columns;
  if (!Array.isArray(columns)) {
    return null;
  }
  return columns.map((entry) => {
    const column = record(entry);
    const data = record(column?.data);
    const label = column?.label;
    const key = data?.key;
    const format = data?.format;
    const scope = data?.scope;
    return {
      label: typeof label === 'string' ? label : '',
      key: typeof key === 'string' ? key : '',
      width: displayLength(column?.width),
      format: typeof format === 'string' ? format : '',
      scope: typeof scope === 'string' ? scope : '',
      hasCell: record(column?.cell) !== undefined,
    };
  });
}

/** Recognize a column selection: a structural path ending exactly in
 * `.columns[n]`. Returns the owning table's path and the column index. */
export function columnPathInfo(
  path: string,
): { readonly tablePath: string; readonly index: number } | null {
  let segments: ReturnType<typeof parsePath>;
  try {
    segments = parsePath(path);
  } catch {
    return null;
  }
  const last = segments[segments.length - 1];
  const parent = segments[segments.length - 2];
  if (
    segments.length < 3 ||
    last === undefined ||
    parent === undefined ||
    last.kind !== 'index' ||
    parent.kind !== 'key' ||
    parent.key !== 'columns'
  ) {
    return null;
  }
  return { tablePath: formatPath(segments.slice(0, segments.length - 2)), index: last.index };
}

/** Append a label-only column (the honest blank state: the engine warns
 * `column_content_missing` until a field is picked — visible, quick-fixable,
 * never a silent guess at a binding). */
export function addColumnOp(tablePath: string, count: number, label: string): Op {
  return {
    op: 'insertItem',
    path: `${tablePath}.columns`,
    index: count,
    value: { label },
  };
}

export function removeColumnOp(tablePath: string, index: number): Op {
  return { op: 'removeItem', path: `${tablePath}.columns`, index };
}

/** Move a column one slot up (-1) or down (+1); the caller disables the
 * boundary directions, and `to` is the post-splice index designer-core's
 * `moveItem` expects (adjacent swaps need no adjustment). */
export function moveColumnOp(tablePath: string, from: number, to: number): Op {
  return { op: 'moveItem', path: `${tablePath}.columns`, from, to };
}
