// The EXPANDED body of one row-condition rule: what the rule matches (field +
// value) and the four style properties this editor owns — alignment, bold,
// background, text color. Every other key an entry carries (`styleNames`, a
// style property with no control here) is carried through untouched by the
// model, so the body reports them rather than pretending they are absent.

import { useI18n } from '../i18n/context';
import { FIELD_LABEL } from '../ui/chrome';
import { IconAlignCenter, IconAlignLeft, IconAlignRight } from '../ui/icons';
import { Segmented } from '../ui/Segmented';
import { FieldPicker } from './FieldPicker';
import type { PickerOption } from './pickerModel';
import { type RowConditionRow, valueFormFor } from './rowConditionsModel';
import { SwatchRow, ValueControl } from './ruleInputs';

/** The alignments this editor offers. */
const ALIGNMENTS = ['left', 'center', 'right'] as const;

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
        <span className={FIELD_LABEL}>{t('panel.rowConditions.align')}</span>
        <Segmented
          ariaLabel={t('panel.rowConditions.align')}
          value={rule.textAlign}
          options={ALIGNMENTS.map((value) => ({
            value,
            label: t(`style.value.textAlign.${value}`),
            icon: alignIcon(value),
          }))}
          // A native radio fires no change for the already-checked
          // option, so a pick is always a NEW alignment.
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
        {t('panel.rowConditions.bold')}
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

function alignIcon(value: (typeof ALIGNMENTS)[number]) {
  if (value === 'left') {
    return <IconAlignLeft size={15} />;
  }
  return value === 'center' ? <IconAlignCenter size={15} /> : <IconAlignRight size={15} />;
}
