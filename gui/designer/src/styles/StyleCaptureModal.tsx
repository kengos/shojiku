// What the selection→style capture COMMITS (gdoc-style
// register/update-style-from-selection): register the selected item's inline formatting
// as a NEW named style, or UPDATE an already-applied style to match it. Thin
// over the pure `captureModel` plans — it reads the captured props (computed by
// the toolbar) and dispatches ONE `applyAll` batch (one undo step). What the
// capture SHOWS — the preview chip and the captured-property list both modes
// render — is `CapturedStyleView`.
//
// All document-derived values (captured prop values, the style name) render as
// auto-escaped TEXT; the preview chip's look comes only from `stylePreview`
// (the CSSOM is the safety boundary for untrusted color/family strings), never
// string-built CSS.

import { useState } from 'react';
import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { REFUSAL_MESSAGE_KEY, type StyleOpPlan, type StyleOpRefusal } from '../panel/stylePlan';
import { BTN, BTN_SM, INPUT } from '../ui/chrome';
import { Modal } from '../ui/Modal';
import { CapturedStyleView } from './CapturedStyleView';
import { captureStyleOps, updateStyleOps } from './captureModel';
import type { StyleUsage } from './usage';

type StyleCaptureModalProps = {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly controller: EditorController;
  /** The selected item's structural path (styleNames / inline style live here). */
  readonly path: string;
  /** The capturable inline props (from `capturableStyleProps` at open time). */
  readonly captured: Readonly<Record<string, string | number>>;
  /** The registry names (duplicate-guard for a new style). */
  readonly existingNames: readonly string[];
  /** The item's current `styleNames` (the new name appends after these). */
  readonly currentStyleNames: readonly string[];
} & (
  | { readonly mode: 'create' }
  | { readonly mode: 'update'; readonly targetName: string; readonly usage: StyleUsage | null }
);

export function StyleCaptureModal(props: StyleCaptureModalProps) {
  const { open, onClose, controller, path, captured, existingNames, currentStyleNames } = props;
  const { t } = useI18n();
  // In update mode the user can switch to "save as a new style"; create mode
  // never leaves the create form.
  const [showCreate, setShowCreate] = useState(props.mode === 'create');
  const [name, setName] = useState('');
  const [notice, setNotice] = useState<StyleOpRefusal | null>(null);

  const run = (plan: StyleOpPlan): void => {
    if (!plan.ok) {
      setNotice(plan.reason);
      return;
    }
    controller.applyAll(plan.ops);
    onClose();
  };
  const submitCreate = (): void => {
    run(captureStyleOps(path, name, captured, existingNames, currentStyleNames));
  };

  const noticeEl =
    notice === null ? null : (
      <output className="mb-2 block rounded-md bg-error-bg px-2 py-0.5 text-sm text-error-text">
        {t(REFUSAL_MESSAGE_KEY[notice])}
      </output>
    );

  // Update mode (not switched to save-as): props narrowed to the update variant.
  if (props.mode === 'update' && !showCreate) {
    const target = props.targetName;
    const count = props.usage === null ? null : (props.usage.refs.get(target)?.length ?? 0);
    return (
      <Modal
        open={open}
        onClose={onClose}
        title={t('styleCapture.updateTitle')}
        closeLabel={t('styles.cancel')}
        footer={
          <>
            <button type="button" className={BTN_SM} onClick={() => setShowCreate(true)}>
              {t('styleCapture.saveAsInstead')}
            </button>
            <button
              type="button"
              className={BTN}
              onClick={() => run(updateStyleOps(path, target, captured))}
            >
              {t('styleCapture.update')}
            </button>
          </>
        }
      >
        {noticeEl}
        <p className="m-0 text-sm text-text">{t('styleCapture.updateTarget', { name: target })}</p>
        {count !== null && count > 0 ? (
          <p className="m-0 text-sm text-muted">{t('styleCapture.impact', { n: count })}</p>
        ) : null}
        <CapturedStyleView captured={captured} text={target} />
      </Modal>
    );
  }

  // Create mode (a new named style from the selection).
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('styleCapture.createTitle')}
      closeLabel={t('styles.cancel')}
      footer={
        <button type="button" className={BTN} onClick={submitCreate}>
          {t('styleCapture.save')}
        </button>
      }
    >
      {noticeEl}
      <label className="block text-sm text-muted" htmlFor="sj-style-capture-name">
        {t('styles.namePlaceholder')}
      </label>
      <input
        id="sj-style-capture-name"
        type="text"
        className={INPUT}
        value={name}
        placeholder={t('styles.namePlaceholder')}
        onChange={(event) => setName(event.currentTarget.value)}
        onKeyDown={(event) => {
          // A Japanese user pressing Enter to confirm an IME conversion must not
          // commit mid-composition.
          if (event.nativeEvent.isComposing) {
            return;
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            submitCreate();
          }
        }}
      />
      <CapturedStyleView
        captured={captured}
        text={name.length > 0 ? name : t('styles.namePlaceholder')}
      />
    </Modal>
  );
}
