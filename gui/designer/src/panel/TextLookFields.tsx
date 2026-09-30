// The text-look controls that ride under the typography rows: letter spacing,
// the decoration lines (underline and strikethrough, `DecorationChecks`) and
// vertical alignment. Each
// is offered only on the types whose engine honours it (`styleSurfaces`), and
// only when the engine declares the key. Each shows its cascade-effective value
// with the shared origin line, like every typography row above it.

import type { Op } from '@shojiku/designer-core';
import { isRelativeLength, readLength } from '../canvas/lengths';
import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import type { CascadeContext } from '../toolbar/cascade';
import { effectiveValueIn } from '../toolbar/effective';
import { SelectField } from './choiceFields';
import { DecorationChecks } from './DecorationChecks';
import { hasCapability } from './itemPanelProps';
import { applyPanelOp, plainTextOp } from './model';
import { type DefaultsSection, OriginBadge } from './OriginBadge';
import { StepperField } from './StepperField';
import { styleOptionLabel } from './styleLabels';
import { DECORATION_LINE_TYPES, LETTER_SPACING_TYPES, VALIGN_TYPES } from './styleSurfaces';
import { letterSpacingOp, letterSpacingStepOp } from './textLookOps';

/** The wire's `VerticalAlign` (`engine/core/src/style/enums.rs`), in
 * declaration order. */
const VERTICAL_ALIGN_VALUES = ['top', 'middle', 'bottom'] as const;

/** A closed select's options plus the AUTHORED value when the list does not
 * carry it — a legal value from a newer engine or a hand edit must show as
 * itself, not as "not set" that the next pick silently overwrites. */
export function withAuthored(options: readonly string[], value: string): readonly string[] {
  return value === '' || options.includes(value) ? options : [...options, value];
}

export interface TextLookFieldsProps {
  readonly type: string;
  readonly path: string;
  readonly controller: EditorController;
  readonly ctx: CascadeContext;
  readonly capabilities?: readonly string[];
  readonly onNavigate?: (section: DefaultsSection) => void;
}

export function TextLookFields({
  type,
  path,
  controller,
  ctx,
  capabilities,
  onNavigate,
}: TextLookFieldsProps) {
  const { t } = useI18n();
  const dispatch = (op: Op | null) => applyPanelOp(controller, op);
  const select = (key: string, options: readonly string[]) => {
    const effective = effectiveValueIn(ctx, key);
    return (
      <div key={key}>
        <SelectField
          label={t(`panel.field.${key}`)}
          value={effective.own}
          options={withAuthored(options, effective.own)}
          noneLabel={t('panel.field.formatNone')}
          optionLabel={(option) => styleOptionLabel(t, key, option)}
          onCommit={(v) => dispatch(plainTextOp(path, ['style', key], v))}
        />
        <OriginBadge effective={effective} onNavigate={onNavigate} />
      </div>
    );
  };
  const spacing = effectiveValueIn(ctx, 'letterSpacing');
  const spacingShown = spacing.own;
  const spacingOffered =
    LETTER_SPACING_TYPES.has(type) && hasCapability(capabilities, 'style.letterSpacing');
  return (
    <>
      {spacingOffered ? (
        <div>
          <StepperField
            label={t('panel.field.letterSpacing')}
            value={spacingShown}
            placeholder="0"
            unit="pt"
            unitHint={t('panel.field.letterSpacing.units')}
            canStep={spacingShown === '' || readLength(spacingShown) !== null}
            stepHint={isRelativeLength(spacingShown) ? t('stepper.relativeUnit') : undefined}
            onCommit={(v) => dispatch(letterSpacingOp(path, spacing.own, v))}
            onStep={(dir) => dispatch(letterSpacingStepOp(path, spacing.own, spacingShown, dir))}
          />
          <OriginBadge effective={spacing} onNavigate={onNavigate} />
        </div>
      ) : null}
      {DECORATION_LINE_TYPES.has(type) && hasCapability(capabilities, 'style.textDecoration') ? (
        <DecorationChecks
          path={path}
          controller={controller}
          ctx={ctx}
          combined={hasCapability(capabilities, 'style.textDecoration.combined')}
          onNavigate={onNavigate}
        />
      ) : null}
      {VALIGN_TYPES.has(type) && hasCapability(capabilities, 'style.verticalAlign')
        ? select('verticalAlign', VERTICAL_ALIGN_VALUES)
        : null}
    </>
  );
}
