// The catalog-driven field section: one control per catalog field the host
// lists, chosen by the field's kind (`widgetFor`), laid out in the
// `FIELD_GROUPS` blocks with short controls two to a row. It reads the edited
// object's own keys (`values`) and reports each change as a `FieldEdit`; it
// never writes, and no key name decides anything here.
//
// A widget draws a display, never the wire value; the section encodes the
// display the author leaves and reports it only when it moves the value: a
// refused entry, a pick of the current option and a blur over the same display
// (`12.0` over `12`, `12` over the number 12) report nothing. A value its
// control cannot show (`shows`) is drawn on the read-only row and never
// reported, so it survives every edit made around it; a key with no control
// and no value draws nothing.

import type { CatalogField } from '@shojiku/designer-core';
import { useI18n } from '../../i18n/context';
import { FIELD_LABEL } from '../../ui/chrome';
import { record } from '../itemView';
import { type FieldEdit, type FieldValues, isSet, sameValue, valueAt } from './fieldEdit';
import { blocksOf, rowsOf } from './fieldGroups';
import { ReadOnlyRow } from './ReadOnlyRow';
import { editedField, shows, widgetFor } from './widgets';
import type { SchemaContext, Shown, Widget } from './widgetTypes';

export interface SchemaFieldsProps {
  /** The fields to list, in catalog order — already narrowed by the host to
   * the keys it has no control of its own for, and to its capabilities. */
  readonly fields: readonly CatalogField[];
  readonly values: FieldValues;
  readonly context: SchemaContext;
  readonly onEdit: (edit: FieldEdit) => void;
}

/** One field as drawn: its control, or `undefined` for the read-only row. */
interface Placed {
  /** The field as its control edits it (`editedField`). */
  readonly field: CatalogField;
  readonly widget: Widget | undefined;
  /** The object's own value; `undefined` when unset. */
  readonly value: unknown;
}

function place(catalogField: CatalogField, values: FieldValues): Placed | null {
  const field = editedField(catalogField);
  const set = isSet(values, field.key);
  const value = set ? valueAt(values, field.key) : undefined;
  const widget = widgetFor(catalogField.spec);
  if (widget === undefined || (set && !shows(widget, field, value))) {
    return set ? { field: catalogField, widget: undefined, value } : null;
  }
  return { field, widget, value };
}

function FieldRow({
  placed,
  context,
  onEdit,
}: {
  readonly placed: Placed;
  readonly context: SchemaContext;
  readonly onEdit: (edit: FieldEdit) => void;
}) {
  const { t } = useI18n();
  const { field, widget, value } = placed;
  const label = t(`panel.field.${field.key}`);
  if (widget === undefined) {
    // The border copy only for what it describes: a per-side map.
    const sides = field.spec.kind === 'sides' && record(value) !== undefined;
    return <ReadOnlyRow label={label} sides={sides} />;
  }
  const shown = value === undefined ? undefined : (widget.decode(value) as Shown);
  const onShown = (next: Shown) => {
    const wire = widget.encode(next, field);
    const moved =
      wire !== null &&
      !sameValue(value, wire) &&
      (wire === undefined || shown === undefined || widget.decode(wire) !== shown);
    if (moved) {
      onEdit({ keys: [field.key], value: wire });
    }
  };
  return (
    <widget.Control field={field} label={label} shown={shown} context={context} onShown={onShown} />
  );
}

export function SchemaFields({ fields, values, context, onEdit }: SchemaFieldsProps) {
  const { t } = useI18n();
  const placed = fields.flatMap((field) => place(field, values) ?? []);
  const short = (item: Placed) => item.widget?.short === true;
  return (
    <div className="flex flex-col gap-1">
      {blocksOf(placed, (item) => item.field.key).map((block) => (
        <div
          key={block.items[0].field.key}
          className={block.ruled ? 'border-0 border-t border-solid border-border pt-2' : ''}
        >
          {block.titleKey === undefined ? null : (
            <span className={`${FIELD_LABEL} font-semibold`}>{t(block.titleKey)}</span>
          )}
          {rowsOf(block.items, short).map((row) => (
            <div
              key={row[0].field.key}
              className={row.length === 2 ? 'grid grid-cols-2 gap-x-3.5' : ''}
            >
              {row.map((item) => (
                <FieldRow key={item.field.key} placed={item} context={context} onEdit={onEdit} />
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
