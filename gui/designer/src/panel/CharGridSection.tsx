// The 「manuscript paper」 section: the `grid.*` geometry and `writingMode` of a
// `char_grid` item.
//
// It renders inside the PLACEMENT tab, under the box fields, because that is
// where an author goes to change how big the thing is — and, for a char_grid,
// `box.w` is not the control that does it. `writingMode` sits here rather than
// with the content because it decides which axis `charsPerLine` runs along: it
// is geometry, not a content mode.

import type { Op } from '@shojiku/designer-core';
import { isRelativeLength, readLength } from '../canvas/lengths';
import { useI18n } from '../i18n/context';
import { SECTION_TITLE } from '../ui/chrome';
import { Segmented } from '../ui/Segmented';
import { CharGridInkFields } from './CharGridInkFields';
import {
  type CharGridView,
  countOp,
  countStepOp,
  countSteppable,
  GRID_COUNT_KEYS,
  GRID_LENGTH_KEYS,
  gridLengthOp,
  WRITING_MODES,
  type WritingMode,
  writingModeOp,
} from './charGrid';
import type { CharGridInkView } from './charGridInk';
import type { ItemPanelProps } from './itemPanelProps';
import { applyPanelOp, stepValueOp } from './model';
import { StepperField } from './StepperField';

/** The stepper increment for a cell/line COUNT — always one whole cell, never
 * the canvas grid step (a 6pt grid would step the cell count by six). */
const COUNT_STEP = 1;
/** Fallback increment for the grid lengths when the canvas grid is off. */
const FALLBACK_STEP_PT = 1;
/** `lineGap`/`charGap` default to 0 on the wire, so an empty field means 0. */
const GAP_PLACEHOLDER = '0';

export function CharGridSection({
  view,
  ink,
  controller,
  path,
  gridStep,
}: {
  readonly view: CharGridView;
  readonly ink: CharGridInkView;
  readonly controller: ItemPanelProps['controller'];
  readonly path: string;
  readonly gridStep: number;
}) {
  const { t } = useI18n();
  const step = gridStep > 0 ? gridStep : FALLBACK_STEP_PT;
  const dispatch = (op: Op | null) => applyPanelOp(controller, op);
  return (
    <section className="mt-3">
      <h3 className={SECTION_TITLE}>{t('panel.section.charGrid')}</h3>
      <div className="grid grid-cols-2 gap-2">
        {GRID_COUNT_KEYS.map((key) => (
          <StepperField
            key={key}
            label={t(`panel.charGrid.${key}`)}
            value={view[key]}
            canStep={countSteppable(view[key])}
            onCommit={(raw) => dispatch(countOp(path, key, raw))}
            // Stepped through the same guard as a typed value, so `▼` cannot
            // walk a REQUIRED dimension down to zero.
            onStep={(dir) => dispatch(countStepOp(path, key, view[key], dir * COUNT_STEP))}
          />
        ))}
        {GRID_LENGTH_KEYS.map((key) => (
          <StepperField
            key={key}
            label={t(`panel.charGrid.${key}`)}
            value={view[key]}
            // The SAME steppability test the box fields use
            // (`boxFields.tsx`): a value the panel cannot read as an absolute
            // length cannot be stepped by points either, and `stepValueOp`
            // would return `null`. Gating on "non-empty" instead left the ▲▼
            // enabled and inert over a legal `5%` or `0.4em` — the very defect
            // the width field was fixed for.
            canStep={readLength(view[key]) !== null}
            stepHint={isRelativeLength(view[key]) ? t('stepper.relativeUnit') : undefined}
            unit="pt"
            unitHint={t('stepper.unitHint')}
            // Both OPTIONAL keys state what their unset value means, the way
            // the placement tab's coordinates do: an unset cell side is
            // DERIVED (from the item's own width), an unset gap is 0. The
            // COUNTS above get no placeholder on purpose — they are required
            // keys, so an empty one is a broken document rather than a
            // meaningful default. Found by looking at the running panel;
            // jsdom shows an empty input either way.
            placeholder={key === 'cellSize' ? t('panel.charGrid.cellSizeAuto') : GAP_PLACEHOLDER}
            onCommit={(raw) => dispatch(gridLengthOp(path, key, raw))}
            onStep={(dir) =>
              dispatch(stepValueOp(path, ['grid', key], view[key], dir, step, 'length'))
            }
          />
        ))}
      </div>
      <Segmented
        ariaLabel={t('panel.charGrid.writingMode')}
        value={view.writingMode}
        // Built FROM the wire vocabulary rather than repeating its spellings:
        // the catalog keys are the wire values, so adding a mode upstream
        // cannot leave a half-updated control behind.
        options={WRITING_MODES.map((mode) => ({
          value: mode,
          label: t(`panel.charGrid.mode.${mode}`),
        }))}
        onChange={(next) => dispatch(writingModeOp(path, next as WritingMode))}
      />
      <CharGridInkFields ink={ink} dispatch={dispatch} path={path} />
      <p className="mt-1 text-[11px] leading-relaxed text-muted">{t('panel.charGrid.hint')}</p>
    </section>
  );
}
