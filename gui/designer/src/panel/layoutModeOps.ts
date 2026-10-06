// The container-layout edits that change SEVERAL keys at once, each built as one
// batch (one undo step): the row / stack / grid switch, and the split-by-ratio
// toggle over a row's children. The single-key edits are `layoutOps.ts`; what the
// panel shows is `layoutModel.ts`, whose classification both builders reuse so a
// control and its edit never disagree about the container.
//
// A switch never deletes or reorders a child. A row becomes a one-row grid with a
// column per child the engine lays out by flex (`isFlexItem`), each column sized
// the way that child was sized in the row (`trackFor`: its width, its weight as
// an `fr` share, or `auto` — its content's width), so the row keeps its look; an
// engine without `fr`/`auto` tracks gets an equal-width column COUNT instead,
// which does not. A stack becomes a ONE-column grid, and its horizontal
// alignment does not carry over — a grid's `alignItems` is vertical. A grid
// going back drops the keys only a grid reads (left in place they warn
// `grid_key_ignored` / `span_outside_grid`) and carries the per-axis gap that was
// winning on the new main axis into `gap`. Wire: docs/engine/{flex,grid}.md.

import { MAX_BATCH_OPS, type Op, type ReadFn } from '@shojiku/designer-core';
import { isFlexItem, trackFor } from './flexParticipants';
import { REQUIRED_BOX_WIRE_TYPES } from './itemView';
import {
  type ContainerNode,
  inBasisPopulation,
  type LayoutMode,
  MAX_GRID_TRACKS,
  readContainerNode,
} from './layoutModel';
import { directionOp } from './layoutOps';

/** The container keys only a grid reads. */
const GRID_ONLY_KEYS = ['type', 'columns', 'rows', 'columnGap', 'rowGap'] as const;
/** The child keys only a grid parent reads. */
const SPAN_KEYS = ['columnSpan', 'rowSpan'] as const;

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function capped(ops: Op[]): Op[] | null {
  return ops.length > MAX_BATCH_OPS ? null : ops;
}

/** What the switch may author: `trackList` = the engine reads `fr` and `auto`
 * column tracks (`grid.fr` + `grid.auto`). */
export interface ModeSwitchOptions {
  readonly trackList: boolean;
}

/** The new grid's `columns` op. A row longer than the track cap keeps the cap;
 * the children past it wrap onto later rows. */
function columnsOp(path: string, from: ContainerNode, options: ModeSwitchOptions): Op {
  const keys = ['box', 'columns'];
  const items = from.mode === 'row' ? from.items.filter(isFlexItem).slice(0, MAX_GRID_TRACKS) : [];
  if (options.trackList && items.length > 0) {
    return { op: 'putValue', path, keys, value: items.map(trackFor) };
  }
  return { op: 'setScalar', path, keys, value: Math.max(1, items.length) };
}

function toGrid(path: string, from: ContainerNode, options: ModeSwitchOptions): Op[] {
  const ops: Op[] = [
    { op: 'setScalar', path, keys: ['box', 'type'], value: 'grid' },
    columnsOp(path, from, options),
  ];
  // In a grid `direction` is the FILL ORDER, not the main axis: a stack's
  // `column` would turn the new grid column-major.
  if (from.box.direction !== undefined) {
    ops.push({ op: 'removeKey', path, keys: ['box', 'direction'] });
  }
  return ops;
}

/** The span keys a child can shed: all it carries, unless dropping them would
 * empty the box of a type whose `box` is required (the op layer prunes an
 * emptied map, and a `rect` with no `box` does not parse) — that child keeps
 * them and the engine warns instead. */
function droppableSpans(child: unknown): readonly string[] {
  const node = record(child);
  const box = record(node?.box);
  if (box === undefined) {
    return [];
  }
  const present = SPAN_KEYS.filter((key) => box[key] !== undefined);
  const emptied = Object.keys(box).length === present.length;
  return emptied && REQUIRED_BOX_WIRE_TYPES.has(String(node?.type)) ? [] : present;
}

function toFlex(path: string, from: ContainerNode, target: 'row' | 'column'): Op[] {
  const ops: Op[] = GRID_ONLY_KEYS.filter((key) => from.box[key] !== undefined).map((key) => ({
    op: 'removeKey' as const,
    path,
    keys: ['box', key],
  }));
  ops.push(directionOp(path, target));
  // Only a scalar is carried: the engine reads a length there, and a hostile
  // map is not a value to copy (`gap` then simply stays as authored).
  const carried = from.box[target === 'row' ? 'columnGap' : 'rowGap'];
  if (typeof carried === 'number' || typeof carried === 'string') {
    ops.push({ op: 'setScalar', path, keys: ['box', 'gap'], value: carried });
  }
  from.items.forEach((child, index) => {
    for (const key of droppableSpans(child)) {
      ops.push({ op: 'removeKey', path: `${path}.items[${index}]`, keys: ['box', key] });
    }
  });
  return ops;
}

/** The batch that switches the container at `path` to `target`: `[]` when it is
 * already there, `null` when the container is not one the panel edits or the
 * batch would exceed the op cap (refused whole — never a partial switch). */
export function modeSwitchOps(
  read: ReadFn,
  path: string,
  target: LayoutMode,
  options: ModeSwitchOptions,
): Op[] | null {
  const from = readContainerNode(read, path);
  if (from === null) {
    return null;
  }
  if (from.mode === target) {
    return [];
  }
  if (target === 'grid') {
    return toGrid(path, from, options);
  }
  if (from.mode !== 'grid') {
    return [directionOp(path, target)];
  }
  return capped(toFlex(path, from, target));
}

/** The split-by-ratio toggle over a row's basis population. On: every member
 * starts from zero (`flexBasis: 0`), and one with no grow weight gets `1` — the
 * engine weighs an unset grow on a zero basis as 0, which would collapse that
 * slot to nothing. Off: the zero bases go; the weights stay, visible in the
 * ratio inputs. `null` when the container is unreadable or over the op cap. */
export function basisOps(read: ReadFn, path: string, on: boolean): Op[] | null {
  const from = readContainerNode(read, path);
  if (from === null) {
    return null;
  }
  const ops: Op[] = [];
  from.items.forEach((child, index) => {
    if (!inBasisPopulation(child)) {
      return;
    }
    const box = record(record(child)?.box);
    const childPath = `${path}.items[${index}]`;
    if (!on) {
      if (box?.flexBasis !== undefined) {
        ops.push({ op: 'removeKey', path: childPath, keys: ['box', 'flexBasis'] });
      }
      return;
    }
    if (box?.flexBasis !== 0) {
      ops.push({ op: 'setScalar', path: childPath, keys: ['box', 'flexBasis'], value: 0 });
    }
    if (box?.flexGrow === undefined) {
      ops.push({ op: 'setScalar', path: childPath, keys: ['box', 'flexGrow'], value: 1 });
    }
  });
  return capped(ops);
}
