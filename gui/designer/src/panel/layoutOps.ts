// What a child-layout control AUTHORS, one key at a time: the named ops the gap
// stepper, the distribution dropdown, the alignment row, the ratio inputs and
// add-slot dispatch (AI parity: every edit is a serializable op). The write half of the container-layout
// pair — it depends on the read half (`layoutModel.ts`), never the reverse.
//
// The three value-PARSING builders (`gapOp`/`gapStepOp`/`ratioOp`) refuse (null)
// rather than authoring what the engine would warn on or discard, and cap the
// magnitudes a hostile paste could land in the wire. The other four cannot be
// refused: three take a typed enum, and the append is always valid.
//
// The engine wire (docs/engine/{flex,grid}.md): layout-mode keys live on the
// container's `box` — `direction`, `gap`, `alignItems`, `justifyContent`; a child's
// grow weight is its own `box.flexGrow` (inert on a width-authored child). The
// edits that touch MORE than one key at once — the row/stack/grid switch and the
// split-by-ratio toggle — are batches, in `layoutModeOps.ts`.

import type { Op, ReadFn } from '@shojiku/designer-core';
import { readLength, stepLength } from '../canvas/lengths';
import { ITEMS_SUFFIX } from './layoutModel';
import { lengthOp } from './model';

/** Ingress caps: never author a value the engine would warn on or discard
 * (`invalid_flex_grow`, negative gaps read as 0) — and cap magnitudes so a
 * hostile paste cannot land an absurd weight/gap in the wire. */
export const MAX_FLEX_GROW = 1000;
export const MAX_GAP_PT = 10000;

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** A row ↔ stack switch's edit (the arrangement segment reaches it through
 * `modeSwitchOps`) — the same key the insert scaffold authors. */
export function directionOp(path: string, direction: 'row' | 'column'): Op {
  return { op: 'setScalar', path, keys: ['box', 'direction'], value: direction };
}

/** Cross-axis alignment values, the engine enum in its wire spellings
 * (docs/engine/flex.md). The alignment row offers `baseline` only in a row —
 * a stack and a grid fall back to `start` for it in the engine. */
export const ALIGN_VALUES = ['start', 'center', 'end', 'stretch', 'baseline'] as const;
export type AlignValue = (typeof ALIGN_VALUES)[number];

export function alignItemsOp(path: string, value: AlignValue): Op {
  return { op: 'setScalar', path, keys: ['box', 'alignItems'], value };
}

/** Main-axis distribution values, the engine enum in its wire spellings
 * (docs/engine/flex.md). */
export const JUSTIFY_VALUES = [
  'start',
  'center',
  'end',
  'space_between',
  'space_around',
  'space_evenly',
] as const;
export type JustifyValue = (typeof JUSTIFY_VALUES)[number];

export function justifyContentOp(path: string, value: JustifyValue): Op {
  return { op: 'setScalar', path, keys: ['box', 'justifyContent'], value };
}

/** The container gap keys: the both-axes `gap`, and a grid's per-axis pair
 * (the specific key wins over `gap` in the engine). */
export type GapKey = 'gap' | 'columnGap' | 'rowGap';

/** Gap commit: empty clears the key; a readable absolute length authors in
 * its typed form; a negative clamps to 0 (the engine reads negatives as 0 —
 * never author what it would discard); unreadable (relative units, garbage,
 * non-finite) or over-cap input dispatches nothing (`null`). One rule for all
 * three keys. */
export function gapOp(path: string, raw: string, key: GapKey = 'gap'): Op | null {
  const keys = ['box', key];
  if (raw.trim() === '') {
    return { op: 'removeKey', path, keys };
  }
  const length = readLength(raw);
  if (length === null || length.pt > MAX_GAP_PT) {
    return null;
  }
  if (length.pt < 0) {
    return { op: 'setScalar', path, keys, value: 0 };
  }
  return lengthOp(path, keys, raw);
}

/** A gap ▲▼ step: steps the authored value (empty = 0) by `dir` pt in its
 * authored form, re-guarded through `gapOp` so a step below zero clamps to 0
 * instead of authoring a negative. */
export function gapStepOp(
  path: string,
  current: string,
  dir: 1 | -1,
  step: number,
  key: GapKey = 'gap',
): Op | null {
  const next = stepLength(current.trim() === '' ? '0' : current, dir, step);
  if (next === null) {
    return null;
  }
  return gapOp(path, String(next), key);
}

/** A ratio (grow weight) commit: empty clears the key; a finite number in
 * `[0, MAX_FLEX_GROW]` authors it; negative / non-finite / over-cap input
 * dispatches nothing — the engine warns `invalid_flex_grow` on what it would
 * degrade, so it is never authored. */
export function ratioOp(childPath: string, raw: string): Op | null {
  const keys = ['box', 'flexGrow'];
  if (raw.trim() === '') {
    return { op: 'removeKey', path: childPath, keys };
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > MAX_FLEX_GROW) {
    return null;
  }
  return { op: 'setScalar', path: childPath, keys, value };
}

/** The add-slot edit: ONE `insertItem` appending a placeholder text child
 * (the same honest slot the picker scaffolds). A missing/unreadable items list
 * appends at 0 — `insertItem` auto-creates the sequence. */
export function addSlotOp(read: ReadFn, path: string, placeholderText: string): Op {
  let index = 0;
  try {
    const items = record(read(path))?.items;
    index = Array.isArray(items) ? items.length : 0;
  } catch {
    index = 0;
  }
  return {
    op: 'insertItem',
    path: `${path}${ITEMS_SUFFIX}`,
    index,
    value: { type: 'text', text: placeholderText },
  };
}
