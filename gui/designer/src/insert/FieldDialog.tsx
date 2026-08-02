// The create-data-field modal: name a fresh top-level data field, pick
// its kind (the text/number/currency/date/boolean quintet), and edit an auto-seeded
// sample value. Confirm hands a `FieldChoice` up; the Designer runs
// `extendParams` + inserts the bound item (insert-menu entry) or binds the
// current item (data.key picker tail), and a typed refusal comes back for
// display. Modal chrome (focus trap + restore, Escape, outside click, ARIA,
// portal) is `ui/Modal`'s; every string is a catalog key or user text rendered
// through React's escaping.

import { useMemo, useState } from 'react';
import { useI18n } from '../i18n/context';
import type { SampleScalar } from '../sample/model';
import { BTN_SM, INPUT } from '../ui/chrome';
import { Modal } from '../ui/Modal';
import {
  confirmField,
  type FieldChoice,
  type FieldRefusal,
  initialFieldSample,
} from './fieldModel';
import { FieldSampleInput } from './fieldSampleInput';
import { FIELD_KINDS, type FieldKind } from './scaffoldFields';

export interface FieldDialogProps {
  /** Apply the choice. A typed refusal comes back for display (the dialog stays
   * open); `null` = applied (the Designer closes the dialog). */
  readonly onConfirm: (choice: FieldChoice) => FieldRefusal | null;
  readonly onClose: () => void;
}

/** The authoring-time local date (`yyyy-mm-dd`) seeding a fresh date field. The
 * value is display-inert sample data, so a local clock is fine. */
function todayIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function FieldDialog({ onConfirm, onClose }: FieldDialogProps) {
  const { t } = useI18n();
  const today = useMemo(() => todayIso(), []);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<FieldKind>('text');
  const [sample, setSample] = useState<SampleScalar>('');
  const [refusal, setRefusal] = useState<FieldRefusal | null>(null);

  // Switching kind re-seeds the sample to that kind's typed default (an empty
  // text value is meaningless as a number; a stale number reads wrong as a
  // date) — the auto-generated-but-editable rule.
  const pickKind = (next: FieldKind) => {
    setKind(next);
    setSample(initialFieldSample(next, today));
  };

  const confirm = () => {
    const outcome = confirmField(name, kind, sample);
    if (outcome.ok) {
      setRefusal(onConfirm(outcome.choice));
    } else {
      setRefusal(outcome.refusal);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t('field.title')}
      closeLabel={t('help.close')}
      footer={
        <>
          <button type="button" className={BTN_SM} onClick={onClose}>
            {t('iterable.cancel')}
          </button>
          <button
            type="button"
            className="cursor-pointer rounded-md border border-accent bg-accent px-2 py-1 font-semibold text-on-accent"
            onClick={confirm}
          >
            {t('field.create')}
          </button>
        </>
      }
    >
      <label className="flex flex-col items-stretch">
        {t('field.name')}
        <input
          type="text"
          className={INPUT}
          value={name}
          placeholder={t('field.namePlaceholder')}
          onChange={(event) => setName(event.target.value)}
        />
      </label>

      <label className="flex flex-col items-stretch">
        {t('field.kind')}
        <select
          className={INPUT}
          value={kind}
          // The select offers only FieldKind values, so the cast is total.
          onChange={(event) => pickKind(event.target.value as FieldKind)}
        >
          {FIELD_KINDS.map((option) => (
            <option key={option} value={option}>
              {t(`iterable.kind.${option}`)}
            </option>
          ))}
        </select>
      </label>

      <FieldSampleInput
        label={t('field.sample')}
        kind={kind}
        sample={sample}
        onChange={setSample}
      />

      {refusal !== null ? (
        <output className="text-sm text-error-text">{t(`field.error.${refusal}`)}</output>
      ) : null}
    </Modal>
  );
}
