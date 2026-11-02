// The add form of a list's 「差し込みの設定」: the data key is picked FIRST
// (picking is safe), and the name is filled from the key's last segment when
// that is a valid name, else left for the author to type under the charset
// hint. 追加 stays disabled until both are set and the name is free; a name
// that cannot be added says why under the field. One `putValue` per add.

import { useId, useState } from 'react';
import { useI18n } from '../i18n/context';
import { BTN_SM, FIELD_LABEL, INPUT } from '../ui/chrome';
import { nameProblem, suggestedName } from './bindingsModel';
import { FieldPicker } from './FieldPicker';
import type { PickerOption } from './pickerModel';

export interface BindingAddFormProps {
  /** The data keys the picker offers (the list entry's fields). */
  readonly options: readonly PickerOption[];
  /** The names already declared. */
  readonly declared: readonly string[];
  readonly onAdd: (name: string, key: string) => void;
  readonly onCancel: () => void;
}

export function BindingAddForm({ options, declared, onAdd, onCancel }: BindingAddFormProps) {
  const { t } = useI18n();
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const nameId = useId();
  const problem = nameProblem(name, declared);
  // A name the author typed is theirs; only an empty or still-suggested one
  // follows the next pick.
  const pick = (next: string) => {
    if (name === '' || name === suggestedName(key)) {
      setName(suggestedName(next));
    }
    setKey(next);
  };
  return (
    <div className="mt-1 rounded-sj border border-border border-solid p-2">
      <FieldPicker
        label={t('panel.field.key')}
        value={key}
        options={options}
        onCommit={(next) => pick(next.trim())}
      />
      <div className="mb-2">
        <label htmlFor={nameId} className={FIELD_LABEL}>
          {t('panel.bindings.name')}
        </label>
        <input
          id={nameId}
          type="text"
          className={INPUT}
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
        />
        {problem === null ? null : (
          <p className="m-0 mt-1 text-xs text-warn-text">{t(`panel.bindings.name.${problem}`)}</p>
        )}
        <p className="m-0 mt-1 text-xs text-muted">{t('panel.bindings.name.hint')}</p>
      </div>
      <div className="flex gap-1">
        <button
          type="button"
          className={BTN_SM}
          disabled={key === '' || name === '' || problem !== null}
          onClick={() => onAdd(name, key)}
        >
          {t('panel.bindings.addSubmit')}
        </button>
        <button type="button" className={BTN_SM} onClick={onCancel}>
          {t('panel.bindings.cancel')}
        </button>
      </div>
    </div>
  );
}
