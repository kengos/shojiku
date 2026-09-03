// The corner-rounding field. It is the one border control whose value is an
// authored LENGTH rather than a pen state, so it commits through `radiusOps`
// (which preserves the authored unit) and steps only when the current text is
// something a step can safely rewrite.

import type { Op } from '@shojiku/designer-core';
import { HelpHint } from '../help/HelpHint';
import { useI18n } from '../i18n/context';
import { radiusOps } from './borderRadius';
import type { RadiusView } from './borderTypes';
import { StepperField } from './StepperField';

/** Whether the ▲▼ steppers can act: a bare numeral, or an empty field (whose
 * unset meaning is the 0 its placeholder shows). A `50%` / `4mm` value stays
 * typeable but unsteppable — stepping must never rewrite the author's unit. */
function isSteppable(text: string): boolean {
  const trimmed = text.trim();
  return trimmed === '' || /^-?\d+(\.\d+)?$/.test(trimmed);
}

/** One stepper click on a bare-numeral radius, clamped at 0. An empty field
 * steps from 0 (its placeholder), so the first ▲ authors `1`. */
function stepRadius(text: string, dir: 1 | -1): string {
  const current = text.trim() === '' ? 0 : Number(text);
  const next = Math.max(0, Math.round((current + dir) * 10) / 10);
  return String(next);
}

export interface BorderRadiusFieldProps {
  readonly radius: RadiusView;
  readonly path: string;
  readonly dispatch: (ops: Op[]) => void;
}

export function BorderRadiusField({ radius, path, dispatch }: BorderRadiusFieldProps) {
  const { t } = useI18n();
  return (
    // The explanation is behind the `?`, not beside the input. As a paragraph it
    // was four wrapped lines against a `w-32` field, which left the sentence's
    // tail — the list of units this key accepts — orphaned under the control and
    // the control itself crammed into a third of the row. The field now takes
    // the full width its `pt` badge and its `10.5` / `50%` values want, and the
    // sentence is carried verbatim by the same affordance `BorderDiagram` uses
    // one section above — the BODY is the same `border.radiusHint` string, so
    // the wording is unchanged; only the popover's own title is new.
    <div className="border-border border-t pt-2">
      <StepperField
        // Keyed by the value so undo / a selection change reseeds the
        // field, while a sibling commit leaves in-progress typing alone.
        key={radius.effective}
        label={t('border.radius')}
        value={radius.effective}
        unit="pt"
        unitHint={t('stepper.unitHint')}
        placeholder="0"
        canStep={isSteppable(radius.effective)}
        help={
          <HelpHint
            // The trigger names the TOPIC, not the field: the field's own label
            // is one element away, so repeating it would give a by-name query
            // two matches and a screen reader the same words twice.
            label={t('help.borderRadius.title')}
            title={t('help.borderRadius.title')}
            body={t('border.radiusHint')}
          />
        }
        onCommit={(next) => dispatch(radiusOps(path, radius, next))}
        onStep={(dir) => dispatch(radiusOps(path, radius, stepRadius(radius.effective, dir)))}
      />
    </div>
  );
}
