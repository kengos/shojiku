// The shapes a catalog-driven field section is assembled from: what the host
// supplies once for the whole section (`SchemaContext`), and what one control
// is (`Widget`) — a kind's control and a composite editor have this one shape.

import type { CatalogField, SnippetValue } from '@shojiku/designer-core';
import type { ReactNode } from 'react';
import type { FormatOption } from '../formatModel';
import type { PickerOption } from '../pickerModel';

/** The pickers a reference field offers, by the `x-shojiku-ref` kind it
 * names. A kind with no options here is typed as plain text. */
export interface RefOptions {
  readonly dataKey?: readonly PickerOption[];
  readonly format?: readonly FormatOption[];
}

/** What the host knows about the surface, for every field in it. */
export interface SchemaContext {
  /** What an unset field shows. `blank`: nothing, and a select's unset row
   * reads 「（既定）」 — a named style is a fragment, so a value shown there
   * would read as "becomes this". `initial`: the catalog's initial value, as
   * a placeholder and in the unset row's 「未設定（…）」. */
  readonly unset: 'blank' | 'initial';
  /** The engine's capability keys; `undefined` = all (see `hasCapability`). */
  readonly capabilities?: readonly string[];
  readonly refs?: RefOptions;
}

/** What a control draws: an input's text, a select's option, a decoration, a
 * tick. Always a primitive, so two displays compare with `===`. */
export type Shown = string | boolean;

/** What one control is handed: the display of the object's own value
 * (`undefined` when unset), and where to report the display the author
 * left it in. The section encodes that display and writes only a change. */
export interface WidgetProps {
  readonly field: CatalogField;
  readonly label: string;
  readonly shown: Shown | undefined;
  readonly context: SchemaContext;
  readonly onShown: (next: Shown) => void;
}

/** A control and the codec between the wire value and what it draws — the
 * widget's whole knowledge of the wire. */
export interface Widget {
  /** Whether the control fits half a row (paired two per row). */
  readonly short: boolean;
  /** The display a present wire value draws as; `null` where the control has
   * none. */
  readonly decode: (value: unknown) => Shown | null;
  /** The wire value a display authors: `undefined` for the unset display
   * (removes the key), `null` for an entry the control refuses. */
  readonly encode: (shown: Shown, field: CatalogField) => SnippetValue | undefined | null;
  readonly Control: (props: WidgetProps) => ReactNode;
}
