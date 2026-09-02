// What a page-setup EDIT WRITES: the named `designer-core` op (or batch) each
// control dispatches. The read half — the view these builders take as their
// starting state — is `pageSetupModel.ts`.
//
// Every builder is root-addressed and composes its wire lengths from the number
// inputs, never parsing one back; keys are literal path segments, so nothing a
// document (or a user) supplies ever becomes a key. A builder may DECLINE: a
// null op, or a dimension dropped from a batch, means "nothing is dispatched"
// rather than an op the document model would refuse.

import type { Op } from '@shojiku/designer-core';
import { stepNumeral } from './model';
import type { CustomDims, Orientation, PageView } from './pageSetupModel';
import type { SizeUnit } from './pageSizes';
import {
  CUSTOM,
  composeDimension,
  convertDimension,
  formatDimension,
  namedSize,
} from './pageSizes';

// A4 portrait points — the prefill fallback when the current size is unknown.
const DEFAULT_DIMS = { w: 595.28, h: 841.89 };

/** The batch that switches a named size to a custom `{ w, h }`: clear the
 * orientation and size keys that exist (so no `orientation_ignored` warning is
 * left behind and the map is rebuilt clean), then write the current effective
 * dimensions as the seed, in the named size's conventional unit. One undo step. */
function startCustomOps(view: PageView): Op[] {
  const base = view.mode === 'named' ? namedSize(view.sizeName) : undefined;
  const unit: SizeUnit = base?.unit ?? 'mm';
  const dims = view.dims ?? DEFAULT_DIMS;
  const ops: Op[] = [];
  if (view.hasOrientation) {
    ops.push({ op: 'removeKey', keys: ['page', 'orientation'] });
  }
  if (view.hasSizeKey) {
    ops.push({ op: 'removeKey', keys: ['page', 'size'] });
  }
  ops.push({
    op: 'setScalar',
    keys: ['page', 'size', 'w'],
    value: `${formatDimension(dims.w, unit)}${unit}`,
  });
  ops.push({
    op: 'setScalar',
    keys: ['page', 'size', 'h'],
    value: `${formatDimension(dims.h, unit)}${unit}`,
  });
  return ops;
}

/** The ops for a size-select change (dispatched as one transactional batch — a
 * single op is still one undo step): the custom sentinel switches to a custom
 * `{ w, h }`, any engine name overwrites `page.size` with that scalar (the
 * final-key set replaces a scalar or a `{ w, h }` map alike; an existing
 * orientation key stays valid on a named size). */
export function selectSizeOp(view: PageView, chosen: string): Op[] {
  if (chosen === CUSTOM) {
    return startCustomOps(view);
  }
  return [{ op: 'setScalar', keys: ['page', 'size'], value: chosen }];
}

/** The op for an orientation-select change (named mode only): landscape writes
 * the key, portrait clears it (the default is unset) — or does nothing when it
 * is already absent, so no `key_not_found` op is dispatched. */
export function orientationOp(view: PageView, next: Orientation): Op | null {
  if (next === 'landscape') {
    return { op: 'setScalar', keys: ['page', 'orientation'], value: 'landscape' };
  }
  return view.hasOrientation ? { op: 'removeKey', keys: ['page', 'orientation'] } : null;
}

/** The op for one custom dimension input commit: compose its wire length, or
 * null (nothing dispatched) when the value is not a positive numeral. */
export function customDimOp(field: 'w' | 'h', value: string, unit: SizeUnit): Op | null {
  const wire = composeDimension(value, unit);
  return wire === null ? null : { op: 'setScalar', keys: ['page', 'size', field], value: wire };
}

/** Whether the ▲▼ can move this dimension: the SAME test the typed commit
 * passes through, so the buttons are offered exactly where a keyboard entry of
 * the shown value would be accepted. The unit is irrelevant to the test — only
 * the numeral is — so the check composes against `pt`. */
export function canStepDimension(value: string): boolean {
  return composeDimension(value, 'pt') !== null;
}

/** The op for one ▲▼ click on a custom dimension: step the DISPLAYED numeral by
 * one of its own unit (the inputs and the unit select share that unit, so a
 * point-sized step would be invisible under `mm` and enormous under `in`), then
 * re-author through `customDimOp`.
 *
 * Going back through that builder is the point: the buttons then cannot reach a
 * value typing the same thing would be refused for. Stepping the last unit off
 * a `1` yields `0`, which `composeDimension` refuses. A dimension is a strictly
 * positive length, so the floor DECLINES rather than clamping — unlike the
 * all-sides margin, whose `0` is legal. `stepNumeral` declines separately when
 * the numeral is too large for the step to move it. */
export function stepCustomDimOp(field: 'w' | 'h', custom: CustomDims, dir: number): Op | null {
  const current = custom[field];
  if (!canStepDimension(current)) {
    return null;
  }
  const next = stepNumeral(current, dir);
  return next === null ? null : customDimOp(field, next, custom.unit);
}

/** The batch for a unit-select change: reinterpret both dimensions into the new
 * unit, preserving their physical size. A dimension that fails to convert is
 * dropped from the batch (its wire value is left as-is). */
export function customUnitOps(custom: CustomDims, next: SizeUnit): Op[] {
  const ops: Op[] = [];
  const w = convertDimension(custom.w, custom.unit, next);
  if (w !== null) {
    ops.push({ op: 'setScalar', keys: ['page', 'size', 'w'], value: `${w}${next}` });
  }
  const h = convertDimension(custom.h, custom.unit, next);
  if (h !== null) {
    ops.push({ op: 'setScalar', keys: ['page', 'size', 'h'], value: `${h}${next}` });
  }
  return ops;
}
