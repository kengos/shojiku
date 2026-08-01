// The glossary, opened from the Help menu (and from a HelpHint's "learn more").
// A plain Modal listing each term and its localized definition from the pure
// term model — the always-available lighter sibling of the tutorial.

import { useI18n } from '../i18n/context';
import { Modal } from '../ui/Modal';
import { GLOSSARY_TERMS } from './glossaryModel';

export interface GlossaryDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

export function GlossaryDialog({ open, onClose }: GlossaryDialogProps) {
  const { t } = useI18n();
  return (
    <Modal open={open} onClose={onClose} title={t('glossary.title')} closeLabel={t('help.close')}>
      <dl className="m-0 flex flex-col gap-3">
        {GLOSSARY_TERMS.map((entry) => (
          <div key={entry.term}>
            <dt className="font-semibold text-text">{t(entry.term)}</dt>
            <dd className="m-0 mt-0.5 text-sm text-muted">{t(entry.def)}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}
