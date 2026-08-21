// What the unified Create/Update style form COMMITS (the document-settings
// styles section's CRUD form): a Modal carrying the style name AND every
// editable field, which replaces the old name-only create + the narrow
// section-rail inline field expansion (the layout breakage this form exists to fix —
// the Modal's own width escapes the rail). A local DRAFT holds edits; NOTHING
// writes to the document until Save, which dispatches ONE `applyAll` (one undo
// step): create authors the whole entry, update writes only the CHANGED fields
// (untouched keys — and non-`STYLE_FIELDS` props like per-side border maps —
// stay byte-intact).
//
// The name row is `StyleNameField` (create authors it, IME-guarded; an existing
// name is read-only — a rename rewrites every reference and stays the row's
// overflow-menu action) and the style fields are `StyleFormFields`. Every
// document-derived value renders as escaped TEXT; the live preview chip's look
// comes only from `stylePreview` (the CSSOM is the safety boundary for
// untrusted colour/family strings), never string-built CSS.

import { useState } from 'react';
import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { PREVIEW_CHIP, stylePreview } from '../styles/preview';
import type { StyleUsage } from '../styles/usage';
import { Button } from '../ui/Button';
import { FIELD_LABEL } from '../ui/chrome';
import { Modal } from '../ui/Modal';
import { StyleFormFields } from './StyleFormFields';
import { StyleNameField } from './StyleNameField';
import { createStyleWithFieldsOps, updateStyleFieldsOps } from './styleFieldOps';
import { STYLE_FIELDS } from './styleFieldSpecs';
import { REFUSAL_MESSAGE_KEY, type StyleOpPlan, type StyleOpRefusal } from './stylePlan';

type StyleFormProps = {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly controller: EditorController;
  /** The registry names — the create duplicate/empty/cap guard. */
  readonly existingNames: readonly string[];
  readonly fontFamilies?: readonly string[];
} & (
  | { readonly mode: 'create' }
  | {
      readonly mode: 'update';
      /** The style being edited (read-only in the form; rename is the row menu). */
      readonly name: string;
      /** Its current field display values (from `readStylesView`). */
      readonly current: Readonly<Record<string, string>>;
      /** Usage index for the impact line (`null` = unknown → no line). */
      readonly usage: StyleUsage | null;
    }
);

export function StyleForm(props: StyleFormProps) {
  const { open, onClose, controller, existingNames, fontFamilies = [] } = props;
  const { t } = useI18n();
  const [nameInput, setNameInput] = useState('');
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    props.mode === 'create'
      ? Object.fromEntries(STYLE_FIELDS.map((spec) => [spec.key, '']))
      : { ...props.current },
  );
  const [notice, setNotice] = useState<StyleOpRefusal | null>(null);

  const isCreate = props.mode === 'create';
  const name = isCreate ? nameInput : props.name;
  const impact =
    props.mode === 'update' && props.usage !== null
      ? (props.usage.refs.get(props.name)?.length ?? 0)
      : 0;

  const setField = (key: string, value: string) => {
    // Computed-key spread (CreateDataProperty) — never `draft[key] = …`, which
    // would fire a `__proto__` setter on a hostile key.
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const submit = () => {
    const plan: StyleOpPlan = isCreate
      ? createStyleWithFieldsOps(nameInput, draft, existingNames)
      : updateStyleFieldsOps(props.name, draft, props.current);
    if (!plan.ok) {
      setNotice(plan.reason);
      return;
    }
    // An update with no touched field is an inert no-op — skip the empty batch
    // so it never lands a blank undo step.
    if (plan.ops.length > 0) {
      controller.applyAll(plan.ops);
    }
    onClose();
  };

  // Only the non-empty draft fields reach the preview (a blank value is unset,
  // not a CSS declaration) — the CSSOM in `stylePreview` guards the rest.
  const previewStyle = stylePreview(
    Object.fromEntries(Object.entries(draft).filter(([, value]) => value.length > 0)),
  );
  const previewText = name.length > 0 ? name : t('styles.namePlaceholder');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isCreate ? t('styles.newStyle') : t('styles.editTitle')}
      closeLabel={t('help.close')}
      footer={
        <>
          <Button onClick={onClose}>{t('styles.cancel')}</Button>
          <Button variant="primary" onClick={submit}>
            {t('styles.save')}
          </Button>
        </>
      }
    >
      {notice !== null ? (
        <output className="mb-2 block rounded-md bg-error-bg px-2 py-0.5 text-sm text-error-text">
          {t(REFUSAL_MESSAGE_KEY[notice])}
        </output>
      ) : null}

      {props.mode === 'update' && impact > 0 ? (
        <p className="m-0 text-sm text-muted">{t('styleCapture.impact', { n: impact })}</p>
      ) : null}

      <StyleNameField isCreate={isCreate} value={name} onChange={setNameInput} onSubmit={submit} />

      <hr className="my-1 border-0 border-t border-border" />

      <StyleFormFields draft={draft} fontFamilies={fontFamilies} onCommit={setField} />

      <div>
        <p className={`${FIELD_LABEL} mt-1`}>{t('docSettings.preview')}</p>
        <div className="rounded-md border border-border bg-surface p-3">
          <span
            className={`${PREVIEW_CHIP} inline-block break-words px-2 py-1`}
            style={previewStyle}
          >
            {previewText}
          </span>
        </div>
      </div>
    </Modal>
  );
}
