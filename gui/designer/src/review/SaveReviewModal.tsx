// The save/export review pane: a Modal shown BEFORE a save or export
// that displays the line-level YAML diff between the opened document and the
// current text — the round-trip guarantee ("only touched keys change") made
// visible. Two audiences in one pane: the nontech-pm reads the plain-language
// the "N places changed" pill, the template-engineer reads the raw line diff (order and
// untouched keys preserved). It is read-only review chrome — it dispatches NO
// document op; `onConfirm` runs the caller's existing save/export, cancel/×/
// Escape run `onClose` and change nothing.
//
// Every diff line is document-derived (attacker-controlled YAML), so it renders
// as ESCAPED React text — never HTML. The component never measures or formats;
// the pure `computeLineDiff` does the work.

import { useMemo } from 'react';
import { useI18n } from '../i18n/context';
import { Button } from '../ui/Button';
import { IconCheck } from '../ui/icons';
import { Modal } from '../ui/Modal';
import { computeLineDiff, type DiffRow } from './diffModel';

export interface SaveReviewModalProps {
  readonly open: boolean;
  /** Which action the confirm proceeds with — drives the title + button label.
   * `copilot` reviews an AI proposal: baseline = the CURRENT text, current =
   * the proposed text, and confirm applies the ops (review before apply, always). */
  readonly mode: 'save' | 'export' | 'copilot';
  /** The opened-document baseline text. */
  readonly baseline: string;
  /** The current editor text. */
  readonly current: string;
  /** An optional assistant note (copilot mode) — untrusted provider text,
   * rendered as escaped React text, display-capped by the caller. */
  readonly note?: string;
  /** Proceed with the save/export (the caller runs it AND closes the modal). */
  readonly onConfirm: () => void;
  /** Cancel — the ONLY thing ×/Escape/backdrop/Cancel do (never saves). */
  readonly onClose: () => void;
}

/** The number gutter + `+`/`−` marker + escaped line text for one row. `+`/`−`
 * are diff markers (not control icons — the chromeConvention glyph ban does not
 * cover them), and the text is rendered as React children (auto-escaped). */
function Row({ row }: { readonly row: DiffRow }) {
  if (row.kind === 'gap') {
    return <div className="select-none py-0.5 text-center text-muted/60">⋯</div>;
  }
  const tone =
    row.kind === 'added'
      ? 'bg-diff-add-bg text-diff-add-text'
      : row.kind === 'removed'
        ? 'bg-diff-del-bg text-diff-del-text'
        : 'text-text/70';
  const marker = row.kind === 'added' ? '+' : row.kind === 'removed' ? '−' : ' ';
  return (
    <div className={`flex ${tone}`}>
      <span className="w-10 flex-none select-none pr-2 text-right text-muted/70">
        {row.newLine ?? row.oldLine}
      </span>
      <span className="w-4 flex-none select-none text-center">{marker}</span>
      <span className="flex-1 pr-3">{row.text}</span>
    </div>
  );
}

/** Per-mode chrome keys (fixed literals — never attacker strings). The
 * copilot baseline caption differs: the diff compares the CURRENT document
 * against the proposal, not the opened document against the current one. */
const MODE_KEYS: Record<
  SaveReviewModalProps['mode'],
  {
    readonly title: string;
    readonly subtitle: string;
    readonly confirm: string;
    readonly baseline: string;
  }
> = {
  save: {
    title: 'review.save.title',
    subtitle: 'review.save.subtitle',
    confirm: 'review.confirm.save',
    baseline: 'review.baseline',
  },
  export: {
    title: 'review.export.title',
    subtitle: 'review.export.subtitle',
    confirm: 'review.confirm.export',
    baseline: 'review.baseline',
  },
  copilot: {
    title: 'review.copilot.title',
    subtitle: 'review.copilot.subtitle',
    confirm: 'review.confirm.copilot',
    baseline: 'review.copilot.baseline',
  },
};

export function SaveReviewModal({
  open,
  mode,
  baseline,
  current,
  note,
  onConfirm,
  onClose,
}: SaveReviewModalProps) {
  const { t } = useI18n();
  const keys = MODE_KEYS[mode];
  const diff = useMemo(() => computeLineDiff(baseline, current), [baseline, current]);
  const { added, removed, changed } = diff.summary;
  const noChange = !diff.truncated && added === 0 && removed === 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t(keys.title)}
      closeLabel={t('help.close')}
      footer={
        <>
          <Button className="whitespace-nowrap" onClick={onClose}>
            {t('review.cancel')}
          </Button>
          <Button variant="primary" className="whitespace-nowrap" onClick={onConfirm}>
            {t(keys.confirm)}
          </Button>
        </>
      }
    >
      <p className="m-0 text-sm text-muted">{t(keys.subtitle)}</p>
      {note !== undefined ? (
        <p className="m-0 rounded-md bg-accent/8 px-2 py-1 text-sm text-text">{note}</p>
      ) : null}

      {noChange ? (
        <div className="flex flex-col items-center gap-1 py-6 text-center text-muted">
          <span className="grid size-11 place-items-center rounded-full bg-diff-add-bg text-diff-add-text">
            <IconCheck />
          </span>
          <p className="m-0 mt-1 font-semibold text-text">{t('review.noChange.title')}</p>
          <p className="m-0">{t('review.noChange.body')}</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="rounded-full bg-accent/12 px-3 py-1 text-sm font-semibold text-accent">
              {t('review.summary.count', { n: changed })}
            </span>
            <span className="font-mono text-xs text-muted">
              <span className="font-bold text-diff-add-text">+{added}</span>
              {' / '}
              <span className="font-bold text-diff-del-text">−{removed}</span> {t('review.lines')}
            </span>
            <span className="ml-auto text-xs text-muted">{t(keys.baseline)}</span>
          </div>

          {diff.truncated ? (
            <output className="block rounded-md bg-warn-bg px-2 py-1 text-sm text-warn-text">
              {t('review.truncated')}
            </output>
          ) : (
            <div className="max-h-72 overflow-auto rounded-md border border-border bg-surface font-mono text-xs leading-relaxed whitespace-pre">
              {diff.rows.map((row, index) => (
                // Rows are positional; a stable index key is correct (the list
                // is recomputed wholesale when the text changes).
                // biome-ignore lint/suspicious/noArrayIndexKey: positional diff rows have no stable id.
                <Row key={index} row={row} />
              ))}
            </div>
          )}
        </>
      )}

      <p className="m-0 text-xs text-muted">{t('review.engineerHint')}</p>
    </Modal>
  );
}
