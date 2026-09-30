// The item's paint alpha as a percentage — `opacity: 0.4` reads 「40%」. The
// field shows a CONVERTED view of the wire, so it never writes back what it
// merely displays: `opacityOp` refuses a commit that would author the value the
// item already carries, and the stepper's own changed-guard skips a
// tab-through. Not inherited: a named style is the only other place a value can
// come from, and the origin line says so.

import type { ReactNode } from 'react';
import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import type { CascadeContext } from '../toolbar/cascade';
import { effectiveValueIn } from '../toolbar/effective';
import { applyPanelOp } from './model';
import { type DefaultsSection, OriginBadge } from './OriginBadge';
import { StepperField } from './StepperField';
import { opacityOp, opacityPercent, opacityStepOp, steppedOpacity } from './textLookOps';

export interface OpacityFieldProps {
  readonly path: string;
  readonly controller: EditorController;
  readonly ctx: CascadeContext;
  /** The sentence behind the field's `?` — what the alpha reaches on this type. */
  readonly help?: ReactNode;
  readonly onNavigate?: (section: DefaultsSection) => void;
}

export function OpacityField({ path, controller, ctx, help, onNavigate }: OpacityFieldProps) {
  const { t } = useI18n();
  const effective = effectiveValueIn(ctx, 'opacity');
  const shown = opacityPercent(effective.own);
  return (
    <div>
      <StepperField
        label={t('panel.field.opacity')}
        value={shown}
        placeholder="100"
        unit="%"
        help={help}
        canStep={steppedOpacity(shown, 1) !== null || steppedOpacity(shown, -1) !== null}
        onCommit={(v) => applyPanelOp(controller, opacityOp(path, effective.own, v))}
        onStep={(dir) => applyPanelOp(controller, opacityStepOp(path, effective.own, shown, dir))}
      />
      <OriginBadge
        effective={{ ...effective, value: `${opacityPercent(effective.value)}%` }}
        onNavigate={onNavigate}
      />
    </div>
  );
}
