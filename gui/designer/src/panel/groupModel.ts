// Pure model for table header-group editing: the groups view read from the
// materialized table node, the group-path recognizer (a canvas click on a
// `headerGroups` cell selects `…headerGroups[n]`), the coverage derivation the
// span field reports its impact scope with, and the `span` op builder.
// Mirrors `columnsModel` — the document is untrusted, so a hostile entry
// (non-map, missing keys) still yields a row and indices stay true, and every
// edit is ONE designer-core op at the group's own structural path.

import type { Op } from '@shojiku/designer-core';
import { formatPath, parsePath } from '@shojiku/designer-core';

export interface GroupRow {
  /** The group's heading label ('' when unset/not a string). */
  readonly label: string;
  /** The authored `span` as its display form ('' when unset or not a number;
   * numbers stringified — the GUI never re-parses a wire value it did not
   * write). */
  readonly span: string;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** The header groups of a materialized table node; `null` when the node
 * carries no `headerGroups` array (nothing to edit). Malformed entries still
 * produce a row so the view's indices match the document's. */
export function readGroupsView(tableNode: unknown): readonly GroupRow[] | null {
  const groups = record(tableNode)?.headerGroups;
  if (!Array.isArray(groups)) {
    return null;
  }
  return groups.map((entry) => {
    const group = record(entry);
    const label = group?.label;
    const span = group?.span;
    return {
      label: typeof label === 'string' ? label : '',
      span: typeof span === 'number' && Number.isFinite(span) ? String(span) : '',
    };
  });
}

/** Recognize a header-group selection: a structural path ending exactly in
 * `.headerGroups[n]`. Returns the owning table's path and the group index. */
export function groupPathInfo(
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
    parent.key !== 'headerGroups'
  ) {
    return null;
  }
  return { tablePath: formatPath(segments.slice(0, segments.length - 2)), index: last.index };
}

/** The engine's floor on a `span`: the wire type is `usize` and layout raises
 * any value up to at least one column, so an unset/garbage/hole read means
 * one. */
function spanFloor(row: GroupRow | undefined): number {
  const value = Number(row?.span);
  return Number.isInteger(value) && value >= 1 ? value : 1;
}

/** Which columns a group covers: the engine's own left-to-right accumulation
 * (each span floored at one, then clamped to the columns still uncovered), so
 * the panel reports the same coverage the render draws. `null` when the group
 * covers nothing — every column was taken by an earlier group, which is the
 * case layout drops with `header_group_span_clamped`. */
export function groupCoverage(
  groups: readonly GroupRow[],
  columnCount: number,
  index: number,
): { readonly start: number; readonly span: number } | null {
  let col = 0;
  for (let i = 0; i < groups.length; i++) {
    if (col >= columnCount) {
      return null;
    }
    const end = Math.min(col + spanFloor(groups[i]), columnCount);
    if (i === index) {
      return { start: col, span: end - col };
    }
    col = end;
  }
  return null;
}

/** A `span` edit. The key is REQUIRED by the wire and typed `usize`, so an
 * empty field, a non-integer, or anything outside 1…`columnCount` authors
 * nothing (`null`) rather than removing the key or writing a value the engine
 * would parse-reject. The upper bound is the column count because layout
 * clamps there anyway — offering more would author a value the render drops. */
export function spanOp(path: string, columnCount: number, raw: string): Op | null {
  const text = raw.trim();
  if (text === '') {
    return null;
  }
  const value = Number(text);
  if (!Number.isInteger(value) || value < 1 || value > columnCount) {
    return null;
  }
  return { op: 'setScalar', path, keys: ['span'], value };
}
