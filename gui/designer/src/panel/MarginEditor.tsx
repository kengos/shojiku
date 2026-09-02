// The page-margin editor (a sub-surface of PageSetup): a mode select (uniform /
// per-side) plus the value inputs for the chosen mode, editing the template's
// `page.margin`. A live view — it re-reads `controller.read('page')` each render
// and every control dispatches a named `designer-core` op batch (AI parity). The
// mode is wire-derived (a bare number = uniform, a `{ top… }` map = per-side),
// mirroring the size named/custom split. Every input goes through a shared field
// primitive, so each is uncontrolled and keyed by its own value plus a reseed
// nonce — it reseeds on its own external change without a body-wide remount
// dropping an in-progress sibling entry (the property-panel remount fix).

import type { Op } from '@shojiku/designer-core';
import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { INPUT } from '../ui/chrome';
import { Field, TextField } from './fields';
import {
  canStepUniformMargin,
  enterPerSideOps,
  enterUniformOps,
  MARGIN_SIDES,
  type MarginMode,
  perSideOp,
  readMarginView,
  stepUniformMarginOp,
  uniformMarginOp,
} from './marginModel';
import { StepperField } from './StepperField';

export interface MarginEditorProps {
  readonly controller: EditorController;
}

export function MarginEditor({ controller }: MarginEditorProps) {
  const { t } = useI18n();
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
        // The all-sides form is a bare pt number, so the unit is always implicit
        // and the badge unconditional — and this field gets NO unit hint. It is
        // the WIRE that refuses `25mm` here (`uniformMarginOp` takes a bare
        // numeral only, and a unit under `page.margin` is an engine parse error),
        // so inviting one would be a lie. The per-side fields below are carried
        // verbatim and do take the invitation. The ▲▼ step by a point and go back
        // through the same builder the typed value does, so they cannot reach a
        // negative margin the keyboard is refused.
        <StepperField
          label={t('pageSetup.marginAll')}
          value={view.uniform}
          unit="pt"
          canStep={canStepUniformMargin(view.uniform)}
          onCommit={(value) => dispatch(uniformMarginOp(value))}
          onStep={(dir) => dispatch(stepUniformMarginOp(view.uniform, dir))}
        />
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
              unitHint={t('stepper.unitHint')}
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
