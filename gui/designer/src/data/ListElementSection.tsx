// 「1 つ 1 つの値」 — a LIST's element schema (`items`): what each value of the
// list is (型 / 表すもの), the text drawn when one is blank, the range each value
// must keep (its length for text, its value for a number), and its choices.
//
// Everything addresses `[...list, 'items', …]`. An element authored with no
// `type` (a hand-written `{ type: array }`) offers 型 ALONE, as unset: any other
// key written first would leave `items` without its required `type`, which the
// engine refuses to parse for every template using the file. The type is
// offered from the scalar types only — `object` would turn the list into a
// table. A list prints each value as it is, so its blank text and printed text
// are recorded but not printed; the section says so.

import type { Op } from '@shojiku/designer-core';
import { useI18n } from '../i18n/context';
import { SECTION_TITLE } from '../ui/chrome';
import { PlaceholderField } from './DisplaySection';
import { readDefinitionField } from './definitionsEdit';
import { EnumSection } from './EnumSection';
import { RangeFields } from './RangeFields';
import { TypeFields } from './TypeFields';
import { readValueRules } from './valueRules';

export interface ListElementSectionProps {
  /** The list node's keys path. */
  readonly listPath: readonly string[];
  readonly definitions: string;
  readonly editable: boolean;
  readonly onDefEdit: (op: Op | null) => boolean;
}

export function ListElementSection({
  listPath,
  definitions,
  editable,
  onDefEdit,
}: ListElementSectionProps) {
  const { t } = useI18n();
  const keysPath = [...listPath, 'items'];
  const def = readDefinitionField(definitions, keysPath);
  const rules = readValueRules(definitions, keysPath);
  const type = def.type;
  const numeric = type === 'number' || type === 'integer';
  const edit = { keysPath, editable, onDefEdit };
  return (
    <section className="flex flex-col gap-3">
      <h3 className={SECTION_TITLE}>{t('data.element')}</h3>
      <TypeFields {...edit} def={def} allowUnset />
      {type === '' ? (
        <p className="m-0 text-sm text-muted">
          {t('data.element.typeFirst', { type: t('data.field.type') })}
        </p>
      ) : (
        <>
          <PlaceholderField
            {...edit}
            placeholder={rules.placeholder}
            hint={t('data.element.placeholderHint')}
          />
          {type === 'boolean' ? null : (
            <div className="flex flex-col gap-1">
              <RangeFields
                {...edit}
                kind={numeric ? 'elementBound' : 'elementLength'}
                ranges={rules.ranges}
              />
              <p className="m-0 text-sm text-muted">{t('data.range.hint')}</p>
            </div>
          )}
          <EnumSection {...edit} definitions={definitions} type={type} format={def.format} nested />
        </>
      )}
    </section>
  );
}
