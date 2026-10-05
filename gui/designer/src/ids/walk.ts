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

/** Node budget for one walk — generous next to the layer tree's DOM cap, since
 * nothing here renders, but still a bound a hostile document cannot push past. */
export const MAX_ID_WALK_NODES = 8192;

/** A node that carries (or could carry) an `id:`. */
export interface IdHolder {
  readonly path: string;
  /** The authored id; `undefined` when absent or not a string. */
  readonly id: string | undefined;
  /** The wire type, or `column` / `cell_frame` / `card_frame`. */
  readonly kind: string;
  /** Content-derived label (the tree's), or `null` → show the kind's name. */
  readonly label: string | null;
}

/** A leaf naming an id: `keys` under the item at `path`. */
export interface IdRef {
  readonly path: string;
  readonly keys: readonly string[];
  readonly id: string;
}

export interface IdWalk {
  readonly holders: IdHolder[];
  readonly refs: IdRef[];
  nodes: number;
  truncated: boolean;
}

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

function idOf(node: Record<string, unknown>): string | undefined {
  const id = own(node, 'id');
  return typeof id === 'string' ? id : undefined;
}

function addRef(walk: IdWalk, path: string, keys: readonly string[], value: unknown): void {
  if (typeof value === 'string') {
    walk.refs.push({ path, keys, id: value });
  }
}

function walkItemList(walk: IdWalk, prefix: string, value: unknown, depth: number): void {
  if (!Array.isArray(value)) {
    return;
  }
  for (let index = 0; index < value.length; index++) {
    walkItem(walk, `${prefix}[${index}]`, value[index], depth);
  }
}

/** One item: itself, its references, then what it owns. */
export function walkItem(walk: IdWalk, path: string, entry: unknown, depth: number): void {
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
  const label = pickLabel(
    own(item, 'text'),
    bindingKey(own(item, 'data')),
    spanLabel(own(item, 'spans')),
    own(item, 'id'),
  );
  walk.holders.push({ path, id: idOf(item), kind, label });
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
  walkItemList(walk, `${path}.items`, own(item, 'items'), depth + 1);
  const columns = own(item, 'columns');
  if (Array.isArray(columns)) {
    for (let index = 0; index < columns.length; index++) {
      walkColumn(walk, `${path}.columns[${index}]`, columns[index], depth + 1);
    }
  }
  if (kind === 'repeat') {
    walkFrame(walk, `${path}.cell`, own(item, 'cell'), 'cell_frame', depth);
  }
  if (kind === 'repeat_flow') {
    walkFrame(walk, `${path}.item`, own(item, 'item'), 'card_frame', depth);
  }
}

/** One table column: it carries an id, and its `cell:` frame holds items. */
export function walkColumn(walk: IdWalk, path: string, entry: unknown, depth: number): void {
  const column = record(entry);
  if (column === undefined || !take(walk)) {
    return;
  }
  const label = pickLabel(own(column, 'label'), bindingKey(own(column, 'data')));
  walk.holders.push({ path, id: idOf(column), kind: 'column', label });
  walkFrame(walk, `${path}.cell`, own(column, 'cell'), 'cell_frame', depth);
}

function walkFrame(
  walk: IdWalk,
  path: string,
  value: unknown,
  kind: 'cell_frame' | 'card_frame',
  depth: number,
): void {
  const frame = record(value);
  if (frame === undefined || !take(walk)) {
    return;
  }
  walk.holders.push({ path, id: idOf(frame), kind, label: null });
  walkItemList(walk, `${path}.items`, own(frame, 'items'), depth + 1);
}
