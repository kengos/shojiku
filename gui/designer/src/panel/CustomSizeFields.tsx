// The custom page-size cluster: the two dimension numerals and the unit they
// share, shown only while `page.size` is a `{ w, h }` map. Split out of
// `PageSetup` because it carries its own commit discipline rather than being
// three more controls in the form.
//
// The two numerals go through the shared `StepperField`, so they commit on blur,
// reseed from the document afterwards (a `composeDimension` that authors nothing
// does not leave the entry on screen), and carry the house ▲▼ — they used to be
// raw `<input type="number">`s, so the browser drew its own spinner on them
// instead. The unit lives in the select beside them, so the fields wear no unit
// badge.

import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { INPUT } from '../ui/chrome';
import { Field } from './fields';
import { applyPanelOp } from './model';
import type { CustomDims } from './pageSetupModel';
import { canStepDimension, customDimOp, customUnitOps, stepCustomDimOp } from './pageSetupOps';
import { SIZE_UNITS, type SizeUnit } from './pageSizes';
import { StepperField } from './StepperField';

export interface CustomSizeFieldsProps {
  readonly controller: EditorController;
  readonly custom: CustomDims;
}

export function CustomSizeFields({ controller, custom }: CustomSizeFieldsProps) {
  const { t } = useI18n();
  // One dimension's field. `StepperField` owns the changed-guard and the reseed
  // nonce, so the only thing left here is which key the two callbacks write.
  const dimension = (field: 'w' | 'h', label: string) => (
    <span className="min-w-0 flex-1">
      <StepperField
        label={label}
        value={custom[field]}
        canStep={canStepDimension(custom[field])}
        // The unit lives in the select beside these two, so `composeDimension`
        // takes a BARE numeral and refuses `12mm` outright — which is exactly
        // the case `StepperField` withholds `inputMode` for by default. Opting
        // in gives a touch keyboard its numeric pad back (these were plain
        // `<input type="number">` before the stepper absorbed them) and tells
        // assistive tech the field is numeric.
        inputMode="decimal"
        onCommit={(value) => applyPanelOp(controller, customDimOp(field, value, custom.unit))}
        onStep={(dir) => applyPanelOp(controller, stepCustomDimOp(field, custom, dir))}
      />
    </span>
  );
  // `items-start` because the three cells own their heights (`StepperField` and
  // `Field` both carry `mb-2`, but only the steppers grow with a ▲▼ column), and
  // the unit cell is `shrink-0` so the two numerals split whatever the select
  // leaves rather than being squeezed by it.
  return (
    <div className="flex items-start gap-2">
      {dimension('w', t('pageSetup.width'))}
      {dimension('h', t('pageSetup.height'))}
      <span className="shrink-0">
        <Field label={t('pageSetup.unit')}>
          <select
            className={INPUT}
            value={custom.unit}
            onChange={(event) =>
              controller.applyAll(
                // The select offers only the four units, so the cast is total.
                customUnitOps(custom, event.currentTarget.value as SizeUnit),
              )
            }
          >
            {SIZE_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </Field>
      </span>
    </div>
  );
}
