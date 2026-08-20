// The DEFINITION half of the data-item editor's right pane: one field's label,
// type, format and description.
//
// Every control is read-only (not hidden) when the host did not arm definition
// editing, so a viewer still sees what the engineer declared. Each input is
// uncontrolled + commit-on-blur and keyed by its own value, and each op builder
// returns null when nothing changed — a mere tab-through authors nothing.

import type { Op } from '@shojiku/designer-core';
import { useI18n } from '../i18n/context';
import { Field } from '../panel/fields';
import { FIELD_LABEL, INPUT, SECTION_TITLE } from '../ui/chrome';
import {
  DEFINITION_TYPES,
  type DefinitionField,
  descriptionOp,
  formatOp,
  isSemanticFormat,
  semanticFormats,
  titleOp,
  typeOp,
} from './definitionsEdit';
import { TYPE_OPTION_KEY } from './editorModel';

export interface DefinitionFormProps {
  readonly keysPath: readonly string[];
  readonly def: DefinitionField;
  readonly editable: boolean;
  readonly onDefEdit: (op: Op | null) => void;
}

export function DefinitionForm({ keysPath, def, editable, onDefEdit }: DefinitionFormProps) {
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
      <div>
        <span className={FIELD_LABEL}>{t('data.field.format')}</span>
        {/* The SEMANTIC format — the data type refiner, not the display
            variant. The values that REFINE the type are a closed set the
            engine's `(type, format)` table decides, so this is a select
            over what actually applies rather than a picker over display
            variants and `formats:` names (which this key ignores). How a
            value LOOKS is chosen per placement, or once for the whole
            document under 表示形式.

            The wire vocabulary itself is OPEN, though (`schema.rs`: an
            unknown value is a generation hint such as `person-name` and
            leaves the base type untouched) — so an authored value outside
            the set gets its own option and is shown verbatim. Dropping it
            into the not-set row would tell the author the field represents
            nothing, and the next edit would overwrite the hint silently. */}
        <select
          className={INPUT}
          aria-label={t('data.field.format')}
          disabled={!editable}
          value={def.format}
          onChange={(event) => onDefEdit(formatOp(keysPath, def.format, event.currentTarget.value))}
        >
          <option value="">{t('data.field.formatNone')}</option>
          {semanticFormats(def.type === '' ? 'string' : def.type).map((option) => (
            <option key={option} value={option}>
              {t(`data.semanticFormat.${option}`)}
            </option>
          ))}
          {isSemanticFormat(def) ? null : <option value={def.format}>{def.format}</option>}
        </select>
      </div>
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
