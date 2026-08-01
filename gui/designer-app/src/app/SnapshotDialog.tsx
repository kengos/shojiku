// The restore-points dialog: capture the current working copy as a named point,
// list the saved points with relative freshness, restore one (after an inline
// confirm — it replaces the working copy), or delete one. Pure over its
// props + local input/confirm state; the store I/O and the actual restore live in
// EditorScreen. Chrome is the shared Modal/Button/IconButton primitives over the
// `--sj-*` tokens. This file owns the dialog shell + the CAPTURE row; the saved
// points themselves are `SnapshotList.tsx`.

import { Button, Modal, useI18n } from '@shojiku/designer';
import { useEffect, useState } from 'react';
import type { Snapshot } from '../persistence/snapshotEntry';
import { MAX_SNAPSHOTS } from '../persistence/snapshots';
import { SnapshotList } from './SnapshotList';

export interface SnapshotDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly snapshots: readonly Snapshot[];
  /** The reference time freshness is measured against (captured when opened). */
  readonly now: number;
  /** A capture is in flight (disables the capture control). */
  readonly busy?: boolean;
  /** The last capture failed to persist (storage/quota) — shows a banner. */
  readonly error?: boolean;
  readonly onCapture: (name: string) => void;
  readonly onRestore: (snapshot: Snapshot) => void;
  readonly onDelete: (id: string) => void;
}

export function SnapshotDialog({
  open,
  onClose,
  snapshots,
  now,
  busy = false,
  error = false,
  onCapture,
  onRestore,
  onDelete,
}: SnapshotDialogProps) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);

  // A closed dialog forgets its in-progress input + confirm, so reopening starts
  // clean (the Modal keeps the component mounted while hidden).
  useEffect(() => {
    if (!open) {
      setName('');
      setConfirmId(null);
    }
  }, [open]);

  const full = snapshots.length >= MAX_SNAPSHOTS;
  const canCapture = !full && !busy && name.trim().length > 0;

  const submit = () => {
    if (!canCapture) {
      return;
    }
    onCapture(name.trim());
    setName('');
  };

  const restore = (snapshot: Snapshot) => {
    setConfirmId(null);
    onRestore(snapshot);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('snapshot.title')}
      closeLabel={t('snapshot.close')}
    >
      <p className="m-0 mb-4 text-sm text-muted">{t('snapshot.intro')}</p>
      <div className="flex items-stretch gap-2">
        <input
          className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1 text-text"
          placeholder={t('snapshot.namePlaceholder')}
          aria-label={t('snapshot.nameLabel')}
          value={name}
          disabled={full || busy}
          onChange={(event) => setName(event.currentTarget.value)}
          onKeyDown={(event) => {
            // Commit on Enter — but never mid-IME-composition (a Japanese kanji
            // confirm press must not fire the capture).
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <Button variant="primary" disabled={!canCapture} onClick={submit}>
          {t('snapshot.capture')}
        </Button>
      </div>
      {error ? (
        <p
          className="m-0 mt-3 rounded-md bg-error-bg px-3 py-2 text-sm text-error-text"
          role="alert"
        >
          {t('snapshot.error')}
        </p>
      ) : null}
      {full ? (
        <p className="m-0 mt-3 rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-text">
          {t('snapshot.full')}
        </p>
      ) : null}
      <hr className="my-4 border-0 border-t border-border" />
      <SnapshotList
        snapshots={snapshots}
        now={now}
        confirmId={confirmId}
        onConfirm={setConfirmId}
        onRestore={restore}
        onDelete={onDelete}
      />
    </Modal>
  );
}
