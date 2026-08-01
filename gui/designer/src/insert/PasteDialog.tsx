// The paste-import dialog: paste spreadsheet clipboard text into a
// textarea, see a live preview of the columns it will create (label + inferred
// kind) and the row count, then insert a NEW table. The dialog owns only the
// parse + the confirm; the Designer builds the scaffold ops and the params rows
// and reports a typed refusal back for display. Modal chrome (focus trap +
// restore, Escape, outside click, ARIA, portal) is `ui/Modal`'s; every string is
// a catalog key or user text rendered through React's escaping.

import { useMemo, useState } from 'react';
import { useI18n } from '../i18n/context';
import { BTN_SM } from '../ui/chrome';
import { Modal } from '../ui/Modal';
import type { PasteRefusal } from './paste';
import { analyzeColumns } from './pasteColumns';
import { type PasteGrid, parsePasteGrid } from './pasteGrid';

export interface PasteDialogProps {
  /** Apply the parsed grid. A typed refusal comes back for display (the dialog
   * stays open); `null` = applied (the Designer closes the dialog). */
  readonly onConfirm: (grid: PasteGrid) => PasteRefusal | null;
  readonly onClose: () => void;
}

export function PasteDialog({ onConfirm, onClose }: PasteDialogProps) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [refusal, setRefusal] = useState<PasteRefusal | null>(null);

  // Re-parse per keystroke (pure + bounded). The empty-input case shows only the
  // instruction, never a scary error before the user has pasted anything.
  const parsed = useMemo(() => parsePasteGrid(text), [text]);
  const columns = useMemo(() => (parsed.ok ? analyzeColumns(parsed.grid) : []), [parsed]);
  const hasInput = text.trim() !== '';

  const confirm = () => {
    /* v8 ignore next 3 -- the confirm button is disabled exactly when the parse failed; kept as a disabled-click race guard. */
    if (!parsed.ok) {
      return;
    }
    setRefusal(onConfirm(parsed.grid));
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t('paste.title')}
      closeLabel={t('help.close')}
      // The parsed-column chips need room to sit on one or two rows; at the
      // default form width they wrap one-per-row and the preview stops reading
      // as a table.
      size="roomy"
      footer={
        <>
          <button type="button" className={BTN_SM} onClick={onClose}>
            {t('paste.cancel')}
          </button>
          <button
            type="button"
            className="cursor-pointer rounded-md border border-accent bg-accent px-2 py-1 font-semibold text-on-accent disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!parsed.ok}
            onClick={confirm}
          >
            {t('paste.insert')}
          </button>
        </>
      }
    >
      <p className="m-0 text-sm text-muted">{t('paste.instructions')}</p>

      <label className="flex flex-col items-stretch gap-1">
        <span className="text-sm text-muted">{t('paste.textareaLabel')}</span>
        <textarea
          className="min-h-[8rem] w-full rounded-md border border-border bg-surface px-2 py-1 font-mono text-sm text-text"
          value={text}
          placeholder={t('paste.placeholder')}
          onChange={(event) => {
            setText(event.target.value);
            setRefusal(null);
          }}
        />
      </label>

      {parsed.ok ? (
        <div className="flex flex-col gap-1 rounded-md border border-border p-2">
          <output className="text-sm text-muted">
            {t('paste.preview.summary', {
              columns: columns.length,
              rows: parsed.grid.rows.length,
            })}
          </output>
          <ul className="m-0 flex flex-wrap gap-1 p-0">
            {columns.map((column) => (
              <li
                key={column.key}
                className="flex items-baseline gap-1 rounded-sm border border-border px-2 py-0.5 text-sm"
              >
                <span>{column.label === '' ? column.key : column.label}</span>
                <span className="text-muted">{t(`iterable.kind.${column.kind}`)}</span>
              </li>
            ))}
          </ul>
          {parsed.truncated ? (
            <output className="text-sm text-muted">{t('paste.note.truncated')}</output>
          ) : null}
        </div>
      ) : hasInput ? (
        <output className="text-sm text-error-text">{t(`paste.error.${parsed.reason}`)}</output>
      ) : null}

      {refusal !== null ? (
        <output className="text-sm text-error-text">{t(`paste.error.${refusal}`)}</output>
      ) : null}
    </Modal>
  );
}
