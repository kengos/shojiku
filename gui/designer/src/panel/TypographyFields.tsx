// The decoration tab's typography rows (text items, and a char_grid's subset):
// one row per typography key — a select for an enum, the family combo, a ▲▼
// stepper for a length or number — each with its `OriginBadge`. Split from
// `StyleTabFields`, which keeps the colour swatch row.

import type { Op } from '@shojiku/designer-core';
import { readLength } from '../canvas/lengths';
import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import type { cascadeContext } from '../toolbar/cascade';
import { effectiveValueIn } from '../toolbar/effective';
import { ComboField, SelectField } from './choiceFields';
import { TextField } from './fields';
import { applyPanelOp, lengthOp, numberOp, plainTextOp, stepValueOp } from './model';
import { type DefaultsSection, OriginBadge } from './OriginBadge';
import { StepperField } from './StepperField';
import { STYLE_FIELDS } from './styleFieldSpecs';
import { styleOptionLabel, type Translate } from './styleLabels';
import { withAuthored } from './TextLookFields';

/** The decoration tab's typography fields — the box-decoration fields
 * (`color` text glyph color, `backgroundColor` fill) are swatch pickers,
 * not free-text inputs. */
const TEXT_STYLE_FIELDS = STYLE_FIELDS.filter(
  (spec) => spec.key !== 'color' && spec.key !== 'backgroundColor',
);

/** Stepper increments. A font SIZE steps by 1pt (a grid jump is far too coarse
 * for type); a plain-number ratio (lineHeight) steps by 0.1. */
const FONT_SIZE_STEP_PT = 1;
const NUMBER_STEP = 0.1;

/** The per-row reads a surface overrides: the cascade context a row resolves
 * over, and how a select row names its options. */
export interface TypographyRows {
  readonly contextFor: (key: string) => ReturnType<typeof cascadeContext>;
  readonly optionLabel: (t: Translate, field: string, option: string) => string;
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
  only,
  rows,
}: {
  readonly controller: EditorController;
  readonly path: string;
  readonly style: Readonly<Record<string, string>>;
  readonly fontFamilies: readonly string[];
  readonly ctx: ReturnType<typeof cascadeContext>;
  readonly onNavigate?: (section: DefaultsSection) => void;
  /** Restrict the rows to these keys (a `char_grid`'s glyph subset); absent =
   * every typography row. */
  readonly only?: readonly string[];
  /** How a surface whose rows do not all follow the item cascade reads them
   * (a `char_grid`); absent = every row over `ctx`, labelled as horizontal. */
  readonly rows?: TypographyRows;
}) {
  const { t } = useI18n();
  const dispatch = (op: Op | null) => applyPanelOp(controller, op);
  const contextFor = rows?.contextFor ?? (() => ctx);
  const label = rows?.optionLabel ?? styleOptionLabel;
  const specs =
    only === undefined ? TEXT_STYLE_FIELDS : TEXT_STYLE_FIELDS.filter((s) => only.includes(s.key));
  return (
    <>
      {specs.map((spec) => {
        const keys = ['style', spec.key];
        const value = style[spec.key];
        const effective = effectiveValueIn(contextFor(spec.key), spec.key);
        const badge = <OriginBadge effective={effective} onNavigate={onNavigate} />;
        if (spec.kind === 'select') {
          // An enum's hint names the value in the same words as its options.
          const named = (
            <OriginBadge
              effective={effective}
              onNavigate={onNavigate}
              valueLabel={(v) => label(t, spec.key, v)}
            />
          );
          return (
            <div key={spec.key}>
              <SelectField
                label={t(spec.labelKey)}
                value={value}
                options={withAuthored(spec.options, value)}
                noneLabel={t('panel.field.formatNone')}
                optionLabel={(option) => label(t, spec.key, option)}
                onCommit={(v) => dispatch(plainTextOp(path, keys, v))}
              />
              {named}
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
