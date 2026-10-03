// The 型 / 表すもの pair — a schema node's base type and its SEMANTIC format —
// shared by a field's definition form and a list's 「1 つ 1 つの値」 section.
//
// 表すもの is the data type refiner, not the display variant: the values that
// REFINE the type are a closed set the engine's `(type, format)` table decides,
// so this is a select over what actually applies rather than a picker over
// display variants and `formats:` names (which this key ignores). How a value
// LOOKS is chosen per placement, or once for the whole document under 表示形式.
//
// The wire vocabulary itself is OPEN, though (`schema.rs`: an unknown value is
// a generation hint such as `person-name` and leaves the base type untouched) —
// so an authored value outside the set gets its own option and is shown
// verbatim. Dropping it into the not-set row would tell the author the field
// represents nothing, and the next edit would overwrite the hint silently.

import type { Op } from '@shojiku/designer-core';
import { useI18n } from '../i18n/context';
import { FIELD_LABEL, INPUT } from '../ui/chrome';
import {
  DEFINITION_TYPES,
  type DefinitionField,
  formatOp,
  isSemanticFormat,
  semanticFormats,
  typeOp,
} from './definitionsEdit';
import { TYPE_OPTION_KEY } from './editorModel';

export interface TypeFieldsProps {
  readonly keysPath: readonly string[];
  readonly def: DefinitionField;
  readonly editable: boolean;
  readonly onDefEdit: (op: Op | null) => void;
  /** Show an unset type as unset (a list element authored without one) rather
   * than as the text default, so choosing text actually writes it. */
  readonly allowUnset?: boolean;
}

export function TypeFields({ keysPath, def, editable, onDefEdit, allowUnset }: TypeFieldsProps) {
  const { t } = useI18n();
  const unset = allowUnset === true && def.type === '';
  return (
    <>
      <div>
        <span className={FIELD_LABEL}>{t('data.field.type')}</span>
        <select
          className={INPUT}
          aria-label={t('data.field.type')}
          value={def.type === '' && !unset ? 'string' : def.type}
          disabled={!editable}
          onChange={(event) => onDefEdit(typeOp(keysPath, def.type, event.currentTarget.value))}
        >
          {unset ? <option value="">{t('data.field.typeUnset')}</option> : null}
          {DEFINITION_TYPES.map((option) => (
            <option key={option} value={option}>
              {t(TYPE_OPTION_KEY[option])}
            </option>
          ))}
        </select>
      </div>
      {unset ? null : (
        <div>
          <span className={FIELD_LABEL}>{t('data.field.format')}</span>
          <select
            className={INPUT}
            aria-label={t('data.field.format')}
            disabled={!editable}
            value={def.format}
            onChange={(event) =>
              onDefEdit(formatOp(keysPath, def.format, event.currentTarget.value))
            }
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
      )}
    </>
  );
}
