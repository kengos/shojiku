// ONE row-condition rule's view — what the 「条件付きの書式」 section shows in place
// of its list while a rule is open, the Google Sheets conditional-format sidebar
// shape: a way back to the list, the rule's sentence, what it matches (field +
// value), the format presets, the format controls, its named styles behind
// the 「名前付きスタイル」 disclosure, and 「完了」. Every edit applies at once — the canvas previews it
// live — so 「完了」 and the back button both just return to the list; there is
// nothing to commit or cancel.
//
// The format controls ARE `TableBandFields`, the same component the header band,
// the body band, a column and a header group render: a rule is one more layer
// over the body row, so it gets the same controls, the same cascade-effective
// display and the same minimal-wire ops — vertical alignment included where the
// engine honours a rule's (a body cell falls back to it under its column's).

import type { Op } from '@shojiku/designer-core';
import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import type { CascadeContext } from '../toolbar/cascade';
import { BTN_SM } from '../ui/chrome';
import { AdvancedStyles, namesAt } from './AdvancedStyles';
import { FieldPicker } from './FieldPicker';
import type { PickerOption } from './pickerModel';
import { RulePresetGallery } from './RulePresetGallery';
import { type RowConditionRow, valueFormFor } from './rowConditionsModel';
import { matchRulePreset, rulePresetOps } from './rulePresets';
import { ruleSummary } from './ruleSummary';
import { TableBandFields, type ValignHost } from './TableBandFields';
import { ValueControl } from './ValueControl';

/** A rule's own style sits at `style.*` under the rule entry itself. */
const RULE_STYLE_KEYS = ['style'] as const;

export interface RuleControlsProps {
  readonly controller: EditorController;
  readonly rule: RowConditionRow;
  /** The raw rule entry — the presets and the named-style list read its wire. */
  readonly entry: unknown;
  readonly options: readonly PickerOption[];
  /** The option the rule's field resolves to (undefined = an unknown key). */
  readonly picked: PickerOption | undefined;
  /** The rule's cascade context — its own style over the body band over the
   * table (`panel/bandCascade` § ruleContext). */
  readonly ctx: CascadeContext;
  /** The rule entry's structural path (`…row.conditionalStyles[n]`). */
  readonly path: string;
  readonly fontFamilies: readonly string[];
  /** Whether the engine honours a rule's `verticalAlign`
   * (`TABLE_BODY_VALIGN_CAPABILITY`) — the control is withheld otherwise. */
  readonly verticalAlign: ValignHost;
  /** The values the sample data carries for the picked field. */
  readonly samples: readonly string[];
  readonly onKeyChange: (key: string) => void;
  readonly onEqualsChange: (value: string | null, fieldType: string) => void;
  readonly onOp: (op: Op | null) => void;
  /** Back to the rule list. */
  readonly onClose: () => void;
}

export function RuleControls(props: RuleControlsProps) {
  const { t } = useI18n();
  const { controller, rule, entry, picked, ctx, path, onOp, onClose } = props;
  const form = valueFormFor(picked?.type ?? '', picked?.enumValues ?? []);
  return (
    <div className="flex flex-col gap-2">
      <button type="button" className={`${BTN_SM} self-start`} onClick={onClose}>
        {t('panel.rowConditions.back')}
      </button>
      <p className="m-0 font-semibold text-sm text-text">{ruleSummary(t, rule, picked)}</p>
      <FieldPicker
        label={t('panel.rowConditions.field')}
        value={rule.key}
        options={props.options}
        onCommit={props.onKeyChange}
      />
      <ValueControl
        form={form}
        rule={rule}
        options={picked?.enumValues ?? []}
        samples={props.samples}
        onChange={(value) => props.onEqualsChange(value, picked?.type ?? '')}
      />
      <RulePresetGallery
        active={matchRulePreset(entry)}
        onPick={(id) => controller.applyAll(rulePresetOps(path, entry, id))}
      />
      <div>
        <TableBandFields
          ctx={ctx}
          path={path}
          keys={RULE_STYLE_KEYS}
          host={{
            fontFamilies: props.fontFamilies,
            verticalAlign: props.verticalAlign,
            fill: true,
          }}
          onOp={onOp}
        />
        <AdvancedStyles
          controller={controller}
          path={path}
          lists={[{ keys: ['styleNames'], names: namesAt(entry, ['styleNames']) }]}
        />
      </div>
      <button type="button" className={`${BTN_SM} self-end`} onClick={onClose}>
        {t('panel.rowConditions.done')}
      </button>
    </div>
  );
}
