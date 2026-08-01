// The AI-copilot prompt modal: a free-text ask ("この表を2列にして") the Designer
// forwards to the host-injected provider. This dialog owns ONLY the ask —
// busy/error display and the ⌘/Ctrl+Enter submit (IME-composition-guarded, so
// a Japanese user confirming a kanji conversion never fires the request). The
// proposal itself is NEVER applied from here: on success the Designer opens
// the review pane (diff + explicit confirm), the same review-before-apply gate every
// destructive surface gets. Every rendered string is a catalog key or the
// user's own text through React escaping — the provider's reply never renders
// here.

import { useId, useState } from 'react';
import { useI18n } from '../i18n/context';
import { BTN, BTN_SM, INPUT } from '../ui/chrome';
import { Modal } from '../ui/Modal';

/** What a run resolved to: ok (the Designer opened the review pane and closed
 * this dialog) or a chrome error KEY the dialog surfaces (provider failure /
 * refused reply — the generic keys, never provider internals). */
export type CopilotRunOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: string };

export interface CopilotDialogProps {
  readonly onClose: () => void;
  /** Run the trimmed prompt through the host's provider. */
  readonly onRun: (prompt: string) => Promise<CopilotRunOutcome>;
}

export function CopilotDialog({ onClose, onRun }: CopilotDialogProps) {
  const { t } = useI18n();
  const promptId = useId();
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const trimmed = prompt.trim();

  const submit = async () => {
    // The button disables on empty/busy; this re-guard covers the keyboard
    // path (⌘Enter on an empty field) and a double-fire while in flight.
    if (busy || trimmed === '') {
      return;
    }
    setBusy(true);
    setErrorKey(null);
    const outcome = await onRun(trimmed);
    // On ok the Designer closed this dialog (unmount makes these no-ops).
    if (!outcome.ok) {
      setErrorKey(outcome.error);
    }
    setBusy(false);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t('copilot.title')}
      closeLabel={t('help.close')}
      footer={
        <>
          <button type="button" className={`${BTN_SM} whitespace-nowrap`} onClick={onClose}>
            {t('review.cancel')}
          </button>
          <button
            type="button"
            className={`${BTN} whitespace-nowrap`}
            disabled={busy || trimmed === ''}
            onClick={() => void submit()}
          >
            {busy ? t('copilot.busy') : t('copilot.run')}
          </button>
        </>
      }
    >
      <p className="m-0 text-sm text-muted">{t('copilot.hint')}</p>
      <label htmlFor={promptId} className="text-sm text-muted">
        {t('copilot.prompt.label')}
      </label>
      <textarea
        id={promptId}
        className={`${INPUT} min-h-28 resize-y`}
        placeholder={t('copilot.placeholder')}
        value={prompt}
        disabled={busy}
        onChange={(event) => setPrompt(event.target.value)}
        onKeyDown={(event) => {
          if (
            event.key === 'Enter' &&
            (event.metaKey || event.ctrlKey) &&
            event.nativeEvent.isComposing !== true
          ) {
            event.preventDefault();
            void submit();
          }
        }}
      />
      {errorKey !== null ? (
        <output className="block rounded-md bg-warn-bg px-2 py-1 text-sm text-warn-text">
          {t(errorKey)}
        </output>
      ) : null}
    </Modal>
  );
}
