// The edits that switch a table column between its kinds (`columnKinds.ts`),
// each ONE transactional batch = one undo step.
//
// Between the bound kinds (text / QR code / image) only `type:` moves, plus
// `fit` when the column stops being an image: the engine warns
// `ignored_column_key` about a `fit` anywhere else. The binding's `format` and
// `placeholder` stay put even on an image column, which ignores them silently
// — hidden there, back on screen as soon as the column prints text again, so a
// trip through image and back loses nothing.
//
// Into a `cell:` column, the column's current display moves inside the cell as
// ONE item carrying the same binding, and the cell's frame carries the table's
// cell padding and the column's vertical alignment (`carriedCellFrame`), so the
// page looks the same right after the switch. A QR code or an image item needs a
// size of its own (without one the engine warns `qr_missing_size` /
// `image_missing_size` and draws nothing), so it fills the frame's content box:
// a `%` height resolves against the row's final height and does not drive it.
//
// Out of a `cell:` column, the sub-template goes and the FIRST bound item found
// (depth-first) lends its binding back to the column; `cellSummary` is what the
// confirm dialog states before that happens.
//
// The document is untrusted: the carried binding is rebuilt from the four keys
// the wire's `Binding` has, own string values only (spread + computed keys, so a
// `__proto__` entry stays inert data), and the walk is bounded in depth and in
// nodes. `removeKey` fails on an absent key, so removals are emitted only for
// keys the column actually has.

import type { Op, ReadFn, SnippetValue } from '@shojiku/designer-core';
import { carriedCellFrame } from './carriedCellFrame';
import { type ColumnKind, columnKindOf } from './columnKinds';

const BINDING_KEYS = ['key', 'format', 'placeholder', 'scope'] as const;

/** A carried item fills the cell (see the header). */
const FILL_BOX = { w: '100%', h: '100%' } as const;

/** The walk's bounds — the `insert/blockRefusal` precedent: depth alone does not
 * bound a wide tree, so the node budget does the work. */
const MAX_WALK_DEPTH = 24;
const MAX_WALK_NODES = 512;

type Entry = Record<string, unknown>;

function record(value: unknown): Entry | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Entry)
    : undefined;
}

function own(entry: Entry | undefined, key: string): unknown {
  return entry !== undefined && Object.hasOwn(entry, key) ? entry[key] : undefined;
}

/** A binding rebuilt from the wire's own keys, or null when it names no key. */
export function carryBinding(data: unknown): Readonly<Record<string, string>> | null {
  const source = record(data);
  const key = own(source, 'key');
  if (typeof key !== 'string' || key === '') {
    return null;
  }
  let binding: Record<string, string> = {};
  for (const name of BINDING_KEYS) {
    const value = own(source, name);
    if (typeof value === 'string') {
      binding = { ...binding, [name]: value };
    }
  }
  return binding;
}

/** What a `cell:` holds, for the confirm dialog and the switch out of it. */
export interface CellSummary {
  /** Top-level items in the cell (what the switch removes, nested ones inside). */
  readonly count: number;
  /** Top-level item types in document order, one per item (non-string → ''). */
  readonly types: readonly string[];
  /** The first bound item's binding, depth-first, or null. */
  readonly binding: Readonly<Record<string, string>> | null;
  /** That item's own type and `fit` — an image item lends its fit back. */
  readonly bindingType: string;
  readonly bindingFit: string;
}

function itemsOf(container: unknown): readonly unknown[] {
  const items = own(record(container), 'items');
  return Array.isArray(items) ? items : [];
}

function firstBound(
  items: readonly unknown[],
  depth: number,
  budget: { nodes: number },
): Entry | null {
  if (depth > MAX_WALK_DEPTH) {
    return null;
  }
  for (const item of items) {
    budget.nodes -= 1;
    if (budget.nodes < 0) {
      return null;
    }
    const entry = record(item);
    if (entry !== undefined && carryBinding(own(entry, 'data')) !== null) {
      return entry;
    }
    const nested = firstBound(itemsOf(entry), depth + 1, budget);
    if (nested !== null) {
      return nested;
    }
  }
  return null;
}

export function cellSummary(cell: unknown): CellSummary {
  const items = itemsOf(cell);
  const bound = firstBound(items, 0, { nodes: MAX_WALK_NODES });
  const type = own(bound ?? undefined, 'type');
  const fit = own(bound ?? undefined, 'fit');
  return {
    count: items.length,
    types: items.map((item) => {
      const value = own(record(item), 'type');
      return typeof value === 'string' ? value : '';
    }),
    binding: bound === null ? null : carryBinding(own(bound, 'data')),
    bindingType: typeof type === 'string' ? type : '',
    bindingFit: typeof fit === 'string' ? fit : '',
  };
}

function removals(column: Entry | undefined, path: string, keys: readonly string[]): Op[] {
  return keys
    .filter((key) => column !== undefined && Object.hasOwn(column, key))
    .map((key) => ({ op: 'removeKey', path, keys: [key] }));
}

function intoCell(read: ReadFn, column: Entry | undefined, path: string, from: ColumnKind): Op[] {
  const binding = carryBinding(own(column, 'data'));
  const fit = own(column, 'fit');
  let item: Record<string, SnippetValue> | null = null;
  if (binding !== null) {
    item =
      from === 'text'
        ? { type: 'text', data: binding }
        : { type: from, data: binding, box: FILL_BOX };
    if (from === 'image' && typeof fit === 'string') {
      item = { ...item, fit };
    }
  }
  return [
    ...removals(column, path, ['data', 'type', 'fit']),
    {
      op: 'putValue',
      path,
      keys: ['cell'],
      value: { box: carriedCellFrame(read, path), items: item === null ? [] : [item] },
    },
  ];
}

function outOfCell(column: Entry | undefined, path: string, to: ColumnKind): Op[] {
  const summary = cellSummary(own(column, 'cell'));
  const ops: Op[] = removals(column, path, ['cell', 'type', 'fit']);
  if (summary.binding !== null) {
    ops.push({ op: 'putValue', path, keys: ['data'], value: summary.binding });
  }
  if (to !== 'text') {
    ops.push({ op: 'setScalar', path, keys: ['type'], value: to });
  }
  if (to === 'image' && summary.bindingType === 'image' && summary.bindingFit !== '') {
    ops.push({ op: 'setScalar', path, keys: ['fit'], value: summary.bindingFit });
  }
  return ops;
}

/** The ONE batch that switches the column at `path` to `to` ([] = no change). */
export function kindSwitchOps(read: ReadFn, path: string, to: ColumnKind): readonly Op[] {
  const raw = read(path);
  const column = record(raw);
  const from = columnKindOf(raw);
  if (column === undefined || from === to) {
    return [];
  }
  if (to === 'cell') {
    return intoCell(read, column, path, from);
  }
  if (from === 'cell') {
    return outOfCell(column, path, to);
  }
  const ops: Op[] =
    to === 'text'
      ? removals(column, path, ['type'])
      : [{ op: 'setScalar', path, keys: ['type'], value: to }];
  return from === 'image' ? [...ops, ...removals(column, path, ['fit'])] : ops;
}
