// The child-layout shell for a container: the arrangement segment (side by side /
// stacked / grid) every mode shows, the gap stepper, then the per-mode cluster —
// column/row steppers for a grid (`GridSteppers`), the distribution dropdown
// (`JustifySelect`) where the arrangement has leftover space to share, the
// alignment row (`AlignRow`, its words following the cross axis), and for a row or
// a stack the ratio inputs (`RatioRow`), a row adding the split-by-ratio checkbox
// (`BasisCheck`). The add-slot button is for a non-grid container (a grid's
// structure is edited by its steppers). The parent-first wrapper that hosts these
// same controls for a child's parent is `ParentContainerCard`.
//
// Chrome vocabulary is the nontech-pm's everyday words (row/stack/grid, alignment) — never
// CSS jargon. Every edit dispatches named ops from the pure models (AI parity); a
// multi-key edit is one batch, so one undo reverts it.

import type { Op } from '@shojiku/designer-core';
import type { ReactNode } from 'react';
import { readLength } from '../canvas/lengths';
import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { BTN_SM } from '../ui/chrome';
import { IconLayoutColumn, IconLayoutGrid, IconLayoutRow, IconPlus } from '../ui/icons';
import { Segmented } from '../ui/Segmented';
import { AlignRow, BASELINE_CAPABILITY } from './AlignRow';
import { BASIS_CAPABILITY, BasisCheck } from './BasisCheck';
import { GridSteppers } from './GridSteppers';
import { hasCapability } from './itemPanelProps';
import { JustifySelect, offersJustify } from './JustifySelect';
import type { ContainerLayout, LayoutMode } from './layoutModel';
import { basisOps, modeSwitchOps } from './layoutModeOps';
import { addSlotOp, alignItemsOp, gapOp, gapStepOp, justifyContentOp, ratioOp } from './layoutOps';
import { applyPanelOp } from './model';
import { RatioRow } from './RatioRow';
import { StepperField } from './StepperField';

const GAP_STEP_PT = 1;

/** The engine capability that admits `box.type: grid`. */
export const GRID_CAPABILITY = 'box.grid';
/** The engine capabilities that admit `fr` and `auto` grid column tracks. */
export const FR_CAPABILITY = 'grid.fr';
export const AUTO_CAPABILITY = 'grid.auto';

export interface LayoutSectionProps {
  readonly controller: EditorController;
  /** The CONTAINER whose child layout these controls edit (the selected
   * container itself, or the selected item's parent in the card). */
  readonly path: string;
  readonly layout: ContainerLayout;
  /** The engine's capability keys; absent = the bundled engine (has them all). */
  readonly capabilities?: readonly string[];
}

/** Applies a multi-key edit as ONE batch (one undo step); a refused (`null`) or
 * empty batch authors nothing. */
function applyBatch(controller: EditorController, ops: Op[] | null) {
  if (ops !== null && ops.length > 0) {
    controller.applyAll(ops);
  }
}

/** The arrangement segment: each option carries the batch that switches to it,
 * and an option is disabled — with the reason as its tip — when the engine
 * cannot lay it out or the batch was refused. */
function ModeSegment({ controller, path, layout, capabilities }: LayoutSectionProps) {
  const { t } = useI18n();
  const gridSupported = hasCapability(capabilities, GRID_CAPABILITY);
  // A row keeps its look as a grid only through a column-track LIST (`fr`
  // shares and `auto` content widths); an engine without both gets the count.
  const options = {
    trackList:
      hasCapability(capabilities, FR_CAPABILITY) && hasCapability(capabilities, AUTO_CAPABILITY),
  };
  const option = (mode: LayoutMode, label: string, icon: ReactNode) => {
    const ops = modeSwitchOps(controller.read, path, mode, options);
    const unsupported = mode === 'grid' && !gridSupported;
    const tip = unsupported
      ? t('panel.layout.mode.gridUnsupported')
      : ops === null
        ? t('panel.layout.mode.refused')
        : undefined;
    return { value: mode, label, icon, tip, disabled: tip !== undefined };
  };
  return (
    <Segmented
      ariaLabel={t('panel.layout.mode')}
      value={layout.mode}
      options={[
        option('row', t('panel.layout.direction.row'), <IconLayoutRow size={15} />),
        option('column', t('panel.layout.direction.column'), <IconLayoutColumn size={15} />),
        option('grid', t('panel.layout.mode.grid'), <IconLayoutGrid size={15} />),
      ]}
      onChange={(value) =>
        applyBatch(controller, modeSwitchOps(controller.read, path, value as LayoutMode, options))
      }
    />
  );
}

export function LayoutSection(props: LayoutSectionProps) {
  const { controller, path, layout, capabilities } = props;
  const { t } = useI18n();
  const dispatch = (op: Op | null) => applyPanelOp(controller, op);
  const gapBase = layout.gap.trim() === '' ? '0' : layout.gap;
  const grid = layout.mode === 'grid';
  // Only the children the engine lays out by flex share a split — a positioned
  // child or a `line` gets no ratio input (a flex key on a line does not parse).
  const splitSlots = layout.children.filter((child) => child.flexItem);
  return (
    <div>
      <ModeSegment {...props} />
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
      {grid && layout.columns !== null ? (
        <GridSteppers
          controller={controller}
          path={path}
          columns={layout.columns}
          rows={Math.ceil(layout.children.length / layout.columns)}
        />
      ) : null}
      {offersJustify(layout) ? (
        <JustifySelect
          layout={layout}
          onPick={(value) => dispatch(justifyContentOp(path, value))}
        />
      ) : null}
      <AlignRow
        mode={layout.mode}
        alignItems={layout.alignItems}
        baseline={hasCapability(capabilities, BASELINE_CAPABILITY)}
        onPick={(value) => dispatch(alignItemsOp(path, value))}
      />
      {!grid && splitSlots.length > 0 ? (
        <RatioRow
          axis={layout.mode === 'row' ? 'row' : 'column'}
          slots={splitSlots}
          onCommit={(childPath, raw) => dispatch(ratioOp(childPath, raw))}
        />
      ) : null}
      {layout.mode === 'row' &&
      layout.children.length > 0 &&
      hasCapability(capabilities, BASIS_CAPABILITY) ? (
        <BasisCheck
          basis={layout.basis}
          onToggle={(on) => applyBatch(controller, basisOps(controller.read, path, on))}
        />
      ) : null}
      {!grid ? (
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
