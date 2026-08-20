// What the unified Create/Edit format form COMMITS: a Modal carrying the
// entry's name, its kind, and its pattern. A local DRAFT holds edits; NOTHING
// writes to the document until Save, which dispatches ONE `applyAll` (one undo
// step) — create authors the whole entry at once (the wire's `type` and
// `pattern` are both required, so a half-written entry would not parse), while
// an edit writes only the CHANGED keys so the untouched ones stay byte-intact.
//
// The name is authored on create (IME-guarded — a Japanese user pressing Enter
// to confirm a conversion must not commit mid-composition) and read-only on
// edit: a rename rewrites every reference and stays the row's overflow-menu
// action, which is a different, transactional operation.

import { useState } from 'react';
import type { EditorController } from '../editor/useEditor';
import type { PatternProbe, ProbeResult } from '../engine/types';
import { createFormatOps, updateFormatOps } from '../formats/fieldOps';
import { editableKind, FORMAT_KINDS } from '../formats/model';
import { type FormatOpRefusal, REFUSAL_MESSAGE_KEY } from '../formats/plan';
import { useI18n } from '../i18n/context';
import { BTN, BTN_SM, FIELD_LABEL, SELECT_SM } from '../ui/chrome';
import { Modal } from '../ui/Modal';
import { PatternField } from './PatternField';

type FormatFormProps = {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly controller: EditorController;
  /** The registry names — the create duplicate/empty/cap guard. */
  readonly existingNames: readonly string[];
  readonly probe: (probes: readonly PatternProbe[]) => Promise<readonly ProbeResult[]>;
} & (
  | { readonly mode: 'create' }
  | {
      readonly mode: 'update';
      readonly name: string;
      readonly current: { readonly kind: string; readonly pattern: string };
    }
);

export function FormatForm(props: FormatFormProps) {
  const { open, onClose, controller, existingNames, probe } = props;
  const { t } = useI18n();
  const isCreate = props.mode === 'create';
  const [nameInput, setNameInput] = useState('');
  const [kind, setKind] = useState(() =>
    props.mode === 'create' ? 'date' : editableKind(props.current.kind),
  );
  const [pattern, setPattern] = useState(() =>
    props.mode === 'create' ? '' : props.current.pattern,
  );
  const [notice, setNotice] = useState<FormatOpRefusal | null>(null);

  const name = isCreate ? nameInput : props.name;

  const submit = () => {
    const plan = isCreate
      ? createFormatOps(nameInput, kind, pattern, existingNames)
      : updateFormatOps(props.name, kind, pattern, props.current);
    if (!plan.ok) {
      setNotice(plan.reason);
      return;
    }
    // An edit that changed nothing is an inert no-op — skip the empty batch so
    // it never lands a blank undo step.
    if (plan.ops.length > 0) {
      controller.applyAll(plan.ops);
    }
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isCreate ? t('formats.newFormat') : t('formats.editTitle')}
      closeLabel={t('help.close')}
      footer={
        <>
          <button type="button" className={BTN_SM} onClick={onClose}>
            {t('styles.cancel')}
          </button>
          <button type="button" className={BTN} onClick={submit}>
            {t('styles.save')}
          </button>
        </>
      }
    >
      {notice !== null ? (
        <output className="mb-2 block rounded-md bg-error-bg px-2 py-0.5 text-sm text-error-text">
          {t(REFUSAL_MESSAGE_KEY[notice])}
        </output>
      ) : null}

      <div>
        <label className={FIELD_LABEL} htmlFor="sj-format-form-name">
          {t('formats.namePlaceholder')}
          {isCreate ? null : (
            <span className="ml-2 rounded-full bg-accent/15 px-1.5 py-0.5 text-xs text-accent">
              {t('styles.renameHint')}
            </span>
          )}
        </label>
        <input
          id="sj-format-form-name"
          type="text"
          className={
            isCreate
              ? 'sj-input w-full rounded-md border border-border bg-surface px-2 py-1 text-text'
              : 'w-full cursor-default rounded-md border border-border bg-bg px-2 py-1 text-muted'
          }
          value={name}
          readOnly={!isCreate}
          placeholder={t('formats.namePlaceholder')}
          onChange={(event) => setNameInput(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || !isCreate) {
              return;
            }
            if (event.key === 'Enter') {
              event.preventDefault();
              submit();
            }
          }}
        />
      </div>

      <div>
        <label className={FIELD_LABEL} htmlFor="sj-format-form-kind">
          {t('field.kind')}
        </label>
        <select
          id="sj-format-form-kind"
          className={SELECT_SM}
          value={kind}
          onChange={(event) => setKind(event.currentTarget.value)}
        >
          {FORMAT_KINDS.map((option) => (
            <option key={option} value={option}>
              {t(option === 'date' ? 'format.label.date' : 'format.label.datetime')}
            </option>
          ))}
        </select>
      </div>

      <PatternField
        label={t('formats.pattern')}
        fieldType={kind === 'datetime' ? 'datetime' : 'date'}
        value={pattern}
        probe={probe}
        onChange={setPattern}
        onCommit={setPattern}
      />
    </Modal>
  );
}
