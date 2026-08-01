// What the diff SHOWS: the unified-diff row vocabulary, the context window that
// decides which steps survive, the collapse of dropped context to a single gap
// row, and the hunk count behind the "N places changed" line. Pure over the edit
// script `diffScript.ts` produces; the component maps these rows to escaped
// React text.

import type { Step } from './diffScript';

/** Context lines kept on each side of a change run; longer context collapses to
 * a single gap marker (unified-diff style). */
const CONTEXT_LINES = 3;

export type DiffRowKind = 'context' | 'added' | 'removed' | 'gap';

/** One rendered diff row. `gap` carries no text/line — the component draws an
 * ellipsis for a collapsed context run. Line numbers are 1-based. */
export interface DiffRow {
  readonly kind: DiffRowKind;
  readonly text: string;
  readonly oldLine: number | null;
  readonly newLine: number | null;
}

/** True for the steps within `CONTEXT_LINES` of any change — the rows a unified
 * diff keeps; the rest collapse to a gap. */
function keptMask(steps: readonly Step[]): boolean[] {
  const kept = steps.map((s) => s.kind !== 'context');
  for (let idx = 0; idx < steps.length; idx += 1) {
    if ((steps[idx] as Step).kind === 'context') {
      continue;
    }
    for (let d = 1; d <= CONTEXT_LINES; d += 1) {
      if (idx - d >= 0) {
        kept[idx - d] = true;
      }
      if (idx + d < steps.length) {
        kept[idx + d] = true;
      }
    }
  }
  return kept;
}

/** Collapse the steps to display rows: kept steps as their row, each run of
 * dropped context as ONE gap row. */
export function toRows(
  base: readonly string[],
  cur: readonly string[],
  steps: readonly Step[],
): DiffRow[] {
  const kept = keptMask(steps);
  const rows: DiffRow[] = [];
  let gapOpen = false;
  steps.forEach((step, idx) => {
    if (!(kept[idx] as boolean)) {
      if (!gapOpen) {
        rows.push({ kind: 'gap', text: '', oldLine: null, newLine: null });
        gapOpen = true;
      }
      return;
    }
    gapOpen = false;
    if (step.kind === 'added') {
      rows.push({
        kind: 'added',
        text: cur[step.curIdx] as string,
        oldLine: null,
        newLine: step.curIdx + 1,
      });
    } else if (step.kind === 'removed') {
      rows.push({
        kind: 'removed',
        text: base[step.baseIdx] as string,
        oldLine: step.baseIdx + 1,
        newLine: null,
      });
    } else {
      rows.push({
        kind: 'context',
        text: base[step.baseIdx] as string,
        oldLine: step.baseIdx + 1,
        newLine: step.curIdx + 1,
      });
    }
  });
  return rows;
}

/** Count change hunks: each maximal run of added/removed rows (gaps/context
 * break a run) is one "place". */
export function countHunks(rows: readonly DiffRow[]): number {
  let hunks = 0;
  let inRun = false;
  for (const row of rows) {
    const isChange = row.kind === 'added' || row.kind === 'removed';
    if (isChange && !inRun) {
      hunks += 1;
    }
    inRun = isChange;
  }
  return hunks;
}
