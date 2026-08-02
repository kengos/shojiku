// How much room the TEMPLATE has left: the headroom indicator shown while an
// image-bearing template is edited, the projected size of one more image, and
// the cap steps the raise prompt walks. The import is gated on `fits` BEFORE the
// op is applied — ops do not re-check the cap, and undo/redo must be able to
// re-parse the result.

import { MAX_TEMPLATE_BYTES, MAX_TEMPLATE_BYTES_CEILING } from '@shojiku/designer-core';

/** The template-size headroom shown while an image-bearing template is edited. */
export interface Headroom {
  /** Used fraction of the cap (0..1, clamped). */
  readonly ratio: number;
  /** `warn` once the template nears the cap (≥ 80%). */
  readonly level: 'ok' | 'warn';
}

/** Fraction at or above which the headroom indicator warns and offers the raise. */
const HEADROOM_WARN = 0.8;

/** Headroom for `templateBytes` against `maxBytes`. A non-positive cap reads as
 * full (defensive — never divide by zero into a false "ok"). */
export function headroom(templateBytes: number, maxBytes: number): Headroom {
  const ratio = maxBytes > 0 ? Math.min(1, templateBytes / maxBytes) : 1;
  return { ratio, level: ratio >= HEADROOM_WARN ? 'warn' : 'ok' };
}

/** Extra template bytes an image item adds beyond its `src` string (the YAML
 * scaffolding: `- type: image`, `box: {…}`, `src: `, plus per-line indentation
 * that grows with nesting depth). Deliberately generous so the projection
 * never under-counts even for a deeply nested insert target — a few hundred
 * bytes of slack is invisible against MiB-scale caps. */
const IMAGE_ITEM_OVERHEAD_BYTES = 256;

/** The projected template size after adding an image, and whether it fits the
 * current cap. The import is gated on `fits` BEFORE the op is applied — ops do
 * not re-check the cap, and undo/redo must be able to re-parse the result. */
export interface ImportProjection {
  readonly projectedBytes: number;
  readonly fits: boolean;
}

/** Project the template size after inserting an image whose `src` data-URI is
 * `dataUriLength` chars (base64 is ASCII, so char count = byte count). */
export function projectImport(
  currentBytes: number,
  dataUriLength: number,
  maxBytes: number,
): ImportProjection {
  const projectedBytes = currentBytes + dataUriLength + IMAGE_ITEM_OVERHEAD_BYTES;
  return { projectedBytes, fits: projectedBytes <= maxBytes };
}

/** The template-size cap steps the raise prompt walks: 2 → 4 → 8 MiB (the
 * default up to the absolute ceiling). Kept in lockstep with the designer-core
 * bounds so the GUI never offers a step the parser would clamp away. */
export const CAP_STEPS: readonly number[] = [
  MAX_TEMPLATE_BYTES,
  MAX_TEMPLATE_BYTES * 2,
  MAX_TEMPLATE_BYTES_CEILING,
];

/** The next cap step above `current`, or `null` when already at (or past) the
 * ceiling — the raise prompt then says "use a smaller image" instead. */
export function nextCapStep(current: number): number | null {
  for (const step of CAP_STEPS) {
    if (step > current) {
      return step;
    }
  }
  return null;
}
