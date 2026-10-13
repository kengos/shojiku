// A QR code's error-correction level: what the item carries, and the op a pick
// dispatches.
//
// Engine facts that decide the shape (read from the source and measured on the
// real engine):
//
//   * `errorCorrection` sits at the item ROOT, a sibling of `text`/`data`, not
//     under `style` (`QrCodeItem.error_correction`,
//     `engine/core/src/template/items/generated.rs`). Unset draws at `medium`.
//   * Its values are exactly `low` | `medium` | `quartile` | `high`, lowercase,
//     or a `~` (read as unset). Any other value — `LOW`, an empty string, a
//     number, a boolean, a list, a map — makes the engine refuse the WHOLE
//     document, so the panel never writes one; a document that already carries
//     one shows it marked invalid (a string or a number as itself, any other
//     shape as `UNREADABLE_LEVEL`), never as the default.
//   * The level is a minimum: the encoder raises it while the content still fits
//     the same code size, so a short content can draw `low` exactly as `medium`.
//   * Every released engine reads the key (it is in the first commit's
//     `QrCodeItem`, as is the `qr_code` capability), so the item's own gate is
//     the field's gate too.
//   * A table COLUMN of kind `qr_code` has no such key (the engine rejects it as
//     an unknown field) and always encodes at `medium`; a `qr_code` item inside a
//     column's `cell:` is an ordinary item and carries it.

import type { Op, ReadFn } from '@shojiku/designer-core';
import { display, record } from './itemView';
import { plainTextOp } from './model';

/** The wire's levels, in the engine's own order (least to most damage
 * tolerated). */
export const EC_LEVELS = ['low', 'medium', 'quartile', 'high'] as const;

/** What the select shows for a value present in the file that no display
 * string can stand for — an empty string, a boolean, a list, a map. Every one
 * of them is refused by the engine like a misspelt level, so it gets a row of
 * its own rather than reading as the default. */
export const UNREADABLE_LEVEL = 'errorCorrection:unreadable';

/** The item's OWN `errorCorrection`, as the select shows it.
 *
 * `shown` is '' for an absent key and for a `~` (which the engine reads as
 * unset), a string verbatim, a number as its digits, and `UNREADABLE_LEVEL` for
 * any other shape. `present` says whether the key is in the file at all, which
 * is what decides whether the default row has something to remove. */
export interface ErrorCorrection {
  readonly shown: string;
  readonly present: boolean;
}

export function errorCorrectionOf(read: ReadFn, path: string): ErrorCorrection {
  const item = record(read(path));
  if (item === undefined || !Object.hasOwn(item, 'errorCorrection')) {
    return { shown: '', present: false };
  }
  const value = item.errorCorrection;
  const shown = display(value);
  return {
    shown: shown !== '' || value === null ? shown : UNREADABLE_LEVEL,
    present: true,
  };
}

/** The op for picking `picked` ('' = the default row, which removes the key)
 * over what the select shows. Null when nothing would change: a re-pick of the
 * shown row, and the default row over an item with no key to remove. */
export function errorCorrectionOp(path: string, own: ErrorCorrection, picked: string): Op | null {
  if (picked === own.shown || (picked === '' && !own.present)) {
    return null;
  }
  return plainTextOp(path, ['errorCorrection'], picked);
}
