// What a child-layout control AUTHORS: the named ops the direction segment, the gap
// stepper, the alignment row, the ratio inputs and add-slot dispatch (AI parity:
// every edit is a serializable op). The write half of the container-layout
// pair — it depends on the read half (`layoutModel.ts`), never the reverse.
//
// The three value-PARSING builders (`gapOp`/`gapStepOp`/`ratioOp`) refuse (null)
// rather than authoring what the engine would warn on or discard, and cap the
// magnitudes a hostile paste could land in the wire. The other three cannot be
// refused: two take a typed enum, and the append is always valid.
//
// The engine wire (docs/engine/{flex,grid}.md): layout-mode keys live on the
// container's `box` — `direction`, `gap`, `alignItems`; a child's grow weight is
// its own `box.flexGrow` (default 1, inert on a width-authored child).

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

/** The direction segment's edit — the same key the insert scaffold authors. */
export function directionOp(path: string, direction: 'row' | 'column'): Op {
  return { op: 'setScalar', path, keys: ['box', 'direction'], value: direction };
}

/** Cross-axis alignment values the alignment row offers, mirroring the engine
 * enum minus `baseline` (expert-only, YAML-authored; an authored baseline
 * simply shows no active button). Wire spellings from docs/engine/flex.md. */
export const ALIGN_VALUES = ['start', 'center', 'end', 'stretch'] as const;
export type AlignValue = (typeof ALIGN_VALUES)[number];

export function alignItemsOp(path: string, value: AlignValue): Op {
  return { op: 'setScalar', path, keys: ['box', 'alignItems'], value };
}

/** Gap commit: empty clears the key; a readable absolute length authors in
 * its typed form; a negative clamps to 0 (the engine reads negatives as 0 —
 * never author what it would discard); unreadable (relative units, garbage,
 * non-finite) or over-cap input dispatches nothing (`null`). */
export function gapOp(path: string, raw: string): Op | null {
  const keys = ['box', 'gap'];
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
export function gapStepOp(path: string, current: string, dir: 1 | -1, step: number): Op | null {
  const next = stepLength(current.trim() === '' ? '0' : current, dir, step);
  if (next === null) {
    return null;
  }
  return gapOp(path, String(next));
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
