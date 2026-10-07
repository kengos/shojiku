// A flowing body's own settings: the space between its stacked items (`gap` —
// `%` of the flow region's height allowed, the n-up gap rule) and the region it
// flows in (`box`, relative to the page margins; every field empty = the whole
// area inside the margins, which the line under the fields says).

import type { Op } from '@shojiku/designer-core';
import { readLength } from '../canvas/lengths';
import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { SECTION_TITLE } from '../ui/chrome';
import { regionOps } from './bodyRegion';
import { BoxAxisField } from './boxFields';
import { CARD_GAP_STEP_PT, cardGapStepOp } from './CardGapField';
import { BOX_AXES, display } from './itemView';
import { applyPanelOp } from './model';
import { readItem } from './placementModel';
import { relativeGapOp } from './repeatGrid';
import { StepperField } from './StepperField';

export function BodyRegionFields({
  controller,
  path,
}: {
  readonly controller: EditorController;
  readonly path: string;
}) {
  const { t } = useI18n();
  // Rendered only for a body `bodyMode` read as flowing, so the map is there.
  const node = readItem(controller.read, path) as Record<string, unknown>;
  const gap = display(node.gap);
  const box = (typeof node.box === 'object' && node.box !== null ? node.box : {}) as Record<
    string,
    unknown
  >;
  const dispatch = (op: Op | null) => applyPanelOp(controller, op);
  return (
    <>
      <StepperField
        label={t('panel.body.gap')}
        value={gap}
        placeholder="0"
        unit="pt"
        unitHint={t('stepper.unitHint')}
        canStep={readLength(gap.trim() === '' ? '0' : gap) !== null}
        onCommit={(raw) => dispatch(relativeGapOp(path, ['gap'], raw))}
        onStep={(dir) => dispatch(cardGapStepOp(path, gap, dir))}
      />
      <h3 className={`${SECTION_TITLE} mt-3`}>{t('panel.body.region')}</h3>
      <div className="grid grid-cols-2 gap-2">
        {BOX_AXES.map((axis) => (
          <BoxAxisField
            key={axis}
            label={t(`panel.box.${axis}`)}
            authored={display(box[axis])}
            seed={null}
            step={CARD_GAP_STEP_PT}
            axis={axis}
            path={path}
            controller={controller}
            emptyHint={axis === 'w' || axis === 'h' ? '100%' : undefined}
            complete={(op) => regionOps(controller.read, path, op)}
          />
        ))}
      </div>
      <p className="mt-1 mb-0 text-[11px] text-muted leading-relaxed">
        {t('panel.body.regionHint')}
      </p>
    </>
  );
}
