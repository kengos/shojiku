// The child-layout shell for a container: the gap stepper every mode shows, the
// direction segment and add-slot button a NON-grid container shows (a grid's
// structure is edited by its column/row steppers instead), and the per-mode branch
// that picks a control cluster — column/row steppers for a grid (`GridSteppers`),
// alignment (`AlignRow`) otherwise, plus the row-mode ratio inputs (`RatioRow`).
// The parent-first wrapper that hosts these same controls for a child's parent
// is `ParentContainerCard`.
//
// Chrome vocabulary is the nontech-pm's everyday words (row/stack/grid, alignment) — never
// CSS jargon. Every edit dispatches named ops from the pure models (AI parity).

import type { Op } from '@shojiku/designer-core';
import { readLength } from '../canvas/lengths';
import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { BTN_SM } from '../ui/chrome';
import { IconLayoutColumn, IconLayoutRow, IconPlus } from '../ui/icons';
import { Segmented } from '../ui/Segmented';
import { AlignRow } from './AlignRow';
import { GridSteppers } from './GridSteppers';
import type { ContainerLayout } from './layoutModel';
import { addSlotOp, alignItemsOp, directionOp, gapOp, gapStepOp, ratioOp } from './layoutOps';
import { applyPanelOp } from './model';
import { RatioRow } from './RatioRow';
import { StepperField } from './StepperField';

const GAP_STEP_PT = 1;

export interface LayoutSectionProps {
  readonly controller: EditorController;
  /** The CONTAINER whose child layout these controls edit (the selected
   * container itself, or the selected item's parent in the card). */
  readonly path: string;
  readonly layout: ContainerLayout;
}

export function LayoutSection({ controller, path, layout }: LayoutSectionProps) {
  const { t } = useI18n();
  const dispatch = (op: Op | null) => applyPanelOp(controller, op);
  const gapBase = layout.gap.trim() === '' ? '0' : layout.gap;
  return (
    <div>
      {layout.mode !== 'grid' ? (
        <Segmented
          ariaLabel={t('panel.layout.direction')}
          value={layout.mode}
          options={[
            {
              value: 'row',
              label: t('panel.layout.direction.row'),
              icon: <IconLayoutRow size={15} />,
            },
            {
              value: 'column',
              label: t('panel.layout.direction.column'),
              icon: <IconLayoutColumn size={15} />,
            },
          ]}
          onChange={(value) => dispatch(directionOp(path, value === 'row' ? 'row' : 'column'))}
        />
      ) : null}
      <StepperField
        label={t('panel.layout.gap')}
        value={layout.gap}
        placeholder="0"
        unit="pt"
        unitHint={t('stepper.unitHint')}
        canStep={readLength(gapBase) !== null}
        onCommit={(value) => dispatch(gapOp(path, value))}
        onStep={(dir) => dispatch(gapStepOp(path, layout.gap, dir, GAP_STEP_PT))}
      />
      {layout.mode === 'grid' ? (
        layout.columns !== null ? (
          <GridSteppers
            controller={controller}
            path={path}
            columns={layout.columns}
            rows={Math.ceil(layout.children.length / layout.columns)}
          />
        ) : null
      ) : (
        <AlignRow
          alignItems={layout.alignItems}
          onPick={(value) => dispatch(alignItemsOp(path, value))}
        />
      )}
      {layout.mode === 'row' && layout.children.length > 0 ? (
        <RatioRow
          slots={layout.children}
          onCommit={(childPath, raw) => dispatch(ratioOp(childPath, raw))}
        />
      ) : null}
      {layout.mode !== 'grid' ? (
        <button
          type="button"
          className={`${BTN_SM} flex items-center gap-1`}
          onClick={() => dispatch(addSlotOp(controller.read, path, t('insert.defaultText')))}
        >
          <IconPlus size={12} />
          {t('panel.layout.addSlot')}
        </button>
      ) : null}
    </div>
  );
}
