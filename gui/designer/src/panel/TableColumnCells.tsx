// The column sheet's cell parts: the row-heading cell, the placeholder cell a
// `cell:`/unbound column shows, the two raw-input cells (label, width), and the
// per-column alignment ROW — the SHARED `AlignSegment` over each column's
// cascade-effective value, one control wherever a `textAlign` is picked. The row
// lives here rather than in the sheet because the sheet is the grid layout and
// nothing else, and because resolving a cascade per column would not fit its
// budget.
// Each editable cell is value-keyed by its OWN value at the call site, so a
// commit in one cell never discards an in-progress edit in another.

import type { Op } from '@shojiku/designer-core';
import type { EffectiveValue } from '../toolbar/effective';
import { alignedValue, alignWire } from '../toolbar/wire';
import { INPUT } from '../ui/chrome';
import type { ColumnRow } from './columnsModel';
import { UnitBadge, unitIsImplicit } from './fields';
import { AlignSegment } from './TableBandFields';
import type { ColumnHeaderDrag } from './useColumnHeaderDrag';

/** A column's own alignment key path, under the column itself. */
const ALIGN_KEYS = ['style', 'textAlign'] as const;

export interface ColumnAlignRowProps {
  readonly columns: readonly ColumnRow[];
  /** `<table>.columns` — each cell's own path is this plus its index. */
  readonly columnsPath: string;
  readonly alignFor: (index: number) => EffectiveValue;
  readonly onOp: (op: Op | null) => void;
}

/** The per-column alignment row: bare cells (a fragment adds no DOM node), so
 * they stay direct children of the sheet's grid. Each segment shows what the
 * column RENDERS with and authors the minimal wire over it — picking the value
 * the row band already supplies authors nothing. */
export function ColumnAlignRow({ columns, columnsPath, alignFor, onOp }: ColumnAlignRowProps) {
  return (
    <>
      {columns.map((_column, index) => {
        const eff = alignFor(index);
        return (
          <AlignSegment
            // biome-ignore lint/suspicious/noArrayIndexKey: positional cell — the control is controlled by its own value, so it re-renders in place when a reorder swaps the data at this position
            key={`a${index}`}
            value={alignedValue(eff.value)}
            onChange={(next) => onOp(alignWire(`${columnsPath}[${index}]`, ALIGN_KEYS, eff, next))}
          />
        );
      })}
    </>
  );
}

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

/** The read-only sample-data preview cell. It renders under the column's own
 * `textAlign` so the alignment row above it is showing its own effect — the
 * cheapest possible preview, and the reason the alignment row belongs in this
 * sheet rather than only in the single-column form. */
export function ColumnSampleCell({
  value,
  textAlign,
}: {
  readonly value: unknown;
  readonly textAlign?: string;
}) {
  return (
    <output
      className="truncate rounded-md border border-transparent px-2 py-1 text-sm text-muted"
      style={{ textAlign: alignStyle(textAlign) }}
    >
      {displaySample(value)}
    </output>
  );
}

/** The engine's three `TextAlign` keywords are the only values that reach a
 * style; anything else a document carries is ignored rather than passed on. */
function alignStyle(value: string | undefined): 'left' | 'center' | 'right' | undefined {
  return value === 'left' || value === 'center' || value === 'right' ? value : undefined;
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
