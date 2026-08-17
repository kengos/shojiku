// What the DOCUMENT says about a placed item's position, end to end: classify
// HOW the item gets placed from the engine's wire rules, and build the named ops
// the auto⇄fixed toggle dispatches — the ops author exactly the `box.x`/`box.y`
// keys the classifier reads back as `pinned`, so the pair round-trips. Both
// halves read the document ALONE (never the box index), which is what keeps
// them correct when a render fails; what the RENDER resolved is the other half
// of the pair, `placementGeometry.ts`. Framework-free so the classification and
// the op construction are exhaustively unit-testable; BoxSection stays thin.
//
// The engine participation rule (docs/engine/{flex,grid,container,flow}.md):
// a CONTAINER child that authors `box.x` OR `box.y` leaves flex/grid placement
// and is pinned absolutely within the container — so a container child is the
// ONLY context where auto (no coord) and fixed (a coord) are both real. A FLOW
// child can never be pinned (the engine always ignores its `box.y`); a BAND or
// `type: absolute` body child is always coordinate-placed. Everything else
// (sub-templates, `line`, sections, hostile docs) keeps today's plain fields.

import type { Op, ReadFn } from '@shojiku/designer-core';
import { seqPosition } from '../tree/reorder';
import { BOXLESS_TYPES } from './itemView';

const ITEMS_SUFFIX = '.items';
// A path inside a repeating sub-template (`table` columns / `cell:` /
// `repeat_flow` `item:`): one definition lays out per data element, so a single
// coordinate is meaningless — these keep plain fields (the manipulate.ts rule).
const SUB_TEMPLATE_RE = /\.columns\[|\.cell\.|\.item\./;

/** How the selected item gets its position — the field/segment shape follows.
 * `pinnable`: a container child (auto⇄fixed toggle). `flow`: a flow-body child
 * (y is engine-owned, no toggle). `coordinate`: a band / absolute-body child
 * (always coordinate-placed). `plain`: everything else (today's fields). */
export type PlacementKind = 'pinnable' | 'flow' | 'coordinate' | 'plain';

export interface Placement {
  readonly kind: PlacementKind;
  /** `pinnable` only: the child currently authors `box.x` or `box.y` (fixed). */
  readonly pinned: boolean;
  /** `flow` only: `box.y` is authored (drives the "y is ignored" hint). */
  readonly ignoredY: boolean;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** The item map at `path`, or `undefined` on a non-map / a read throw (an
 * alias-bomb subtree) — a hostile document never crashes the panel. */
export function readItem(read: ReadFn, path: string): Record<string, unknown> | undefined {
  try {
    return record(read(path));
  } catch {
    return undefined;
  }
}

/** The `.items`-sequence owner of a child path (`…items[0].items[2]` →
 * `…items[0]`; `sections.body.items[3]` → `sections.body`), or `null` when the
 * path is not an `.items` entry (a section root, a `columns[n]`). */
export function ownerPathOf(path: string): string | null {
  const position = seqPosition(path);
  if (position === null || !position.parent.endsWith(ITEMS_SUFFIX)) {
    return null;
  }
  return position.parent.slice(0, -ITEMS_SUFFIX.length);
}

/** Classify the placement of the item at `path` from the DOCUMENT alone (never
 * the box index — the classification stays correct when a render fails). Never
 * throws: any hostile/garbage shape degrades to `plain`. */
export function placementFor(read: ReadFn, path: string): Placement {
  const plain: Placement = { kind: 'plain', pinned: false, ignoredY: false };
  if (SUB_TEMPLATE_RE.test(path)) {
    return plain;
  }
  const ownerPath = ownerPathOf(path);
  if (ownerPath === null) {
    return plain;
  }
  const child = readItem(read, path);
  const owner = readItem(read, ownerPath);
  if (child === undefined || owner === undefined) {
    return plain;
  }
  if (typeof child.type === 'string' && BOXLESS_TYPES.has(child.type)) {
    return plain;
  }
  const box = record(child.box) ?? {};
  const hasX = box.x !== undefined;
  const hasY = box.y !== undefined;
  if (ownerPath === 'sections.header' || ownerPath === 'sections.footer') {
    return { kind: 'coordinate', pinned: false, ignoredY: false };
  }
  if (ownerPath === 'sections.body') {
    if (owner.type === 'absolute') {
      return { kind: 'coordinate', pinned: false, ignoredY: false };
    }
    if (owner.type === 'flow') {
      return { kind: 'flow', pinned: false, ignoredY: hasY };
    }
    return plain;
  }
  if (owner.type !== 'container') {
    return plain;
  }
  // A container child is pinnable whether the container is flex OR grid — an
  // authored coordinate is the absolute escape hatch in both (grid.md).
  return { kind: 'pinnable', pinned: hasX || hasY, ignoredY: false };
}

/** The batch that pins an auto container child at its resolved coordinate: BOTH
 * `box.x` and `box.y` (a full pin — writing one leaves the other 0, moving the
 * item). Dispatched via `applyAll` = one undo step. */
export function pinOps(path: string, x: number, y: number): Op[] {
  return [
    { op: 'setScalar', path, keys: ['box', 'x'], value: x },
    { op: 'setScalar', path, keys: ['box', 'y'], value: y },
  ];
}

/** The batch that returns a fixed container child to auto: a `removeKey` for
 * each coordinate that is PRESENT (removeKey on a missing key errors, rolling
 * back the batch). One undo step. */
export function unpinOps(read: ReadFn, path: string): Op[] {
  const box = record(readItem(read, path)?.box);
  const ops: Op[] = [];
  if (box?.x !== undefined) {
    ops.push({ op: 'removeKey', path, keys: ['box', 'x'] });
  }
  if (box?.y !== undefined) {
    ops.push({ op: 'removeKey', path, keys: ['box', 'y'] });
  }
  return ops;
}
