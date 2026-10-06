// The space between a repeat_flow's cards (its own `gap`, not the card's): one
// stepper on the repeat_flow's content tab, under the data binding — the insert
// scaffold writes 8, and this is where that number becomes editable. The ingress
// is the n-up sheet's gap rule (`relativeGapOp`), since this gap may also be a
// `%` of the flowing region's height. Empty is the engine default, 0.

import type { Op } from '@shojiku/designer-core';
import { readLength, stepLength } from '../canvas/lengths';
import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { display } from './itemView';
import { applyPanelOp } from './model';
import { readItem } from './placementModel';
import { relativeGapOp } from './repeatGrid';
import { StepperField } from './StepperField';

/** One ▲▼ step of a gap, in pt. */
export const CARD_GAP_STEP_PT = 1;

/** A ▲▼ step of the cards' gap from its current value (empty = 0); `null`
 * when the value cannot be stepped (a relative or garbage one). */
export function cardGapStepOp(path: string, current: string, dir: 1 | -1): Op | null {
  const next = stepLength(current.trim() === '' ? '0' : current, dir, CARD_GAP_STEP_PT);
  return next === null ? null : relativeGapOp(path, ['gap'], String(next));
}

export function CardGapField({
  controller,
  path,
}: {
  readonly controller: EditorController;
  /** The repeat_flow's path. */
  readonly path: string;
}) {
  const { t } = useI18n();
  const value = display(readItem(controller.read, path)?.gap);
  const dispatch = (op: Op | null) => applyPanelOp(controller, op);
  return (
    <StepperField
      label={t('panel.cards.gap')}
      value={value}
      placeholder="0"
      unit="pt"
      unitHint={t('stepper.unitHint')}
      canStep={readLength(value.trim() === '' ? '0' : value) !== null}
      onCommit={(raw) => dispatch(relativeGapOp(path, ['gap'], raw))}
      onStep={(dir) => dispatch(cardGapStepOp(path, value, dir))}
    />
  );
}
