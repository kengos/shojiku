// Pure model for the selection→style capture surface (gdoc-style
// register/update-style-from-selection): read the selected item's EXPLICIT inline
// style props and plan the named ops that either (a) register them as a NEW
// named style — appending the name to `styleNames` and stripping the now-
// redundant inline props in ONE transactional batch, so the item's look is
// preserved by construction — or (b) UPDATE an already-applied named style to
// match the selection's inline drift.
//
// Framework-free so the composition + refusal logic is exhaustively unit-
// testable; the modal component stays thin over it. Every op addresses the
// registry by a literal `keys` path (`['styles', name, …]`), safe for any
// hostile style name. Zero designer-core surface added — it rides the shipped
// putValue / setScalar / setStrings / removeKey ops, so an AI emits the same
// batch (parity by construction).
//
// Capture reads ONLY explicit inline `style:` scalars — never the cascade-
// effective values, which would bake inherited context into the new style.
// Non-scalar values (a per-side border map) are left inline untouched, and
// UPDATE writes per-prop `setScalar` (never a whole-map `putValue`) so a
// registry entry's non-`STYLE_FIELDS` props survive byte-intact.

import type { Op } from '@shojiku/designer-core';
import { STYLE_FIELDS } from '../panel/styleFieldSpecs';
import { refuse, type StyleOpPlan } from '../panel/stylePlan';
import { dedupe, MAX_STYLES } from '../panel/stylesModel';

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** The selected item's capturable inline style: exactly the `STYLE_FIELDS`
 * keys whose RAW value is a string or number scalar. A non-scalar value
 * (map/array/bool/null — e.g. a per-side border map) and an unknown style key
 * are excluded; an absent or hostile (non-map) item/style yields `{}`. The
 * authored value FORM is preserved (a numeric `fontSize` stays a number). */
export function capturableStyleProps(rawItem: unknown): Record<string, string | number> {
  const style = record(record(rawItem)?.style);
  const out: Record<string, string | number> = {};
  if (style === undefined) {
    return out;
  }
  for (const field of STYLE_FIELDS) {
    const value = style[field.key];
    if (typeof value === 'string' || typeof value === 'number') {
      out[field.key] = value;
    }
  }
  return out;
}

/** Plan a "save selection as a new named style": register the captured props,
 * apply the new name (appended LAST so it wins the cascade), and strip the now-
 * redundant inline props — one transactional batch, one undo step. Refused on
 * an empty/duplicate name, the registry cap, or nothing to capture. The op
 * ORDER is pinned: `putValue` (the entry) → `setStrings` (styleNames) →
 * `removeKey` per captured prop. */
export function captureStyleOps(
  path: string,
  name: string,
  captured: Readonly<Record<string, string | number>>,
  existingNames: readonly string[],
  currentStyleNames: readonly string[],
): StyleOpPlan {
  if (name.length === 0) {
    return refuse('empty_name');
  }
  if (existingNames.includes(name)) {
    return refuse('duplicate_name');
  }
  if (existingNames.length >= MAX_STYLES) {
    return refuse('too_many_styles');
  }
  const props = Object.keys(captured);
  if (props.length === 0) {
    return refuse('nothing_captured');
  }
  // The new style must land LAST (later-wins) or the look changes: an existing
  // occurrence of the name (a dangling reference being given a definition) is
  // MOVED to the end, never left in place — `dedupe([...current, name])` would
  // keep the FIRST occurrence and let a later real style override the captured
  // props. `dedupe` still collapses duplicates among the existing names.
  const names = dedupe([...currentStyleNames.filter((n) => n !== name), name]);
  const ops: Op[] = [
    { op: 'putValue', keys: ['styles', name], value: { ...captured } },
    { op: 'setStrings', path, keys: ['styleNames'], values: names },
    ...props.map((prop): Op => ({ op: 'removeKey', path, keys: ['style', prop] })),
  ];
  return { ok: true, ops };
}

/** Plan "update this applied style to match the selection": rewrite each
 * captured prop into the registry entry (per-prop `setScalar`, so the entry's
 * non-`STYLE_FIELDS` props survive byte-intact — never a whole-map replace) and
 * strip the same props inline. A dangling target name auto-creates the entry
 * (the `setScalar` intermediate-map auto-create). Refused only when there is
 * nothing to capture — it rewrites no references, so no usage-based refusal. */
export function updateStyleOps(
  path: string,
  name: string,
  captured: Readonly<Record<string, string | number>>,
): StyleOpPlan {
  const props = Object.keys(captured);
  if (props.length === 0) {
    return refuse('nothing_captured');
  }
  const ops: Op[] = [];
  for (const prop of props) {
    ops.push({ op: 'setScalar', keys: ['styles', name, prop], value: captured[prop] });
  }
  for (const prop of props) {
    ops.push({ op: 'removeKey', path, keys: ['style', prop] });
  }
  return { ok: true, ops };
}

/** The named style an "update to match" targets: the highest-precedence REAL
 * applied style — the LAST `styleNames` entry that exists in the registry
 * (later wins). Dangling names (no registry entry) are skipped; `null` when the
 * item applies no real style (all dangling, or no names), which hides the
 * update entry (only registration is offered). Registry names are hostile
 * strings, so membership is an array `.includes`, never a prototype-walking
 * plain-object lookup. */
export function updateTargetName(
  styleNames: readonly string[],
  registryNames: readonly string[],
): string | null {
  for (let i = styleNames.length - 1; i >= 0; i--) {
    if (registryNames.includes(styleNames[i])) {
      return styleNames[i];
    }
  }
  return null;
}
