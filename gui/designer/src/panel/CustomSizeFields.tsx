// The custom page-size cluster: the two dimension numerals and the unit they
// share, shown only while `page.size` is a `{ w, h }` map. Split out of
// `PageSetup` because it carries its own commit discipline rather than being
// three more controls in the form.
//
// Uncontrolled number inputs commit on blur and are keyed by their own value
// plus a refusal nonce, so each reseeds when THAT value changes (an undo, a
// size switch, a unit re-expression) AND when its own commit is refused —
// without a body-wide remount dropping an in-progress sibling.

import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { INPUT } from '../ui/chrome';
import { Field } from './fields';
import { applyPanelOp } from './model';
import type { CustomDims } from './pageSetupModel';
import { customDimOp, customUnitOps } from './pageSetupOps';
import { SIZE_UNITS, type SizeUnit } from './pageSizes';
import { useReseedKey } from './useReseedKey';

export interface CustomSizeFieldsProps {
  readonly controller: EditorController;
  readonly custom: CustomDims;
}

export function CustomSizeFields({ controller, custom }: CustomSizeFieldsProps) {
  const { t } = useI18n();
  const [wKey, reseedW] = useReseedKey(custom.w);
  const [hKey, reseedH] = useReseedKey(custom.h);
  return (
    <div className="flex gap-2">
      <Field label={t('pageSetup.width')}>
        <input
          key={wKey}
          type="number"
          className={INPUT}
          min="0"
          step="any"
          defaultValue={custom.w}
          // Commit only a CHANGED value: the displayed numeral can be a
          // unit-converted view of the wire (a mixed-unit authored size),
          // so an unconditional blur-through write would rewrite the wire
          // form the user never touched.
          onBlur={(event) => {
            const typed = event.currentTarget.value;
            if (typed !== custom.w) {
              applyPanelOp(controller, customDimOp('w', typed, custom.unit));
              reseedW();
            }
          }}
        />
      </Field>
      <Field label={t('pageSetup.height')}>
        <input
          key={hKey}
          type="number"
          className={INPUT}
          min="0"
          step="any"
          defaultValue={custom.h}
          onBlur={(event) => {
            const typed = event.currentTarget.value;
            if (typed !== custom.h) {
              applyPanelOp(controller, customDimOp('h', typed, custom.unit));
              reseedH();
            }
          }}
        />
      </Field>
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
    </div>
  );
}
