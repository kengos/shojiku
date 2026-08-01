// The insert menu's container picker: a gdoc-style n×m trace grid in a
// compact Modal. A deviation from gdoc's hover SUBMENU with a stated reason —
// Headless UI's Menu has no nested/hover submenu, and the dialog keeps the
// trace-to-select interaction (hover previews the shape) while adding keyboard
// operability: every cell is a real button, arrow keys move focus across the
// grid, Enter picks. The preview line names the shape in the nontech-pm's
// vocabulary (row / stack / grid words — never "flex/grid"). Cells carry a
// coordinate identity (`data-cell="CxR"`) for tutorial coach-mark anchoring.

import { useRef, useState } from 'react';
import { useI18n } from '../i18n/context';
import { TOUR_ANCHORS } from '../tutorial/anchors';
import { Modal } from '../ui/Modal';
import { containerShape, PICKER_MAX_COLUMNS, PICKER_MAX_ROWS } from './containerModel';

export interface ContainerPickerDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** A cell was picked: insert the `containerShape(columns, rows)` scaffold. */
  readonly onPick: (columns: number, rows: number) => void;
  /** Destination hint shown when the pick will REPLACE the selected placeholder
   * slot (nest-into-slot) instead of appending — the inserted-into-your-slot
   * hint. Absent = the ordinary trace/append hint. */
  readonly nestHint?: string;
}

const CELL_BASE =
  'h-6 w-6 cursor-pointer rounded-sm border bg-surface p-0 transition-colors duration-75';
const CELL_OFF = `${CELL_BASE} border-border`;
const CELL_ON = `${CELL_BASE} border-accent bg-accent/15`;

/** The picker grid's arrow-key move: the next 1-based cell, clamped. */
function arrowCell(
  key: string,
  cell: { readonly c: number; readonly r: number },
): { readonly c: number; readonly r: number } | null {
  if (key === 'ArrowLeft') {
    return { c: Math.max(1, cell.c - 1), r: cell.r };
  }
  if (key === 'ArrowRight') {
    return { c: Math.min(PICKER_MAX_COLUMNS, cell.c + 1), r: cell.r };
  }
  if (key === 'ArrowUp') {
    return { c: cell.c, r: Math.max(1, cell.r - 1) };
  }
  if (key === 'ArrowDown') {
    return { c: cell.c, r: Math.min(PICKER_MAX_ROWS, cell.r + 1) };
  }
  return null;
}

export function ContainerPickerDialog({
  open,
  onClose,
  onPick,
  nestHint,
}: ContainerPickerDialogProps) {
  const { t } = useI18n();
  const gridRef = useRef<HTMLDivElement | null>(null);
  // The traced cell (hover or keyboard focus); null shows the trace hint.
  const [cell, setCell] = useState<{ readonly c: number; readonly r: number } | null>(null);

  const preview = (c: number, r: number): string => {
    // The picker only ever passes its own in-bounds loop constants, so the
    // shape is always classifiable; the label names it in chrome vocabulary.
    const shape = containerShape(c, r);
    /* v8 ignore next 3 -- containerShape is null only for non-finite input, which the loop constants never are */
    if (shape === null) {
      return t('containerPicker.hint');
    }
    return t('containerPicker.preview', {
      columns: c,
      rows: r,
      kind: t(`containerKind.${shape.kind}`),
    });
  };

  const rows = Array.from({ length: PICKER_MAX_ROWS }, (_, i) => i + 1);
  const columns = Array.from({ length: PICKER_MAX_COLUMNS }, (_, i) => i + 1);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('containerPicker.title')}
      closeLabel={t('help.close')}
    >
      {/* When a placeholder slot is selected the pick replaces it — surface the
          destination so the implicit rule is visible before it fires. */}
      {nestHint !== undefined ? (
        <p className="mb-2 text-center text-accent text-sm">{nestHint}</p>
      ) : null}
      {/* A group of real option buttons; the div-level handlers are pure
          enhancements (trace-clear on leave, roving arrow-key focus). */}
      {/* biome-ignore lint/a11y/useSemanticElements: a button cluster, not form fields — fieldset is wrong here (the toolbar align-group precedent). */}
      <div
        ref={gridRef}
        data-tour={TOUR_ANCHORS.containerPicker}
        role="group"
        aria-label={t('containerPicker.title')}
        className="grid w-max grid-cols-6 gap-1"
        onMouseLeave={() => setCell(null)}
        onKeyDown={(event) => {
          if (cell === null) {
            return;
          }
          const next = arrowCell(event.key, cell);
          if (next === null) {
            return;
          }
          event.preventDefault();
          setCell(next);
          gridRef.current
            ?.querySelector<HTMLButtonElement>(`[data-cell="${next.c}x${next.r}"]`)
            ?.focus();
        }}
      >
        {rows.map((r) =>
          columns.map((c) => (
            <button
              key={`${c}x${r}`}
              type="button"
              data-cell={`${c}x${r}`}
              aria-label={preview(c, r)}
              aria-pressed={cell !== null && c <= cell.c && r <= cell.r}
              className={cell !== null && c <= cell.c && r <= cell.r ? CELL_ON : CELL_OFF}
              onMouseEnter={() => setCell({ c, r })}
              onFocus={() => setCell({ c, r })}
              onClick={() => onPick(c, r)}
            />
          )),
        )}
      </div>
      <output className="block min-h-[1.5em] text-center text-muted text-sm">
        {cell === null ? t('containerPicker.hint') : preview(cell.c, cell.r)}
      </output>
    </Modal>
  );
}
