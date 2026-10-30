// The editors for catalog types a single control cannot show, keyed by the
// type's `$defs` name — never by a style key, so the same editor serves the
// type wherever the catalog uses it. Each is VALUE-IN / VALUE-OUT: it reads
// the value it is handed and reports the value to author, with no controller
// of its own, because one section serves the named-style form's draft and the
// live surfaces alike.
//
// This map is also the `composites` argument `surfaceFields` takes: a `$ref`
// it names reads as a `composite` field and is routed back here.

import { useI18n } from '../../i18n/context';
import { type Decoration, decorationOf } from '../../text/spanRuns';
import { FIELD_LABEL } from '../../ui/chrome';
import { SelectField } from '../choiceFields';
import { DecorationBoxes } from '../DecorationBoxes';
import { hasCapability } from '../itemPanelProps';
import { styleOptionLabel } from '../styleLabels';
import { withAuthored } from '../TextLookFields';
import { toggledDecoration } from '../textLookOps';
import { combineToken, combineValue, typesettingOptions } from '../typesettingModel';
import { noneLabelOf } from './scalarControls';
import type { Shown, Widget, WidgetProps } from './widgetTypes';

/** The capability under which the engine takes both lines at once; without
 * it ticking one box clears the other (`toggledDecoration`, as on the
 * decoration tab). */
const COMBINED_DECORATION = 'style.textDecoration.combined';

/** `TextDecoration`: an underline box and a strikethrough box over the one
 * wire value. Either order of the two-line value reads as both; clearing both
 * removes the key. */
function TextDecorationControl({ label, shown = 'none', context, onShown }: WidgetProps) {
  const current = shown as Decoration;
  const combined = hasCapability(context.capabilities, COMBINED_DECORATION);
  return (
    <fieldset className="mb-2 block border-0 p-0" aria-label={label}>
      <legend className={FIELD_LABEL}>{label}</legend>
      <DecorationBoxes
        current={current}
        onToggle={(line) => onShown(toggledDecoration(current, line, combined))}
      />
    </fieldset>
  );
}

/** `TextCombineUpright`: the tate-chu-yoko select over the token codec the
 * typesetting section uses (`{ digits: N }` is the `digitsN` row; a shape the
 * engine cannot parse is its own row, so the unset row can remove it). */
function TextCombineUprightControl({ field, label, shown = '', context, onShown }: WidgetProps) {
  const { t } = useI18n();
  const token = shown as string;
  return (
    <SelectField
      label={label}
      value={token}
      options={withAuthored(typesettingOptions('textCombineUpright', context.capabilities), token)}
      noneLabel={noneLabelOf(t, field, context)}
      optionLabel={(option) => styleOptionLabel(t, field.key, option)}
      onCommit={onShown}
    />
  );
}

export const COMPOSITES: ReadonlyMap<string, Widget> = new Map([
  [
    'TextDecoration',
    {
      short: false,
      // A spelling `decorationOf` cannot read (`overline`) draws as no line,
      // which is also how `none` and unset draw: none of them can be shown.
      decode: (value: unknown) => (typeof value === 'string' ? decorationOf(value) : null),
      encode: (shown: Shown) => (shown === 'none' ? undefined : shown),
      Control: TextDecorationControl,
    },
  ],
  [
    'TextCombineUpright',
    {
      short: true,
      decode: combineToken,
      encode: (shown: Shown) => (shown === '' ? undefined : combineValue(shown as string)),
      Control: TextCombineUprightControl,
    },
  ],
]);
