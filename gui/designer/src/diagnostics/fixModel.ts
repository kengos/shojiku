// Diagnostics quick-fix registry: a frequent diagnostic whose fix is
// MECHANICAL becomes a one-click "修正". Each fix is a named patch-op
// (or a batch of them) so AI parity holds — the GUI authors nothing the op layer
// cannot, and one `applyAll` batch is one undo step. The registry is keyed by
// the engine's stable diagnostic `code` through a real `Map`, NEVER a
// plain-object index: a forged `code:'constructor'` must resolve to nothing, not
// walk the prototype to an inherited function. A builder returns `null` when no
// concrete removable key is found, so the panel never shows a button that would
// silently do nothing.

import type { Op } from '@shojiku/designer-core';
import type { Diagnostic } from '../engine/types';
import { fixMissingSize, fixOverflowWidth, fixSourceConflict } from './fixWrites';

/** Reads a materialized node by structural path (`Editor.read`); display-only. */
export type ReadNode = (path: string) => unknown;

/** One way to resolve a diagnostic: what it does (a chrome key, plus the ICU
 * args a value-writing label needs) and the ops that do it. One `applyAll`
 * batch is one undo step, whichever candidate the author picks. */
export interface FixCandidate {
  readonly labelKey: string;
  readonly labelArgs?: Readonly<Record<string, string | number>>;
  readonly ops: readonly Op[];
}

/** The label a removal carries: the message already says what goes away, so the
 * button only has to name the action. */
const REMOVE_LABEL = 'diagnostics.fix';

/** Builds the candidate resolutions for one diagnostic, or `null` when there
 * are none. */
type FixBuilder = (diag: Diagnostic, read: ReadNode) => readonly FixCandidate[] | null;

/** Wraps a removal builder as the single candidate it has always been. */
function removal(
  build: (path: string, diag: Diagnostic, read: ReadNode) => readonly Op[] | null,
): (path: string, diag: Diagnostic, read: ReadNode) => readonly FixCandidate[] | null {
  return (path, diag, read) => {
    const ops = build(path, diag, read);
    return ops === null ? null : [{ labelKey: REMOVE_LABEL, ops }];
  };
}

/** The layout keys that lay out nothing on a leaf item box (`layout_key_on_leaf`
 * fires when any is present; `has_layout_keys` = these plus the grid keys). */
const LEAF_LAYOUT_KEYS = [
  'type',
  'direction',
  'gap',
  'alignItems',
  'justifyContent',
  'columns',
  'rows',
  'columnGap',
  'rowGap',
] as const;

/** The grid-only keys inert without `box.type: grid` (`grid_key_ignored`). */
const GRID_KEYS = ['columns', 'rows', 'columnGap', 'rowGap'] as const;

/** The table pagination keys inert off a flow body (`table_pagination_key_ignored`),
 * authored at the table item ROOT (not under `box`). */
const PAGINATION_KEYS = ['repeatHeader', 'autoPageBreak', 'keepTogether'] as const;

/** Where a `grid_key_ignored` node's box lives: a container's own `box`, a
 * `repeat` cell's `cell.box`, or a `repeat_flow`'s `item.box`. */
const GRID_BOX_LOCATIONS = [['box'], ['cell', 'box'], ['item', 'box']] as const;

/** A plain map node, or `null` for a hostile/absent read (array, scalar, null). */
function asMap(node: unknown): Record<string, unknown> | null {
  return typeof node === 'object' && node !== null && !Array.isArray(node)
    ? (node as Record<string, unknown>)
    : null;
}

/** Wraps a fix that needs the diagnostic's structural path, returning `null`
 * when it carries none (the guard lives here once, not in every builder). */
function pathFix(
  build: (path: string, diag: Diagnostic, read: ReadNode) => readonly FixCandidate[] | null,
): FixBuilder {
  return (diag, read) => (typeof diag.path === 'string' ? build(diag.path, diag, read) : null);
}

/** `removeKey` ops for the members of `candidates` present in the map reached by
 * following `keysPrefix` from the node at `path`; `null` when the node/prefix is
 * unreadable or none of the candidates are present (so no dead button shows). */
function removePresent(
  read: ReadNode,
  path: string,
  keysPrefix: readonly string[],
  candidates: readonly string[],
): readonly Op[] | null {
  let node: unknown = read(path);
  for (const step of keysPrefix) {
    const map = asMap(node);
    if (map === null) return null;
    node = map[step];
  }
  const map = asMap(node);
  if (map === null) return null;
  const ops = candidates
    .filter((key) => Object.hasOwn(map, key))
    .map((key): Op => ({ op: 'removeKey', path, keys: [...keysPrefix, key] }));
  return ops.length > 0 ? ops : null;
}

/** `orientation: landscape` ignored on a custom page size → drop the root
 * `page.orientation` key (the diagnostic is pathless; the key is root-global). */
