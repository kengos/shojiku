// The rule LIST of a table's 「条件付きの書式」 section: the cards in display
// order (reversed — the top card wins, `ruleOrder.ts`), reorder by the cards'
// grips or their up/down buttons, the precedence note once order matters, and
// the add button, which stops at the engine's cap.
//
// After a button move the focus follows the moved rule to its new card — the
// same button, or the other one when the move took it to an end, where the
// pressed one is disabled.

import type { Op } from '@shojiku/designer-core';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/context';
import { BTN_SM } from '../ui/chrome';
import type { PickerOption } from './pickerModel';
import { RuleCard } from './RuleCard';
import { removeRuleOp } from './rowConditionOps';
import type { RowConditionRow } from './rowConditionsModel';
import { MAX_ROW_CONDITIONS, moveRuleOp, wireIndex } from './ruleOrder';
import { useRuleDrag } from './useRuleDrag';

export interface RuleListProps {
  /** The selected table's structural path. */
  readonly path: string;
  /** The raw entries and their rule rows, both in WIRE order. */
  readonly list: {
    readonly entries: readonly unknown[];
    readonly rules: readonly RowConditionRow[];
  };
  readonly pickedFor: (key: string) => PickerOption | undefined;
  readonly dispatch: (op: Op | null) => void;
  /** Opens the rule at a WIRE index. */
  readonly onOpen: (wire: number) => void;
  readonly onAdd: () => void;
}

interface PendingFocus {
  readonly display: number;
  readonly button: 'up' | 'down';
}

export function RuleList({ path, list, pickedFor, dispatch, onOpen, onAdd }: RuleListProps) {
  const { t } = useI18n();
  const { entries, rules } = list;
  const count = rules.length;
  const drag = useRuleDrag(path, entries, dispatch);
  const listRef = useRef<HTMLUListElement>(null);
  const [focus, setFocus] = useState<PendingFocus | null>(null);

  useEffect(() => {
    if (focus === null) {
      return;
    }
    const card = listRef.current?.children.item(focus.display);
    const other = focus.button === 'up' ? 'down' : 'up';
    const pick = (button: string) =>
      card?.querySelector<HTMLButtonElement>(`[data-move="${button}"]:not(:disabled)`);
    (pick(focus.button) ?? pick(other))?.focus();
    setFocus(null);
  }, [focus]);

  const move = (display: number, step: -1 | 1) => {
    const from = wireIndex(count, display);
    dispatch(moveRuleOp(path, entries, from, from - step));
    setFocus({ display: display + step, button: step === -1 ? 'up' : 'down' });
  };
  const atCap = count >= MAX_ROW_CONDITIONS;

  return (
    <>
      {count === 0 ? (
        <p className="mt-0 mb-1.5 text-muted text-sm">{t('panel.rowConditions.hint')}</p>
      ) : (
        <ul ref={listRef} className="m-0 mb-1.5 flex list-none flex-col gap-1.5 p-0">
          {rules.map((_, display) => {
            const wire = wireIndex(count, display);
            const rule = rules[wire];
            const line = drag.lineAt === display ? 'before' : null;
            return (
              <RuleCard
                // The list is index-addressed (the wire is a sequence with no
                // ids), so the position is the only stable handle a card has.
                // biome-ignore lint/suspicious/noArrayIndexKey: see above
                key={display}
                rule={rule}
                picked={pickedFor(rule.key)}
                place={{
                  display,
                  count,
                  applied: wire < MAX_ROW_CONDITIONS,
                  line: display === count - 1 && drag.lineAt === count ? 'after' : line,
                }}
                actions={{
                  onOpen: () => onOpen(wire),
                  onRemove: () => dispatch(removeRuleOp(path, entries, wire)),
                  onMove: (step) => move(display, step),
                }}
                drag={drag}
              />
            );
          })}
        </ul>
      )}
      {count >= 2 ? (
        <p className="mt-0 mb-1.5 text-muted text-xs">{t('panel.rowConditions.precedence')}</p>
      ) : null}
      <button
        type="button"
        className={`${BTN_SM} w-full text-center`}
        disabled={atCap}
        onClick={onAdd}
      >
        {t('panel.rowConditions.add')}
      </button>
      {atCap ? (
        <p className="mt-1 mb-0 text-muted text-sm">
          {t('panel.rowConditions.atCap', { max: MAX_ROW_CONDITIONS })}
        </p>
      ) : null}
    </>
  );
}
