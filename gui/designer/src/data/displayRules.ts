// How a definitions field SHOWS beyond its type — its currency code, decimal
// places, quantity unit and default display variant — as the data-item editor
// reads and writes them. The declared variant LIST is `displayFormatsModel.ts`;
// the hints for other tools are `recommendedStyle.ts`.
//
// The engine reads these per FIELD TYPE (`engine/formatter/src/format.rs`):
// `currency` on a currency field, `precision` on a currency or percentage field,
// `unit` on a quantity field — and a plain number promoted to currency by a
// placement's `symbol` / `name` pick reads its `currency` and `precision` too;
// the editor offers them where the TYPE reads them. A key left behind by a type change is inert
// and stays as authored. Every builder returns a null op when nothing changed (a
// tab-through authors nothing), and an empty entry CLEARS the key.
//
// `precision` is a `u32` on the wire, so a negative, a fraction or a string there
// is a PARSE ERROR for every template using the file — refused here before any
// op exists. Above `MAX_PRECISION` the engine silently prints 20 places, so the
// editor stops there too (an authored larger value is shown as it is).

import type { Op } from '@shojiku/designer-core';
import { own, readSchemaNode } from './schemaNode';
import { type NumberRefusal, parseNumber, shownScalar } from './valueRules';

/** The engine's decimal-places clamp (`MAX_PRECISION`,
 * engine/formatter/src/format/number.rs; drift-pinned). */
export const MAX_PRECISION = 20;

/** Why a decimal-places entry was not written. */
export type PrecisionRefusal = NumberRefusal | 'over_max';

/** One field's display keys, as shown (empty = not authored). */
export interface DisplayRules {
  readonly currency: string;
  readonly precision: string;
  readonly unit: string;
  readonly displayFormat: string;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function readDisplayRules(defsText: string, keysPath: readonly string[]): DisplayRules {
  const schema = readSchemaNode(defsText, keysPath);
  return {
    currency: text(own(schema, 'currency')),
    precision: shownScalar(own(schema, 'precision')),
    unit: text(own(schema, 'unit')),
    displayFormat: text(own(schema, 'displayFormat')),
  };
}

/** Set / clear a text key verbatim (what is typed is what is written, like the
 * document currency). */
function textOp(keysPath: readonly string[], key: string, current: string, raw: string): Op | null {
  if (raw === current) {
    return null;
  }
  const keys = [...keysPath, key];
  return raw === '' ? { op: 'removeKey', keys } : { op: 'setScalar', keys, value: raw };
}

export function currencyOp(keysPath: readonly string[], current: string, raw: string): Op | null {
  return textOp(keysPath, 'currency', current, raw);
}

export function unitOp(keysPath: readonly string[], current: string, raw: string): Op | null {
  return textOp(keysPath, 'unit', current, raw);
}

/** Pick the default display variant; an empty spelling clears it back to the
 * document's own setting. */
export function displayFormatOp(
  keysPath: readonly string[],
  current: string,
  spelling: string,
): Op | null {
  return textOp(keysPath, 'displayFormat', current, spelling);
}

export type PrecisionEdit =
  | { readonly ok: true; readonly op: Op | null }
  | { readonly ok: false; readonly refusal: PrecisionRefusal };

/** Set / clear the decimal places: a whole number from 0 to `MAX_PRECISION`. An
 * entry naming the shown number (`2.0` over `2`) authors nothing. */
export function precisionOp(
  keysPath: readonly string[],
  current: string,
  raw: string,
): PrecisionEdit {
  const keys = [...keysPath, 'precision'];
  if (raw.trim() === '') {
    return { ok: true, op: current === '' ? null : { op: 'removeKey', keys } };
  }
  const n = parseNumber(raw, { whole: true, nonNegative: true });
  if (typeof n === 'string') {
    return { ok: false, refusal: n };
  }
  if (n > MAX_PRECISION) {
    return { ok: false, refusal: 'over_max' };
  }
  return { ok: true, op: String(n) === current ? null : { op: 'setScalar', keys, value: n } };
}
