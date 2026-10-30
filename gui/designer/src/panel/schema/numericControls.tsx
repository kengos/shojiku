// The ▲▼ widgets: a length (pt badge, other units allowed), a number, and a
// fraction shown as a percentage (the decoration tab's opacity rule: 0.4 reads
// 「40」 and a typed 40 authors 0.4). All three are the panel's `StepperField`
// over the shown text; what differs is the codec between that text and the
// wire.

import { useI18n } from '../../i18n/context';
import { StepperField } from '../StepperField';
import { fractionFromPercent, opacityPercent, steppedOpacity } from '../textLookOps';
import { lengthEntry, numberEntry, steppedMeasure } from './entries';
import { scalarText } from './fieldEdit';
import { placeholderOf, type SpecOf } from './scalarControls';
import type { Widget, WidgetProps } from './widgetTypes';

/** A length or a number, stepped by one and held to the catalog's bounds; an
 * unset field steps from the initial value it shows as its placeholder. */
function MeasureControl({ field, label, shown = '', context, onShown }: WidgetProps) {
  const { t } = useI18n();
  const length = field.spec.kind === 'length';
  const { bounds } = field.spec as SpecOf<'length' | 'number'>;
  const text = shown as string;
  const placeholder = placeholderOf(field, context);
  const base = text === '' ? (placeholder ?? '') : text;
  return (
    <StepperField
      label={label}
      value={text}
      placeholder={placeholder}
      unit={length ? 'pt' : undefined}
      unitHint={length ? t('stepper.unitHint') : undefined}
      canStep={
        steppedMeasure(base, 1, bounds) !== null || steppedMeasure(base, -1, bounds) !== null
      }
      onCommit={onShown}
      onStep={(dir) => {
        const next = steppedMeasure(base, dir, bounds);
        if (next !== null) {
          onShown(String(next));
        }
      }}
    />
  );
}

/** A 0–1 fraction shown and typed as 0–100 %. */
function PercentControl({ field, label, shown = '', context, onShown }: WidgetProps) {
  const text = shown as string;
  const initial = placeholderOf(field, context);
  return (
    <StepperField
      label={label}
      value={text}
      placeholder={initial === undefined ? undefined : opacityPercent(initial)}
      unit="%"
      canStep={steppedOpacity(text, 1) !== null || steppedOpacity(text, -1) !== null}
      onCommit={onShown}
      onStep={(dir) => {
        const next = steppedOpacity(text, dir);
        if (next !== null) {
          onShown(next);
        }
      }}
    />
  );
}

/** The input's text; a typed entry is held to the catalog's bounds, and a
 * value outside them is a display the field would refuse to author. */
export const MEASURE: Widget = {
  short: true,
  decode: scalarText,
  encode: (shown, field) => {
    const { bounds } = field.spec as SpecOf<'length' | 'number'>;
    const text = shown as string;
    return field.spec.kind === 'length' ? lengthEntry(text, bounds) : numberEntry(text, bounds);
  },
  Control: MeasureControl,
};

/** The fraction as a percentage; a value the conversion leaves verbatim
 * (`1e-7`, `'40%'`) or clamps (`2`) does not survive the round trip. */
export const PERCENT: Widget = {
  short: true,
  decode: (value) => {
    const text = scalarText(value);
    return text === null ? null : opacityPercent(text);
  },
  encode: (shown) => fractionFromPercent(shown as string),
  Control: PercentControl,
};
