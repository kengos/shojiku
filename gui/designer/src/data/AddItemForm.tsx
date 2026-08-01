// The add-a-data-item form in the editor's left rail: a name + scalar type that
// dispatches an `addFieldPlan` putValue, so a missing field is added without
// leaving the Designer — including on a mounted host, where the sample data is
// read-only but the definitions are not.

import type { Op } from '@shojiku/designer-core';
import { useState } from 'react';
import { useI18n } from '../i18n/context';
import { BTN_SM, INPUT } from '../ui/chrome';
import { DEFINITION_TYPES, type DefinitionType } from './definitionsEdit';
import { addFieldPlan } from './defsPlan';
import { TYPE_OPTION_KEY } from './editorModel';

/** The add-a-data-item form (name + scalar type) → an `addFieldPlan` putValue,
 * so a missing field is added without leaving the Designer (works even when the
 * sample data is read-only). */
export function AddItemForm({
  definitions,
  onDefinitionEdit,
}: {
  readonly definitions: string;
  readonly onDefinitionEdit: (op: Op) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [type, setType] = useState<DefinitionType>('string');
  const [refusal, setRefusal] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        const plan = addFieldPlan(definitions, name, type);
        if (!plan.ok) {
          setRefusal(
            plan.reason === 'key_exists' ? 'field.error.key_exists' : 'field.error.name_too_long',
          );
          return;
        }
        onDefinitionEdit(plan.op);
        setName('');
        setRefusal(null);
      }}
    >
      <input
        type="text"
        className={INPUT}
        aria-label={t('sample.addFieldKey')}
        placeholder={t('sample.addFieldKey')}
        value={name}
        onChange={(event) => setName(event.currentTarget.value)}
        onKeyDown={(event) => {
          // A Japanese user pressing Enter to confirm an IME conversion must
          // not submit the form mid-composition.
          if (event.key === 'Enter' && event.nativeEvent.isComposing) {
            event.preventDefault();
          }
        }}
      />
      <div className="flex gap-1">
        <select
          className={`${INPUT} min-w-0 flex-1`}
          aria-label={t('sample.addFieldKind')}
          value={type}
          onChange={(event) => setType(event.currentTarget.value as DefinitionType)}
        >
          {DEFINITION_TYPES.map((option) => (
            <option key={option} value={option}>
              {t(TYPE_OPTION_KEY[option])}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className={`${BTN_SM} whitespace-nowrap`}
          disabled={name.trim() === ''}
        >
          {t('data.addItem')}
        </button>
      </div>
      {refusal !== null ? <output className="text-sm text-error-text">{t(refusal)}</output> : null}
    </form>
  );
}
