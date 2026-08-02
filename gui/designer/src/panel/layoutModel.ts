// What the DOCUMENT says about a container: read HOW it arranges its children
// for the child-layout section and the parent-first card, from the document alone
// (never the box index — correct when a render fails). Framework-free so the
// classification and its guards are exhaustively unit-testable; the
// LayoutSection component stays thin. What a control AUTHORS is the write half
// of the pair, `layoutOps.ts`.
//
// The engine wire (docs/engine/{flex,grid}.md): layout-mode keys live on the
// container's `box` — `type` (unset/`flex` = flex, `grid` = tracks),
// `direction`, `gap`, `alignItems`; a child's grow weight is its own
// `box.flexGrow` (default 1, inert on a width-authored child).

import type { ReadFn } from '@shojiku/designer-core';
import type { ContainerKind } from '../insert/containerModel';
import { seqPosition } from '../tree/reorder';
import { display } from './itemView';

export type LayoutMode = ContainerKind;

/** The `.items` sequence key every container child path runs through — the
 * write half appends through it too. */
export const ITEMS_SUFFIX = '.items';

/** The engine's track cap (`MAX_GRID_TRACKS`) — the displayed column count is
 * clamped to what the engine would actually lay out. */
const MAX_GRID_TRACKS = 64;

export interface ChildSlot {
  readonly path: string;
  /** The child's grow-weight display: authored `box.flexGrow`, or `"1"` (the
   * engine default) when unset or not a displayable scalar. */
  readonly ratio: string;
  /** The child authors `box.w` — outside the ratio split (the fixed-width chip). */
  readonly fixedWidth: boolean;
}

export interface ContainerLayout {
  readonly mode: LayoutMode;
  /** Authored `box.gap` display (`''` when unset — the engine default 0). */
  readonly gap: string;
  /** EFFECTIVE cross-axis alignment: the authored value, or `stretch` (the
   * engine default) when unset. A garbage value passes through verbatim (no
   * button reads active) — the engine is the validator. */
  readonly alignItems: string;
  /** Grid only: the column-track count (a count, or a track list's length),
   * clamped to the engine's cap; `null` when unresolvable or not a grid. */
  readonly columns: number | null;
  readonly children: readonly ChildSlot[];
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Grid column count from the wire `columns` value: a finite count ≥1 (floored)
 * or a non-empty track list's length, both clamped to the engine cap. */
function gridColumns(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 1) {
    return Math.min(MAX_GRID_TRACKS, Math.floor(value));
  }
  if (Array.isArray(value) && value.length >= 1) {
    return Math.min(MAX_GRID_TRACKS, value.length);
  }
  return null;
}

function childSlot(path: string, index: number, child: unknown): ChildSlot {
  const box = record(record(child)?.box);
  const grow = box?.flexGrow;
  const shown = display(grow);
  return {
    path: `${path}.items[${index}]`,
    ratio: grow === undefined || shown === '' ? '1' : shown,
    fixedWidth: box?.w !== undefined,
  };
}

/** The layout view of the container at `path`, or `null` when the node is not
 * a container, its `box.type` is neither flex nor grid (a hostile mode gets no
 * layout controls — the dnd refusal posture), or the subtree is unreadable
 * (an alias bomb: a read throw is "no"). Hostile child entries still yield
 * slots so indices stay true (the columns-model precedent). */
export function containerLayoutFor(read: ReadFn, path: string): ContainerLayout | null {
  let node: Record<string, unknown> | undefined;
  try {
    node = record(read(path));
  } catch {
    return null;
  }
  if (node === undefined || node.type !== 'container') {
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
  const items = Array.isArray(node.items) ? node.items : [];
  return {
    mode,
    gap: display(box.gap),
    alignItems: box.alignItems === undefined ? 'stretch' : display(box.alignItems),
    columns: mode === 'grid' ? gridColumns(box.columns) : null,
    children: items.map((child, index) => childSlot(path, index, child)),
  };
}

/** The path of the DIRECT parent container of the item at `path`, or `null`
 * when the parent is anything else (the flow body, a band, a table — the
 * parent-first card shows only for a real container parent; exactly one
 * level, never recursive). A read throw is "no". */
export function parentContainerOf(read: ReadFn, path: string): string | null {
  const position = seqPosition(path);
  if (position === null || !position.parent.endsWith(ITEMS_SUFFIX)) {
    return null;
  }
  const ownerPath = position.parent.slice(0, -ITEMS_SUFFIX.length);
  try {
    const owner = record(read(ownerPath));
    return owner?.type === 'container' ? ownerPath : null;
  } catch {
    return null;
  }
}

/** The localized kind word for a container layout — the canvas chip and the
 * parent card share it (a grid carries its column count when known). */
export function containerKindLabel(
  t: (key: string, args?: Record<string, string | number>) => string,
  layout: { readonly mode: LayoutMode; readonly columns: number | null },
): string {
  if (layout.mode === 'grid' && layout.columns !== null) {
    return t('containerKind.gridN', { columns: layout.columns });
  }
  return t(`containerKind.${layout.mode}`);
}
