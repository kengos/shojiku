// The DEFINITION half of the data-item editor's right pane: one field's label,
// type, format and description.
//
// Every control is read-only (not hidden) when the host did not arm definition
// editing, so a viewer still sees what the engineer declared. Each input is
// uncontrolled + commit-on-blur and keyed by its own value, and each op builder
// returns null when nothing changed — a mere tab-through authors nothing.

import type { Op } from '@shojiku/designer-core';
import { useI18n } from '../i18n/context';
import { FormatPicker } from '../panel/FormatPicker';
import { Field } from '../panel/fields';
import { formatOptions } from '../panel/formatModel';
import { FIELD_LABEL, INPUT, SECTION_TITLE } from '../ui/chrome';
import {
  DEFINITION_TYPES,
  type DefinitionField,
  descriptionOp,
  formatOp,
  titleOp,
  typeOp,
} from './definitionsEdit';
import { TYPE_OPTION_KEY } from './editorModel';

export interface DefinitionFormProps {
  readonly keysPath: readonly string[];
  readonly def: DefinitionField;
  readonly editable: boolean;
  readonly formatRegistry: readonly string[];
  readonly capabilities?: readonly string[];
  readonly onDefEdit: (op: Op | null) => void;
}

export function DefinitionForm({
  keysPath,
  def,
  editable,
  formatRegistry,
  capabilities,
  onDefEdit,
}: DefinitionFormProps) {
  const { t } = useI18n();
  return (
    <section className="flex flex-col gap-3">
      <h3 className={SECTION_TITLE}>{t('data.definition')}</h3>
      <Field label={t('data.field.label')}>
        <input
          key={def.title}
          type="text"
          defaultValue={def.title}
          readOnly={!editable}
          onBlur={(event) => onDefEdit(titleOp(keysPath, def.title, event.currentTarget.value))}
        />
      </Field>
      <div>
        <span className={FIELD_LABEL}>{t('data.field.type')}</span>
        <select
          className={INPUT}
          aria-label={t('data.field.type')}
          value={def.type === '' ? 'string' : def.type}
          disabled={!editable}
          onChange={(event) => onDefEdit(typeOp(keysPath, def.type, event.currentTarget.value))}
        >
          {DEFINITION_TYPES.map((option) => (
            <option key={option} value={option}>
              {t(TYPE_OPTION_KEY[option])}
            </option>
          ))}
        </select>
      </div>
      {editable ? (
        <FormatPicker
          label={t('data.field.format')}
          value={def.format}
          options={formatOptions(
            formatRegistry,
            def.type === '' ? undefined : def.type,
            capabilities,
          )}
          onCommit={(spelling) => onDefEdit(formatOp(keysPath, def.format, spelling))}
        />
      ) : (
        <Field label={t('data.field.format')}>
          <input type="text" defaultValue={def.format} readOnly />
        </Field>
      )}
      <Field label={t('data.field.description')}>
        <textarea
          key={def.description}
          className={`${INPUT} min-h-[4rem] resize-y`}
          defaultValue={def.description}
          readOnly={!editable}
          onBlur={(event) =>
            onDefEdit(descriptionOp(keysPath, def.description, event.currentTarget.value))
          }
        />
      </Field>
    </section>
  );
}
