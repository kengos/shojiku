// The id walk: every node that can CARRY an `id:` and every leaf that NAMES
// one, over a materialized template subtree. The two sets are the engine's own:
// all 15 item types, a table column, and the three sub-template frames (a
// repeat's `cell`, a column's `cell`, a repeat_flow's `item`) carry an `id`
// (engine/core/src/template.rs `Item::id`, table/column.rs, imposition.rs
// `ContainerItem`); exactly two spellings name one — an ellipse's `anchor` and
// a line endpoint's `item` (template/marks.rs, geometry/point_spec.rs).
//
// The descent mirrors the layer tree's (`tree/model.ts`): items → `items`,
// a table's `columns` → a column's `cell` frame, a repeat's `cell` frame, a
// repeat_flow's `item` frame. Untrusted input: own-property reads only, never
// throws, bounded by depth and a node budget (a hit marks the walk truncated,
// and a truncated walk must never back a uniqueness or cascade decision).

import { MAX_TREE_DEPTH } from '../tree/model';
import { bindingKey, pickLabel, record, spanLabel } from '../tree/nodeFields';
import type { IdHolder, IdWalk, Owner } from './holders';

export type { IdHolder, IdRef, IdWalk, Owner } from './holders';

/** Node budget for one walk — generous next to the layer tree's DOM cap, since
 * nothing here renders, but still a bound a hostile document cannot push past. */
export const MAX_ID_WALK_NODES = 8192;

export function newWalk(): IdWalk {
  return { holders: [], refs: [], nodes: 0, truncated: false };
}

function take(walk: IdWalk): boolean {
  if (walk.nodes >= MAX_ID_WALK_NODES) {
    walk.truncated = true;
    return false;
  }
  walk.nodes += 1;
  return true;
}

function own(node: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(node, key) ? node[key] : undefined;
}

/** The node's `id` when it is a string, and whether it carries one that is not. */
function named(node: Record<string, unknown>): Pick<IdHolder, 'id' | 'foreign'> {
  const id = own(node, 'id');
  return typeof id === 'string'
    ? { id, foreign: false }
    : { id: undefined, foreign: id !== undefined };
}

function addRef(walk: IdWalk, path: string, keys: readonly string[], value: unknown): void {
  if (typeof value === 'string') {
    walk.refs.push({ path, keys, id: value });
  }
}

function walkItemList(
  walk: IdWalk,
  prefix: string,
  value: unknown,
  depth: number,
  repeated: boolean,
): void {
  if (!Array.isArray(value)) {
    return;
  }
  for (let index = 0; index < value.length; index++) {
    walkItem(walk, `${prefix}[${index}]`, value[index], depth, repeated);
  }
}

/** One item: itself, its references, then what it owns. `repeated` says the
 * item sits inside a repeated scope (see `IdHolder.repeated`); `owner` is the
 * region holding it directly (see `IdHolder.owner`). */
export function walkItem(
  walk: IdWalk,
  path: string,
  entry: unknown,
  depth: number,
  repeated = false,
  owner: Owner = null,
): void {
  if (depth > MAX_TREE_DEPTH) {
    walk.truncated = true;
    return;
  }
  const item = record(entry);
  if (item === undefined || !take(walk)) {
    return;
  }
  const rawType = own(item, 'type');
  const kind = typeof rawType === 'string' && rawType !== '' ? rawType : 'item';
  // The layer tree's own label order, so a refusal names the row the user sees.
  const dataKey = bindingKey(own(item, 'data'));
  const label = pickLabel(
    own(item, 'text'),
    dataKey,
    spanLabel(own(item, 'spans')),
    own(item, 'id'),
  );
  walk.holders.push({ path, kind, label, repeated, dataKey, owner, ...named(item) });
  if (kind === 'ellipse') {
    addRef(walk, path, ['anchor'], own(item, 'anchor'));
  }
  if (kind === 'line') {
    for (const end of ['from', 'to'] as const) {
      const point = record(own(item, end));
      if (point !== undefined) {
        addRef(walk, path, [end, 'item'], own(point, 'item'));
      }
    }
  }
  walkItemList(walk, `${path}.items`, own(item, 'items'), depth + 1, repeated);
  const columns = own(item, 'columns');
  if (Array.isArray(columns)) {
    for (let index = 0; index < columns.length; index++) {
      walkColumn(walk, `${path}.columns[${index}]`, columns[index], depth + 1, repeated);
    }
  }
  if (kind === 'repeat') {
    walkFrame(walk, `${path}.cell`, own(item, 'cell'), 'cell_frame', depth, repeated);
  }
  if (kind === 'repeat_flow') {
    walkFrame(walk, `${path}.item`, own(item, 'item'), 'card_frame', depth, repeated);
  }
}

/** One table column: it carries an id, and its `cell:` frame holds items. */
export function walkColumn(
  walk: IdWalk,
  path: string,
  entry: unknown,
  depth: number,
  repeated = false,
): void {
  const column = record(entry);
  if (column === undefined || !take(walk)) {
    return;
  }
  const dataKey = bindingKey(own(column, 'data'));
  const label = pickLabel(own(column, 'label'), dataKey);
  walk.holders.push({
    path,
    kind: 'column',
    label,
    repeated,
    dataKey,
    owner: null,
    ...named(column),
  });
  walkFrame(walk, `${path}.cell`, own(column, 'cell'), 'cell_frame', depth, repeated);
}

function walkFrame(
  walk: IdWalk,
  path: string,
  value: unknown,
  kind: 'cell_frame' | 'card_frame',
  depth: number,
  repeated: boolean,
): void {
  const frame = record(value);
  if (frame === undefined || !take(walk)) {
    return;
  }
  // The frame itself repeats only if its owner does; everything INSIDE it is
  // one placement per element.
  const fields = { label: null, repeated, dataKey: undefined, owner: null };
  walk.holders.push({ path, kind, ...fields, ...named(frame) });
  walkItemList(walk, `${path}.items`, own(frame, 'items'), depth + 1, true);
}
