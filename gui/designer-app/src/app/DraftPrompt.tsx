// The draft-restore prompt, shared by the standalone (preset) and mounted
// (project template) flows: a local working copy exists for the document being
// opened — restore it or discard it. Pure over its two callbacks.

import { useI18n } from '@shojiku/designer';
import { APP_BUTTON } from './chrome';

export interface DraftPromptProps {
  readonly onRestore: () => void;
  readonly onDiscard: () => void;
}

export function DraftPrompt({ onRestore, onDiscard }: DraftPromptProps) {
  const { t } = useI18n();
  return (
    <section
      className="mx-auto my-12 max-w-[460px] rounded-[calc(var(--sj-radius)+3px)] border border-border bg-surface p-4"
      aria-labelledby="draft-title"
    >
      <h2 id="draft-title" className="m-0 mb-2 text-base">
        {t('app.draftRestoreTitle')}
      </h2>
      <p className="m-0 mb-3 text-muted">{t('app.draftRestoreBody')}</p>
      <button type="button" className={`${APP_BUTTON} mr-2`} onClick={onRestore}>
        {t('app.draftRestore')}
      </button>
      <button type="button" className={APP_BUTTON} onClick={onDiscard}>
        {t('app.draftDiscard')}
      </button>
    </section>
  );
}
