// The widgets for the catalog kinds whose value is one scalar, each the
// panel's existing control for that kind — a select, a text box, the swatch
// picker, a checkbox, the data-key and format pickers — with the codec between
// the wire value and what the control draws.

import type { CatalogField, FieldSpec } from '@shojiku/designer-core';
import { useI18n } from '../../i18n/context';
import { isHexColor } from '../../ui/chipContrast';
import { SelectField } from '../choiceFields';
import { FieldPicker } from '../FieldPicker';
import { FormatPicker } from '../FormatPicker';
import { TextField } from '../fields';
import { PanelColorRow } from '../PanelColorRow';
import { styleOptionLabel, type Translate, unsetLabel } from '../styleLabels';
import { withAuthored } from '../TextLookFields';
import { textEntry } from './entries';
import { scalarText } from './fieldEdit';
import type { SchemaContext, Shown, Widget, WidgetProps } from './widgetTypes';

/** The spec of one kind. A control is only ever handed the kind the registry
 * routes to it, so the casts below name a fact, not a hope. */
export type SpecOf<K extends FieldSpec['kind']> = Extract<FieldSpec, { kind: K }>;

/** The text an unset input shows: the catalog's initial value where the
 * surface shows initials, nothing where it does not. */
export function placeholderOf(field: CatalogField, context: SchemaContext): string | undefined {
  return context.unset === 'initial' ? (scalarText(field.initial) ?? undefined) : undefined;
}

/** A select's unset row: 「未設定（…）」 naming the initial value, or
 * 「（既定）」 where the surface shows no initials. */
export function noneLabelOf(t: Translate, field: CatalogField, context: SchemaContext): string {
  return context.unset === 'initial'
    ? unsetLabel(t, field.key, placeholderOf(field, context))
    : t('panel.field.formatNone');
}

/** A typed or picked text: empty removes the key. */
const encodeText = (shown: Shown) => textEntry(shown as string);

/** A closed set: the wire spellings, localized, plus an authored value
 * outside them shown as its own spelling (`withAuthored`). */
function EnumControl({ field, label, shown = '', context, onShown }: WidgetProps) {
  const { t } = useI18n();
  const value = shown as string;
  return (
    <SelectField
      label={label}
      value={value}
      options={withAuthored((field.spec as SpecOf<'enum'>).values, value)}
      noneLabel={noneLabelOf(t, field, context)}
      optionLabel={(option) => styleOptionLabel(t, field.key, option)}
      onCommit={onShown}
    />
  );
}

/** Free text, committed on blur. */
function TextControl({ field, label, shown = '', context, onShown }: WidgetProps) {
  return (
    <TextField
      label={label}
      value={shown as string}
      placeholder={placeholderOf(field, context)}
      onCommit={onShown}
    />
  );
}

/** A colour from the swatch picker, named in words beside the chip. */
function ColorControl({ label, shown = '', onShown }: WidgetProps) {
  return <PanelColorRow label={label} value={shown as string} onCommit={onShown} />;
}

/** On or off. Unset shows the state the catalog's initial value stands for. */
function BooleanControl({ field, label, shown, onShown }: WidgetProps) {
  const checked = shown === undefined ? field.initial === true : shown === true;
  return (
    <label className="mb-2 flex items-center gap-1.5 text-sm text-text">
      <input
        type="checkbox"
        className="accent-accent"
        checked={checked}
        onChange={() => onShown(!checked)}
      />
      {label}
    </label>
  );
}

/** A name defined elsewhere: the data-key or format picker where the host
 * offers that kind's names, else typed as text. */
function RefControl(props: WidgetProps) {
  const { field, label, shown = '', context, onShown } = props;
  const ref = (field.spec as SpecOf<'ref'>).ref;
  const refs = context.refs ?? {};
  const dataKeys = ref === 'dataKey' ? refs.dataKey : undefined;
  const formats = ref === 'format' ? refs.format : undefined;
  if (dataKeys !== undefined) {
    return (
      <FieldPicker label={label} value={shown as string} options={dataKeys} onCommit={onShown} />
    );
  }
  if (formats !== undefined) {
    return (
      <FormatPicker label={label} value={shown as string} options={formats} onCommit={onShown} />
    );
  }
  return <TextControl {...props} />;
}

/** A string is its own option row; `''` is the unset row's display. */
export const ENUM: Widget = {
  short: true,
  decode: (value) => (typeof value === 'string' ? value : null),
  encode: encodeText,
  Control: EnumControl,
};
/** A string or a finite number, as the input shows it. */
export const TEXT: Widget = {
  short: false,
  decode: scalarText,
  encode: encodeText,
  Control: TextControl,
};
/** The same codec as text: every picker shows the value's text. */
export const REF: Widget = {
  short: false,
  decode: scalarText,
  encode: encodeText,
  Control: RefControl,
};
/** Only the `#rrggbb` the chip and its label can draw (`isHexColor`). */
export const COLOR: Widget = {
  short: true,
  decode: (value) => (typeof value === 'string' && isHexColor(value) ? value : null),
  encode: encodeText,
  Control: ColorControl,
};
/** A tick; the state the initial stands for is the unset display. */
export const BOOLEAN: Widget = {
  short: false,
  decode: (value) => (typeof value === 'boolean' ? value : null),
  encode: (shown, field) => (shown === (field.initial === true) ? undefined : shown),
  Control: BooleanControl,
};
