// Pure line-level diff between the OPENED document text and the current text —
// the model behind the save/export review pane (GU16). It never mutates the
// document (read-only review chrome, so no patch op), and it renders nothing:
// the component maps `rows` to escaped React text. The two inputs are already
// in memory (the Designer's baseline snapshot + `editor.text`), both produced
// by the ONE serializer, so a diff shows exactly the touched lines — the
// round-trip guarantee ("only touched keys change") made visible.
//
// Cost is bounded for a hostile/huge document: common prefix + suffix are
// trimmed first (an authored edit is local, so the differing middle is tiny),
// and the O(n·m) LCS runs ONLY on that middle, capped at `MAX_LCS_LINES` per
// side. Over the cap the result is `truncated` with a coarse summary and no
// rows — the pane shows a notice instead of freezing the tab.
//
// The edit script itself is `diffScript.ts` and the row projection `diffRows.ts`;
// this file owns the CAP decision and the result the pane consumes.

import { countHunks, type DiffRow, toRows } from './diffRows';
import { commonTrim, fullSteps, lines } from './diffScript';

export type { DiffRow, DiffRowKind } from './diffRows';

/** Per-side cap on the differing middle the LCS table spans. Beyond it the diff
 * degrades to a coarse (truncated) summary — a browser must never block on an
 * O(n·m) table over a multi-megabyte template. */
export const MAX_LCS_LINES = 1500;

/** The plain-language + engineer summary. `changed` counts change HUNKS
 * (contiguous add/remove runs) for the "N places changed" line; `added`/`removed`
 * are line counts for the engineer's `+a / −r` readout. */
export interface DiffSummary {
  readonly changed: number;
  readonly added: number;
  readonly removed: number;
}

export interface DiffResult {
  readonly rows: readonly DiffRow[];
  readonly summary: DiffSummary;
  /** The differing middle exceeded `MAX_LCS_LINES` — `rows` is empty and the
   * summary is a coarse upper bound. */
  readonly truncated: boolean;
}

/** Line-level diff of `baseline` (opened) vs `current`. Pure; never throws. */
export function computeLineDiff(baseline: string, current: string): DiffResult {
  const base = lines(baseline);
  const cur = lines(current);

  // Cheap prefix/suffix trim to size the LCS middle before committing to it.
  const { prefix, suffix } = commonTrim(base, cur);
  const baseMid = base.length - suffix - prefix;
  const curMid = cur.length - suffix - prefix;
  if (baseMid > MAX_LCS_LINES || curMid > MAX_LCS_LINES) {
    // Truncation implies a side exceeded the cap (> 0), so there IS a change.
    return { rows: [], summary: { changed: 1, added: curMid, removed: baseMid }, truncated: true };
  }

  const steps = fullSteps(base, cur);
  const rows = toRows(base, cur, steps);
  let added = 0;
  let removed = 0;
  for (const step of steps) {
    if (step.kind === 'added') {
      added += 1;
    } else if (step.kind === 'removed') {
      removed += 1;
    }
  }
  return { rows, summary: { changed: countHunks(rows), added, removed }, truncated: false };
}
