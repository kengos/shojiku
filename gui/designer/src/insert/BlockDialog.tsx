// The save-as-reusable-block modal: name the selected node's snippet and add it
// to the app-global block library. Confirm hands the NAME up; the Designer runs
// `addBlock` + persists through the host, and a typed refusal comes back for
// display. Modal chrome (focus trap + restore, Escape, outside click, ARIA,
// portal) is `ui/Modal`'s; every string is a catalog key or user text rendered
// through React's escaping. Enter commits (IME-composition-guarded, so a
// Japanese user confirming a kanji conversion does not save mid-composition).

import { useState } from 'react';
import { useI18n } from '../i18n/context';
import { Button } from '../ui/Button';
import { INPUT } from '../ui/chrome';
import { Modal } from '../ui/Modal';
import type { BlockRefusal } from './blockModel';

export interface BlockDialogProps {
  /** Apply the name. A typed refusal comes back for display (the dialog stays
   * open); `null` = saved (the Designer closes the dialog). */
  readonly onConfirm: (name: string) => BlockRefusal | null;
  readonly onClose: () => void;
}

export function BlockDialog({ onConfirm, onClose }: BlockDialogProps) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [refusal, setRefusal] = useState<BlockRefusal | null>(null);

  const confirm = () => setRefusal(onConfirm(name));

  return (
    <Modal
      open
      onClose={onClose}
      title={t('block.title')}
      closeLabel={t('help.close')}
      footer={
        <>
          <Button onClick={onClose}>{t('block.cancel')}</Button>
          <Button variant="primary" onClick={confirm}>
            {t('block.save')}
          </Button>
        </>
      }
    >
      <p className="m-0 text-sm text-muted">{t('block.hint')}</p>

      <label className="flex flex-col items-stretch">
        {t('block.name')}
        <input
          type="text"
          className={INPUT}
          value={name}
          placeholder={t('block.namePlaceholder')}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            // Guard IME composition: Enter confirming a kanji conversion must
            // not commit the save.
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault();
              confirm();
            }
          }}
        />
      </label>

      {refusal !== null ? (
        <output className="text-sm text-error-text">{t(`block.error.${refusal}`)}</output>
      ) : null}
    </Modal>
  );
}
