// How a field SHOWS on the page, beyond its type — 「表示」: its currency and
// decimal places, its quantity unit, its default display format, the blank-form
// placeholder and the formats it declares. Which of them a field gets follows
// what the ENGINE reads for its type (`engineFieldType`): a key the type does
// not read is not offered, and one left behind by a type change stays as
// authored. `PlaceholderField` is also the list element section's (a list's
// values print verbatim, so it gets none of the others).
//
// The samples beside the default format are the engine's, in the field's OWN
// currency when it has one (`useFieldCatalog`); a decimal-places override is not
// in them (the catalog renders a type, not a field), and the section says so.

import type { Op } from '@shojiku/designer-core';
import { useI18n } from '../i18n/context';
import { variantOptions, variantSamples } from '../panel/formatModel';
import { FIELD_LABEL, SECTION_TITLE } from '../ui/chrome';
import { DefaultFormatField } from './DefaultFormatField';
import { DisplayFormatsList } from './DisplayFormatsList';
import { CurrencyField, UnitField } from './DisplayKeyFields';
import type { DefinitionField } from './definitionsEdit';
import type { DetailContext } from './detailContext';
import { readFormats } from './displayFormatsModel';
import { displayFormatOp, MAX_PRECISION, readDisplayRules } from './displayRules';
import { engineFieldType } from './enumRules';
import { PrecisionField } from './PrecisionField';
import { RuleInput } from './RuleInput';
import { useFieldCatalog } from './useFieldCatalog';
import { placeholderOp } from './valueRules';

export interface PlaceholderFieldProps {
  readonly keysPath: readonly string[];
  readonly placeholder: string;
  readonly editable: boolean;
  readonly onDefEdit: (op: Op | null) => void;
  /** The line under the field (a list element's differs: nothing prints it). */
  readonly hint?: string;
}

export function PlaceholderField({
  keysPath,
  placeholder,
  editable,
  onDefEdit,
  hint,
}: PlaceholderFieldProps) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-0.5">
      <span className={FIELD_LABEL}>{t('data.placeholder')}</span>
      <RuleInput
        label={t('data.placeholder')}
        value={placeholder}
        editable={editable}
        placeholder={t('data.none')}
        onCommit={(raw) => {
          onDefEdit(placeholderOp(keysPath, placeholder, raw));
          return null;
        }}
      />
      <p className="m-0 text-sm text-muted">{hint ?? t('data.placeholderHint')}</p>
    </div>
  );
}

export interface DisplaySectionProps {
  readonly keysPath: readonly string[];
  readonly def: DefinitionField;
  readonly placeholder: string;
  readonly ctx: DetailContext;
}

export function DisplaySection({ keysPath, def, placeholder, ctx }: DisplaySectionProps) {
  const { t } = useI18n();
  const mapped = engineFieldType(def.type === '' ? 'string' : def.type, def.format);
  // The catalog names the date-time type `datetime`.
  const type = mapped === 'date-time' ? 'datetime' : mapped;
  const rules = readDisplayRules(ctx.definitions, keysPath);
  const catalog = useFieldCatalog(ctx.formats, type === 'currency' ? rules.currency : '');
  const edit = { keysPath, editable: ctx.editable, onDefEdit: ctx.onDefEdit };
  const places = type === 'currency' || type === 'percentage';
  // Whether a sample is on screen beside the default format: a percentage's
  // fixed rendering, or the picked variant's — the note about places is about it.
  const sampled =
    variantSamples(catalog, type, type === 'percentage' ? 'default' : rules.displayFormat).length >
    0;
  const declared = readsDeclared(ctx.definitions, keysPath);
  const spellings = [...variantOptions(catalog, type).map((option) => option.spelling), 'default'];
  return (
    <section className="flex flex-col gap-3">
      <h3 className={SECTION_TITLE}>{t('data.display')}</h3>
      {places || type === 'quantity' ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-3">
          {type === 'currency' ? <CurrencyField {...edit} value={rules.currency} /> : null}
          {places ? (
            <PrecisionField {...edit} value={rules.precision} currency={type === 'currency'} />
          ) : null}
          {type === 'quantity' ? (
            <UnitField
              {...edit}
              value={rules.unit}
              samples={rules.unit === '' ? variantSamples(catalog, 'quantity', 'default') : []}
            />
          ) : null}
        </div>
      ) : null}
      <DefaultFormatField
        type={type}
        catalog={catalog}
        current={rules.displayFormat}
        declared={declared ?? []}
        editable={ctx.editable}
        onPick={(spelling) =>
          ctx.onDefEdit(displayFormatOp(keysPath, rules.displayFormat, spelling))
        }
      />
      {places && /^\d+$/.test(rules.precision) && sampled ? (
        <p className="-mt-2 m-0 text-sm text-muted">
          {t('data.display.sampleDigits', {
            places: Math.min(Number(rules.precision), MAX_PRECISION),
          })}
        </p>
      ) : null}
      <PlaceholderField {...edit} placeholder={placeholder} />
      {/* Offered where the ENGINE names variants for the type (its non-fixed
          catalog entries), or wherever a list is already authored. */}
      {(catalog?.types.some((entry) => entry.fieldType === type && !entry.fixed) ?? false) ||
      declared !== null ? (
        <DisplayFormatsList
          {...edit}
          definitions={ctx.definitions}
          spellings={spellings}
          money={type === 'currency' || type === 'number' ? type : null}
        />
      ) : null}
    </section>
  );
}

/** The field's declared format ids — empty for a list this editor cannot read,
 * `null` when none is authored. A type that offers no variants still shows an
 * authored list, so it can be cleared. */
function readsDeclared(definitions: string, keysPath: readonly string[]): string[] | null {
  const read = readFormats(definitions, keysPath);
  if (read.kind === 'readonly') {
    return [];
  }
  return read.rows.length > 0 ? read.rows.map((row) => row.id) : null;
}
