// The 「grid」 section: an n-up `repeat`'s sheet — how many cells each page
// holds, their gaps and fill order, where the grid starts, and whether it is
// marked for cutting.
//
// It renders AS the placement tab of a `repeat` (the wire gives the type no
// `box:`, so there are no box fields to sit under), because the grid is what
// decides where every cell lands and how big it is — the `char_grid` precedent.
// What a cell SHOWS is not here: those are ordinary items, listed under the grid
// in the structure pane and edited like any other.

import type { Op } from '@shojiku/designer-core';
import { isRelativeLength, readLength } from '../canvas/lengths';
import { useI18n } from '../i18n/context';
import { SECTION_TITLE } from '../ui/chrome';
import { Segmented } from '../ui/Segmented';
import { hasCapability, type ItemPanelProps } from './itemPanelProps';
import { applyPanelOp } from './model';
import {
  BREAK_BEFORE_CAPABILITY,
  CUT_MARKS_CAPABILITY,
  countSteppable,
  cutMarksOp,
  FILL_ORDERS,
  type FillOrder,
  fillOrderOp,
  GRID_COUNT_KEYS,
  GRID_GAP_KEYS,
  gridCountOp,
  gridCountStepOp,
  gridGapOp,
  gridGapStepOp,
  newPageOp,
  readRepeatGrid,
} from './repeatGrid';
import { StepperField } from './StepperField';

/** Fallback gap increment when the canvas grid is off. */
const FALLBACK_STEP_PT = 1;

/** A checkbox row: one control, one sentence. */
function CheckRow(props: {
  readonly checked: boolean;
  readonly label: string;
  readonly onToggle: () => void;
}) {
  return (
    <label className="mb-1.5 flex items-center gap-1.5 text-sm text-text">
      <input
        type="checkbox"
        className="accent-accent"
        checked={props.checked}
        onChange={props.onToggle}
      />
      {props.label}
    </label>
  );
}

export function RepeatSection({ controller, path, gridStep, capabilities }: ItemPanelProps) {
  const { t } = useI18n();
  const view = readRepeatGrid(controller.read, path);
  const dispatch = (op: Op | null) => applyPanelOp(controller, op);
  const step = gridStep > 0 ? gridStep : FALLBACK_STEP_PT;
  // Each count's cap depends on the OTHER axis as authored.
  const otherOf = { columns: view.rows, rows: view.columns };
  return (
    <section>
      <h3 className={SECTION_TITLE}>{t('panel.section.repeatGrid')}</h3>
      <div className="grid grid-cols-2 gap-2">
        {GRID_COUNT_KEYS.map((key) => (
          <StepperField
            key={key}
            label={t(`panel.repeat.${key}`)}
            value={view[key]}
            // Unset is the engine's single cell, and says so.
            placeholder="1"
            canStep={countSteppable(view[key])}
            inputMode="decimal"
            onCommit={(raw) => dispatch(gridCountOp(path, key, raw, otherOf[key]))}
            onStep={(dir) => dispatch(gridCountStepOp(path, key, view[key], dir, otherOf[key]))}
          />
        ))}
        {GRID_GAP_KEYS.map((key) => (
          <StepperField
            key={key}
            label={t(`panel.repeat.${key}`)}
            value={view[key]}
            canStep={readLength(view[key]) !== null}
            stepHint={isRelativeLength(view[key]) ? t('stepper.relativeUnit') : undefined}
            unit="pt"
            unitHint={t('stepper.unitHint')}
            // An unset axis gap falls back to the `gap` shorthand, then to 0 —
            // the placeholder shows whichever the engine will use.
            placeholder={view.gap === '' ? '0' : view.gap}
            onCommit={(raw) => dispatch(gridGapOp(path, key, raw))}
            onStep={(dir) => dispatch(gridGapStepOp(path, key, view[key], dir, step))}
          />
        ))}
      </div>
      <Segmented
        ariaLabel={t('panel.repeat.direction')}
        value={view.direction}
        options={FILL_ORDERS.map((order) => ({
          value: order,
          label: t(`panel.repeat.direction.${order}`),
        }))}
        onChange={(next) => dispatch(fillOrderOp(path, next as FillOrder))}
      />
      {hasCapability(capabilities, BREAK_BEFORE_CAPABILITY) ? (
        <CheckRow
          checked={view.startsOnNewPage}
          label={t('panel.repeat.newPage')}
          onToggle={() => dispatch(newPageOp(path, !view.startsOnNewPage))}
        />
      ) : null}
      {hasCapability(capabilities, CUT_MARKS_CAPABILITY) ? (
        <CheckRow
          checked={view.cutMarks}
          label={t('panel.repeat.cutMarks')}
          onToggle={() => dispatch(cutMarksOp(path, !view.cutMarks))}
        />
      ) : null}
      <p className="mt-1 text-[11px] leading-relaxed text-muted">{t('panel.repeat.hint')}</p>
    </section>
  );
}
