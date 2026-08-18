// The WRITE side of the property-panel model: the named `designer-core` ops a
// field edit dispatches, plus the shared dispatch guard. Keeping this
// framework-free makes op construction exhaustively unit-testable; the panel
// components stay thin over it. Every edit is an op (AI parity) — the panel
// never mutates the document directly.
//
// The read side (display values out of a materialized node) is `itemView.ts`,
// the format-picker vocabulary `formatModel.ts`, and the style-key table
// `styleFieldSpecs.ts`.

import type { Op } from '@shojiku/designer-core';
import { stepLength } from '../canvas/lengths';
import { chipWire } from '../text/chipModel';
import { parseRawSegments } from '../text/interpolate';
import { type ContentMode, type ItemView, record } from './itemView';

/** A number-or-unit-string value: a bare number is authored as a number (so the
 * round-trip form is preserved), anything else (`"50%"`, `"8mm"`) as a string. */
function lengthValue(raw: string): number | string {
  return /^-?\d+(?:\.\d+)?$/.test(raw.trim()) ? Number(raw.trim()) : raw;
}

// `path` is OPTIONAL on these leaf builders (mirroring the op wire): a string is
// an item-scoped edit, `undefined` is a root-addressed edit (`defaults.*`,
// `styles.<name>.*`) the document-settings surfaces dispatch. The builders only
// pass `path` through — no branch on it — so the two forms share one policy.

/** A length/text field edit: an empty value clears the key (removeKey), a bare
 * number authors a number, otherwise a string (units preserved). */
export function lengthOp(path: string | undefined, keys: readonly string[], raw: string): Op {
  return raw.trim() === ''
    ? { op: 'removeKey', path, keys }
    : { op: 'setScalar', path, keys, value: lengthValue(raw) };
}

/** A strict-number field edit (e.g. lineHeight): empty clears; a non-finite
 * value returns `null` so the caller dispatches nothing. */
export function numberOp(
  path: string | undefined,
  keys: readonly string[],
  raw: string,
): Op | null {
  if (raw.trim() === '') {
    return { op: 'removeKey', path, keys };
  }
  const value = Number(raw);
  return Number.isFinite(value) ? { op: 'setScalar', path, keys, value } : null;
}

/** A stepper (▲▼) edit: step the CURRENT authored value by `dir * step` (pt),
 * preserving its unit, then author it through the same builder the typed field
 * uses (`number` kind = lineHeight → `numberOp`, else `lengthOp`). Returns
 * `null` (dispatch nothing) when the value is not a steppable length/number —
 * the caller also disables the buttons in that case, but the guard keeps a
 * mid-render race from authoring a hostile delta. */
export function stepValueOp(
  path: string | undefined,
  keys: readonly string[],
  current: string,
  dir: number,
  step: number,
  kind: 'length' | 'number',
): Op | null {
  const next = stepLength(current, dir, step);
  if (next === null) {
    return null;
  }
  return kind === 'number'
    ? numberOp(path, keys, String(next))
    : lengthOp(path, keys, String(next));
}

/** Apply a built op through the controller; `null` (a non-edit: an invalid
 * number, a no-op combo commit) dispatches nothing. Panels and the toolbar
 * share this guard instead of re-inlining it. */
export function applyPanelOp(controller: { apply(op: Op): unknown }, op: Op | null): void {
  if (op !== null) {
    controller.apply(op);
  }
}

/** A string-valued field edit (static text, an enum select, a color): empty
 * clears the key, otherwise the value is authored verbatim as a string (never
 * coerced to a number — `"12"` static text stays a string). */
export function plainTextOp(path: string | undefined, keys: readonly string[], raw: string): Op {
  return raw === '' ? { op: 'removeKey', path, keys } : { op: 'setScalar', path, keys, value: raw };
}

/** A free-text field edit that keeps an empty string as a value rather than
 * clearing the key (the data-binding key stays present but empty, surfacing a
 * validation warning instead of silently exiting data mode). */
export function bindingKeyOp(path: string, raw: string): Op {
  return { op: 'setScalar', path, keys: ['data', 'key'], value: raw };
}

/** The wire spelling of the binding scope that escapes a row — the ONLY value
 * the GUI authors or recognizes. The engine's other variant (`element`) is the
 * default and never written: an unset key already means it. */
export const DOCUMENT_SCOPE = 'document';

/** The ops a PICKED binding target dispatches: the key, plus the `data.scope`
 * that makes the key resolve where the picked row promised.
 *
 * A document-scope pick authors `scope: document`; a row-scope pick clears it
 * — but ONLY when the key is actually present, because `removeKey` on an
 * absent key fails `key_not_found` and would roll the whole batch back. The
 * caller applies the result through `applyAll`, so key and scope move as ONE
 * undo step. Free-typed entry does NOT come through here (`bindingKeyOp`
 * alone): typing a key never re-scopes the binding the file already carries. */
