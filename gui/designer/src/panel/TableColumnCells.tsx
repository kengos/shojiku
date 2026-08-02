// The column sheet's cell parts: the row-heading cell, the placeholder cell a
// `cell:`/unbound column shows, and the two raw-input cells (label, width).
// Each editable cell is value-keyed by its OWN value at the call site, so a
// commit in one cell never discards an in-progress edit in another.

import { INPUT } from '../ui/chrome';
import type { ColumnRow } from './columnsModel';
import { UnitBadge, unitIsImplicit } from './fields';
import type { ColumnHeaderDrag } from './useColumnHeaderDrag';

export interface ColumnHeaderRowProps {
  readonly columns: readonly ColumnRow[];
  readonly drag: ColumnHeaderDrag;
  readonly reorderLabel: string;
}

/** The strip's header row: a corner cell, then one drag handle per column.
 * Returns bare cells (a fragment adds no DOM node), so they stay direct
 * children of the sheet's grid. */
export function ColumnHeaderRow({ columns, drag, reorderLabel }: ColumnHeaderRowProps) {
  return (
    <>
      <span />
      {columns.map((column, index) => (
        <button
          // biome-ignore lint/suspicious/noArrayIndexKey: positional cell — read-only, so it re-renders in place when a reorder swaps the data at this position
          key={`h${index}`}
          type="button"
          ref={(el) => drag.setRef(index, el)}
          aria-label={reorderLabel}
          className="flex cursor-grab items-center gap-1 rounded-md border border-border bg-chrome px-2 py-1 text-sm active:cursor-grabbing"
          onPointerDown={drag.onPointerDown(index)}
          onPointerMove={drag.onPointerMove}
          onPointerUp={drag.onPointerUp}
          onKeyDown={drag.onKeyDown(index)}
        >
          <span aria-hidden="true" className="text-muted">
            ⠿
          </span>
          <span className="truncate">{column.label}</span>
        </button>
      ))}
    </>
  );
}

/** The read-only sample-data preview cell. */
export function ColumnSampleCell({ value }: { readonly value: unknown }) {
  return (
    <output className="truncate rounded-md border border-transparent px-2 py-1 text-sm text-muted">
      {displaySample(value)}
    </output>
  );
}

/** The sample cell's display string: primitives verbatim, structured values as
 * bounded JSON, absent as ''. React escapes; the cap stops a hostile paste from
 * bloating the DOM. */
export function displaySample(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  const text =
    typeof value === 'string'
      ? value
      : typeof value === 'number' || typeof value === 'boolean'
        ? String(value)
        : JSON.stringify(value);
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

export function RowLabel({ children }: { readonly children: React.ReactNode }) {
  return (
    <span className="flex items-center pr-2 text-sm font-medium text-muted whitespace-nowrap">
      {children}
    </span>
  );
}

/** A placeholder cell (a cell/unbound column's absent binding or format). */
export function MutedCell() {
  return (
    <span aria-hidden="true" className="flex items-center px-2 text-muted">
      —
    </span>
  );
}

export interface TextCellProps {
  readonly label: string;
  readonly value: string;
  readonly onCommit: (next: string) => void;
}

/** The label cell: a plain text input committing on blur, only when changed. */
export function ColumnLabelCell({ label, value, onCommit }: TextCellProps) {
  return (
    <input
      type="text"
      className={INPUT}
      aria-label={label}
      defaultValue={value}
      onBlur={(event) => {
        if (event.currentTarget.value !== value) {
          onCommit(event.currentTarget.value);
        }
      }}
    />
  );
}

/** The width cell: the same commit-on-change input, plus the implicit-unit
 * badge. A column width is commonly a `%`; the badge shows only while the value
 * is bare, i.e. while the pt is the invisible one. */
export function ColumnWidthCell({ label, value, onCommit }: TextCellProps) {
  const implicit = unitIsImplicit(value);
  return (
    // The strip's cell is the wrapper, so the badge can sit over the input
    // without leaving the grid.
    <span className="relative flex min-w-0">
      <input
        type="text"
        className={`${INPUT} w-full min-w-0 ${implicit ? 'pr-9' : ''}`}
        aria-label={label}
        defaultValue={value}
        onBlur={(event) => {
          if (event.currentTarget.value !== value) {
            onCommit(event.currentTarget.value);
          }
        }}
      />
      {implicit ? <UnitBadge text="pt" /> : null}
    </span>
  );
}
