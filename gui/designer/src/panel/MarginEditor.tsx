// The page-margin editor (a sub-surface of PageSetup): a mode select (uniform /
// per-side) plus the value inputs for the chosen mode, editing the template's
// `page.margin`. A live view — it re-reads `controller.read('page')` each render
// and every control dispatches a named `designer-core` op batch (AI parity). The
// mode is wire-derived (a bare number = uniform, a `{ top… }` map = per-side),
// mirroring the size named/custom split. Inputs are uncontrolled + keyed by their
// own value, so each reseeds on its own external change without a body-wide
// remount dropping an in-progress sibling entry (the property-panel remount fix).

import type { Op } from '@shojiku/designer-core';
import { useId } from 'react';
import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { FIELD_LABEL, INPUT } from '../ui/chrome';
import { Field, TextField, UnitBadge } from './fields';
import {
  enterPerSideOps,
  enterUniformOps,
  MARGIN_SIDES,
  type MarginMode,
  perSideOp,
  readMarginView,
  uniformMarginOp,
} from './marginModel';

export interface MarginEditorProps {
  readonly controller: EditorController;
}

export function MarginEditor({ controller }: MarginEditorProps) {
  const { t } = useI18n();
  const uniformId = useId();
  const view = readMarginView(controller.read('page'));

  const dispatch = (ops: Op[] | null): void => {
    if (ops !== null) {
      controller.applyAll(ops);
    }
  };

  return (
    <div>
      <Field label={t('pageSetup.margin')}>
        <select
          className={INPUT}
          value={view.mode}
          onChange={(event) =>
            // The select offers only these two values, so the cast is total.
            controller.applyAll(
              (event.currentTarget.value as MarginMode) === 'perSide'
                ? enterPerSideOps(view)
                : enterUniformOps(view),
            )
          }
        >
          <option value="uniform">{t('pageSetup.marginUniform')}</option>
          <option value="perSide">{t('pageSetup.marginPerSide')}</option>
        </select>
      </Field>

      {view.mode === 'uniform' ? (
        // A NUMBER input can only hold a bare value, so the unit is always
        // implicit here — the badge is unconditional. Explicit htmlFor/id, not
        // the wrapping-label `Field`: the badge's text would otherwise fold
        // into the computed label (the all-sides label would otherwise read with a fused "pt").
        <span className="mb-2 block">
          <label htmlFor={uniformId} className={FIELD_LABEL}>
            {t('pageSetup.marginAll')}
          </label>
          <span className="relative flex min-w-0">
            <input
              key={view.uniform}
              id={uniformId}
              type="number"
              className={`${INPUT} w-full min-w-0 pr-9`}
              min="0"
              step="any"
              defaultValue={view.uniform}
              onBlur={(event) =>
                event.currentTarget.value === view.uniform
                  ? undefined
                  : dispatch(uniformMarginOp(event.currentTarget.value))
              }
            />
            <UnitBadge text="pt" />
          </span>
        </span>
      ) : (
        <div className="flex flex-wrap gap-2">
          {MARGIN_SIDES.map((side) => (
            // Per side the value is carried VERBATIM — a bare number is pt, a
            // `12mm` / `5%` string says its own unit — so the badge follows the
            // value rather than the field.
            <TextField
              key={side}
              label={t(`pageSetup.margin.${side}`)}
              value={view.sides[side]}
              unit="pt"
              onCommit={(value) =>
                value === view.sides[side] ? undefined : dispatch(perSideOp(view, side, value))
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
