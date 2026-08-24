// The property model for a header/footer band: what the panel SHOWS for one
// band, and the ops its two fields dispatch. Pure and framework-free, like the
// column/group models beside it — a band is the third selection in the editor
// that has no `type:` of its own.
//
// Every narrowing degrades rather than throws: a hostile document putting a
// scalar, a list or a wrong-typed value at `sections.footer` reads as unset
// fields, never as a crash.

import type { Op } from '@shojiku/designer-core';
import { record } from './itemView';
import { numberOp } from './model';

/** The engine's `Repeat` modes, in its own declaration order. The wire values
 * are snake_case (serde `rename_all`); anything else is a parse error, so this
 * list is closed and the select never composes a value from the document. */
export const BAND_REPEATS = ['every_page', 'first_page', 'except_first_page', 'last_page'] as const;

export type BandRepeat = (typeof BAND_REPEATS)[number];

/** The engine's default when `repeat:` is absent (`Repeat::EveryPage`). */
export const DEFAULT_REPEAT: BandRepeat = 'every_page';

export interface BandView {
  /** The AUTHORED repeat value, verbatim — `''` when the key is absent or not
   * a string. Reported rather than normalized so a document carrying an
   * unknown mode keeps it on screen instead of being silently rewritten to
   * the default (the `data/enumValue` posture). */
  readonly repeat: string;
  /** The authored height as display text; `''` when absent or not a finite
   * number (`Band.height` is `Option<f64>` — nothing else parses). */
  readonly height: string;
}

const UNSET: BandView = { repeat: '', height: '' };

/** Narrow a materialized `sections.<band>` node into the panel's two fields. */
export function readBandView(raw: unknown): BandView {
  const band = record(raw);
  if (band === undefined) {
    return UNSET;
  }
  // Own-property reads: a node reaching here is document-derived, and the
  // area's rule is that an inherited entry never fills a field.
  const repeat = Object.hasOwn(band, 'repeat') ? band.repeat : undefined;
  const height = Object.hasOwn(band, 'height') ? band.height : undefined;
  return {
    repeat: typeof repeat === 'string' ? repeat : '',
    height: typeof height === 'number' && Number.isFinite(height) ? String(height) : '',
  };
}

/** Whether a value is one of the engine's four modes — what the select uses to
 * decide whether the document's current value needs its own extra option. */
export function isKnownRepeat(value: string): value is BandRepeat {
  return (BAND_REPEATS as readonly string[]).includes(value);
}

/** What the band ACTUALLY does today: the authored mode, or the engine's
 * default when the key is absent. This is what the select shows, so it is also
 * what a pick is compared against — otherwise picking the mode already on
 * screen would author a key and mint an undo step for no visible change. */
export function effectiveRepeat(repeat: string): string {
  return repeat === '' ? DEFAULT_REPEAT : repeat;
}

/** A repeat-mode pick. Returns `null` — dispatch nothing, mint no undo step —
 * when the pick does not CHANGE what the band does: re-picking the mode on
 * screen (including the implicit default on a band with no `repeat:` key), or
 * picking anything outside the engine's closed set. */
export function bandRepeatOp(path: string, current: string, raw: string): Op | null {
  if (raw === effectiveRepeat(current) || !isKnownRepeat(raw)) {
    return null;
  }
  return { op: 'setScalar', path, keys: ['repeat'], value: raw };
}

/** A height edit. Empty clears the key; a non-finite entry dispatches nothing.
 * `Band.height` is a plain number on the wire — no unit strings — so this is
 * `numberOp`, not `lengthOp`. */
export function bandHeightOp(path: string, raw: string): Op | null {
  return numberOp(path, ['height'], raw);
}
