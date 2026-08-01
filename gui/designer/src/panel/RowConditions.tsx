// The table's row-conditional-styles section (decoration tab): a list of collapsible rule
// cards over `row.conditionalStyles`. Each card reads "when <field> is
// <value>" so the rule is legible without opening it, and expands into the four
// controls the panel owns — alignment, bold, background, text color.
//
// The section never evaluates a predicate itself: how many rows a rule hits is
// the engine's answer, shown by the canvas preview, not a second implementation
// in TS.

import type { Op } from '@shojiku/designer-core';
import { useState } from 'react';
import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { BTN_SM, SECTION_TITLE } from '../ui/chrome';
import { applyPanelOp } from './model';
import type { PickerOption } from './pickerModel';
import { RuleCard } from './RuleCard';
import {
  addRuleOp,
  removeRuleOp,
  repointRuleOps,
  setRuleEqualsOp,
  setRuleStyleOp,
} from './rowConditionOps';
import { readRowConditions } from './rowConditionsModel';

export interface RowConditionsSectionProps {
  /** The selected table's structural path. */
  readonly path: string;
  readonly controller: EditorController;
  /** The raw `row.conditionalStyles` entries — every op rewrites the list, so
   * the component hands them back to the model untouched. */
  readonly entries: readonly unknown[];
  /** The row-scope binding options (the table's own array group). */
  readonly options: readonly PickerOption[];
}

export function RowConditionsSection({
  path,
  controller,
  entries,
  options,
}: RowConditionsSectionProps) {
  const { t } = useI18n();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const rules = readRowConditions(entries);
  const dispatch = (op: Op | null) => applyPanelOp(controller, op);
  // Repointing can change which controls render (a boolean-form field has
  // no value control), so the model reconciles a stale `equals` into the
  // same batch. Always dispatched via applyAll: a batch is transactional
  // and lands as ONE undo step whether it carries one op or two.
  const repoint = (index: number, key: string, hasEquals: boolean) => {
    const picked = options.find((o) => o.key === key);
    controller.applyAll(
      repointRuleOps(
        path,
        entries,
        index,
        key,
        picked?.type ?? '',
        picked?.enumValues ?? [],
        hasEquals,
      ),
    );
  };
  return (
    <section className="mb-3">
      <h3 className={SECTION_TITLE}>{t('panel.rowConditions.title')}</h3>
      {rules.length === 0 ? (
        <p className="mt-0 mb-1.5 text-muted text-sm">{t('panel.rowConditions.hint')}</p>
      ) : (
        <ul className="m-0 mb-1.5 flex list-none flex-col gap-1.5 p-0">
          {rules.map((rule, index) => (
            <RuleCard
              // The list is index-addressed (the wire is a sequence with no
              // ids), so the index is the only stable handle a rule has.
              // biome-ignore lint/suspicious/noArrayIndexKey: see above
              key={index}
              rule={rule}
              index={index}
              open={openIndex === index}
              options={options}
              onToggle={() => setOpenIndex(openIndex === index ? null : index)}
              onRemove={() => {
                dispatch(removeRuleOp(path, entries, index));
                setOpenIndex(null);
              }}
              onKeyChange={(key) => repoint(index, key, rule.hasEquals)}
              onEqualsChange={(value, fieldType) =>
                dispatch(setRuleEqualsOp(path, entries, index, value, fieldType))
              }
              onStyleChange={(property, value) =>
                dispatch(setRuleStyleOp(path, entries, index, property, value))
              }
            />
          ))}
        </ul>
      )}
      <button
        type="button"
        className={`${BTN_SM} w-full text-center`}
        onClick={() => {
          dispatch(addRuleOp(path, entries));
          setOpenIndex(rules.length);
        }}
      >
        {t('panel.rowConditions.add')}
      </button>
    </section>
  );
}
