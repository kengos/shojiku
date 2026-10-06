// A grid's spacing and fill order: one gap per axis (`box.columnGap` /
// `box.rowGap`), each showing the both-axes `box.gap` as its placeholder because
// that is what the engine uses while the axis key is absent, and the order the
// cells fill in (`box.direction` — in a grid it is the FILL order, row-major by
// default, not a main axis). The single 間隔 field a row or a stack shows is
// replaced by these two in a grid. Ingress is the container gap's own rule
// (`gapOp`), one per key.

import type { Op } from '@shojiku/designer-core';
import { readLength } from '../canvas/lengths';
import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { FIELD_LABEL } from '../ui/chrome';
import { Segmented } from '../ui/Segmented';
import { display } from './itemView';
import { type GapKey, gapOp, gapStepOp } from './layoutOps';
import { applyPanelOp } from './model';
import { StepperField } from './StepperField';

const GAP_STEP_PT = 1;

/** The fill-order pick: the default `row` removes the key (minimal wire). */
export function gridFillOrderOp(path: string, order: 'row' | 'column'): Op {
  return order === 'row'
    ? { op: 'removeKey', path, keys: ['box', 'direction'] }
    : { op: 'setScalar', path, keys: ['box', 'direction'], value: 'column' };
}

export function GridGapFields({
  controller,
  path,
  box,
}: {
  readonly controller: EditorController;
  readonly path: string;
  /** The grid container's authored `box`. */
  readonly box: Readonly<Record<string, unknown>>;
}) {
  const { t } = useI18n();
  const dispatch = (op: Op | null) => applyPanelOp(controller, op);
  const shared = display(box.gap);
  const field = (key: Exclude<GapKey, 'gap'>, label: string) => {
    const value = display(box[key]);
    // A step starts from what the engine uses now: the axis value, else `gap`.
    const base = value.trim() === '' ? shared : value;
    return (
      <StepperField
        label={label}
        value={value}
        placeholder={shared === '' ? '0' : shared}
        unit="pt"
        unitHint={t('stepper.unitHint')}
        canStep={readLength(base.trim() === '' ? '0' : base) !== null}
        onCommit={(raw) => dispatch(gapOp(path, raw, key))}
        onStep={(dir) => dispatch(gapStepOp(path, base, dir, GAP_STEP_PT, key))}
      />
    );
  };
  const order = box.direction === 'column' ? 'column' : 'row';
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {field('columnGap', t('panel.layout.columnGap'))}
        {field('rowGap', t('panel.layout.rowGap'))}
      </div>
      <span className={FIELD_LABEL}>{t('panel.layout.fill')}</span>
      <Segmented
        ariaLabel={t('panel.layout.fill')}
        value={order}
        options={[
          { value: 'row', label: t('panel.layout.fill.row') },
          { value: 'column', label: t('panel.layout.fill.column') },
        ]}
        onChange={(value) => dispatch(gridFillOrderOp(path, value === 'column' ? 'column' : 'row'))}
      />
    </>
  );
}
