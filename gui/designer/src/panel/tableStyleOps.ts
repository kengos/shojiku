// The WRITE side of a table's row-band styling. Every edit is ONE leaf op at the
// band's own key path — `setScalar` to author, `removeKey` to clear — which is
// what keeps the rest of the table byte-exact in the produced file. `removeKey`
// prunes a map its removal emptied, so clearing the last header property takes
// the whole `header:` map with it and the document returns to the shape it had
// before the section was ever opened.
//
// Nothing here refuses: the values all come from closed sets upstream (the swatch
// palette, a native colour input, an enum segmented control, a checkbox), so
// there is no free text to validate and the section is not an op-size amplifier.

import type { Op } from '@shojiku/designer-core';
import { plainTextOp } from './model';
import type { BandProperty } from './tableStyleModel';

/** Which band a control edits, and the key path it owns under the table. */
export type Band = 'header' | 'row' | 'zebra';

const BAND_KEYS: Readonly<Record<Band, readonly string[]>> = {
  header: ['header', 'style'],
  row: ['row', 'style'],
  zebra: ['row', 'alternateStyle'],
};

/** The zebra tone a fresh check applies — the classic business-form stripe. Only
 * a SEED: the swatch beside the checkbox edits it afterwards, and re-checking a
 * band that already carries a colour never overwrites the user's pick. */
export const DEFAULT_ZEBRA_FILL = '#f6f8fa';

/** Set (or, with `''`, clear) one property of one band. */
export function bandStyleOp(
  tablePath: string,
  band: Band,
  property: BandProperty,
  value: string,
): Op {
  return plainTextOp(tablePath, [...BAND_KEYS[band], property], value);
}

/** Flip the zebra overlay, given what the band carries now. It takes the CURRENT
 * value rather than a desired on/off, because the checkbox's own state is derived
 * from that value — a boolean parameter would re-state it and create a
 * can't-happen leg. So the function is total: no colour → seed the default
 * stripe; a colour → remove it.
 *
 * Off removes ONLY the `backgroundColor` this control owns, so a sibling the
 * panel does not edit (`alternateStyleNames`, or a text property an external
 * author put in `alternateStyle`) survives; the emptied map is pruned by the op
 * layer. On seeds a default only because it can only be reached from empty —
 * a colour the user chose is therefore never overwritten. */
export function zebraToggleOp(tablePath: string, current: string): Op {
  return current === ''
    ? bandStyleOp(tablePath, 'zebra', 'backgroundColor', DEFAULT_ZEBRA_FILL)
    : bandStyleOp(tablePath, 'zebra', 'backgroundColor', '');
}

/** The capability an engine needs before the invisible-header control is
 * offered: an older one parse-REJECTS the key (`TableHeaderSpec` is
 * deny_unknown_fields), so a hopeful checkbox would break the document. */
export const HIDDEN_HEADER_CAPABILITY = 'table.header.visuallyHidden';

/** Toggle `header.visuallyHidden`. Turning it OFF removes the key rather than
 * writing `false` — an unset key already means it, and the op layer prunes the
 * `header:` map when this was its last entry, so a document that never had one
 * returns byte-identical. */
export function hiddenHeaderToggleOp(tablePath: string, current: boolean): Op {
  const keys = ['header', 'visuallyHidden'];
  return current
    ? { op: 'removeKey', path: tablePath, keys }
    : { op: 'setScalar', path: tablePath, keys, value: true };
}

/** Drop the table's own `style.backgroundColor` — the fill the engine never
 * paints. Leaves the rest of `style` (the grid `borderWidth`/`borderColor`)
 * alone; the op layer prunes `style:` only if this was its last key. */
export function clearIneffectiveFillOp(tablePath: string): Op {
  return { op: 'removeKey', path: tablePath, keys: ['style', 'backgroundColor'] };
}
