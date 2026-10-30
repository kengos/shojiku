// The widget registry: each catalog kind (`FieldSpec`) to the panel control
// that edits it. A `sides` key (one value, or a per-side map) takes its
// one-value arm's control; a `composite` takes the editor `COMPOSITES` holds
// for its type. A `map` or `opaque` key has no control here — a value it holds
// is shown on the read-only row.

import type { CatalogField, FieldSpec } from '@shojiku/designer-core';
import { COMPOSITES } from './composites';
import { MEASURE, PERCENT } from './numericControls';
import { BOOLEAN, COLOR, ENUM, REF, TEXT } from './scalarControls';
import type { Widget } from './widgetTypes';

/** The control for a kind; `undefined` where the section has none. */
export function widgetFor(spec: FieldSpec): Widget | undefined {
  switch (spec.kind) {
    case 'enum':
      return ENUM;
    case 'length':
    case 'number':
      return MEASURE;
    case 'percent':
      return PERCENT;
    case 'boolean':
      return BOOLEAN;
    case 'color':
      return COLOR;
    case 'ref':
      return REF;
    case 'text':
      return TEXT;
    case 'sides':
      return widgetFor(spec.scalar);
    case 'composite':
      return COMPOSITES.get(spec.name);
    case 'map':
    case 'opaque':
      return undefined;
  }
}

/** The field as its control edits it: a `sides` key's one-value arm. */
export function editedField(field: CatalogField): CatalogField {
  return field.spec.kind === 'sides' ? { ...field, spec: field.spec.scalar } : field;
}

/** Whether a widget can show a present value: it has a display, that display
 * is not the unset one, and authoring from it lands on the same display. */
export function shows(widget: Widget, field: CatalogField, value: unknown): boolean {
  const shown = widget.decode(value);
  if (shown === null) {
    return false;
  }
  const wire = widget.encode(shown, field);
  return wire !== undefined && wire !== null && widget.decode(wire) === shown;
}
