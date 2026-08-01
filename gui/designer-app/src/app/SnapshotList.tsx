// The saved restore points, listed newest-first with relative freshness: each
// row is either its normal face (name + freshness + restore/delete) or the
// inline restore CONFIRM that replaces it — restoring overwrites the working
// copy, so it is never one click. Pure over its props; the confirm selection is
// owned by the dialog (a closed dialog forgets it). Freshness renders through
// `Intl.RelativeTimeFormat`, so no catalog strings (or ICU brace traps) are
// needed for it.

import { Button, IconButton, IconTrash, useI18n } from '@shojiku/designer';
import { useMemo } from 'react';
import type { Snapshot } from '../persistence/snapshotEntry';
import { MAX_SNAPSHOTS } from '../persistence/snapshots';
import { freshness } from './freshness';

export interface SnapshotListProps {
  readonly snapshots: readonly Snapshot[];
  /** The reference time freshness is measured against (captured when opened). */
  readonly now: number;
  /** The row currently showing its restore confirm, if any. */
  readonly confirmId: string | null;
  readonly onConfirm: (id: string | null) => void;
  readonly onRestore: (snapshot: Snapshot) => void;
  readonly onDelete: (id: string) => void;
}

export function SnapshotList({
  snapshots,
  now,
  confirmId,
  onConfirm,
  onRestore,
  onDelete,
}: SnapshotListProps) {
  const { t, locale } = useI18n();
  const rtf = useMemo(() => new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }), [locale]);
  if (snapshots.length === 0) {
    return <p className="m-0 px-2 py-6 text-center text-sm text-muted">{t('snapshot.empty')}</p>;
  }
  return (
    <>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="m-0 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
          {t('snapshot.saved')}
        </h3>
        <span className="text-sm text-muted tabular-nums">
          {snapshots.length} / {MAX_SNAPSHOTS}
        </span>
      </div>
      <ul className="m-0 list-none p-0">
        {snapshots.map((snapshot) => {
          const fresh = freshness(snapshot.createdAt, now);
          return (
            <li key={snapshot.id} className="border-b border-border last:border-b-0">
              {confirmId === snapshot.id ? (
                <div className="my-0.5 flex flex-col gap-2 rounded-md bg-warn-bg p-3">
                  <span className="text-sm text-warn-text">
                    「{snapshot.name}」{t('snapshot.confirmBody')}
                  </span>
                  <div className="flex justify-end gap-2">
                    <Button onClick={() => onConfirm(null)}>{t('snapshot.confirmCancel')}</Button>
                    <Button variant="primary" onClick={() => onRestore(snapshot)}>
                      {t('snapshot.restore')}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 px-1 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px]">{snapshot.name}</div>
                    <div className="mt-0.5 text-sm text-muted">
                      {rtf.format(fresh.value, fresh.unit)}
                    </div>
                  </div>
                  <div className="flex flex-none items-center gap-1.5">
                    <Button onClick={() => onConfirm(snapshot.id)}>{t('snapshot.restore')}</Button>
                    <IconButton label={t('snapshot.delete')} onClick={() => onDelete(snapshot.id)}>
                      <IconTrash />
                    </IconButton>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
