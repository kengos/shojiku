// What a palette drag CARRIES, and the bound item a completed drop inserts.
// Framework- and DOM-free; the Designer owns the pointer state machine and
// applies the one `insertItem` op a drop realizes (AI parity). Where the drop
// lands is `drag.ts`'s job.

import type { SnippetValue } from '@shojiku/designer-core';
import { defaultVariantFor, scaffoldFromGroup } from '../insert/scaffold';
import { scaffoldSnippet } from '../insert/scaffoldSnippet';
import { DOCUMENT_SCOPE } from '../panel/model';
import type { PaletteGroup } from './model';

/** The dragged field: what the palette hands the Designer at drag start.
 * All strings are definitions-derived (untrusted but display-capped); the
 * snippet composes them as plain scalars through designer-core's validated
 * `SnippetValue` path, so a hostile key stays inert data. */
export interface PaletteDragField {
  readonly key: string;
  /** The palette's display-type name (`string`, `date`, `image`, …). */
  readonly type: string;
  readonly label: string;
  /** The id of the ARRAY group whose rows carry this field, or `null` for a
   * document-scope field. A row-relative key resolves ONLY inside a cell whose
   * rows come from that same group — everywhere else the drop is refused. */
  readonly group: string | null;
}

/** What a palette drag carries: a document-scope field (drag-to-bind), or an
 * array GROUP heading (drag-to-scaffold — the drop inserts the group's
 * default presentation; the insert menu offers the full choice). */
export type PaletteDragPayload =
  | { readonly kind: 'field'; readonly field: PaletteDragField }
  | { readonly kind: 'group'; readonly group: PaletteGroup };

/** The bound item a completed palette drop inserts. `workshop` threads the
 * Designer's mode down to the field snippet (see [`boundSnippet`]);
 * `declarations` reports whether the engine understands `bindings:`, which
 * decides how a group's list scaffold names a charset-unsafe field. */
export function dropSnippet(
  payload: PaletteDragPayload,
  workshop = false,
  declarations = false,
  documentScoped = false,
): SnippetValue {
  if (payload.kind === 'field') {
    return boundSnippet(payload.field, workshop, documentScoped);
  }
  const spec = scaffoldFromGroup(payload.group);
  return scaffoldSnippet(spec, defaultVariantFor(spec), declarations);
}

/** The bound item a dropped field creates: an image field becomes an `image`
 * item (explicit box — images cannot auto-size from flow), anything else a
 * flow-auto-sized `text` item bound via `data.key` (the insert-menu snippet
 * precedent: engine-canonical keys, no redundant defaults). In workshop mode a
 * currency-typed field also carries `format: symbol` so the money display
 * shows its symbol from the first preview (engineer mode stays bare — the
 * declared `displayFormat` is the engineer's channel). */
export function boundSnippet(
  field: PaletteDragField,
  workshop = false,
  documentScoped = false,
): SnippetValue {
  // `scope` rides along ONLY where it changes the resolution — a document field
  // landing inside a row scope. The engine's `element` default is never
  // authored: an unset key already says it.
  const data: Record<string, SnippetValue> = documentScoped
    ? { key: field.key, scope: DOCUMENT_SCOPE }
    : { key: field.key };
  if (field.type === 'image') {
    return { type: 'image', data, box: { w: 120, h: 60 } };
  }
  if (workshop && field.type === 'currency') {
    return { type: 'text', data: { ...data, format: 'symbol' } };
  }
  return { type: 'text', data };
}