function fixOrientation(_diag: Diagnostic, read: ReadNode): readonly FixCandidate[] | null {
  const page = asMap(read('page'));
  if (page === null || !Object.hasOwn(page, 'orientation')) return null;
  return [{ labelKey: REMOVE_LABEL, ops: [{ op: 'removeKey', keys: ['page', 'orientation'] }] }];
}

/** Grid keys without `type: grid` → drop the present ones at whichever box
 * location the node carries (container / repeat cell / repeat_flow item). */
function fixGridKeys(path: string, _diag: Diagnostic, read: ReadNode): readonly Op[] | null {
  for (const prefix of GRID_BOX_LOCATIONS) {
    const ops = removePresent(read, path, prefix, GRID_KEYS);
    if (ops !== null) return ops;
  }
  return null;
}

/** Inert style keys on a shape or a span → drop the ones the diagnostic names
 * (`args.keys`, comma-joined by the engine) from the node's inline `style`. */
function fixIgnoredStyleKeys(path: string, diag: Diagnostic, read: ReadNode): readonly Op[] | null {
  const raw = diag.args.keys;
  if (typeof raw !== 'string') return null;
  const listed = raw.split(', ').filter((key) => key.length > 0);
  return listed.length === 0 ? null : removePresent(read, path, ['style'], listed);
}

/** An unused `bindings:` declaration → drop it. Unlike every other fix here,
 * the diagnostic's `path` addresses the DECLARATION (`<item>.bindings.<name>`),
 * not the node the key hangs off, so the item path has to be derived.
 *
 * It is derived by stripping the suffix BY LENGTH, never by splitting at the
 * last `.`: a binding name may legally contain dots (the interpolation charset
 * is alphanumerics, `_` and `.`), so `a.b` would otherwise strip one segment
 * and address the wrong node. A path that does not end in the declaration the
 * diagnostic names is forged or stale, and yields no fix. */
function fixUnusedBinding(path: string, diag: Diagnostic, read: ReadNode): readonly Op[] | null {
  const name = diag.args.name;
  if (typeof name !== 'string' || name.length === 0) return null;
  const suffix = `.bindings.${name}`;
  if (!path.endsWith(suffix)) return null;
  const itemPath = path.slice(0, -suffix.length);
  if (itemPath.length === 0) return null;
  return removePresent(read, itemPath, ['bindings'], [name]);
}

/** The code → fix table. A `Map`, so an unknown/hostile `code` misses cleanly. */
const FIXES: ReadonlyMap<string, FixBuilder> = new Map<string, FixBuilder>([
  ['orientation_ignored', fixOrientation],
  [
    'ignored_column_key',
    pathFix(removal((path, _diag, read) => removePresent(read, path, [], ['fit']))),
  ],
  [
    'layout_key_on_leaf',
    pathFix(removal((path, _diag, read) => removePresent(read, path, ['box'], LEAF_LAYOUT_KEYS))),
  ],
  ['grid_key_ignored', pathFix(removal(fixGridKeys))],
  [
    'table_pagination_key_ignored',
    pathFix(removal((path, _diag, read) => removePresent(read, path, [], PAGINATION_KEYS))),
  ],
  ['shape_style_ignored', pathFix(removal(fixIgnoredStyleKeys))],
  ['ignored_span_style', pathFix(removal(fixIgnoredStyleKeys))],
  ['unused_binding', pathFix(removal(fixUnusedBinding))],
  // Two candidates: the author picks which source survives.
  ['image_source_conflict', pathFix(fixSourceConflict)],
  // One candidate that WRITES a size — the four shapes that draw nothing
  // without one (`mark_missing_size` covers ellipse AND checkbox).
  ['rect_missing_size', pathFix(fixMissingSize)],
  ['image_missing_size', pathFix(fixMissingSize)],
  ['qr_missing_size', pathFix(fixMissingSize)],
  ['mark_missing_size', pathFix(fixMissingSize)],
  // One candidate that shrinks the item back inside what it overflowed. Only
  // the codes carrying an `over` amount: `flex_row_overflow` reports a ROW's
  // children collectively needing more room than the box, so there is no single
  // width to shrink and no honest fix of this shape.
  ['flow_item_overflow', pathFix(fixOverflowWidth)],
  ['sheet_overflow', pathFix(fixOverflowWidth)],
  ['child_overflow', pathFix(fixOverflowWidth)],
]);

/** The candidate resolutions for `diag` — one button each — or `null` when it
 * has no mechanical fix (unknown code, or nothing concrete to do in the current
 * document). */
export function fixFor(diag: Diagnostic, read: ReadNode): readonly FixCandidate[] | null {
  const builder = FIXES.get(diag.code);
  return builder ? builder(diag, read) : null;
}
