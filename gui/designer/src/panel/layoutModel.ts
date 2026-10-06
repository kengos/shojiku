// What the DOCUMENT says about a container: read HOW it arranges its children
// for the child-layout section and the parent-first card, from the document alone
// (never the box index — correct when a render fails). Framework-free so the
// classification and its guards are exhaustively unit-testable; the
// LayoutSection component stays thin. What a control AUTHORS is the write half
// of the pair, `layoutOps.ts`.
//
// The engine wire (docs/engine/{flex,grid}.md): layout-mode keys live on the
// container's `box` — `type` (unset/`flex` = flex, `grid` = tracks),
// `direction`, `gap`, `alignItems`, `justifyContent`; a child's grow weight is its
// own `box.flexGrow` and its starting size its `box.flexBasis` (both inert on a
// width-authored child). An unset grow weight has no single default the document
// can show: in a ROW the engine gives a child it can measure 0 and one it cannot
// (a table, vertical text) 1, and vertical writing can arrive through inherited
// style — so an unset weight reads as EMPTY rather than as a number that may be
// false. (In a stack an unset weight is always 0.) Only the children the engine
// lays out by flex take part in any of this — `flexParticipants.ts`.

import type { ReadFn } from '@shojiku/designer-core';
import type { ContainerKind } from '../insert/containerModel';
import { seqPosition } from '../tree/reorder';
import { type FrameKindOf, holdsLayout, readContainerNode } from './containerNode';
import { isFlexItem } from './flexParticipants';
import { display } from './itemView';

export type LayoutMode = ContainerKind;

/** The `.items` sequence key every container child path runs through — the
 * write half appends through it too. */
export const ITEMS_SUFFIX = '.items';

/** The engine's track cap (`MAX_GRID_TRACKS`, engine/core/src/geometry/grid.rs)
 * — the displayed column count is clamped to what the engine would actually lay
 * out, and a switch to a grid never asks for more. */
export const MAX_GRID_TRACKS = 64;

export interface ChildSlot {
  readonly path: string;
  /** The child's grow-weight display: authored `box.flexGrow`, or `''` when
   * unset or not a displayable scalar (the engine decides the default). */
  readonly ratio: string;
  /** The child authors `box.w` — outside a row's split (the fixed-width chip). */
  readonly fixedWidth: boolean;
  /** The child authors `box.h` — outside a stack's split (the fixed-height chip). */
  readonly fixedHeight: boolean;
  /** The engine lays the child out by flex (`isFlexItem`): a positioned child
   * or a `line` takes no part in a split, so it gets no ratio input. */
  readonly flexItem: boolean;
  /** The child covers more than one grid cell (`columnSpan`/`rowSpan` > 1). */
  readonly spanning: boolean;
}

export interface ContainerLayout {
  readonly mode: LayoutMode;
  /** The container's authored `box` (`{}` when absent or not a map) — what the
   * grid controls read their tracks, gaps and fill order from. */
  readonly box: Readonly<Record<string, unknown>>;
  /** The repeat cell / card frame this container is, or `null` for an item. */
  readonly frame: FrameKindOf | null;
  /** Authored `box.gap` display (`''` when unset — the engine default 0). */
  readonly gap: string;
  /** EFFECTIVE cross-axis alignment: the authored value, or `stretch` (the
   * engine default) when unset. A garbage value passes through verbatim (no
   * button reads active) — the engine is the validator. */
  readonly alignItems: string;
  /** EFFECTIVE main-axis distribution: the authored value verbatim, or `start`
   * (the engine default) when unset. */
  readonly justifyContent: string;
  /** The container has a definite height of its own: an authored `box.h`, or
   * a repeat cell (sized by its slot) — a stack's distribution, equal rows and
   * `fr` rows only act against one. */
  readonly hasHeight: boolean;
  /** Grid only: the column-track count (a count, or a track list's length),
   * clamped to the engine's cap; `null` when unresolvable or not a grid. */
  readonly columns: number | null;
  /** Grid `columns` is a track LIST — the only grid shape whose leftover width
   * `justifyContent` can distribute (a count consumes the axis). */
  readonly columnsIsList: boolean;
  /** Whether the BASIS POPULATION (children with no `box.x`/`box.y` and no
   * `box.w`) starts from zero (`flexBasis: 0`): all of them, none, a mix — or
   * `empty` when there is no such child. */
  readonly basis: BasisState;
  readonly children: readonly ChildSlot[];
}

export type BasisState = 'all' | 'none' | 'mixed' | 'empty';

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
  return {
    path: `${path}.items[${index}]`,
    ratio: display(box?.flexGrow),
    fixedWidth: box?.w !== undefined,
    fixedHeight: box?.h !== undefined,
    flexItem: isFlexItem(child),
    spanning: [box?.columnSpan, box?.rowSpan].some((n) => typeof n === 'number' && n > 1),
  };
}

/** A child the engine lays out by flex (`isFlexItem` — a flex item type with
 * no `x`/`y`) that sizes from its basis: no authored `w`. Shared with the write
 * half, so the checkbox's state and its edit read one population. */
export function inBasisPopulation(child: unknown): boolean {
  return isFlexItem(child) && record(record(child)?.box)?.w === undefined;
}

function basisState(items: readonly unknown[]): BasisState {
  const population = items.filter(inBasisPopulation);
  if (population.length === 0) {
    return 'empty';
  }
  const zero = population.filter((child) => record(record(child)?.box)?.flexBasis === 0).length;
  if (zero === 0) {
    return 'none';
  }
  return zero === population.length ? 'all' : 'mixed';
}

/** The layout view of the container at `path` (`null` exactly when
 * `readContainerNode` is). Hostile child entries still yield slots so indices
 * stay true (the columns-model precedent). */
export function containerLayoutFor(read: ReadFn, path: string): ContainerLayout | null {
  const container = readContainerNode(read, path);
  if (container === null) {
    return null;
  }
  const { mode, box, items, frame } = container;
  return {
    mode,
    box,
    frame,
    gap: display(box.gap),
    alignItems: box.alignItems === undefined ? 'stretch' : display(box.alignItems),
    justifyContent: box.justifyContent === undefined ? 'start' : display(box.justifyContent),
    // A repeat cell is handed its slot's height (it fills the slot), so it has
    // a definite height without a `box.h` of its own; a card does not.
    hasHeight: box.h !== undefined || frame === 'cell',
    columns: mode === 'grid' ? gridColumns(box.columns) : null,
    columnsIsList: mode === 'grid' && Array.isArray(box.columns),
    basis: basisState(items),
    children: items.map((child, index) => childSlot(path, index, child)),
  };
}

/** The path of the DIRECT parent container (or repeat / card frame) of the
 * item at `path`, or `null` when the parent is anything else (the flow body, a
 * band, a table — the
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
    return owner !== undefined && holdsLayout(read, ownerPath, owner) !== null ? ownerPath : null;
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
