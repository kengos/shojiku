// The reusable-block manage modal: the saved-block list with a two-step delete
// (a first click arms the delete-confirm label, a second confirms — a mis-click never
// destroys a block). Delete routes `onDelete(id)` up; the Designer removes the
// block from the library and persists through the host. Modal chrome (focus
// trap + restore, Escape, outside click, ARIA, portal) is `ui/Modal`'s — and
// the modal carries NO footer: it only manages a list, so the × and the
// outside click are the whole dismissal story (user direction; a footer
// a Close button beside the × is the same action twice).

import { useState } from 'react';
import { useI18n } from '../i18n/context';
import { Modal } from '../ui/Modal';
import type { SavedBlock } from './blockModel';

export interface BlockManageDialogProps {
  readonly blocks: readonly SavedBlock[];
  readonly onDelete: (id: string) => void;
  readonly onClose: () => void;
}

export function BlockManageDialog({ blocks, onDelete, onClose }: BlockManageDialogProps) {
  const { t } = useI18n();
  // Which block's delete is armed for confirmation (null = none). A second row's
  // first click re-arms to it (only one pending at a time).
  const [pendingId, setPendingId] = useState<string | null>(null);

  const clickDelete = (id: string) => {
    if (pendingId === id) {
      onDelete(id);
      setPendingId(null);
    } else {
      setPendingId(id);
    }
  };

  return (
    <Modal open onClose={onClose} title={t('block.manage.title')} closeLabel={t('help.close')}>
      {blocks.length === 0 ? (
        <p className="m-0 text-sm text-muted">{t('block.manage.empty')}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {blocks.map((block) => {
            const armed = pendingId === block.id;
            return (
              <li
                key={block.id}
                className="flex items-center gap-2 rounded-md border border-border bg-bg px-2 py-1.5"
              >
                <span className="min-w-0 flex-1 truncate text-sm">{block.name}</span>
                <button
                  type="button"
                  className={
                    armed
                      ? 'cursor-pointer rounded-md border border-error-text bg-error-bg px-2 py-1 text-sm font-semibold text-error-text'
                      : 'cursor-pointer rounded-md border border-border bg-surface px-2 py-1 text-sm text-text enabled:hover:border-muted'
                  }
                  onClick={() => clickDelete(block.id)}
                >
                  {armed ? t('block.manage.confirmDelete') : t('block.manage.delete')}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
