// What a CONTAINER is, for the layout controls: a `container` item, or the
// per-element frame of a `repeat` (`cell:`) or a `repeat_flow` (`item:`) — both
// containers on the wire, without a `type:` of their own. `readContainerNode` is
// the ONE classification every layout read and multi-key edit goes through
// (`layoutModel`, `layoutModeOps`, `gridState`), so a control and its edit
// never disagree about what they are pointed at. Split from `layoutModel.ts`.

import type { ReadFn } from '@shojiku/designer-core';
import { frameOf } from './frameModel';
import type { LayoutMode } from './layoutModel';

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** A container as the layout controls see it: its mode, its `box` (`{}` when
 * absent or not a map) and its child list (`[]` when not a list). */
export interface ContainerNode {
  readonly mode: LayoutMode;
  /** The repeat cell / card frame this container is, or `null` for an item. */
  readonly frame: FrameKindOf | null;
  readonly box: Readonly<Record<string, unknown>>;
  readonly items: readonly unknown[];
}

/** The node lays out children the way a container does: a `container` item, or
 * the per-element frame of a `repeat` (`cell:`) or a `repeat_flow` (`item:`) —
 * both ARE containers on the wire, only without a `type:` of their own. A table
 * column's `cell:` is not offered: its owner is a column, sized by the table. */
export function holdsLayout(
  read: ReadFn,
  path: string,
  node: Record<string, unknown>,
): { readonly frame: FrameKindOf | null } | null {
  if (node.type === 'container') {
    return { frame: null };
  }
  const frame = frameOf(read, path);
  return frame === null || frame.kind === 'columnCell' ? null : { frame: frame.kind };
}

/** The frame kinds that hold a layout. */
export type FrameKindOf = 'cell' | 'card';

/** The container at `path` (a container item or a repeat / card frame,
 * `holdsLayout`), or `null` when the node is not one, its
 * `box.type` is neither flex nor grid (a hostile mode gets no layout controls —
 * the dnd refusal posture), or the subtree is unreadable (an alias bomb: a read
 * throw is "no"). The one classification the view AND the multi-key edits
 * (`layoutModeOps.ts`) read, so a control and its edit never disagree. */
export function readContainerNode(read: ReadFn, path: string): ContainerNode | null {
  let node: Record<string, unknown> | undefined;
  try {
    node = record(read(path));
  } catch {
    return null;
  }
  const holder = node === undefined ? null : holdsLayout(read, path, node);
  if (node === undefined || holder === null) {
    return null;
  }
  const box = record(node.box) ?? {};
  let mode: LayoutMode;
  if (box.type === 'grid') {
    mode = 'grid';
  } else if (box.type === undefined || box.type === 'flex') {
    mode = box.direction === 'row' ? 'row' : 'column';
  } else {
    return null;
  }
  return {
    mode,
    box,
    items: Array.isArray(node.items) ? node.items : [],
    frame: holder.frame,
  };
}
