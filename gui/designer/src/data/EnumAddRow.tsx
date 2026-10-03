// The choices table's add row: 「＋ 選択肢を追加」 opens a draft — data value
// (typed by the field) and printed text — that 追加 or Enter (outside an IME
// composition) appends as ONE op. A refused entry stays in the draft with the
// reason beside it; an accepted one clears the draft for the next member.

import { type KeyboardEvent, useId, useState } from 'react';
import { useI18n } from '../i18n/context';
import { BTN_SM, INPUT } from '../ui/chrome';
import { IconPlus } from '../ui/icons';
import { addRow, type EnumTarget } from './enumEdits';
import type { EnumEdit } from './enumModel';

export interface EnumAddRowProps {
  readonly target: EnumTarget;
  /** Dispatch an edit's op; the refusal MESSAGE when it was refused. */
  readonly apply: (edit: EnumEdit) => string | null;
  /** Open the draft at once (the toggle just turned choices on). */
  readonly startOpen: boolean;
}

export function EnumAddRow({ target, apply, startOpen }: EnumAddRowProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(startOpen);
  const [value, setValue] = useState(target.type === 'boolean' ? 'true' : '');
  const [label, setLabel] = useState('');
  const [refusal, setRefusal] = useState<string | null>(null);
  const messageId = useId();
  if (!open) {
    return (
      <button type="button" className={`${BTN_SM} self-start`} onClick={() => setOpen(true)}>
        <IconPlus size={14} /> {t('data.choices.add')}
      </button>
    );
  }
  const submit = () => {
    const message = apply(addRow(target, value, label));
    setRefusal(message);
    if (message === null) {
      setValue(target.type === 'boolean' ? 'true' : '');
      setLabel('');
    }
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };
  const described = refusal === null ? undefined : messageId;
  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-start gap-1">
        {target.type === 'boolean' ? (
          <select
            className={INPUT}
            aria-label={t('data.choices.value')}
            value={value}
            onChange={(event) => setValue(event.currentTarget.value)}
          >
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        ) : (
          <input
            type="text"
            className={`${INPUT} font-mono`}
            aria-label={t('data.choices.value')}
            aria-describedby={described}
            value={value}
            onChange={(event) => setValue(event.currentTarget.value)}
            onKeyDown={onKeyDown}
          />
        )}
        <input
          type="text"
          className={INPUT}
          aria-label={t('data.choices.label')}
          placeholder={t('data.choices.labelEmpty')}
          value={label}
          onChange={(event) => setLabel(event.currentTarget.value)}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          className={BTN_SM}
          aria-label={t('data.choices.addSubmitLabel')}
          onClick={submit}
        >
          {t('data.choices.addSubmit')}
        </button>
      </div>
      {refusal === null ? null : (
        <p id={messageId} className="m-0 text-sm text-error-text">
          {refusal}
        </p>
      )}
    </div>
  );
}
