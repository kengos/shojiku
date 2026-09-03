// The READ side of a form mark's PRESENCE — the half of an `ellipse` /
// `checkbox` the engine calls content ("a mark's *presence* is content",
// `engine/layout/src/engine/marks.rs`). Its geometry stays on the placement
// tab; its stroke on the decoration tab.
//
// `data:` is a `MarkBinding`, the SAME `{ key, equals?, scope? }` predicate
// and the same truth table `visible:` uses — `engine/core/src/template/
// visibility.rs` says so in its own header ("no second grammar") — so the
// value control a picked field earns comes from `valueFormFor` rather than
// being restated here, exactly as `visibilityModel` takes it.
//
// The document is untrusted: an externally-authored `data:` may carry a
// non-string key or a container `equals`, so every field degrades to a
// displayable string rather than throwing, and a hostile display string is
// truncated rather than dropped.

import type { ReadFn } from '@shojiku/designer-core';

export { valueFormFor } from './rowConditionsModel';

/** Which presence form the mark is authored in. `static` covers both the
 * always-draw ellipse and a checkbox's `checked:`; `bound` means `data:`. */
export type MarkMode = 'static' | 'bound';

/** A form mark's presence as the panel shows it. */
export interface MarkRow {
  readonly mode: MarkMode;
  /** `data.key` ('' when unset or not a string). */
  readonly key: string;
  /** `data.equals`'s display string ('' when absent — the boolean form). */
  readonly equals: string;
  /** Whether `equals` is authored at all (absent = read the field as a bool). */
  readonly hasEquals: boolean;
  /** Whether `data.scope: document` is authored. The panel does not edit it —
   * the scope escape is an authoring-level choice — so the row REPORTS it
   * rather than hiding that the document says something the panel cannot. */
  readonly documentScope: boolean;
  /** Whether `data.scope` is present AT ALL, whatever its value. `removeKey`
   * succeeds on a hostile value and fails only on an ABSENT key, and a failing
   * op refuses the whole batch — so a repoint that clears the scope has to be
   * told, exactly as `bindingPickOps` is. `documentScope` cannot stand in: it
   * is false both for an absent key and for an authored `element`. */
  readonly hasScope: boolean;
  /** A checkbox's static `checked: true` (always false for an `ellipse`,
   * which has no such key). */
  readonly checked: boolean;
  /** Whether `checked` is authored AT ALL — `false` is a different document
   * from an absent key, and the ops must not remove a key that is not there. */
  readonly hasChecked: boolean;
  /** Both `checked` and `data:` are authored. The wire calls them mutually
   * exclusive and the engine warns, with `data:` winning — so the panel says
   * so instead of silently showing one of them. */
  readonly conflict: boolean;
}

/** Longest display string a hostile document can put in the row — the
 * `visibilityModel` bound, for the same reason. */
const MAX_DISPLAY = 80;

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.length > MAX_DISPLAY ? `${value.slice(0, MAX_DISPLAY)}…` : value;
}

/** A scalar `equals` as the input shows it; containers read as unset (the
 * engine rejects them at parse, so there is nothing to edit). */
function displayScalar(value: unknown): string {
  if (typeof value === 'string') {
    return text(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

/** Reads a form mark's presence. Unlike `readVisible` this never returns
 * `null`: every mark HAS a presence — an ellipse with no `data:` draws
 * unconditionally, an unticked checkbox is the blank-form state — so the
 * section always has something true to show. An unreadable item reads as the
 * static form, which is what the engine does with it.
 *
 * A `data:` that exists but is not a map reads as `static` too: there is no
 * row to edit and the engine's parse error is the honest report. */
export function readMark(read: ReadFn, path: string): MarkRow {
  let item: Record<string, unknown> | undefined;
  try {
    item = record(read(path));
  } catch {
    item = undefined;
  }
  const data = record(item?.data);
  const hasChecked = item !== undefined && item.checked !== undefined;
  return {
    mode: data === undefined ? 'static' : 'bound',
    key: text(data?.key),
    equals: displayScalar(data?.equals),
    hasEquals: data?.equals !== undefined && data?.equals !== null,
    documentScope: data?.scope === 'document',
    hasScope: data !== undefined && data.scope !== undefined,
    checked: item?.checked === true,
    hasChecked,
    conflict: data !== undefined && hasChecked,
  };
}
