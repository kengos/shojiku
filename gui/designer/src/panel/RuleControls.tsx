// The EXPANDED body of one row-condition rule: what the rule matches (field +
// value) and the four style properties this editor owns — alignment, bold,
// background, text color. The alignment control is the SHARED `AlignSegment`
// (one control wherever a `textAlign` is picked), not a fourth copy of it. Its four labels are the GENERIC `panel.field.*` ones,
// shared with the table's band editor and the named-style form: the same four
// properties named the same way wherever they are edited. Every other key an entry carries (`styleNames`, a
// style property with no control here) is carried through untouched by the
// model, so the body reports them rather than pretending they are absent.

import { useI18n } from '../i18n/context';
import { FIELD_LABEL } from '../ui/chrome';
import { FieldPicker } from './FieldPicker';
import type { PickerOption } from './pickerModel';
import { type RowConditionRow, valueFormFor } from './rowConditionsModel';
import { SwatchRow, ValueControl } from './ruleInputs';
import { AlignSegment } from './TableBandFields';

export interface RuleControlsProps {
  readonly rule: RowConditionRow;
  readonly options: readonly PickerOption[];
  /** The option the rule's field resolves to (undefined = an unknown key). */
  readonly picked: PickerOption | undefined;
  readonly onKeyChange: (key: string) => void;
  readonly onEqualsChange: (value: string | null, fieldType: string) => void;
  readonly onStyleChange: (property: string, value: string | null) => void;
}

export function RuleControls({
  rule,
  options,
  picked,
  onKeyChange,
  onEqualsChange,
  onStyleChange,
}: RuleControlsProps) {
  const { t } = useI18n();
  const form = valueFormFor(picked?.type ?? '', picked?.enumValues ?? []);
  return (
    <div className="flex flex-col gap-2 border-border border-t p-2">
      <FieldPicker
        label={t('panel.rowConditions.field')}
        value={rule.key}
        options={options}
        onCommit={onKeyChange}
      />
      <ValueControl
        form={form}
        rule={rule}
        options={picked?.enumValues ?? []}
        onChange={(value) => onEqualsChange(value, picked?.type ?? '')}
      />
      <div>
        <span className={FIELD_LABEL}>{t('panel.field.textAlign')}</span>
        <AlignSegment
          value={rule.textAlign}
          onChange={(value) => onStyleChange('textAlign', value)}
        />
      </div>
      <label className="flex items-center gap-1.5 text-sm text-text">
        <input
          type="checkbox"
          checked={rule.bold}
          onChange={(event) =>
            onStyleChange('fontWeight', event.currentTarget.checked ? 'bold' : null)
          }
        />
        {t('panel.field.bold')}
      </label>
      <SwatchRow
        label={t('panel.field.backgroundColor')}
        value={rule.backgroundColor}
        onCommit={(value) => onStyleChange('backgroundColor', value === '' ? null : value)}
      />
      <SwatchRow
        label={t('panel.field.color')}
        value={rule.color}
        onCommit={(value) => onStyleChange('color', value === '' ? null : value)}
      />
      {rule.styleNameCount > 0 ? (
        // Named styles ride along untouched; say so rather than leaving
        // the rule looking like it carries only what is editable here.
        <p className="m-0 text-muted text-xs">
          {t('panel.rowConditions.styleNames', { count: rule.styleNameCount })}
        </p>
      ) : null}
    </div>
  );
}
