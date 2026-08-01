// The iterable dialog's workshop-mode create form: name a fresh array params key
// and type its row fields inline (name + kind per row). The whole form is one
// `IterableDraft` bundle in and out, so the dialog shell holds a single piece
// of state and this component owns none. Every string is a catalog key or user
// text rendered through React's escaping.

import { useI18n } from '../i18n/context';
import { BTN_SM } from '../ui/chrome';
import { MAX_FORM_FIELDS } from './iterableModel';
import { FIELD_KINDS, type FieldKind, type ScaffoldField } from './scaffoldFields';

/** What the create form is editing: the fresh source key's name and its row
 * fields. Bundled so the shell threads one value, not a scatter. */
export interface IterableDraft {
  readonly name: string;
  readonly fields: readonly ScaffoldField[];
}

interface IterableCreateFormProps {
  readonly draft: IterableDraft;
  readonly onDraft: (next: IterableDraft) => void;
  /** A list variant enumerates scalars, so it has no per-row fields to type. */
  readonly showFields: boolean;
}

export function IterableCreateForm({ draft, onDraft, showFields }: IterableCreateFormProps) {
  const { t } = useI18n();
  const { name, fields } = draft;
  const setFields = (next: readonly ScaffoldField[]) => onDraft({ name, fields: next });

  return (
    <div>
      <label className="flex flex-col items-stretch">
        {t('iterable.sourceName')}
        <input
          type="text"
          className="rounded-md border border-border bg-surface px-2 py-1 text-text"
          value={name}
          placeholder={t('iterable.sourceNamePlaceholder')}
          onChange={(event) => onDraft({ name: event.target.value, fields })}
        />
      </label>
      {showFields ? (
        <fieldset className="m-0 flex flex-col gap-1 rounded-md border border-border p-2">
          <legend className="px-1 text-sm text-muted">{t('iterable.fields')}</legend>
          {fields.map((field, index) => (
            // Rows are positional form state (no stable identity exists
            // for a just-typed row); index keys are correct here.
            // biome-ignore lint/suspicious/noArrayIndexKey: positional form rows
            <div key={index} className="flex gap-1">
              <input
                type="text"
                className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1 text-text"
                aria-label={t('iterable.fieldName')}
                value={field.name}
                onChange={(event) =>
                  setFields(
                    fields.map((f, i) =>
                      i === index ? { name: event.target.value, kind: f.kind } : f,
                    ),
                  )
                }
              />
              <select
                className="rounded-md border border-border bg-surface px-2 py-1 text-text"
                aria-label={t('iterable.fieldKind')}
                value={field.kind}
                onChange={(event) =>
                  setFields(
                    fields.map((f, i) =>
                      // The select offers only FieldKind values, so the
                      // cast to the union is total.
                      i === index ? { name: f.name, kind: event.target.value as FieldKind } : f,
                    ),
                  )
                }
              >
                {FIELD_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {t(`iterable.kind.${kind}`)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={BTN_SM}
                aria-label={t('iterable.removeField')}
                onClick={() => setFields(fields.filter((_, i) => i !== index))}
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            className={BTN_SM}
            disabled={fields.length >= MAX_FORM_FIELDS}
            onClick={() => setFields([...fields, { name: '', kind: 'text' }])}
          >
            {t('iterable.addField')}
          </button>
        </fieldset>
      ) : null}
    </div>
  );
}
