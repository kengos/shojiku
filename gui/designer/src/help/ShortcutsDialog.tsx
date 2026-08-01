// The keyboard-shortcuts reference, opened from the Help menu. A plain Modal
// listing the window-level chords (from the pure display model) against their
// localized descriptions; the chord glyphs follow the viewer's platform.

import { Fragment } from 'react';
import { useI18n } from '../i18n/context';
import { Modal } from '../ui/Modal';
import { isMacPlatform, shortcutRows } from './shortcutsModel';

export interface ShortcutsDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

export function ShortcutsDialog({ open, onClose }: ShortcutsDialogProps) {
  const { t } = useI18n();
  const rows = shortcutRows(isMacPlatform());
  return (
    <Modal open={open} onClose={onClose} title={t('shortcuts.title')} closeLabel={t('help.close')}>
      <dl className="m-0 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2">
        {rows.map((row) => (
          <Fragment key={row.labelKey}>
            <dt className="justify-self-start">
              <kbd className="rounded border border-border bg-chrome px-1.5 py-0.5 font-mono text-sm text-text">
                {row.combo}
              </kbd>
            </dt>
            <dd className="m-0 text-text">{t(row.labelKey)}</dd>
          </Fragment>
        ))}
      </dl>
    </Modal>
  );
}
