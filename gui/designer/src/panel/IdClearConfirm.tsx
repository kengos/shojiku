// The confirm before clearing a name that anchors still use: those anchors
// name an id no node will carry, and the engine then draws nothing for them
// (`anchor_unknown_target`). A destructive confirm is a modal (the
// surface-placement rule); the edit itself stays one undo step.

import { isMacPlatform, modifierGlyph } from '../help/shortcutsModel';
import { useI18n } from '../i18n/context';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

export interface IdClearConfirmProps {
  /** How many anchors name the id being cleared. */
  readonly count: number;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

export function IdClearConfirm({ count, onCancel, onConfirm }: IdClearConfirmProps) {
  const { t } = useI18n();
  return (
    <Modal
      open
      onClose={onCancel}
      title={t('panel.id.clearConfirm.title')}
      closeLabel={t('help.close')}
      footer={
        <>
          <Button onClick={onCancel}>{t('panel.id.clearConfirm.cancel')}</Button>
          <Button variant="primary" onClick={onConfirm}>
            {t('panel.id.clearConfirm.confirm')}
          </Button>
        </>
      }
    >
      <p className="m-0">{t('panel.id.clearConfirm.body', { n: count })}</p>
      <p className="m-0 mt-2 text-muted text-sm">
        {t('panel.id.clearConfirm.undo', { mod: modifierGlyph(isMacPlatform()) })}
      </p>
    </Modal>
  );
}
