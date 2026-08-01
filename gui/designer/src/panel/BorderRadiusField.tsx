// The corner-rounding field. It is the one border control whose value is an
// authored LENGTH rather than a pen state, so it commits through `radiusOps`
// (which preserves the authored unit) and steps only when the current text is
// something a step can safely rewrite.

import type { Op } from '@shojiku/designer-core';
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
    <div className="flex items-start gap-3 border-border border-t pt-2">
      {/* Wider than the pen's width field: this one carries a unit badge
          AND realistic values run to `10.5` / `50%`, which clip at the
          w-24 the badge-less fields use. */}
      <div className="w-32">
        <StepperField
          // Keyed by the value so undo / a selection change reseeds the
          // field, while a sibling commit leaves in-progress typing alone.
          key={radius.effective}
          label={t('border.radius')}
          value={radius.effective}
          unit="pt"
          placeholder="0"
          canStep={isSteppable(radius.effective)}
          onCommit={(next) => dispatch(radiusOps(path, radius, next))}
          onStep={(dir) => dispatch(radiusOps(path, radius, stepRadius(radius.effective, dir)))}
        />
      </div>
      <p className="m-0 flex-1 text-sm text-muted">{t('border.radiusHint')}</p>
    </div>
  );
}
