// The decoration tab's FIELD widgets: the per-key typography row set (text items
// only) and the labeled colour swatch the fill/text-colour cluster renders.
// `StyleSection.tsx` beside this file composes them with the border editor, the
// line stroke editor and the row-condition rules.
//
// Every field carries an `OriginBadge` — the cascade-effective value plus where
// it came from — so an unset control still says what the item renders at.

import type { Op } from '@shojiku/designer-core';
import { readLength } from '../canvas/lengths';
import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import type { cascadeContext } from '../toolbar/cascade';
import { effectiveValueIn } from '../toolbar/effective';
import { ColorSwatchPicker } from '../ui/ColorSwatchPicker';
import { FIELD_LABEL, PANEL_SWATCH_TRIGGER } from '../ui/chrome';
import { ComboField, SelectField } from './choiceFields';
import { TextField } from './fields';
import { applyPanelOp, lengthOp, numberOp, plainTextOp, stepValueOp } from './model';
import { type DefaultsSection, OriginBadge } from './OriginBadge';
import { StepperField } from './StepperField';
import { STYLE_FIELDS } from './styleFieldSpecs';
import { styleOptionLabel } from './styleLabels';

/** The decoration tab's typography fields (text only) — the box-decoration fields
 * (`color` text glyph color, `backgroundColor` fill) are swatch pickers,
 * not free-text inputs. */
const TEXT_STYLE_FIELDS = STYLE_FIELDS.filter(
  (spec) => spec.key !== 'color' && spec.key !== 'backgroundColor',
);

/** Stepper increments. A font SIZE steps by 1pt (a grid jump is far too coarse
 * for type); a plain-number ratio (lineHeight) steps by 0.1. */
const FONT_SIZE_STEP_PT = 1;
const NUMBER_STEP = 0.1;

/** One panel color row (text glyph color or box fill): a labeled swatch picker
 * over the cascade-effective color, with an origin badge. No hand-typed hex. */
export function PanelColorField({
  label,
  styleKey,
  ctx,
  path,
  controller,
  onNavigate,
}: {
  readonly label: string;
  readonly styleKey: string;
  readonly ctx: ReturnType<typeof cascadeContext>;
  readonly path: string;
  readonly controller: EditorController;
  readonly onNavigate?: (section: DefaultsSection) => void;
}) {
  const { t } = useI18n();
  const effective = effectiveValueIn(ctx, styleKey);
  return (
    <div className="mb-2">
      <span className={FIELD_LABEL}>{label}</span>
      <ColorSwatchPicker
        label={label}
        value={effective.value}
        onCommit={(v) => controller.apply(plainTextOp(path, ['style', styleKey], v))}
        triggerClassName={PANEL_SWATCH_TRIGGER}
        customLabel={t('toolbar.color.custom')}
        clearLabel={t('toolbar.color.clear')}
      />
      <OriginBadge effective={effective} onNavigate={onNavigate} />
    </div>
  );
}

/** The text item's typography rows, one per `TEXT_STYLE_FIELDS` spec: a select
 * for an enum, the fontFamily combo when the host supplies families, a ▲▼
 * stepper for a length/number, else a plain field — each with its origin badge. */
export function TypographyFields({
  controller,
  path,
  style,
  fontFamilies,
  ctx,
  onNavigate,
}: {
  readonly controller: EditorController;
  readonly path: string;
  readonly style: Readonly<Record<string, string>>;
  readonly fontFamilies: readonly string[];
  readonly ctx: ReturnType<typeof cascadeContext>;
  readonly onNavigate?: (section: DefaultsSection) => void;
}) {
  const { t } = useI18n();
  const dispatch = (op: Op | null) => applyPanelOp(controller, op);
  return (
    <>
      {TEXT_STYLE_FIELDS.map((spec) => {
        const keys = ['style', spec.key];
        const value = style[spec.key];
        const effective = effectiveValueIn(ctx, spec.key);
        const badge = <OriginBadge effective={effective} onNavigate={onNavigate} />;
        if (spec.kind === 'select') {
          return (
            <div key={spec.key}>
              <SelectField
                label={t(spec.labelKey)}
                value={value}
                options={spec.options}
                noneLabel={t('panel.field.formatNone')}
                optionLabel={(option) => styleOptionLabel(t, spec.key, option)}
                onCommit={(v) => dispatch(plainTextOp(path, keys, v))}
              />
              {badge}
            </div>
          );
        }
        if (spec.key === 'fontFamily' && fontFamilies.length > 0) {
          return (
            <div key={spec.key}>
              <ComboField
                label={t(spec.labelKey)}
                value={value}
                options={fontFamilies}
                listId="sj-font-family-list"
                onCommit={(v) => dispatch(plainTextOp(path, keys, v))}
              />
              {badge}
            </div>
          );
        }
        if (spec.kind === 'length' || spec.kind === 'number') {
          // Capture the narrowed kind in a const — control-flow narrowing
          // does not carry into the deferred onStep/onCommit closures.
          const kind = spec.kind;
          const step = kind === 'number' ? NUMBER_STEP : FONT_SIZE_STEP_PT;
          return (
            <div key={spec.key}>
              <StepperField
                label={t(spec.labelKey)}
                value={value}
                canStep={readLength(value) !== null}
                unit={kind === 'number' ? undefined : 'pt'}
                unitHint={t('stepper.unitHint')}
                onCommit={(v) =>
                  dispatch(kind === 'number' ? numberOp(path, keys, v) : lengthOp(path, keys, v))
                }
                onStep={(dir) => dispatch(stepValueOp(path, keys, value, dir, step, kind))}
              />
              {badge}
            </div>
          );
        }
        return (
          <div key={spec.key}>
            <TextField
              label={t(spec.labelKey)}
              value={value}
              onCommit={(v) => dispatch(plainTextOp(path, keys, v))}
            />
            {badge}
          </div>
        );
      })}
    </>
  );
}
