// The EXPANDED body of one row-condition rule: what the rule matches (field +
// value) and the four style properties this editor owns — alignment, bold,
// background, text color. Those four ARE `TableBandFields`, the same component
// the header band, the body band and a column's cells render: a rule is one more
// layer over the body row, so it gets the same controls, the same
// cascade-effective display and the same minimal-wire ops rather than a fourth
// copy of any of them. What it shows is what the rows this rule MATCHES render
// with — its own style over the body band over the table. Every other key an
// entry carries (`styleNames`, a style property with no control here) is carried
// through untouched by the model, so the body reports them rather than
// pretending they are absent.

import type { Op } from '@shojiku/designer-core';
import { useI18n } from '../i18n/context';
import type { CascadeContext } from '../toolbar/cascade';
import { FieldPicker } from './FieldPicker';
import type { PickerOption } from './pickerModel';
import { type RowConditionRow, valueFormFor } from './rowConditionsModel';
import { ValueControl } from './ruleInputs';
import { TableBandFields } from './TableBandFields';

/** A rule's own style sits at `style.*` under the rule entry itself. */
const RULE_STYLE_KEYS = ['style'] as const;

export interface RuleControlsProps {
  readonly rule: RowConditionRow;
  readonly options: readonly PickerOption[];
  /** The option the rule's field resolves to (undefined = an unknown key). */
  readonly picked: PickerOption | undefined;
  /** The rule's cascade context — its own style over the body band over the
   * table (`panel/bandCascade` § ruleContext). */
  readonly ctx: CascadeContext;
  /** The rule entry's structural path (`…row.conditionalStyles[n]`). The INDEX
   * is proven in range by the caller having rendered this rule from the list,
   * so the path travels instead of the index and no guard is re-proved here. */
  readonly path: string;
  readonly onKeyChange: (key: string) => void;
  readonly onEqualsChange: (value: string | null, fieldType: string) => void;
  readonly onOp: (op: Op | null) => void;
}

export function RuleControls({
  rule,
  options,
  picked,
  ctx,
  path,
  onKeyChange,
  onEqualsChange,
  onOp,
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
        <TableBandFields ctx={ctx} path={path} keys={RULE_STYLE_KEYS} onOp={onOp} />
      </div>
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
