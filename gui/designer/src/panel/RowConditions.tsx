// The table's 「条件付きの書式」 section (decoration tab), in Google Sheets'
// conditional-format sidebar shape: the LIST of rules over
// `row.conditionalStyles` (each row reads "when <field> is <value>" with the
// chips of what it adds), or — while one is open — that rule's own view
// (`RuleControls`) in place of the list. Every edit applies at once; the view's
// back button and 「完了」 only return to the list.
//
// The open rule is Designer-local UI state: it resets when the section
// remounts (a tab switch, another selection) and never reaches the template.
//
// The section never evaluates a predicate itself: how many rows a rule hits is
// the engine's answer, shown by the canvas preview. The value chips it offers
// are the sample data's values for the field (`ruleValues`), a pick list rather
// than a count.

import type { Op } from '@shojiku/designer-core';
import { useState } from 'react';
import { useI18n } from '../i18n/context';
import { cascadeContext } from '../toolbar/cascade';
import { BTN_SM } from '../ui/chrome';
import { ruleContext } from './bandCascade';
import { hasCapability, type ItemPanelProps } from './itemPanelProps';
import { applyPanelOp } from './model';
import { PanelSection } from './PanelSection';
import { type PickerOption, pickerOptions } from './pickerModel';
import { RuleCard } from './RuleCard';
import { RuleControls } from './RuleControls';
import { addRuleOp, removeRuleOp, repointRuleOps, setRuleEqualsOp } from './rowConditionOps';
import { readRawEntries, readRowConditions } from './rowConditionsModel';
import { sampleValues } from './ruleValues';
import { conditionsSummary } from './tableDecorationSummaries';

/** The whole section, gated on `table.row.conditionalStyles`. */
export function TableConditionsSection(props: ItemPanelProps) {
  const i18n = useI18n();
  const { controller, path, view } = props;
  if (!hasCapability(props.capabilities, 'table.row.conditionalStyles')) {
    return null;
  }
  const entries = readRawEntries(controller.read, path);
  return (
    <PanelSection
      id="table.conditions"
      title={i18n.t('panel.tableSection.conditions.title')}
      summary={conditionsSummary(i18n, entries.length)}
      help={i18n.t('panel.tableSection.conditions.help')}
    >
      <RowConditionsSection
        path={path}
        controller={controller}
        floor={props.floor}
        host={{ fontFamilies: props.fontFamilies, params: props.params, dataKey: view.dataKey }}
        entries={entries}
        options={
          view.dataKey === '' ? [] : pickerOptions(props.paletteGroups, view.dataKey, props.params)
        }
      />
    </PanelSection>
  );
}

export interface RowConditionsSectionProps {
  /** The selected table's structural path. */
  readonly path: string;
  readonly controller: ItemPanelProps['controller'];
  /** The engine-default floor for the rule style cascade. */
  readonly floor?: Readonly<Record<string, unknown>>;
  /** What the rule view needs from the host: its font families, and the sample
   * params + the table's array key its value chips are read from. */
  readonly host: {
    readonly fontFamilies: readonly string[];
    readonly params: string;
    readonly dataKey: string;
  };
  /** The raw `row.conditionalStyles` entries — every op rewrites the list, so
   * the component hands them back to the model untouched. */
  readonly entries: readonly unknown[];
  /** The row-scope binding options (the table's own array group). */
  readonly options: readonly PickerOption[];
}

export function RowConditionsSection(props: RowConditionsSectionProps) {
  const { t } = useI18n();
  const { path, controller, entries, options, floor, host } = props;
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const rules = readRowConditions(entries);
  const dispatch = (op: Op | null) => applyPanelOp(controller, op);
  const pickedFor = (key: string) => options.find((o) => o.key === key);
  const opened = openedRule(rules, openIndex);
  if (opened !== null) {
    const { rule: open, index: at } = opened;
    const picked = pickedFor(open.key);
    return (
      <RuleControls
        controller={controller}
        rule={open}
        entry={entries[at]}
        options={options}
        picked={picked}
        ctx={ruleContext(cascadeContext(controller.read, path, floor), entries[at])}
        path={`${path}.row.conditionalStyles[${at}]`}
        fontFamilies={host.fontFamilies}
        samples={
          host.dataKey === '' || open.key === ''
            ? []
            : sampleValues(host.params, host.dataKey, open.key)
        }
        // Repointing can change which value control renders, so the model
        // reconciles a stale `equals` into the same batch — one undo step.
        onKeyChange={(key) => {
          const next = pickedFor(key);
          controller.applyAll(
            repointRuleOps(
              path,
              entries,
              at,
              key,
              next?.type ?? '',
              next?.enumValues ?? [],
              open.hasEquals,
              open.equals,
              open.boolEquals,
            ),
          );
        }}
        onEqualsChange={(value, fieldType) =>
          dispatch(setRuleEqualsOp(path, entries, at, value, fieldType))
        }
        onOp={dispatch}
        onClose={() => setOpenIndex(null)}
      />
    );
  }
  return (
    <>
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
              picked={pickedFor(rule.key)}
              onOpen={() => setOpenIndex(index)}
              onRemove={() => dispatch(removeRuleOp(path, entries, index))}
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
    </>
  );
}

/** The open rule and its index — `null` when none is open, or when the open
 * index no longer names a rule (an undo took it away), which shows the list. */
function openedRule<R>(
  rules: readonly R[],
  index: number | null,
): { readonly rule: R; readonly index: number } | null {
  if (index === null || index >= rules.length) {
    return null;
  }
  return { rule: rules[index], index };
}