export function bindingPickOps(
  read: (path: string) => unknown,
  path: string,
  key: string,
  documentScoped: boolean,
): Op[] {
  const ops: Op[] = [bindingKeyOp(path, key)];
  if (documentScoped) {
    ops.push({ op: 'setScalar', path, keys: ['data', 'scope'], value: DOCUMENT_SCOPE });
    return ops;
  }
  if (hasAuthoredScope(read, path)) {
    ops.push({ op: 'removeKey', path, keys: ['data', 'scope'] });
  }
  return ops;
}

/** Whether the item at `path` carries a `data.scope` key at all (any value —
 * `removeKey` succeeds on a hostile one and fails only on an absent one). An
 * unreadable/hostile node reads as "no key", so the batch stays legal. */
function hasAuthoredScope(read: (path: string) => unknown, path: string): boolean {
  let data: Record<string, unknown> | undefined;
  try {
    data = record(record(read(path))?.data);
  } catch {
    return false;
  }
  return data !== undefined && Object.hasOwn(data, 'scope');
}

/** A format edit: empty clears (default format), otherwise sets the name. */
export function formatOp(path: string, raw: string): Op {
  return raw === ''
    ? { op: 'removeKey', path, keys: ['data', 'format'] }
    : { op: 'setScalar', path, keys: ['data', 'format'], value: raw };
}

/** A blank-form placeholder edit: empty clears the key (only-touched-keys
 * write policy — no `placeholder: ""` left behind), otherwise sets the
 * verbatim text drawn when the bound value is blank. */
export function placeholderOp(path: string, raw: string): Op {
  return raw === ''
    ? { op: 'removeKey', path, keys: ['data', 'placeholder'] }
    : { op: 'setScalar', path, keys: ['data', 'placeholder'], value: raw };
}

/** A styleNames edit: an empty selection clears the key, otherwise writes the
 * list as a flow sequence. */
export function styleNamesOp(path: string, names: readonly string[]): Op {
  return names.length === 0
    ? { op: 'removeKey', path, keys: ['styleNames'] }
    : { op: 'setStrings', path, keys: ['styleNames'], values: [...names] };
}

/** Toggle one name in a styleNames selection, preserving order (append on add,
 * drop on remove). */
export function toggleStyleName(current: readonly string[], name: string, on: boolean): string[] {
  if (on) {
    return current.includes(name) ? [...current] : [...current, name];
  }
  return current.filter((n) => n !== name);
}

/** The binding a text carries when it is NOTHING BUT one expression — the case
 * the two content modes can both express, so switching between them need not
 * throw the binding away. Null for mixed text (`{customer.name} 様`), which no
 * single `data:` can hold. */
export function textAsBinding(text: string): { key: string; format: string } | null {
  const segments = parseRawSegments(text);
  const only = segments.length === 1 ? segments[0] : undefined;
  return only === undefined || only.kind !== 'expr'
    ? null
    : { key: only.key, format: only.format ?? '' };
}

/** The same binding written as text, for the other direction. Empty when the
 * key cannot be spelled in the interpolation charset (a declared name is the
 * chip editor's business, not a bare `text:`) — the switch then opens blank. */
export function bindingAsText(key: string, format: string): string {
  const wire = chipWire(key);
  if (wire === null) {
    return '';
  }
  return format === '' ? wire : `{${key}:${format}}`;
}

/** The atomic content-mode switch (text ⇄ data): remove the key that is present
 * and seed the target, so the item always has exactly one content key and one
 * undo step reverts the whole switch. Dispatched via `applyAll`.
 *
 * The seed CARRIES THE BINDING ACROSS whenever both modes can say it: a text of
 * one expression becomes that data key (with its format), and a data key
 * becomes `{key}` text. Switching by mistake then costs nothing, and only mixed
 * text — which no `data:` can hold — is dropped. `restore` is what the panel
 * kept of that dropped text, seeded on the way back when the binding itself
 * carries nothing. */
export function switchContentOps(
  path: string,
  view: ItemView,
  target: ContentMode,
  restore = '',
): Op[] {
  if (target === 'data') {
    const ops: Op[] = [];
    const carried = view.hasText ? textAsBinding(view.text) : null;
    if (view.hasText) {
      ops.push({ op: 'removeKey', path, keys: ['text'] });
    }
    ops.push({ op: 'setScalar', path, keys: ['data', 'key'], value: carried?.key ?? '' });
    if (carried !== null && carried.format !== '') {
      ops.push({ op: 'setScalar', path, keys: ['data', 'format'], value: carried.format });
    }
    return ops;
  }
  const ops: Op[] = [];
  const carried = view.hasData ? bindingAsText(view.dataKey, view.format) : '';
  if (view.hasData) {
    ops.push({ op: 'removeKey', path, keys: ['data'] });
  }
  ops.push({ op: 'setScalar', path, keys: ['text'], value: carried === '' ? restore : carried });
  return ops;
}
