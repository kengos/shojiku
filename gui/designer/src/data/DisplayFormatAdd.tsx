// The declared display formats' add row: 「＋ 表示形式を追加」 opens a draft — the
// spelling (the engine's spellings for the type suggested) and its name — that
// 追加 or Enter (outside an IME composition) appends as ONE op. A refused entry
// stays in the draft with the reason; an accepted one clears it.

import { type KeyboardEvent, useId, useState } from 'react';
import { useI18n } from '../i18n/context';
import { BTN_SM, INPUT } from '../ui/chrome';
import { IconPlus } from '../ui/icons';
import { addFormat, type FormatsEdit, type FormatsTarget } from './displayFormatsModel';

export interface DisplayFormatAddProps {
  /** Dispatch an edit's op; the refusal MESSAGE when it was refused. */
  readonly apply: (edit: FormatsEdit) => string | null;
  readonly target: FormatsTarget;
  /** The `<datalist>` id of the suggested spellings. */
  readonly list: string;
}

export function DisplayFormatAdd({ apply, target, list }: DisplayFormatAddProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [id, setId] = useState('');
  const [label, setLabel] = useState('');
  const [refusal, setRefusal] = useState<string | null>(null);
  const messageId = useId();
  if (!open) {
    return (
      <button type="button" className={`${BTN_SM} self-start`} onClick={() => setOpen(true)}>
        <IconPlus size={14} /> {t('data.formats.add')}
      </button>
    );
  }
  const submit = () => {
    const message = apply(addFormat(target, id, label));
    setRefusal(message);
    if (message === null) {
      setId('');
      setLabel('');
    }
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };
  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-start gap-1">
        <input
          type="text"
          className={`${INPUT} font-mono`}
          aria-label={t('data.formats.id')}
          aria-describedby={refusal === null ? undefined : messageId}
          list={list}
          value={id}
          onChange={(event) => setId(event.currentTarget.value)}
          onKeyDown={onKeyDown}
        />
        <input
          type="text"
          className={INPUT}
          aria-label={t('data.formats.label')}
          placeholder={t('data.none')}
          value={label}
          onChange={(event) => setLabel(event.currentTarget.value)}
          onKeyDown={onKeyDown}
        />
        <button type="button" className={BTN_SM} onClick={submit}>
          {t('data.formats.addSubmit')}
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
